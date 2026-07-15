import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetEnvCache,
  type AssetRegistryEntry,
} from '@stellardao/shared';

import {
  assetRepository,
  initAssetRepository,
  __resetAssetRepoForTest,
} from './asset-repository.js';

/* ─────────────────── env stubs (required for parseEnv cached at module load) ─────────────────── */
vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');

/* ─────────────────── pool.js mock + Proxy-based drizzle-chain ───────────────────
 * Mirrors the pattern from transaction-repository.spec.ts: replace
 * getDb / bootstrapSchema / __closeDbForTest with vi.fns that hand
 * back a Proxy-based chainable fake. Diffs vs the transaction spec:
 *
 *   - `db.execute('DELETE FROM assets')` — same as transactions
 *     (`__clearForTest` calls `db.execute(sql\`DELETE FROM assets\`)`)
 *   - `db.insert(...).values({ id: keyFor(source), ... }).onConflictDoUpdate({...})`
 *     — two simultaneous `set` branches map cleanly to the Proxy
 *   - `db.select().from(assets).where(eq(assets.id, id)).limit(1)` —
 *     extra `.limit(1)` chain captured by the Proxy
 *
 * Why hoist: vi.mock factories at top-of-file run BEFORE module
 * imports; the fakes variable must be reachable by the factory, so
 * it's declared via vi.hoisted.
 */
const fakes = vi.hoisted(() => {
  const dbState = {
    callLog: [] as Array<{ method: string }>,
    execCalls: [] as Array<unknown[]>,
    queuedSelectResponses: [] as Array<Record<string, unknown>[]>,
    bootstrapCalls: 0,
  };

  function makeChain(method: string) {
    dbState.callLog.push({ method });
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            resolve: (v: unknown) => void,
            reject?: (e: unknown) => void,
          ) => {
            const response = dbState.queuedSelectResponses.shift() ?? [];
            return Promise.resolve(response).then(resolve, reject);
          };
        }
        if (prop === 'catch' || prop === 'finally') return undefined;
        // every drizzle fluent method returns another chainable
        return () => makeChain(String(prop));
      },
    });
  }

  const fakeDb = {
    insert: vi.fn(() => makeChain('insert')),
    select: vi.fn(() => makeChain('select')),
    execute: vi.fn((...args: unknown[]) => {
      dbState.execCalls.push(args);
      return Promise.resolve(undefined);
    }),
    __dbState: dbState,
    __reset: () => {
      dbState.callLog.length = 0;
      dbState.execCalls.length = 0;
      dbState.queuedSelectResponses.length = 0;
    },
  };
  return { fakeDb, dbState };
});

vi.mock('../pool.js', () => ({
  getDb: vi.fn(() => fakes.fakeDb),
  bootstrapSchema: vi.fn(() => {
    fakes.dbState.bootstrapCalls += 1;
    return Promise.resolve(undefined);
  }),
  __closeDbForTest: vi.fn(() => Promise.resolve(undefined)),
}));

/* ─────────────────── fixtures ─────────────────── */

const WRAPPER_TOKEN =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

/**
 * Build a valid AssetRegistryEntry-shaped fixture. The address is
 * always stored lowercased at the repo boundary because `keyFor`
 * lowercases on lookups; tests that probe case-insensitive behavior
 * override the address to mixed case at the call site.
 */
function makeAsset(overrides: Partial<AssetRegistryEntry> = {}): AssetRegistryEntry {
  return {
    id: 'ethereum:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    source: {
      chain: 'ethereum',
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    wrapperToken: WRAPPER_TOKEN,
    symbol: 'AAA',
    name: 'Triple-A Token',
    decimals: 6,
    ...overrides,
  };
}

function drizzleRowFor(entry: AssetRegistryEntry) {
  return {
    id: entry.id,
    wrapperToken: entry.wrapperToken,
    chain: entry.source.chain,
    sourceAddress: entry.source.address,
    symbol: entry.symbol,
    name: entry.name,
    decimals: entry.decimals,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
  };
}

/* ─────────────────── Memory impl tests (default before init) ─────────────────── */

describe('assetRepository (Memory impl)', () => {
  beforeEach(async () => {
    __resetEnvCache();
    await __resetAssetRepoForTest();
  });
  afterEach(async () => {
    await __resetAssetRepoForTest();
  });

  it('upsertBySource generates id from keyFor (chain + lowercase(address)) when none supplied', async () => {
    const input = makeAsset({
      id: undefined,
      source: {
        chain: 'ethereum',
        address: '0xABABABABABABABABABABABABABABABABABABABAB',
      },
    });
    delete (input as { id?: string }).id;
    const result = await assetRepository.upsertBySource(input);
    expect(result.id).toBe('ethereum:0xabababababababababababababababababababab');
    // returned entry preserves the input shape (echo); only id was derived
    expect(result.source.address).toBe('0xABABABABABABABABABABABABABABABABABABABAB');
    expect(result.symbol).toBe('AAA');
  });

  it('upsertBySource with explicit id overrides keyFor derivation', async () => {
    const input = makeAsset({
      id: 'custom:override',
      source: {
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111111',
      },
    });
    const result = await assetRepository.upsertBySource(input);
    expect(result.id).toBe('custom:override');
  });

  it('upsertBySource overwrites an existing entry on the same composite key (lifecycle)', async () => {
    const initial = makeAsset({ symbol: 'AAA', name: 'Triple-A Token' });
    await assetRepository.upsertBySource(initial);
    const updated = makeAsset({
      ...initial,
      symbol: 'AAAB',
      name: 'Triple-A Token v2',
    });
    const result = await assetRepository.upsertBySource(updated);
    expect(result.symbol).toBe('AAAB');
    expect(result.name).toBe('Triple-A Token v2');

    // listAll reflects the overwrite: only one row, the latest symbol.
    const all = await assetRepository.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.symbol).toBe('AAAB');
  });

  it('findBySource returns the stored entry under mixed-case address (lowercasing at the boundary)', async () => {
    const input = makeAsset({
      id: undefined,
      source: {
        chain: 'ethereum',
        address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      },
    });
    delete (input as { id?: string }).id;
    await assetRepository.upsertBySource(input);

    // Caller passes uppercase EIP-55 form; keyFor lowercases on lookup.
    const upper = await assetRepository.findBySource(
      'ethereum',
      '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF',
    );
    expect(upper?.id).toBe('ethereum:0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');

    // And vice versa: caller stored lowercase, lookup in mixed case.
    const lower = await assetRepository.findBySource(
      'ethereum',
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    expect(lower?.id).toBe('ethereum:0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  });

  it('findBySource returns null for an unknown chain', async () => {
    expect(
      await assetRepository.findBySource('solana', 'unknown'),
    ).toBeNull();
  });

  it('listAll returns all entries (insertion order, no DB ordering yet)', async () => {
    const a = makeAsset({
      id: 'list:a',
      source: { chain: 'ethereum', address: '0xaaaa' },
    });
    const b = makeAsset({
      id: 'list:b',
      source: { chain: 'solana', address: 'So11111111111111111111111111111111111111112' },
    });
    const c = makeAsset({
      id: 'list:c',
      source: { chain: 'polygon', address: '0xbbbb' },
    });
    await assetRepository.upsertBySource(a);
    await assetRepository.upsertBySource(b);
    await assetRepository.upsertBySource(c);
    const all = await assetRepository.listAll();
    expect(all.map((e) => e.id).sort()).toEqual(['list:a', 'list:b', 'list:c']);
  });

  it('listAll returns empty array when the registry has no entries', async () => {
    expect(await assetRepository.listAll()).toEqual([]);
  });

  it('__clearForTest empties the in-memory map', async () => {
    await assetRepository.upsertBySource(makeAsset({ id: 'mem-clear' }));
    expect((await assetRepository.listAll()).length).toBe(1);
    assetRepository.__clearForTest();
    expect(await assetRepository.listAll()).toEqual([]);
  });

  it('different chains with the same address produce distinct keys (no cross-chain collision)', async () => {
    const address = '0xcafebabe1234567890abcdef1234567890abcdef';
    const onEthereum = makeAsset({
      id: undefined,
      source: { chain: 'ethereum', address },
    });
    const onPolygon = makeAsset({
      id: undefined,
      source: { chain: 'polygon', address },
    });
    delete (onEthereum as { id?: string }).id;
    delete (onPolygon as { id?: string }).id;
    const e = await assetRepository.upsertBySource(onEthereum);
    const p = await assetRepository.upsertBySource(onPolygon);
    expect(e.id).not.toBe(p.id);
    expect(e.id).toBe('ethereum:0xcafebabe1234567890abcdef1234567890abcdef');
    expect(p.id).toBe('polygon:0xcafebabe1234567890abcdef1234567890abcdef');
  });
});

/* ─────────────────── initAssetRepository swap + Drizzle parity ─────────────────── */

describe('initAssetRepository swap', () => {
  beforeEach(async () => {
    __resetEnvCache();
    await __resetAssetRepoForTest();
    fakes.fakeDb.__reset();
  });
  afterEach(async () => {
    await __resetAssetRepoForTest();
  });

  it('initAssetRepository(undefined) keeps the Memory default', async () => {
    const a = makeAsset({ id: 'keep-mem' });
    await initAssetRepository(undefined);
    await assetRepository.upsertBySource(a);
    expect(fakes.dbState.callLog).toEqual([]);
    expect(fakes.dbState.bootstrapCalls).toBe(0);
    expect((await assetRepository.listAll()).map((e) => e.id)).toEqual([
      'keep-mem',
    ]);
  });

  it("initAssetRepository('postgres://…') calls getDb + bootstrapSchema", async () => {
    await initAssetRepository('postgres://test-only');
    expect(fakes.dbState.bootstrapCalls).toBe(1);
  });

  it('after init, upsertBySource routes through db.insert().values().onConflictDoUpdate()', async () => {
    await initAssetRepository('postgres://test-only');
    fakes.fakeDb.__reset(); // reset callLog; keep bootstrapCalls
    await assetRepository.upsertBySource(makeAsset({ id: 'drizzle-upsert' }));
    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('insert');
    expect(methods).toContain('values');
    expect(methods).toContain('onConflictDoUpdate');
  });

  it('after init, listAll routes through db.select()', async () => {
    await initAssetRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    fakes.dbState.queuedSelectResponses.push([]);
    await assetRepository.listAll();
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('select');
  });

  it('after init, findBySource routes through db.select().from().where().limit(1)', async () => {
    await initAssetRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    fakes.dbState.queuedSelectResponses.push([]);
    await assetRepository.findBySource('ethereum', '0xaaaa');
    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('select');
    expect(methods).toContain('from');
    expect(methods).toContain('where');
    expect(methods).toContain('limit');
  });

  it('after init, __clearForTest routes through db.execute(DELETE)', async () => {
    await initAssetRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    await assetRepository.__clearForTest();
    expect(fakes.dbState.execCalls).toHaveLength(1);
  });

  it('Drizzle impl maps Drizzle row → AssetRegistryEntry shape (parity with the Memory impl echo)', async () => {
    await initAssetRepository('postgres://test-only');
    const entry = makeAsset({
      id: 'drizzle-mapping',
      source: {
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111111',
      },
    });
    fakes.dbState.queuedSelectResponses.push([drizzleRowFor(entry)]);
    const result = await assetRepository.findBySource(
      'solana',
      'So11111111111111111111111111111111111111111',
    );
    expect(result).toEqual(entry);
    // Sanity: rowToEntry reconstructs the nested AssetId shape, not a flat wrap.
    expect(result?.source.chain).toBe('solana');
    expect(result?.source.address).toBe('So11111111111111111111111111111111111111111');
  });

  it('Drizzle impl listAll maps an empty-row fallback to an empty array (no spurious entries)', async () => {
    await initAssetRepository('postgres://test-only');
    fakes.dbState.queuedSelectResponses.push([]);
    expect(await assetRepository.listAll()).toEqual([]);
  });

  it('__resetAssetRepoForTest swaps back to Memory + resets state, leaving drizzle ids unresolved', async () => {
    await initAssetRepository('postgres://test-only');
    await assetRepository.upsertBySource(makeAsset({ id: 'drizzle-id' }));
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('insert');
    await __resetAssetRepoForTest();

    // Memory below — finds nothing for the drizzle id
    expect(
      await assetRepository.findBySource('ethereum', 'missing'),
    ).toBeNull();

    // And a Memory upsert doesn't touch the drizzle fakeDb anymore.
    fakes.fakeDb.__reset();
    await assetRepository.upsertBySource(makeAsset({ id: 'mem-after-reset' }));
    expect(fakes.dbState.callLog).toEqual([]);
  });
});
