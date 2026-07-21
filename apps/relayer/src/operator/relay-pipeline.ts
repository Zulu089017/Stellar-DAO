import crypto from 'node:crypto';

import pino from 'pino';
import type { Keypair } from '@stellar/stellar-sdk';
import type { BridgeContract } from '@stellardao/sdk';
import { type buildLockDigest, type signEd25519 } from '@stellardao/sdk';
import type { SourceChainId, Transaction } from '@stellardao/shared';

import { type eventQueue } from '../state/event-queue.js';
import type { LockEvent } from '../sources/types.js';

import { type signer } from './signer.js';

const log = pino({ transport: { target: 'pino-pretty' } });

/**
 * Build a `Transaction` envelope from a `LockEvent` + chain id.
 * Fills in the fields the API + dashboard expect (`id`, `type`,
 * `sourceChain`) and marks `sourceTxHash` / `stellarTxHash` as `null`
 * until the upstream systems populate them — the relayer's role here
 * is to track the in-flight attestation, not the source-chain/hash state.
 *
 * The `id` is `crypto.randomUUID()` so two concurrent workers can't
 * collide; the dedup key on `eventQueue` is `${sourceChain}:${nonce}`,
 * so a duplicate push for the same lock replays the lifecycle (not
 * the id) — acceptable because the bridge's `mint_with_attestation`
 * is itself a nonce-keyed operation.
 *
 * TODO(50-item backlog, sourceTxHash dedup): when source-chain receipt
 * integration lands and a real `sourceTxHash` arrives, switch the
 * eventQueue dedup key to `sourceTxHash` so chain reorgs cannot
 * trigger a duplicate-mint race.
 */
function envelope(event: LockEvent, chain: SourceChainId): Transaction {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'wrap',
    sourceChain: chain,
    sourceToken: event.sourceToken,
    wrapperToken: event.wrapperToken,
    recipient: event.recipient,
    amount: event.amount,
    nonce: event.nonce,
    status: 'attesting',
    sourceTxHash: null,
    stellarTxHash: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Injected dependencies for `handleLockEvent`. Each function/class is
 * a seam the spec substitutes so the pipeline can be exercised without
 * the full soroban-rpc + signet network stack.
 *
 * Production (`index.ts`) assembles one of these per process; tests
 * can swap any combination. The full suite of relay-pipeline.spec.ts
 * assertions map 1:1 onto this shape, so adding a new dep means
 * adding both the production wiring AND the test seam in one diff.
 */
export type HandleLockEventDeps = {
  eventQueue: typeof eventQueue;
  buildLockDigest: typeof buildLockDigest;
  signEd25519: typeof signEd25519;
  signer: typeof signer;
  bridge: BridgeContract;
  sourceKeypair: Keypair;
  relayerPK: string;
  relayerSecretKey: string | undefined;
  networkPassphrase: string;
  sorobanRpcUrl: string;
};

/**
 * Real implementation of the relayer's per-event handler. Pulled out
 * of `main()`'s inline closure so it's testable in isolation:
 *
 *  1. Envelope + push to eventQueue (dedup'd by `(chain, nonce)`).
 *  2. `buildLockDigest` + `signEd25519` (or dry-run zeroed sig).
 *  3. `signer.submitMintToBridge` against the BridgeContract.
 *  4. On success: `updateById` to `minting` with the resulting hash.
 *  5. On failure: `updateById` to `failed` with the error message.
 *
 * Pure with respect to `process.env` — all reads happen in `index.ts`
 * once, then are passed via `deps`. The same deps shape is used by
 * `index.ts` and by `apps/relayer/src/operator/relay-pipeline.spec.ts`.
 */
export async function handleLockEvent(
  chain: SourceChainId,
  event: LockEvent,
  deps: HandleLockEventDeps,
): Promise<void> {
  log.info({ chain }, 'attesting lock event');

  const tx = envelope(event, chain);
  deps.eventQueue.push(tx);

  // `Buffer.from(hexStr, 'hex')` in Node 22+ does NOT strip the `0x`
  // prefix — it treats `x` as an invalid hex character and returns a
  // 0-length buffer. Since `LockEvent.nonce` always carries the
  // `0x` + 64-hex prefix, we strip before decoding so the digest
  // builder sees a real 32-byte nonce.
  const nonceHex = event.nonce.startsWith('0x')
    ? event.nonce.slice(2)
    : event.nonce;
  const digest = deps.buildLockDigest({
    sourceChain: chain,
    sourceToken: event.sourceToken,
    wrapperToken: event.wrapperToken,
    recipient: event.recipient,
    amount: event.amount,
    nonce: Buffer.from(nonceHex, 'hex'),
  });

  // Dry-run: no `relayerSecretKey` → zeroed signature. Production
  // warns at startup and refuses to submit without a key (logged
  // from `index.ts`), but the test path needs this branch to be
  // observable end-to-end so the no-key shape is asserted.
  const signature = deps.relayerSecretKey
    ? await deps.signEd25519(digest, deps.relayerSecretKey)
    : new Uint8Array(64);

  try {
    const stellarTxHash = await deps.signer.submitMintToBridge({
      bridgeContract: deps.bridge,
      sourceKeypair: deps.sourceKeypair,
      relayerPK: deps.relayerPK,
      payload: { ...event, sourceChain: chain },
      signature,
      networkPassphrase: deps.networkPassphrase,
      sorobanRpcUrl: deps.sorobanRpcUrl,
    });

    deps.eventQueue.updateById(chain, event.nonce, {
      status: 'minting',
      stellarTxHash,
    });
  } catch (err) {
    const message = (err as Error).message;
    log.error({ chain, err: message }, 'mint submission failed');
    deps.eventQueue.updateById(chain, event.nonce, {
      status: 'failed',
      error: message,
    });
  }
}
