import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';

import {
  buildLockDigest,
  buildUnlockDigest,
  signSecp256k1,
  verifySecp256k1,
  verifyThreshold,
} from './attestation.js';

const sampleNonce = new Uint8Array(32).fill(7);
const WRAPPER_TOKEN_HEX = '00'.repeat(32); // 32-byte zero contract id as hex string

/* ─────────────────── digest builder tests (existing) ─────────────────── */

describe('buildLockDigest', () => {
  it('is deterministic for the same payload', () => {
    const a = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: WRAPPER_TOKEN_HEX,
      recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
      amount: '100',
      nonce: sampleNonce,
    });
    const b = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: WRAPPER_TOKEN_HEX,
      recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
      amount: '100',
      nonce: sampleNonce,
    });
    expect(a).toEqual(b);
  });

  it('differs when any field changes', () => {
    const a = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: WRAPPER_TOKEN_HEX,
      recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
      amount: '100',
      nonce: sampleNonce,
    });
    const b = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: WRAPPER_TOKEN_HEX,
      recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
      amount: '101',
      nonce: sampleNonce,
    });
    expect(a).not.toEqual(b);
  });
});

describe('buildUnlockDigest', () => {
  it('produces a stable hash for the same inputs', () => {
    const a = buildUnlockDigest({
      sourceChain: 'ethereum',
      wrapperToken: WRAPPER_TOKEN_HEX,
      sourceAddress: '0xdeadbeef',
      amount: '250',
      nonce: sampleNonce,
    });
    expect(a.length).toBe(32);
  });
});

/* ─────────────────── shared fixtures for crypto tests ─────────────────── */

// Keys are deterministic-but-not-secret-by-construction. They are not
// cryptographically random and cannot be confused with real operator
// keys; a developer copy-pasting them into a production HSM would be
// obvious from any reasonable audit.
const SECRET_A = new Uint8Array(32).fill(11);
const SECRET_B = new Uint8Array(32).fill(22);
const SECRET_C = new Uint8Array(32).fill(33);
// Compressed secp256k1 public keys (33 bytes).
const PUB_A = secp256k1.getPublicKey(SECRET_A, true);
const PUB_B = secp256k1.getPublicKey(SECRET_B, true);
const PUB_C = secp256k1.getPublicKey(SECRET_C, true);

const SAMPLE_DIGEST = buildLockDigest({
  sourceChain: 'ethereum',
  sourceToken: '0xab',
  wrapperToken: WRAPPER_TOKEN_HEX,
  recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
  amount: '100',
  nonce: sampleNonce,
});

async function signedAttFor(
  secret: Uint8Array,
): Promise<{ publicKey: Uint8Array; signature: Uint8Array }> {
  const signature = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(secret).toString('hex'));
  const publicKey = secp256k1.getPublicKey(secret, true);
  return { publicKey, signature };
}

/* ─────────────────── verifySecp256k1 ─────────────────── */

describe('verifySecp256k1', () => {
  it('returns true for a valid signature from the matching pubkey', async () => {
    const sig = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(SECRET_A).toString('hex'));
    await expect(verifySecp256k1(SAMPLE_DIGEST, PUB_A, sig)).resolves.toBe(true);
  });

  it('returns false when one byte of the signature is flipped', async () => {
    const sig = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(SECRET_A).toString('hex'));
    const tampered = sig.slice();
    tampered[0]! ^= 0xff;
    await expect(verifySecp256k1(SAMPLE_DIGEST, PUB_A, tampered)).resolves.toBe(false);
  });

  it('returns false when one byte of the digest is flipped', async () => {
    const sig = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(SECRET_A).toString('hex'));
    const tampered = SAMPLE_DIGEST.slice();
    tampered[0]! ^= 0xff;
    await expect(verifySecp256k1(tampered, PUB_A, sig)).resolves.toBe(false);
  });

  it('returns false when verifying against a different pubkey', async () => {
    const sig = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(SECRET_A).toString('hex'));
    await expect(verifySecp256k1(SAMPLE_DIGEST, PUB_B, sig)).resolves.toBe(false);
  });

  it('returns false on a 63-byte signature (wrong length — caught, not thrown)', async () => {
    await expect(
      verifySecp256k1(SAMPLE_DIGEST, PUB_A, new Uint8Array(63)),
    ).resolves.toBe(false);
  });

  it('returns false on a 31-byte pubkey (wrong length — caught, not thrown)', async () => {
    const sig = await signSecp256k1(SAMPLE_DIGEST, Buffer.from(SECRET_A).toString('hex'));
    await expect(
      verifySecp256k1(SAMPLE_DIGEST, new Uint8Array(31), sig),
    ).resolves.toBe(false);
  });

  // Sanity check: the @noble/hashes import that backs buildLockDigest /
  // buildUnlockDigest is actually loading in this vitest env. Cheap to
  // run and catches ambiguous ESM configs (the project's vitest config
  // has `server.deps.inline: [/@noble\//]` precisely so this resolves).
  // Not a re-test of sha256 itself — that is the upstream library's
  // responsibility.
  it('resolves @noble/hashes/sha256 and produces 32-byte digests', () => {
    expect(sha256(new Uint8Array([1, 2, 3])).length).toBe(32);
  });
});

/* ─────────────────── verifyThreshold ─────────────────── */

describe('verifyThreshold', () => {
  it('returns ok when threshold is met by valid attestations', async () => {
    const attestations = [await signedAttFor(SECRET_A), await signedAttFor(SECRET_B)];
    await expect(
      verifyThreshold(attestations, 2, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: true });
  });

  it('returns `insufficient` when attestations fall short of threshold', async () => {
    const attestations = [await signedAttFor(SECRET_A)];
    await expect(
      verifyThreshold(attestations, 2, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: false, error: 'insufficient' });
  });

  it('returns `duplicate_signer` when the same pubkey signs twice', async () => {
    const attestations = [await signedAttFor(SECRET_A), await signedAttFor(SECRET_A)];
    await expect(
      verifyThreshold(attestations, 2, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: false, error: 'duplicate_signer' });
  });

  it('returns `unknown_signer` when attestor is not in the operator list', async () => {
    const attestations = [await signedAttFor(SECRET_A), await signedAttFor(SECRET_C)];
    await expect(
      verifyThreshold(attestations, 2, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: false, error: 'unknown_signer' });
  });

  it('short-circuits after threshold met (duplicate 4th attestation is never evaluated)', async () => {
    const attestations = [
      await signedAttFor(SECRET_A),
      await signedAttFor(SECRET_B),
      await signedAttFor(SECRET_C),
      // Duplicate-SECRETC-as-4th: if short-circuit is broken, the 4th
      // would hit `duplicate_signer` (SEEN-set check fires before verify)
      // and the assertion below would fail. A garbled-len 4th (the
      // prior shape) trips `unknown_signer` instead, which is a weaker
      // test of the short-circuit path because both error classes
      // satisfy outside-the-engine-evals-required.
      await signedAttFor(SECRET_C),
    ];
    await expect(
      verifyThreshold(attestations, 3, [PUB_A, PUB_B, PUB_C], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: true });
  });

  it('is operator-order agnostic', async () => {
    const attestations = [await signedAttFor(SECRET_A), await signedAttFor(SECRET_B)];
    await expect(
      verifyThreshold(attestations, 2, [PUB_B, PUB_A], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: true });
  });

  it('returns ok for the degenerate state threshold=0 with empty attestations', async () => {
    await expect(
      verifyThreshold([], 0, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: true });
  });

  it('returns `insufficient` for threshold=1 with empty attestations', async () => {
    await expect(
      verifyThreshold([], 1, [PUB_A, PUB_B], SAMPLE_DIGEST),
    ).resolves.toEqual({ ok: false, error: 'insufficient' });
  });
});
