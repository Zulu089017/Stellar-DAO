import { describe, it, expect } from 'vitest';

import {
  SourceChainIdSchema,
  AssetIdSchema,
  WrappedAssetSchema,
  AssetRegistryEntrySchema,
  TxStatusSchema,
  TransactionSchema,
  SignedAttestationSchema,
  LockPayloadSchema,
  UnlockPayloadSchema,
  MintRequestSchema,
  BurnRequestSchema,
  CreateAssetRequestSchema,
  CreateAssetResponseSchema,
  ListAssetsResponseSchema,
  GetTransactionResponseSchema,
  ListTransactionsResponseSchema,
  HealthResponseSchema,
} from './schemas.js';

/* ─────────────────── fixtures ─────────────────── */

const HEX_32 = '0x' + 'a'.repeat(64);
/** 64-byte EC signature, 0x-prefixed (secp256k1 / ed25519 expanded). */
const EC_SIG = '0x' + 'b'.repeat(128);
/** Stellar-style tx hash: 64-char hex, no prefix. */
const TX_HASH_OK = 'c'.repeat(64);
const EVM_ADDRESS = '0x' + '0'.repeat(40);
const UUID_V4 = '11111111-1111-4111-8111-111111111111';

const baseTx = {
  id: UUID_V4,
  type: 'wrap' as const,
  sourceChain: 'ethereum' as const,
  sourceToken: EVM_ADDRESS,
  wrapperToken: HEX_32,
  recipient: HEX_32,
  amount: '1000000',
  status: 'pending' as const,
  sourceTxHash: TX_HASH_OK,
  stellarTxHash: null,
  nonce: HEX_32,
  createdAt: '2026-01-15T12:34:56.000Z',
  updatedAt: '2026-01-15T12:34:56.000Z',
};

const baseAsset = {
  id: `ethereum:${EVM_ADDRESS}`,
  source: { chain: 'ethereum' as const, address: EVM_ADDRESS },
  wrapperToken: HEX_32,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
};

/* ─────────────────── chain ─────────────────── */

describe('SourceChainIdSchema', () => {
  it.each(['ethereum', 'solana', 'polygon'] as const)('accepts %s', (cid) => {
    expect(SourceChainIdSchema.parse(cid)).toBe(cid);
  });
  it('rejects unknown chains', () => {
    const r = SourceChainIdSchema.safeParse('bitcoin');
    expect(r.success).toBe(false);
  });
  it('rejects non-string input', () => {
    expect(() => SourceChainIdSchema.parse(123)).toThrow();
  });
});

describe('AssetIdSchema', () => {
  it('accepts a {chain,address} pair', () => {
    expect(AssetIdSchema.parse({ chain: 'ethereum', address: EVM_ADDRESS })).toEqual({
      chain: 'ethereum',
      address: EVM_ADDRESS,
    });
  });
  it('rejects empty address', () => {
    expect(() => AssetIdSchema.parse({ chain: 'ethereum', address: '' })).toThrow();
  });
});

/* ─────────────────── asset ─────────────────── */

describe('WrappedAssetSchema', () => {
  it('round-trips a valid asset', () => {
    expect(
      WrappedAssetSchema.parse({
        ...baseAsset,
        totalSupply: '0',
        deployedAt: '2026-01-15T12:34:56.000Z',
      }),
    ).toBeDefined();
  });
  it('rejects non-integer decimals', () => {
    expect(() =>
      WrappedAssetSchema.parse({
        ...baseAsset,
        totalSupply: '0',
        deployedAt: '2026-01-15T12:34:56.000Z',
        decimals: 6.5,
      }),
    ).toThrow();
  });
  it('rejects non-hex wrapperToken', () => {
    expect(() =>
      WrappedAssetSchema.parse({
        ...baseAsset,
        totalSupply: '0',
        deployedAt: '2026-01-15T12:34:56.000Z',
        wrapperToken: 'not-hex',
      }),
    ).toThrow();
  });
  it('rejects negative decimals', () => {
    expect(() =>
      WrappedAssetSchema.parse({
        ...baseAsset,
        totalSupply: '0',
        deployedAt: '2026-01-15T12:34:56.000Z',
        decimals: -1,
      }),
    ).toThrow();
  });
});

describe('AssetRegistryEntrySchema', () => {
  it('round-trips a valid entry', () => {
    expect(AssetRegistryEntrySchema.parse(baseAsset)).toBeDefined();
  });
});

/* ─────────────────── transaction ─────────────────── */

describe('TxStatusSchema', () => {
  it.each(['pending', 'attesting', 'minting', 'completed', 'failed', 'refunded'] as const)(
    'accepts %s',
    (status) => {
      expect(TxStatusSchema.parse(status)).toBe(status);
    },
  );
  it('rejects unknown status', () => {
    expect(() => TxStatusSchema.parse('canceled')).toThrow();
  });
});

describe('TransactionSchema', () => {
  it('round-trips a valid transaction', () => {
    expect(TransactionSchema.parse(baseTx)).toEqual(baseTx);
  });
  it('rejects non-uuid id', () => {
    expect(() => TransactionSchema.parse({ ...baseTx, id: 'not-uuid' })).toThrow();
  });
  it('rejects unknown sourceChain', () => {
    expect(() => TransactionSchema.parse({ ...baseTx, sourceChain: 'bitcoin' })).toThrow();
  });
  it('accepts stellarTxHash + sourceTxHash both null', () => {
    expect(
      TransactionSchema.parse({ ...baseTx, sourceTxHash: null, stellarTxHash: null }),
    ).toBeDefined();
  });
  it('accepts `error: null` (explicit clear) and field-absent (baseTx has no `error` key by design)', () => {
    expect(TransactionSchema.parse({ ...baseTx, error: null })).toBeDefined();
    expect(TransactionSchema.parse(baseTx)).toBeDefined();
  });
});

/* ─────────────────── bridge ─────────────────── */

describe('SignedAttestationSchema', () => {
  it('accepts valid pubkey+sig', () => {
    expect(SignedAttestationSchema.parse({ publicKey: HEX_32, signature: EC_SIG })).toBeDefined();
  });
  it('rejects short pubkey', () => {
    expect(() =>
      SignedAttestationSchema.parse({ publicKey: HEX_32.slice(0, 20), signature: EC_SIG }),
    ).toThrow();
  });
  // Guard the SPECIFIC blocker the previous validation pass missed:
  // a Stellar-style tx hash (no `0x` prefix, 64 chars) must NOT be
  // accepted as an EC signature (which expects 0x + 128 chars).
  it('rejects a Stellar tx hash mis-submitted as a signature', () => {
    expect(() =>
      SignedAttestationSchema.parse({ publicKey: HEX_32, signature: TX_HASH_OK }),
    ).toThrow();
  });
});

describe('LockPayloadSchema', () => {
  const sample = {
    sourceChain: 'ethereum',
    sourceToken: EVM_ADDRESS,
    wrapperToken: HEX_32,
    recipient: HEX_32,
    amount: '1000000',
    nonce: HEX_32,
  };
  it('round-trips', () => {
    expect(LockPayloadSchema.parse(sample)).toEqual(sample);
  });
  it('rejects non-numeric amount', () => {
    expect(() => LockPayloadSchema.parse({ ...sample, amount: '1.5' })).toThrow();
  });
});

describe('UnlockPayloadSchema', () => {
  const sample = {
    sourceChain: 'ethereum',
    wrapperToken: HEX_32,
    sourceAddress: EVM_ADDRESS,
    amount: '1000000',
    nonce: HEX_32,
  };
  it('round-trips', () => {
    expect(UnlockPayloadSchema.parse(sample)).toEqual(sample);
  });
});

describe('MintRequestSchema', () => {
  const sample = {
    relayer: 'relayer-1',
    wrapperToken: HEX_32,
    payload: {
      sourceChain: 'ethereum',
      sourceToken: EVM_ADDRESS,
      wrapperToken: HEX_32,
      recipient: HEX_32,
      amount: '1000000',
      nonce: HEX_32,
    },
    attestations: [{ publicKey: HEX_32, signature: EC_SIG }],
  };
  it('round-trips', () => {
    expect(MintRequestSchema.parse(sample)).toEqual(sample);
  });
  it('rejects empty attestations array', () => {
    expect(() => MintRequestSchema.parse({ ...sample, attestations: [] })).toThrow();
  });
});

describe('BurnRequestSchema', () => {
  const sample = {
    relayer: 'relayer-1',
    wrapperToken: HEX_32,
    payload: {
      sourceChain: 'ethereum',
      wrapperToken: HEX_32,
      sourceAddress: EVM_ADDRESS,
      amount: '1000000',
      nonce: HEX_32,
    },
    attestations: [{ publicKey: HEX_32, signature: EC_SIG }],
  };
  it('round-trips', () => {
    expect(BurnRequestSchema.parse(sample)).toEqual(sample);
  });
});

/* ─────────────────── api ─────────────────── */

describe('CreateAssetRequestSchema', () => {
  const sample = {
    source: { chain: 'ethereum' as const, address: EVM_ADDRESS },
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  };
  it('round-trips', () => {
    expect(CreateAssetRequestSchema.parse(sample)).toEqual(sample);
  });
  it('rejects decimals out of [0,18]', () => {
    expect(() => CreateAssetRequestSchema.parse({ ...sample, decimals: 19 })).toThrow();
    expect(() => CreateAssetRequestSchema.parse({ ...sample, decimals: -1 })).toThrow();
  });
});

describe('CreateAssetResponseSchema', () => {
  it('round-trips', () => {
    expect(
      CreateAssetResponseSchema.parse({ wrapperToken: HEX_32, txHash: TX_HASH_OK }),
    ).toBeDefined();
  });
});

describe('ListAssetsResponseSchema', () => {
  it('accepts an empty assets array', () => {
    expect(ListAssetsResponseSchema.parse({ assets: [] })).toBeDefined();
  });
  it('accepts a populated list', () => {
    expect(ListAssetsResponseSchema.parse({ assets: [baseAsset] })).toBeDefined();
  });
  it('rejects >1000 entries (anti-bloat cap)', () => {
    const oversized = Array.from({ length: 1001 }, () => baseAsset);
    expect(() => ListAssetsResponseSchema.parse({ assets: oversized })).toThrow();
  });
});

describe('GetTransactionResponseSchema + ListTransactionsResponseSchema', () => {
  it('wraps a single transaction', () => {
    expect(GetTransactionResponseSchema.parse({ transaction: baseTx })).toBeDefined();
  });
  it('accepts an empty transactions array', () => {
    expect(ListTransactionsResponseSchema.parse({ transactions: [] })).toBeDefined();
  });
  it('caps transactions at 500', () => {
    const oversized = Array.from({ length: 501 }, () => baseTx);
    expect(() => ListTransactionsResponseSchema.parse({ transactions: oversized })).toThrow();
  });
});

describe('HealthResponseSchema', () => {
  const sample = {
    status: 'ok' as const,
    network: 'testnet',
    horizon: 'reachable' as const,
    contracts: {
      bridge: HEX_32,
      factory: HEX_32,
      wrapperTokenTemplate: HEX_32,
    },
  };
  it('round-trips', () => {
    expect(HealthResponseSchema.parse(sample)).toEqual(sample);
  });
  it('rejects status !== "ok"', () => {
    expect(() => HealthResponseSchema.parse({ ...sample, status: 'degraded' })).toThrow();
  });
  it('rejects unknown horizon state', () => {
    expect(() => HealthResponseSchema.parse({ ...sample, horizon: 'maybe' })).toThrow();
  });
});
