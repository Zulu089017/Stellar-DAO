import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { BridgeContract } from '@stellardao/sdk';
import type { SourceChainId } from '@stellardao/shared';

import { eventQueue } from '../state/event-queue.js';
import type { LockEvent } from '../sources/types.js';

import {
  handleLockEvent,
  type HandleLockEventDeps,
} from './relay-pipeline.js';

/* ─────────────────── fixtures ─────────────────── */

const makeLockEvent = (overrides: Partial<LockEvent> = {}): LockEvent => ({
  sourceToken: '0x' + '11'.repeat(20),
  wrapperToken: '0x' + '00'.repeat(32),
  recipient: 'G' + 'A'.repeat(55),
  amount: '100',
  nonce: '0x' + '22'.repeat(32),
  ...overrides,
});

const makeDeps = (
  overrides: Partial<HandleLockEventDeps> = {},
): HandleLockEventDeps => {
  const stubDigest = vi.fn(
    (_p: Parameters<HandleLockEventDeps['buildLockDigest']>[0]) =>
      Buffer.alloc(32, 7),
  );
  const stubSign = vi.fn(
    async (
      _digest: Parameters<HandleLockEventDeps['signSecp256k1']>[0],
      _key: Parameters<HandleLockEventDeps['signSecp256k1']>[1],
    ): Promise<Uint8Array> => new Uint8Array(64).fill(0x42),
  );
  const stubSubmitMint = vi.fn(
    async (
      _args: Parameters<HandleLockEventDeps['signer']['submitMintToBridge']>[0],
    ): Promise<string> => 'txhash-' + 'a'.repeat(64),
  );
  const stubSigner = {
    submitMintToBridge: stubSubmitMint,
  } as unknown as HandleLockEventDeps['signer'];

  return {
    eventQueue,
    buildLockDigest: stubDigest as unknown as HandleLockEventDeps['buildLockDigest'],
    signSecp256k1: stubSign as unknown as HandleLockEventDeps['signSecp256k1'],
    signer: stubSigner,
    bridge: new BridgeContract(''),
    sourceKeypair: Keypair.random(),
    relayerPK: 'G' + 'A'.repeat(55),
    relayerSecretKey: '0x' + 'a1'.repeat(32),
    networkPassphrase: 'Test SDF Network ; September 2015',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    ...overrides,
  };
};

const getSubmitCalls = (deps: HandleLockEventDeps) =>
  (deps.signer.submitMintToBridge as unknown as ReturnType<typeof vi.fn>).mock
    .calls;

const getSignCalls = (deps: HandleLockEventDeps) =>
  (deps.signSecp256k1 as unknown as ReturnType<typeof vi.fn>).mock.calls;

const getDigestCalls = (deps: HandleLockEventDeps) =>
  (deps.buildLockDigest as unknown as ReturnType<typeof vi.fn>).mock.calls;

/* ─────────────────── tests ─────────────────── */

describe('handleLockEvent', () => {
  beforeEach(() => {
    eventQueue.__clearForTest();
  });
  afterEach(() => {
    eventQueue.__clearForTest();
  });

  /* 1. Envelope + push: the relayer constructs a Transaction from the
   *    LockEvent and pushes it onto eventQueue. */
  it('envelopes the lock event and pushes it onto eventQueue as `attesting`', async () => {
    const event = makeLockEvent({
      nonce: '0x' + 'aa'.repeat(32),
      amount: '500',
    });
    const deps = makeDeps();
    await handleLockEvent('ethereum', event, deps);

    const stored = eventQueue.list();
    expect(stored).toHaveLength(1);
    const tx = stored[0];
    if (!tx) throw new Error('expected 1 eventQueue row, got 0');
    expect(tx.type).toBe('wrap');
    expect(tx.sourceChain).toBe('ethereum');
    expect(tx.sourceToken).toBe(event.sourceToken);
    expect(tx.wrapperToken).toBe(event.wrapperToken);
    expect(tx.recipient).toBe(event.recipient);
    expect(tx.amount).toBe(event.amount);
    expect(tx.nonce).toBe(event.nonce);
    expect(tx.status).toBe('minting'); // post-submit lifecycle advanced
    expect(tx.sourceTxHash).toBeNull();
    expect(tx.stellarTxHash).toBe('txhash-' + 'a'.repeat(64));
    expect(typeof tx.id).toBe('string');
    expect(tx.id.length).toBeGreaterThan(0);
  });

  /* 2. Dedup invariant: the relayer's eventQueue is keyed by
   *    `${sourceChain}:${nonce}`, so two handleLockEvent calls
   *    with the same key produce ONE row, not two. The lifecycle
   *    advances from `attesting` → `minting` (post-submit) on the
   *    surviving entry.
   *
   *    TODO(50-item backlog, sourceTxHash dedup): when source-chain
   *    receipt integration lands and the dedup key migrates to
   *    `sourceTxHash`, this test should still pass (the observable
   *    behavior: at most one transaction per lock). The dedup-key
   *    swap is internal. */
  it('dedup invariant: two LockEvents with the same (chain, nonce) produce one row in eventQueue', async () => {
    const event = makeLockEvent({
      nonce: '0x' + 'cc'.repeat(32),
      amount: '500',
    });

    // Pre-existing row at the same key simulates a duplicate event
    // arriving from a separate relayer worker (rare, but the dedup
    // semantics need to be observable end-to-end).
    eventQueue.push({
      id: 'preset-warm',
      type: 'wrap',
      sourceChain: 'ethereum',
      sourceToken: event.sourceToken,
      wrapperToken: event.wrapperToken,
      recipient: event.recipient,
      amount: '100',
      nonce: event.nonce,
      status: 'attesting',
      sourceTxHash: null,
      stellarTxHash: null,
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    });

    const deps = makeDeps();
    await handleLockEvent('ethereum', event, deps);

    expect(eventQueue.list()).toHaveLength(1);
    const tx = eventQueue.list()[0];
    if (!tx) throw new Error('expected 1 eventQueue row, got 0');
    expect(tx.sourceChain).toBe('ethereum');
    expect(tx.nonce).toBe(event.nonce);
    expect(tx.amount).toBe(event.amount); // overwritten by second push
    expect(tx.status).toBe('minting'); // lifecycle advanced post-submit
    expect(tx.stellarTxHash).toBe('txhash-' + 'a'.repeat(64));
  });

  /* 3. Dry-run signature: when the relayer's signing key is not
   *    configured, the signature handed to submitMintToBridge is a
   *    64-byte zeroed array (NOT the typed-array output of a real
   *    signing call). The submit-mint invocation fires either way
   *    so the dashboard surfaces the dry-run attempt. */
  it('dry-run path: emits a 64-byte zeroed signature when relayerSecretKey is undefined', async () => {
    const event = makeLockEvent();
    const deps = makeDeps({ relayerSecretKey: undefined });
    await handleLockEvent('ethereum', event, deps);

    // signSecp256k1 must NOT be called in the dry-run path.
    expect(getSignCalls(deps)).toHaveLength(0);

    const submitCalls = getSubmitCalls(deps);
    expect(submitCalls).toHaveLength(1);
    const submittedSig = submitCalls[0]?.[0]?.signature as Uint8Array;
    expect(submittedSig).toBeInstanceOf(Uint8Array);
    expect(submittedSig.length).toBe(64);
    expect([...submittedSig].every((byte) => byte === 0)).toBe(true);
  });

  /* 4. Signed path: signSecp256k1 receives the digest built from the
   *    lock event fields + the secret key, and the resulting
   *    signature bytes are forwarded to submitMintToBridge. */
  it('signed path: invokes signSecp256k1 with the digest + secretKey and submits the resulting signature', async () => {
    const secretKey = '0x' + 'b1'.repeat(32);
    const event = makeLockEvent();
    const deps = makeDeps({ relayerSecretKey: secretKey });
    await handleLockEvent('ethereum', event, deps);

    const signCalls = getSignCalls(deps);
    expect(signCalls).toHaveLength(1);
    const [digestArg, keyArg] = signCalls[0] ?? [];
    if (!digestArg || !keyArg) {
      throw new Error('expected signSecp256k1 to receive (digest, secretKey)');
    }
    // `digest` is whatever the stub returned; just check length.
    expect((digestArg as Uint8Array).length).toBe(32);
    expect(keyArg).toBe(secretKey);

    // signature forwarded to bridge = stub output (constant 0x42).
    const submitCalls = getSubmitCalls(deps);
    const submittedSig = submitCalls[0]?.[0]?.signature as Uint8Array;
    expect(submittedSig.length).toBe(64);
    expect([...submittedSig].every((byte) => byte === 0x42)).toBe(true);
  });

  /* 5. Success path: submitMintToBridge resolves → updateById sets
   *    `status='minting'` and `stellarTxHash` on the queue entry. */
  it('success path: updateById sets status=minting and stellarTxHash on the queue entry', async () => {
    const event = makeLockEvent();
    const deps = makeDeps();
    await handleLockEvent('ethereum', event, deps);

    expect(getSubmitCalls(deps)).toHaveLength(1);
    const tx = eventQueue.list()[0];
    if (!tx) throw new Error('expected 1 eventQueue row, got 0');
    expect(tx.status).toBe('minting');
    expect(tx.stellarTxHash).toBe('txhash-' + 'a'.repeat(64));
    expect(tx.error).toBeUndefined();
  });

  /* 6. Failure path: submitMintToBridge rejects → updateById sets
   *    `status='failed'` and captures the error message. */
  it('failure path: updateById sets status=failed and captures the error message verbatim', async () => {
    const event = makeLockEvent();
    const failSubmit = vi.fn(
      async (
        _args: Parameters<HandleLockEventDeps['signer']['submitMintToBridge']>[0],
      ): Promise<string> => {
        throw new Error('sim-bridge-down');
      },
    );
    const failSigner = {
      submitMintToBridge: failSubmit,
    } as unknown as HandleLockEventDeps['signer'];
    const deps = makeDeps({ signer: failSigner });
    await handleLockEvent('ethereum', event, deps);

    expect(failSubmit).toHaveBeenCalledTimes(1);
    const tx = eventQueue.list()[0];
    if (!tx) throw new Error('expected 1 eventQueue row, got 0');
    expect(tx.status).toBe('failed');
    expect(tx.error).toBe('sim-bridge-down');
    expect(tx.stellarTxHash).toBeNull();
  });

  /* 7. Digest builder contract: buildLockDigest receives a
   *    plain object with `sourceChain` (matched against the chain
   *    passed to handleLockEvent), the lock fields, and a
   *    `nonce` Buffer decoded from the hex string. Covers BOTH
   *    the WITH-`0x`-prefix branch and the bare-hex `else` branch
   *    so a regression to either side surfaces. */
  it('digest builder receives sourceChain + lock fields + Buffer-decoded nonce (with 0x prefix)', async () => {
    const event = makeLockEvent({ nonce: '0x' + 'dd'.repeat(32) });
    const deps = makeDeps();
    const chain: SourceChainId = 'solana';
    await handleLockEvent(chain, event, deps);

    const digestCalls = getDigestCalls(deps);
    expect(digestCalls).toHaveLength(1);
    const args = digestCalls[0]?.[0];
    if (!args) throw new Error('expected buildLockDigest to receive args');
    expect(args.sourceChain).toBe(chain);
    expect(args.sourceToken).toBe(event.sourceToken);
    expect(args.wrapperToken).toBe(event.wrapperToken);
    expect(args.recipient).toBe(event.recipient);
    expect(args.amount).toBe(event.amount);
    expect(args.nonce).toBeInstanceOf(Buffer);
    // The hex-string check (64 chars after `dd` × 32) implies a
    // 32-byte buffer; a regression to a 0-length buffer would
    // surface as an empty hex string here, not a length mismatch.
    expect((args.nonce as Buffer).toString('hex')).toBe('dd'.repeat(32));
  });

  /* 7b. Companion to test 7: locks down the `else` branch of the
   *     inline 0x-strip. Without this, the production fix is
   *     only exercised for prefixed nonces; bare hex would still
   *     trip on a future refactor that drops the startsWith check. */
  it('digest builder accepts nonce without 0x prefix (decodes the raw hex)', async () => {
    const event = makeLockEvent({ nonce: 'dd'.repeat(32) });
    const deps = makeDeps();
    await handleLockEvent('ethereum', event, deps);

    const digestCalls = getDigestCalls(deps);
    const args = digestCalls[0]?.[0];
    if (!args) throw new Error('expected buildLockDigest to receive args');
    expect(args.nonce).toBeInstanceOf(Buffer);
    expect((args.nonce as Buffer).toString('hex')).toBe('dd'.repeat(32));
  });
});
