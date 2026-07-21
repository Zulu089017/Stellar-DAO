import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BurnRequest, MintRequest, Transaction } from '@stellardao/shared';

import { bridge } from '../soroban/index.js';
import { transactionRepository } from '../db/repositories/transaction-repository.js';

/**
 * Zod schemas mirror the `MintRequest` / `BurnRequest` shared types so
 * the routes return 400 (not 500) on malformed input. Without these,
 * `buildMint({})` reaches the SDK and crashes on `new Address(undefined)
 * .toScVal()` — the route returns 500, which is a worse signal to
 * integrators than a structured 400.
 */
const LockPayloadSchema = z.object({
  sourceChain: z.string(),
  sourceToken: z.string(),
  wrapperToken: z.string(),
  recipient: z.string(),
  amount: z.string(),
  nonce: z.string(),
});

const UnlockPayloadSchema = z.object({
  sourceChain: z.string(),
  wrapperToken: z.string(),
  sourceAddress: z.string(),
  amount: z.string(),
  nonce: z.string(),
});

const SignedAttestationSchema = z.object({
  publicKey: z.string(),
  signature: z.string(),
});

const MintRequestSchema = z.object({
  relayer: z.string(),
  wrapperToken: z.string(),
  payload: LockPayloadSchema,
  attestations: z.array(SignedAttestationSchema).min(1),
});

const BurnRequestSchema = z.object({
  relayer: z.string(),
  wrapperToken: z.string(),
  payload: UnlockPayloadSchema,
  attestations: z.array(SignedAttestationSchema).min(1),
});

/**
 * Wrap request — the user-facing entry on the wrap page. Mirrors
 * `LockPayload` minus `nonce` (the server mints a fresh one to keep
 * client implementations simple) and minus the attestation list
 * (the relayer signs in our mock implementation, not the client).
 */
const SOURCE_CHAINS = ['ethereum', 'solana', 'polygon'] as const;
type SourceChainId = (typeof SOURCE_CHAINS)[number];

const WrapRequestSchema = z.object({
  sourceChain: z.enum(SOURCE_CHAINS),
  sourceToken: z.string().min(1),
  wrapperToken: z.string().regex(/^C[0-9A-Z]{55}$/, 'wrapperToken must be a C-address'),
  recipient: z
    .string()
    .regex(/^G[0-9A-Z]{55}$/, 'recipient must be a Stellar G-address')
    .or(z.string().regex(/^G[A-Z]{56}$/, 'recipient must be a Stellar G-address')),
  amount: z
    .string()
    .regex(/^[0-9]+$/, 'amount must be a decimal integer string')
    .refine((s) => s !== '0', 'amount must be positive'),
});

const LIFECYCLE_STEPS: Array<{
  status: Transaction['status'];
  delayMs: number;
}> = [
  { status: 'attesting', delayMs: 200 },
  { status: 'minting', delayMs: 200 },
  { status: 'completed', delayMs: 200 },
];

/**
 * Mock Soroban mint: walk the row's `status` through the standard
 * lifecycle so the dashboard sees the steps land in real time. Each
 * upsert fires a `transaction-update` over SSE via the in-process bus.
 *
 * In production the relayer would submit `mint_with_attestation` to
 * the bridge contract here; the timer's replaced by polling the
 * Soroban-RPC transaction status. The contract for this function
 * (input: Transaction, side-effect: progressive upserts) stays the
 * same, which is the point of routing everything through
 * `transactionRepository.upsert`.
 */
async function scheduleMockLifecycle(initial: Transaction): Promise<void> {
  let current: Transaction = initial;
  for (const { status, delayMs } of LIFECYCLE_STEPS) {
    await new Promise<void>((r) => setTimeout(r, delayMs));
    const next: Transaction = {
      ...current,
      status,
      stellarTxHash: status === 'completed' ? randomBytes(32).toString('hex') : current.stellarTxHash,
      updatedAt: new Date().toISOString(),
    };
    current = next;
    await transactionRepository.upsert(next);
  }
}

export const bridgeRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post<{ Body: MintRequest }>('/mint', async (req, reply) => {
    const parsed = MintRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const request = parsed.data;
    const bridgeContract = bridge();
    const op = bridgeContract.buildMint(request);
    const txHash = await bridgeContract.simulateAndSubmit(
      {
        bridgeContractId: bridgeContract.contractId,
        sourceKeypair: app.sorobanSigner,
        networkPassphrase: app.networkPassphrase,
        sorobanRpcUrl: app.sorobanRpcUrl,
      },
      op,
    );
    reply.code(202).send({ txHash });
  });

  app.post<{ Body: BurnRequest }>('/burn', async (req, reply) => {
    const parsed = BurnRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const request = parsed.data;
    const bridgeContract = bridge();
    const op = bridgeContract.buildBurn(
      request.wrapperToken,
      request.relayer,
      request.payload,
      request.attestations,
    );
    const txHash = await bridgeContract.simulateAndSubmit(
      {
        bridgeContractId: bridgeContract.contractId,
        sourceKeypair: app.sorobanSigner,
        networkPassphrase: app.networkPassphrase,
        sorobanRpcUrl: app.sorobanRpcUrl,
      },
      op,
    );
    reply.code(202).send({ txHash });
  });

  /**
   * User-facing wrap entry.
   *
   * Creates a Transaction in `pending`, returns 202 with the
   * freshly-generated txId, then walks the row's lifecycle in the
   * background. Each lifecycle upsert fans out over SSE so the wrap
   * panel and dashboard update without further polling.
   */
  app.post<{ Body: z.infer<typeof WrapRequestSchema> }>('/wrap', async (req, reply) => {
    const parsed = WrapRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'validation_failed',
        message: parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }
    const body = parsed.data;

    const id = randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const initial: Transaction = {
      id,
      type: 'wrap',
      sourceChain: body.sourceChain as SourceChainId,
      sourceToken: body.sourceToken,
      wrapperToken: body.wrapperToken,
      recipient: body.recipient,
      amount: body.amount,
      status: 'pending',
      sourceTxHash: null,
      stellarTxHash: null,
      nonce: randomBytes(32).toString('hex'),
      createdAt: now,
      updatedAt: now,
    };

    await transactionRepository.upsert(initial);
    void scheduleMockLifecycle(initial);

    reply.code(202).send({ txId: id, status: initial.status });
  });
};
