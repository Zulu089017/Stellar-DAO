/**
 * Attestation helpers — these run on the relayer and produce the bytes that
 * the bridge signatures are over. The bridge pays for verification, the
 * relayer pays for constructing the canonical digest.
 *
 * Imports `@noble/hashes` and `@noble/curves` from their top-level entries
 * (v1.5+ exposes sha256 / secp256k1 directly); the subpath forms
 * (`@noble/hashes/sha256`) trip TypeScript's moduleResolution in our
 * tsconfig even though they're valid runtime paths.
 */
import { Buffer } from 'node:buffer';

import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { LockPayload, UnlockPayload } from '@stellardao/shared';
import { SIGNATURE_TAGS } from '@stellardao/shared';

const encoder = new TextEncoder();

/** Domain-separated digest matching `LockPayload::digest` in `contracts/bridge/src/storage.rs`. */
export function buildLockDigest(payload: Omit<LockPayload, 'nonce'> & { nonce: Uint8Array }): Uint8Array {
  const buf = Buffer.concat([
    encoder.encode(SIGNATURE_TAGS.LOCK_V1),
    encoder.encode(payload.sourceChain),
    Buffer.from(payload.sourceToken.replace(/^0x/, ''), 'hex'),
    Buffer.from(payload.wrapperToken, 'hex'),
    encoder.encode(payload.recipient),
    Buffer.from(toBigEndianBytes(BigInt(payload.amount))),
    Buffer.from(payload.nonce),
  ]);
  return sha256(buf);
}

/** Domain-separated digest matching `UnlockPayload::digest` in `contracts/bridge/src/storage.rs`. */
export function buildUnlockDigest(
  payload: Omit<UnlockPayload, 'nonce'> & { nonce: Uint8Array },
): Uint8Array {
  const buf = Buffer.concat([
    encoder.encode(SIGNATURE_TAGS.UNLOCK_V1),
    encoder.encode(payload.sourceChain),
    Buffer.from(payload.wrapperToken, 'hex'),
    encoder.encode(payload.sourceAddress),
    Buffer.from(toBigEndianBytes(BigInt(payload.amount))),
    Buffer.from(payload.nonce),
  ]);
  return sha256(buf);
}

/** Sign the digest with secp256k1 (default relayer scheme). */
export async function signSecp256k1(
  digest: Uint8Array,
  privateKeyHex: string,
): Promise<Uint8Array> {
  const priv = Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex');
  const sig = secp256k1.sign(digest, priv, { lowS: true });
  return sig.toBytes('compact');
}

/** Verify a secp256k1 attestation server-side (used by the relayer's joining nodes). */
export async function verifySecp256k1(
  digest: Uint8Array,
  publicKey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return secp256k1.verify(signature, digest, publicKey, { lowS: true });
  } catch {
    return false;
  }
}

/* ───────────────  threshold aggregation  ─────────────── */

/**
 * SDK-side mirror of `verify_threshold` in
 * `contracts/bridge/src/verification.rs`. The on-chain verifier is
 * currently a SECURITY STUB that returns `false` for every call
 * (pending the 64→65-byte signature migration against `soroban-sdk`
 * 21.x), so the relayer MUST pre-validate locally before
 * submitting a Soroban RPC. This helper returns a tagged union
 * — never throws — so callers can dispatch on the failure mode
 * without try/catch boilerplate.
 *
 * The tagged-union `error` field maps 1:1 onto the Rust variants:
 *   `'duplicate_signer'`  ↔ `AttestationError::DuplicateSigner`
 *   `'unknown_signer'`    ↔ `AttestationError::UnknownSigner`
 *   `'insufficient'`      ↔ `AttestationError::InsufficientSignatures`
 *
 * Per-attestation check order (duplicate → unknown → valid →
 * threshold) matches the Rust loop so the two implementations
 * cannot disagree on the failure class for any given input.
 * Short-circuits as soon as `valid >= threshold` to avoid wasted
 * EC verify calls (each ~50µs).
 */
export type AttestationEntry = { publicKey: Uint8Array; signature: Uint8Array };

export type ThresholdResult =
  | { ok: true }
  | { ok: false; error: 'insufficient' | 'duplicate_signer' | 'unknown_signer' };

export async function verifyThreshold(
  attestations: AttestationEntry[],
  threshold: number,
  operators: Uint8Array[],
  digest: Uint8Array,
): Promise<ThresholdResult> {
  // Degenerate threshold-0: there is nothing to verify at the
  // signature-aggregation layer. Mirror the "admin override /
  // localnet single-trusted-setup" case the Rust contract handles
  // at its call site, so the relayer can pre-validate zero-threshold
  // payloads without forcing callers to populate the empty atts
  // array. Without this short-circuit we silently fall through to
  // `insufficient` even though `valid=0 >= threshold=0` is vacuously
  // true.
  if (threshold === 0) {
    return { ok: true };
  }

  // Set membership keyed by lowercase hex so the comparison is
  // allocation-free even for large operator sets (50+ operators
  // is plausible once the multi-tenant relayer is in place).
  const operatorsSet = new Set<string>(operators.map(bytesToHex));
  const seen = new Set<string>();
  let valid = 0;

  for (const att of attestations) {
    const pubHex = bytesToHex(att.publicKey);
    if (seen.has(pubHex)) {
      return { ok: false, error: 'duplicate_signer' };
    }
    if (!operatorsSet.has(pubHex)) {
      return { ok: false, error: 'unknown_signer' };
    }
    const isValid = await verifySecp256k1(digest, att.publicKey, att.signature);
    if (isValid) {
      valid += 1;
      seen.add(pubHex);
    }
    if (valid >= threshold) {
      return { ok: true };
    }
  }

  return { ok: false, error: 'insufficient' };
}

/* ───────────────  internal helpers  ─────────────── */

function toBigEndianBytes(value: bigint): Uint8Array {
  // 16-byte big-endian (i128) digest field; small enough for all reasonable amounts.
  const out = new Uint8Array(16);
  let v = value;
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}
