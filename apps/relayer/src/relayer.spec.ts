import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { ed25519 } from '@noble/curves/ed25519';
import { buildLockDigest, signEd25519, verifyEd25519 } from '@stellardao/sdk';

import { eventQueue } from './state/event-queue.js';

describe('buildLockDigest + sign + verify (round-trip)', () => {
  it('produces a 32-byte hash and a cryptographically valid ed25519 signature', async () => {
    // Use a real G-address from a randomly-generated keypair so future
    // SDK bumps that add Address validation upstream of the digest
    // builder don't silently break this assertion.
    const recipientKp = Keypair.random();

    // Generate a real ed25519 private key from the noble library.
    const privKey = ed25519.utils.randomPrivateKey();
    const testPrivKey = '0x' + Buffer.from(privKey).toString('hex');

    const digest = buildLockDigest({
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: 'ab'.repeat(32),
      recipient: recipientKp.publicKey(),
      amount: '500',
      nonce: new Uint8Array(32).fill(7),
    });
    expect(digest.length).toBe(32);

    const sig = await signEd25519(digest, testPrivKey);
    expect(sig.length).toBe(64);

    // Round-trip: derive the public key from the private key and verify
    // the signature against it. ed25519 maps cleanly to Soroban's
    // native `env.crypto().ed25519_verify()` — no format conversion needed.
    const pubKey = ed25519.getPublicKey(privKey);
    const isValid = await verifyEd25519(digest, pubKey, sig);
    expect(isValid).toBe(true);
  });
});

describe('eventQueue', () => {
  it('round-trips a transaction', () => {
    const recipientKp = Keypair.random();
    const tx = eventQueue.push({
      id: 'ethereum:abc',
      type: 'wrap',
      sourceChain: 'ethereum',
      sourceToken: '0xab',
      wrapperToken: 'CABC',
      recipient: recipientKp.publicKey(),
      amount: '1000',
      status: 'pending',
      sourceTxHash: '0x123',
      stellarTxHash: null,
      nonce: 'abc',
    });
    expect(tx.id).toBe('ethereum:abc');
    expect(eventQueue.list().length).toBe(1);
  });
});
