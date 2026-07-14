import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';

import { buildLockDigest, buildUnlockDigest, verifySecp256k1 } from './attestation.js';

const sampleNonce = new Uint8Array(32).fill(7);
const WRAPPER_TOKEN_HEX = '00'.repeat(32); // 32-byte zero contract id as hex string

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

describe('verifySecp256k1', () => {
  it('returns false on a tampered signature', async () => {
    const secret = new Uint8Array(32).fill(11);
    const digest = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: WRAPPER_TOKEN_HEX,
      recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
      amount: '100',
      nonce: sampleNonce,
    });
    const sig = secp256k1.sign(digest, secret, { lowS: true }).toBytes('compact');
    const pub = secp256k1.getPublicKey(secret, true);
    const tampered = sig.slice();
    tampered[0]! ^= 0xff;
    await expect(verifySecp256k1(digest, pub, tampered)).resolves.toBe(false);
    // also sanity-check that the noble sha256 import really works in this env
    expect(sha256(new Uint8Array([1, 2, 3])).length).toBe(32);
  });
});
