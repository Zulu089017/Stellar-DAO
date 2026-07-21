/**
 * Zod schemas mirroring the TS types in this folder. Used at the
 * boundary between untrusted input (HTTP request bodies, JSON file
 * ingestion, raw blockchain event payloads) and the in-process
 * invariants the rest of the system relies on.
 *
 * Convention: each schema is exported with a `Schema` suffix so the
 * existing type names (`AssetId`, `Transaction`, etc.) stay
 * referencable. Inferred-from-schema types are exported alongside
 * (with an `Inferred` suffix) ONLY when the schema-derived shape is
 * meaningfully different from the existing TS type — otherwise
 * downstream callers should keep using the existing TS type and
 * infer at the call site if they need a stricter view.
 */
import { z } from 'zod';

import { SOURCE_CHAINS } from './chain.js';

/* ───────────────  regex constants  ─────────────── */

/** 32-byte contract id / public key / nonce, lowercase or uppercase hex.
 *  Always `0x`-prefixed (Soroban / Ethereum convention). */
export const HEX_32 = /^0x[0-9a-fA-F]{64}$/;

/** 64-byte elliptic-curve signature (secp256k1 or ed25519 expanded).
 *  Always `0x`-prefixed. NOT to be used for tx hashes. */
export const EC_SIGNATURE = /^0x[0-9a-fA-F]{128}$/;

/** Stellar-style transaction hash. 64-char lowercase or uppercase
 *  hex, NO `0x` prefix. Covers Stellar Horizon's
 *  `/transactions/{hash}` response shape. */
export const TX_HASH = /^[0-9a-fA-F]{64}$/;

/** EVM-style transaction hash. Optional `0x` prefix + 64 hex chars.
 *  ethers / viem return prefixed; some wallets emit unprefixed. */
export const EVM_TX_HASH = /^(0x)?[0-9a-fA-F]{64}$/;

/** Decimal bigint string — no `.`, no `e`, no leading whitespace, non-empty. */
export const DEC_BIGINT = /^[0-9]+$/;

/** UUID v4 (matched by the `8-4-4-4-12` shape; the version digit enforces non-nil). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ───────────────  chain  ─────────────── */

/**
 * Use `z.custom` rather than `z.enum` so the schema stays in sync
 * with the SOURCE_CHAINS runtime array (adding a new chain
 * automatically extends validation, no manual re-sync needed).
 *
 * Double-cast `as unknown as readonly [string, ...string[]]` would
 * also work but trips `@typescript-eslint/consistent-type-assertions`
 * and obscures intent — the `custom + refine` form spells out the
 * invariant ("value must be a string AND one of the canonical chain
 * ids") without type-system gymnastics.
 */
export const SourceChainIdSchema = z.custom<'ethereum' | 'solana' | 'polygon'>(
  (v): v is 'ethereum' | 'solana' | 'polygon' =>
    typeof v === 'string' && (SOURCE_CHAINS as readonly string[]).includes(v),
  { message: `expected one of ${SOURCE_CHAINS.join(', ')}` },
);

export const AssetIdSchema = z.object({
  chain: SourceChainIdSchema,
  address: z.string().min(1),
});

/* ───────────────  asset  ─────────────── */

export const WrappedAssetSchema = z.object({
  id: z.string().min(1),
  source: AssetIdSchema,
  wrapperToken: z.string().regex(HEX_32, 'expected 32-byte hex contract id'),
  symbol: z.string().min(1).max(12),
  name: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(18),
  totalSupply: z.string().regex(DEC_BIGINT, 'expected decimal bigint string'),
  deployedAt: z.string().datetime({ offset: true }),
});

export const AssetRegistryEntrySchema = z.object({
  id: z.string().min(1),
  source: AssetIdSchema,
  wrapperToken: z.string().regex(HEX_32, 'expected 32-byte hex contract id'),
  symbol: z.string().min(1).max(12),
  name: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(18),
});

/* ───────────────  transaction  ─────────────── */

export const TxStatusSchema = z.enum([
  'pending',
  'attesting',
  'minting',
  'completed',
  'failed',
  'refunded',
]);

export const TransactionSchema = z.object({
  id: z.string().regex(UUID_V4, 'expected uuid v4'),
  type: z.enum(['wrap', 'unwrap']),
  sourceChain: SourceChainIdSchema,
  sourceToken: z.string().min(1),
  wrapperToken: z.string().regex(HEX_32, 'expected 32-byte hex contract id'),
  recipient: z.string().min(1),
  amount: z.string().regex(DEC_BIGINT, 'expected decimal bigint string'),
  status: TxStatusSchema,
  // Stellar Convention: 64-char hex, no prefix. Use EVM_TX_HASH
  // inside a future mirror for `Transaction.sourceTxHash` if you
  // need to align with ethers-style hashes.
  sourceTxHash: z.string().regex(TX_HASH).nullable(),
  stellarTxHash: z.string().regex(TX_HASH).nullable(),
  nonce: z.string().regex(HEX_32, 'expected 32-byte hex nonce'),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  // Bug-fix: callers can denote an undo-not-required state with
  // either `undefined` (`!error`) or `null` (explicitly clear).
  // `.optional()` alone rejects `null`. `.nullable().optional()`
  // (or its reverse) accepts both.
  error: z.string().nullable().optional(),
});

/* ───────────────  bridge  ─────────────── */

export const SignedAttestationSchema = z.object({
  publicKey: z.string().regex(HEX_32, 'expected 32-byte hex public key'),
  signature: z.string().regex(EC_SIGNATURE, 'expected 64-byte hex EC signature'),
});

export const LockPayloadSchema = z.object({
  sourceChain: z.string().min(1),
  sourceToken: z.string().min(1),
  wrapperToken: z.string().regex(HEX_32),
  recipient: z.string().min(1),
  amount: z.string().regex(DEC_BIGINT),
  nonce: z.string().regex(HEX_32),
});

export const UnlockPayloadSchema = z.object({
  sourceChain: z.string().min(1),
  wrapperToken: z.string().regex(HEX_32),
  sourceAddress: z.string().min(1),
  amount: z.string().regex(DEC_BIGINT),
  nonce: z.string().regex(HEX_32),
});

export const MintRequestSchema = z.object({
  relayer: z.string().min(1),
  wrapperToken: z.string().regex(HEX_32),
  payload: LockPayloadSchema,
  // Threshold is enforced on-chain in `verify_threshold`; here we
  // just refuse an empty attestations array so the client gets an
  // explicit 400 rather than a wasted Soroban RPC.
  attestations: z.array(SignedAttestationSchema).min(1),
});

export const BurnRequestSchema = z.object({
  relayer: z.string().min(1),
  wrapperToken: z.string().regex(HEX_32),
  payload: UnlockPayloadSchema,
  attestations: z.array(SignedAttestationSchema).min(1),
});

/* ───────────────  api  ─────────────── */

export const CreateAssetRequestSchema = z.object({
  source: AssetIdSchema,
  name: z.string().min(1).max(64),
  symbol: z.string().min(1).max(12),
  decimals: z.number().int().min(0).max(18),
});

export const CreateAssetResponseSchema = z.object({
  wrapperToken: z.string().regex(HEX_32),
  txHash: z.string().min(1),
});

export const ListAssetsResponseSchema = z.object({
  // Cap at 1000 to refuse pathologically-large list payloads
  // (e.g. from a buggy / malicious dashboard). Production listing
  // is paginated at the route handler anyway.
  assets: z
    .array(
      z.object({
        id: z.string().min(1),
        source: AssetIdSchema,
        wrapperToken: z.string().regex(HEX_32),
        symbol: z.string().min(1).max(12),
        name: z.string().min(1).max(64),
        decimals: z.number().int().min(0).max(18),
      }),
    )
    .max(1000),
});

export const GetTransactionResponseSchema = z.object({
  transaction: TransactionSchema,
});

export const ListTransactionsResponseSchema = z.object({
  transactions: z.array(TransactionSchema).max(500),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  network: z.string(),
  horizon: z.enum(['reachable', 'down']),
  contracts: z.object({
    bridge: z.string().regex(HEX_32),
    factory: z.string().regex(HEX_32),
    wrapperTokenTemplate: z.string().regex(HEX_32),
  }),
});

/* ───────────────  inferred types  ─────────────── */
/* Only export the Inferred*-type for shapes where the validator's
 * view is STRICTLY STRONGER than the existing TS type, and where
 * downstream code is expected to consume it. For shapes that match
 * the existing TS type modulo regex constraints, use the TS type
 * directly. Call this `z.infer<typeof XSchema>` at the call site if
 * you need the validator's view. */
export type SourceChainIdInferred = z.infer<typeof SourceChainIdSchema>;
export type WrappedAssetInferred = z.infer<typeof WrappedAssetSchema>;
export type TransactionInferred = z.infer<typeof TransactionSchema>;
