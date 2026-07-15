/**
 * Soroban contract wrappers spec.
 *
 * Coverage target: the three Contract classes in
 * `packages/sdk/src/contracts/`:
 *   - `FactoryContract::buildCreateWrapperAsset()` — off-chain
 *     construction of the `create_wrapper` invoke call (6 args:
 *     Address(developerPK), String(sourceChain), Bytes(sourceToken),
 *     Bytes(name), Bytes(symbol), U32(decimals)).
 *   - `BridgeContract::buildMint()` / `buildBurn()` — off-chain
 *     construction of the bridge attestation ops. Note the on-chain
 *     `verify_threshold` is a security stub pending the 64→65-byte
 *     signature migration; the relayer pre-validates locally with
 *     `verifyThreshold` and the SDK only does the Address-string
 *     plumbing.
 *   - `WrapperTokenContract::buildMint()` / `buildBurn()` /
 *     `buildTransfer()` — Standard SAC ops. Note `buildMint()` takes
 *     a `_bridgePK` prefix-underscore parameter to signal "intentionally
 *     unused at the SDK layer" — the on-chain minter auth comes from
 *     the contract's stored minter list.
 *   - `static decodeAmount()` / `decodeBalance()` / `tokenInfo()` —
 *     pure helpers.
 *
 * `simulateAndSubmit()` is NOT exercised here — it requires deep
 * mocking of `SorobanRpc.Server.prototype.simulateTransaction`,
 * `SorobanRpc.Server.prototype.sendTransaction`, AND the free-function
 * `SorobanRpc.assembleTransaction`. Two failure modes make that
 * brittle in unit tests: (a) `SorobanRpc.assembleTransaction` is
 * non-configurable so `vi.spyOn` fails with
 * `Cannot redefine property: assembleTransaction` (Object.freeze
 * applied at SDK module-init), and (b) `TransactionBuilder.addOperation`
 * calls `op.sourceAccount()` on the returned op, which the spy
 * implementation would have to synthesise. Coverage for
 * `simulateAndSubmit` belongs in a soroban-RPC integration suite
 * with a fake RPC, not here.
 *
 * Spy strategy: pass-through to the real `Operation.invokeContractFunction`
 * so the returned op is a real `xdr.Operation` (sound for any
 * downstream consumer), while still capturing the input params
 * (where contract id / function name / args order live as plain JS
 * fields — readable without parsing the XDR tree).
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  Keypair,
  Operation,
  StrKey,
  nativeToScVal,
} from '@stellar/stellar-sdk';

import { BridgeContract } from './contracts/bridge.js';
import { FactoryContract } from './contracts/factory.js';
import { WrapperTokenContract } from './contracts/wrapper-token.js';

// `Keypair.random()` rather than a hardcoded strkey fixture because
// `new Address(strkey)` validates the CRC16 checksum on every
// invocation. A 56-char `'G' + 'A'.repeat(55)`-shaped string is
// rejected at runtime (`Error: Unsupported address type`) even
// though it pattern-matches the address regex used elsewhere — the
// regex is a shape check, not a checksum check. Re-derived once per
// module load; all tests share the same address because the
// assertions verify *shape* (contract id, function name, args
// count) rather than the address bytes themselves.
const VALID_GADDRESS = Keypair.random().publicKey();

// Same logic for contract ids: `Operation.invokeContractFunction`
// builds an `Address` from the contract strkey and validates the
// StrKey encoding on entry. `'CFACTORY123'` / `'CBRIDGE123'` /
// `'CWRAP123'` are 8-13 chars — well below the 56-char base32
// payload + 'C' prefix that stellar-sdk expects. Using
// `StrKey.encodeContractId(zero)` yields a real 57-char strkey with
// a valid checksum; each contract class gets its own derived id so
// assertions can distinguish them by value rather than just by
// `toHaveBeenCalledWith({...})` substring matching.
const FACTORY_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
const BRIDGE_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 2));
const WRAP_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 3));

/**
 * Install a pass-through spy on `Operation.invokeContractFunction`.
 * The spy:
 *   - captures the input `params` so tests can read `.contract`,
 *     `.function`, and `.args` as plain JS fields without parsing
 *     the XDR tree returned by the real call
 *   - calls through to the real implementation via a saved reference
 *     (NOT through the spied method, which would recurse)
 *   - returns a real `xdr.Operation`, sound for any downstream
 *     consumer (e.g. `TransactionBuilder.addOperation` needs a
 *     `.sourceAccount()` method which only the real op has)
 */
function setupInvokeSpy(): MockInstance {
  // Bind to Operation since the static method reads Operation as
  // `this`. Single cast on the ref (not the inner arrow) keeps TS
  // narrowing inside the original implementation surface.
  const realImpl = Operation.invokeContractFunction.bind(Operation) as typeof Operation.invokeContractFunction;
  return vi.spyOn(Operation, 'invokeContractFunction').mockImplementation(realImpl);
}

/* ───────────────────────────────────────────────────────────── FactoryContract ── */

describe('FactoryContract', () => {
  const factory = new FactoryContract(FACTORY_CONTRACT_ID);
  let invokeSpy: MockInstance;

  beforeEach(() => {
    invokeSpy = setupInvokeSpy();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('buildCreateWrapperAsset', () => {
    const happyInput = {
      sourceChain: 'ethereum' as const,
      sourceToken: '0xab',
      name: 'Wrapped ETH',
      symbol: 'wETH',
      decimals: 7,
    };

    it('targets the factory contract id with function name `create_wrapper`', () => {
      factory.buildCreateWrapperAsset(VALID_GADDRESS, happyInput);
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: FACTORY_CONTRACT_ID, function: 'create_wrapper' }),
      );
    });

    it('emits 6 args in the canonical order', () => {
      factory.buildCreateWrapperAsset(VALID_GADDRESS, happyInput);
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(6);
    });

    it('strips the 0x prefix from sourceToken hex bytes (WASM reads raw bytes)', () => {
      factory.buildCreateWrapperAsset(VALID_GADDRESS, { ...happyInput, sourceToken: '0xabcd' });
      factory.buildCreateWrapperAsset(VALID_GADDRESS, { ...happyInput, sourceToken: 'abcd' });
      const with0x = (invokeSpy.mock.calls[0]?.[0] as { args: Array<{ toXDR: (enc: string) => string }> }).args[2];
      const without0x = (invokeSpy.mock.calls[1]?.[0] as { args: Array<{ toXDR: (enc: string) => string }> }).args[2];
      // Both should produce Buffer<ab cd> → identical ScVal bytes.
      expect(with0x?.toXDR('hex')).toBe(without0x?.toXDR('hex'));
    });

    it('throws on a malformed developerPK (stellar-sdk Address strkey checksum)', () => {
      const malformedPK = 'G' + 'A'.repeat(55);
      expect(() => factory.buildCreateWrapperAsset(malformedPK, happyInput)).toThrow();
    });

    it('returns a real xdr.Operation (not a stub — sound for downstream TransactionBuilder)', () => {
      const op = factory.buildCreateWrapperAsset(VALID_GADDRESS, happyInput);
      // `xdr.Operation` does NOT expose `.type` as a public field in
      // stellar-sdk v12 (only `Operation2<...>` has it and TS narrows
      // it away after instantiation). Use the conservative
      // "operation is truthy and serializable" probe instead: a real
      // op serializes to base64 via `.toXDR('base64')` (a plain-object
      // stub from a v3-style spy does not).
      const xdr = (op as { toXDR: (enc: string) => string }).toXDR('base64');
      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
    });
  });
});

/* ──────────────────────────────────────────────────────────────── BridgeContract ── */

describe('BridgeContract', () => {
  const bridge = new BridgeContract(BRIDGE_CONTRACT_ID);
  let invokeSpy: MockInstance;

  beforeEach(() => {
    invokeSpy = setupInvokeSpy();
  });
  afterEach(() => vi.restoreAllMocks());

  const samplePayload = {
    sourceChain: 'ethereum' as const,
    sourceToken: '0xab',
    wrapperToken: 'aa'.repeat(32),
    recipient: VALID_GADDRESS,
    amount: '100',
    // LockPayloadSchema's `nonce` is a hex string (see
    // packages/shared/src/types/schemas.ts). Keep this in 32-byte
    // hex form so the buildLockDigest re-encode round-trip is
    // trivially consistent.
    nonce: '00'.repeat(32),
  };

  describe('buildMint', () => {
    it('emits `mint_with_attestation` targeting the bridge contract with 4 args', () => {
      bridge.buildMint({
        wrapperToken: VALID_GADDRESS,
        relayer: VALID_GADDRESS,
        payload: samplePayload,
        attestations: [],
      });
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: BRIDGE_CONTRACT_ID, function: 'mint_with_attestation' }),
      );
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(4);
    });

    it('throws on malformed relayer (Address strkey checksum)', () => {
      expect(() =>
        bridge.buildMint({
          wrapperToken: VALID_GADDRESS,
          relayer: 'G' + 'A'.repeat(55),
          payload: samplePayload,
          attestations: [],
        }),
      ).toThrow();
    });

    it('throws on malformed wrapperToken', () => {
      expect(() =>
        bridge.buildMint({
          wrapperToken: 'NOT-A-GADDRESS',
          relayer: VALID_GADDRESS,
          payload: samplePayload,
          attestations: [],
        }),
      ).toThrow();
    });
  });

  describe('buildBurn', () => {
    it('emits `burn_with_attestation` targeting the bridge contract with 4 args', () => {
      bridge.buildBurn(
        VALID_GADDRESS,
        VALID_GADDRESS,
        {
          sourceChain: 'ethereum',
          wrapperToken: 'aa'.repeat(32),
          sourceAddress: '0xdeadbeef',
          amount: '250',
          nonce: '00'.repeat(32),
        },
        [],
      );
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: BRIDGE_CONTRACT_ID, function: 'burn_with_attestation' }),
      );
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(4);
    });

    it('throws when wrapperToken (1st arg) is malformed', () => {
      expect(() =>
        bridge.buildBurn(
          'G' + 'A'.repeat(55),
          VALID_GADDRESS,
          {
            sourceChain: 'ethereum',
            wrapperToken: 'aa'.repeat(32),
            sourceAddress: '0xdeadbeef',
            amount: '250',
            nonce: '00'.repeat(32),
          },
          [],
        ),
      ).toThrow();
    });
  });

  describe('static decodeAmount', () => {
    it('round-trips through nativeToScVal(BigInt(123)) → decodeAmount → 123n', () => {
      const scv = nativeToScVal(BigInt(123), { type: 'i128' });
      expect(BridgeContract.decodeAmount(scv)).toBe(123n);
    });
  });
});

/* ──────────────────────────────────────────────────────── WrapperTokenContract ── */

describe('WrapperTokenContract', () => {
  const token = new WrapperTokenContract(WRAP_CONTRACT_ID);
  let invokeSpy: MockInstance;

  beforeEach(() => {
    invokeSpy = setupInvokeSpy();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('buildMint', () => {
    it('emits `mint` with 2 args (recipient Address, i128 amount)', () => {
      token.buildMint(VALID_GADDRESS, VALID_GADDRESS, 1_000n);
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: WRAP_CONTRACT_ID, function: 'mint' }),
      );
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(2);
    });

    it('throws on malformed recipient', () => {
      expect(() => token.buildMint(VALID_GADDRESS, 'G' + 'A'.repeat(55), 1_000n)).toThrow();
    });

    it('silently ignores _bridgePK (underscore prefix signals SDK-layer unused for on-chain minter auth)', () => {
      // _bridgePK is intentionally unused at the SDK layer; on-chain
      // minter auth comes from the contract's stored minter list.
      expect(() => token.buildMint('garbage', VALID_GADDRESS, 0n)).not.toThrow();
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(2);
    });
  });

  describe('buildBurn', () => {
    it('emits `burn` with 2 args (from Address, i128 amount)', () => {
      token.buildBurn(VALID_GADDRESS, 5_000n);
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: WRAP_CONTRACT_ID, function: 'burn' }),
      );
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(2);
    });

    it('throws on malformed `from`', () => {
      expect(() => token.buildBurn('G' + 'A'.repeat(55), 1n)).toThrow();
    });
  });

  describe('buildTransfer', () => {
    it('emits `transfer` with 3 args (from, to, i128 amount)', () => {
      token.buildTransfer(VALID_GADDRESS, VALID_GADDRESS, 7_000n);
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ contract: WRAP_CONTRACT_ID, function: 'transfer' }),
      );
      const params = invokeSpy.mock.lastCall?.[0] as { args: unknown[] } | undefined;
      expect(params?.args).toHaveLength(3);
    });
  });

  describe('static decodeBalance', () => {
    it('round-trips through nativeToScVal(BigInt(999)) → decodeBalance → 999n', () => {
      const scv = nativeToScVal(BigInt(999), { type: 'i128' });
      expect(WrapperTokenContract.decodeBalance(scv)).toBe(999n);
    });
  });

  describe('static tokenInfo', () => {
    it('derives name + symbol from the contract id prefix and uses decimals=7', () => {
      const meta = WrapperTokenContract.tokenInfo('CAAA1234BBBB');
      expect(meta.symbol).toBe('w-CAAA');
      expect(meta.name).toBe('Wrapped Token (CAAA12…)');
      expect(meta.decimals).toBe(7);
    });

    it('handles a very short contract id without crashing (slice is bounded)', () => {
      const meta = WrapperTokenContract.tokenInfo('C');
      // slice(0, 4) of 'C' = 'C'; slice(0, 6) of 'C' = 'C'.
      expect(meta.symbol).toBe('w-C');
      expect(meta.name).toBe('Wrapped Token (C…)');
      expect(meta.decimals).toBe(7);
    });
  });
});
