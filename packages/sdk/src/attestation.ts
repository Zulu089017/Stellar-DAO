/**
 * Attestation helpers — these run on the relayer and produce the bytes that
 * the bridge signatures are over. The bridge pays for verification, the
 * relayer pays for constructing the canonical digest.
 *
 * Uses ed25519 via Soroban's native `env.crypto().ed25519_verify()`.
 * Ed25519 maps cleanly to the existing `BytesN<32>` (public key) and
 * `BytesN<64>` (signature) types — no format conversion needed.
 *
 * Imports `@noble/hashes` and `@noble/curves` from their top-level entries
 * (v1.5+ exposes sha256 / ed25519 directly).
 */
import { Buffer } from 'node:buffer';

import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';
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

/** Sign the digest with ed25519 (Soroban-native scheme). */
export async function signEd25519(
  digest: Uint8Array,
  privateKeyHex: string,
): Promise<Uint8Array> {
  const priv = Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex');
  return ed25519.sign(digest, priv);
}

/** Verify an ed25519 attestation (used by the relayer's joining nodes). */
export async function verifyEd25519(
  digest: Uint8Array,
  publicKey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return ed25519.verify(signature, digest, publicKey);
  } catch {
    return false;
  }
}

/* ───────────────  threshold aggregation  ─────────────── */

/**
 * SDK-side mirror of `verify_threshold` in
 * `contracts/bridge/src/verification.rs`. Uses ed25519 via
 * Soroban's native `env.crypto().ed25519_verify()`.
 *
 * The relayer pre-validates locally before submitting to Soroban RPC
 * to avoid wasting gas on invalid attestation bundles. Returns a
 * tagged union — never throws — so callers can dispatch on the
 * failure mode without try/catch boilerplate.
 *
 * The tagged-union `error` field maps 1:1 onto the Rust variants:
 *   `'duplicate_signer'`  ↔ `AttestationError::DuplicateSigner`
 *   `'unknown_signer'`    ↔ `AttestationError::UnknownSigner`
 *   `'insufficient'`      ↔ `AttestationError::InsufficientSignatures`
 *
 * Per-attestation check order (duplicate → unknown → valid →
 * threshold) matches the Rust loop so the two implementations
 * cannot disagree on the failure class for any given input.
 * Short-circuits as soon as `valid >= threshold`.
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
  if (threshold === 0) {
    return { ok: true };
  }

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
    const isValid = await verifyEd25519(digest, att.publicKey, att.signature);
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
