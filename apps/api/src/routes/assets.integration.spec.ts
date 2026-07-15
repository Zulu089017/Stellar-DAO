import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { FactoryContract } from '@stellardao/sdk';
import { Keypair } from '@stellar/stellar-sdk';
import { __resetEnvCache, type AssetRegistryEntry } from '@stellardao/shared';

import { createServer } from '../server.js';
import {
  __resetAssetRepoForTest,
  assetRepository,
} from '../db/repositories/asset-repository.js';
import { __resetContractInstances } from '../soroban/index.js';
import { __resetEventBusForTest } from '../sse/event-bus.js';

/* ─────────────────── env stubs (module-top, hoisted before any import reads process.env) ─────────────────── */
vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');
vi.stubEnv('BRIDGE_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('FACTORY_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('WRAPPER_TOKEN_TEMPLATE_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
// DATABASE_URL is NOT stubbed at module top so the default describe
// block runs against the memory impl. The Drizzle describe block
// stubs DATABASE_URL per-test.

/* ─────────────────── pool.js mock + drizzle chain ───────────────────
 * Mirrors the pattern from `apps/api/src/db/repositories/asset-repository.spec.ts`:
 * replace `getDb` / `bootstrapSchema` / `__closeDbForTest` with vi.fn stubs
 * that hand back a Proxy-based chainable fake `db`. The Proxy records
 * every fluent call (insert / select / where / limit / etc.) in
 * `dbState.callLog` so tests assert the route-layer talked to drizzle
 * via the expected command sequence rather than inspecting SQL strings.
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

vi.mock('../db/pool.js', () => ({
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

function makeAssetEntry(
  overrides: Partial<{
    id: string;
    chain: 'ethereum' | 'solana' | 'polygon';
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  }> = {},
): Omit<AssetRegistryEntry, 'id'> & { id?: string } {
  const chain = overrides.chain ?? 'ethereum';
  const address = overrides.address ?? '0x' + '11'.repeat(20);
  return {
    wrapperToken: WRAPPER_TOKEN,
    source: { chain, address },
    symbol: overrides.symbol ?? 'TEST',
    name: overrides.name ?? 'Test Token',
    decimals: overrides.decimals ?? 6,
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
  };
}

function drizzleRowFor(entry: AssetRegistryEntry): Record<string, unknown> {
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

/* ─────────────────── Memory impl ─────────────────── */

describe('asset routes (Memory impl)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let simulateAndSubmitSpy: MockInstance;

  beforeEach(async () => {
    __resetEnvCache();
    __resetContractInstances();
    await __resetAssetRepoForTest();
    __resetEventBusForTest();
    fakes.fakeDb.__reset();
    simulateAndSubmitSpy = vi
      .spyOn(FactoryContract.prototype, 'simulateAndSubmit')
      .mockResolvedValue('a'.repeat(64));
    app = await createServer();
  });
  afterEach(async () => {
    simulateAndSubmitSpy.mockRestore();
    if (app) await app.close();
    await __resetAssetRepoForTest();
  });

  /* Empty registry round-trip: route returns 200 with an empty `assets`
   * array. Verifies that the in-memory impl is the active repository
   * (no Drizzle calls leak through — the route is wired through
   * assetRepository.listAll, and Memory returns [...store.values()]). */
  it('GET /assets returns 200 with an empty array when the registry has no entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ assets: [] });
    expect(fakes.dbState.callLog).toEqual([]);
  });

  /* Two seeded entries show up in the listing. Confirms the route
   * shape: listAll entries are mapped to {id, source, wrapperToken,
   * symbol, name, decimals} per `ListAssetsResponse`. */
  it('GET /assets echoes all entries seeded through the repository', async () => {
    const a = makeAssetEntry({ id: 'list-a', address: '0xaaaa' });
    const b = makeAssetEntry({
      id: 'list-b',
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111111',
    });
    const storedA = await assetRepository.upsertBySource(a);
    const storedB = await assetRepository.upsertBySource(b);

    const res = await app.inject({ method: 'GET', url: '/assets/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.assets).toHaveLength(2);
    expect(body.assets.map((e: { id: string }) => e.id).sort()).toEqual(
      [storedA.id, storedB.id].sort(),
    );
  });

  /* 404 fallback: ChainEnum.safeParse rejects 'bitcoin' and the
   * route hits `reply.badRequest('unsupported chain')`. */
  it('GET /assets/:chain/:address returns 400 on unsupported chain', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/bitcoin/0xbeefempty',
    });
    expect(res.statusCode).toBe(400);
  });

  /* 404 fallback: keyFor mismatch — no entry under that composite key. */
  it('GET /assets/:chain/:address returns 404 when the entry is not found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/ethereum/0xbeefbeef',
    });
    expect(res.statusCode).toBe(404);
  });

  /* Route round-trip: POST /assets seeds via upsertBySource; GET
   * afterwards returns the entry. End-to-end: route.ts → repo →
   * Memory → response. */
  it('GET /assets/:chain/:address returns the entry created via POST /assets', async () => {
    // Use a real G-address so `FactoryContract.buildCreateWrapperAsset`'s
    // stellar-sdk `Address(s)` strkey checksum validation inside the
    // SDK passes. A `'G' + 'A'.repeat(55)` placeholder fails the
    // checksum and surfaces as a 500 (not a 400, since the SDK throws
    // after the route schema already accepted the input). Mirrors the
    // pattern in `apps/api/src/server.spec.ts`'s POST /assets happy
    // path.
    const developerPK = Keypair.random().publicKey();
    const post = await app.inject({
      method: 'POST',
      url: '/assets/',
      headers: { 'x-developer-public-key': developerPK },
      payload: {
        source: {
          chain: 'ethereum',
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        name: 'Triple-A',
        symbol: 'AAA',
        decimals: 6,
      },
    });
    expect(post.statusCode).toBe(202);

    const get = await app.inject({
      method: 'GET',
      url: '/assets/ethereum/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.id).toBe('ethereum:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(body.symbol).toBe('AAA');
    // `apps/api/src/routes/assets.ts::POST /assets` always upserts
    // with `wrapperToken: ''` as a pre-stage; a follow-up process
    // populates it after the Soroban tx confirms. The GET route
    // therefore returns `''` here, not the synthetic WRAPPER_TOKEN.
    expect(body.wrapperToken).toBe('');
  });

  /* GET /assets?limit=N — page-size cap honoured; nextCursor set iff
   * the page is full. ids here are seeded alphabetically so the
   * pinned sort order (`id` ASC) gives a deterministic first page
   * regardless of Map insertion order. */
  it('GET /assets?limit=2 returns the first 2 entries sorted by id ASC + nextCursor set on a full page', async () => {
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:a', address: '0xpa' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:b', address: '0xpb' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:c', address: '0xpc' }));

    const res = await app.inject({ method: 'GET', url: '/assets/?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assets: Array<{ id: string }>; nextCursor?: string };
    expect(body.assets.map((e) => e.id)).toEqual(['paging:a', 'paging:b']);
    expect(body.nextCursor).toBe('paging:b');
  });

  /* Subsequent page via cursor — disjoint from the previous page
   * and `nextCursor` is OMITTED (not present in JSON) on the final page. */
  it('GET /assets?limit=2&cursor=paging:b returns paging:c as the final page (no nextCursor key)', async () => {
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:a', address: '0xpa' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:b', address: '0xpb' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'paging:c', address: '0xpc' }));

    const res = await app.inject({
      method: 'GET',
      url: '/assets/?limit=2&cursor=paging:b',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assets: Array<{ id: string }>; nextCursor?: string };
    expect(body.assets.map((e) => e.id)).toEqual(['paging:c']);
    // Last page — `nextCursor` must be OMITTED, not present-as-null,
    // so `Object.keys(body)` does not include `nextCursor` at all.
    expect(body.nextCursor).toBeUndefined();
    expect(Object.keys(body)).not.toContain('nextCursor');
  });

  /* sourceChain filter narrows the page, cursor still ordered ASC. */
  it('GET /assets?sourceChain=ethereum returns ONLY ethereum entries (multi-chain seed)', async () => {
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'mix:eth-1', chain: 'ethereum', address: '0xme1' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'mix:sol-1', chain: 'solana', address: 'So11111111111111111111111111111111111111111' }));
    await assetRepository.upsertBySource(makeAssetEntry({ id: 'mix:eth-2', chain: 'ethereum', address: '0xme2' }));

    const res = await app.inject({
      method: 'GET',
      url: '/assets/?sourceChain=ethereum&limit=10',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assets: Array<{ source: { chain: string } }> };
    expect(body.assets).toHaveLength(2);
    expect(body.assets.every((e) => e.source.chain === 'ethereum')).toBe(true);
  });

  /* Invalid chain filter is 400 (parity with the `/assets/:chain/:address`
   * path param validation in the same file). */
  it('GET /assets?sourceChain=bitcoin returns 400 (ChainEnum rejects at the route boundary)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/?sourceChain=bitcoin',
    });
    expect(res.statusCode).toBe(400);
  });

  /* Full traversal across multi-pages — every page is disjoint from
   * the previous one, the union equals the seeded set. Locks in the
   * cursor-stability invariant at the route layer. */
  it('GET /assets cursor traversal across multiple pages covers every seeded entry without overlap', async () => {
    for (const letter of ['walk:a', 'walk:b', 'walk:c', 'walk:d', 'walk:e']) {
      await assetRepository.upsertBySource(
        makeAssetEntry({ id: letter, address: '0x' + letter.slice(-1).repeat(40) }),
      );
    }
    const collected: string[] = [];
    let cursor = '';
    let pages = 0;
    while (pages < 10) {
      pages += 1;
      const res = await app.inject({
        method: 'GET',
        url: `/assets/?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { assets: Array<{ id: string }>; nextCursor?: string };
      collected.push(...body.assets.map((e) => e.id));
      if (!body.nextCursor) break;
      cursor = body.nextCursor;
    }
    expect(collected).toEqual(['walk:a', 'walk:b', 'walk:c', 'walk:d', 'walk:e']);
  });
});

/* ─────────────────── Drizzle impl ─────────────────── */

describe('asset routes (Drizzle impl)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let simulateAndSubmitSpy: MockInstance;

  beforeEach(async () => {
    // DATABASE_URL drives `initAssetRepository(env.DATABASE_URL)`
    // inside `createServer` toward the drizzle branch. Setting it
    // BEFORE `__resetEnvCache()` ensures `parseEnv.api()` sees the
    // new value on the next read.
    vi.stubEnv('DATABASE_URL', 'postgres://test-only');
    __resetEnvCache();
    await __resetAssetRepoForTest();
    __resetEventBusForTest();
    __resetContractInstances();
    fakes.fakeDb.__reset();
    simulateAndSubmitSpy = vi
      .spyOn(FactoryContract.prototype, 'simulateAndSubmit')
      .mockResolvedValue('a'.repeat(64));
    app = await createServer();
  });
  afterEach(async () => {
    simulateAndSubmitSpy.mockRestore();
    if (app) await app.close();
    await __resetAssetRepoForTest();
    // Drop the Drizzle-mode DATABASE_URL stub via `process.env` delete
    // rather than `vi.unstubEnv` because the host vitest build
    // doesn't always expose that helper (depends on the picker).
    delete process.env.DATABASE_URL;
    __resetEnvCache();
  });

  /* POST /assets routes through `db.insert().values().onConflictDoUpdate()`
   * under Drizzle. The Proxy captures each fluent call in dbState.callLog
   * so we assert the FULL chain (insert, values, onConflictDoUpdate) is
   * invoked rather than just the top-level db.insert.
   *
   * `developerPK` must be a real G-address (Keypair.random().publicKey()):
   * the SDK's `Address(s)` strkey checksum validation throws on the
   * `'G' + 'A'.repeat(55)` placeholder, surfacing as a 500 here. */
  it('POST /assets routes through db.insert().values().onConflictDoUpdate()', async () => {
    const developerPK = Keypair.random().publicKey();
    const res = await app.inject({
      method: 'POST',
      url: '/assets/',
      headers: { 'x-developer-public-key': developerPK },
      payload: {
        source: {
          chain: 'ethereum',
          address: '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd',
        },
        name: 'Drizzle Token',
        symbol: 'DRZ',
        decimals: 6,
      },
    });
    expect(res.statusCode).toBe(202);

    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('insert');
    expect(methods).toContain('values');
    expect(methods).toContain('onConflictDoUpdate');
  });

  /* GET /assets routes through `db.select()` for the listing. We push
   * an empty array as the queued select response so listAll returns
   * `[]` and the route shape is observable. */
  it('GET /assets routes through db.select() and returns the empty list', async () => {
    fakes.dbState.queuedSelectResponses.push([]); // listAll → drizzle.select → []
    const res = await app.inject({ method: 'GET', url: '/assets/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ assets: [] });
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('select');
  });

  /* GET /assets/:chain/:address routes through
   * `db.select().from().where().limit(1)` for the lookup. We queue a
   * single-row response so findBySource finds a row and the route
   * returns it (200) instead of 404. */
  it('GET /assets/:chain/:address routes through db.select().from().where().limit(1)', async () => {
    const entry: AssetRegistryEntry = {
      id: 'ethereum:0xdrizzle0000000000000000000000000000000',
      wrapperToken: WRAPPER_TOKEN,
      source: {
        chain: 'ethereum',
        address: '0xdrizzle0000000000000000000000000000000',
      },
      symbol: 'DRZ',
      name: 'Drizzle Token',
      decimals: 6,
    };
    fakes.dbState.queuedSelectResponses.push([drizzleRowFor(entry)]);

    const res = await app.inject({
      method: 'GET',
      url: `/assets/${entry.source.chain}/${entry.source.address}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(entry.id);
    expect(body.wrapperToken).toBe(entry.wrapperToken);

    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('select');
    expect(methods).toContain('from');
    expect(methods).toContain('where');
    expect(methods).toContain('limit');
  });

  /* Drizzle listByFilter path: the route now uses
   * `db.select().from().where(...).orderBy(asc(.id)).limit(N)` for
   * the listing. Only fluent chain methods appear in the Proxy's
   * `callLog` — drizzle's `and(...)`, `eq(...)`, `gt(...)`, and
   * `asc(...)` are FUNCTIONAL OPERATORS passed as args, not chained
   * methods, so the Proxy never sees them. We assert on the
   * fluent chain (`select, from, where, orderBy, limit`) being
   * present and that the response shape is the new
   * `{ assets: [...], nextCursor? }` discriminated union. */
  it('GET /assets?sourceChain=ethereum&limit=1 routes through select.from.where.orderBy.limit (single-row page returns nextCursor)', async () => {
    const entry: AssetRegistryEntry = {
      id: 'ethereum:0xdrizzlefilter0000000000000000000000000',
      wrapperToken: WRAPPER_TOKEN,
      source: {
        chain: 'ethereum',
        address: '0xdrizzlefilter0000000000000000000000000',
      },
      symbol: 'DRZ',
      name: 'Drizzle Filter',
      decimals: 6,
    };
    fakes.dbState.queuedSelectResponses.push([drizzleRowFor(entry)]);

    const res = await app.inject({
      method: 'GET',
      url: '/assets/?sourceChain=ethereum&limit=1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assets: Array<{ id: string }>; nextCursor?: string };
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0]?.id).toBe(entry.id);
    // Single-row page with limit=1 → page IS full → nextCursor set.
    expect(body.nextCursor).toBe(entry.id);

    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('select');
    expect(methods).toContain('from');
    expect(methods).toContain('where');
    expect(methods).toContain('orderBy');
    expect(methods).toContain('limit');
  });

  /* Empty page result from Drizzle — nextCursor OMITTED, not null,
   * matching the route's `null → undefined` translation. */
  it('GET /assets?limit=10 returns an empty page with no nextCursor key (Drizzle returns 0 rows)', async () => {
    fakes.dbState.queuedSelectResponses.push([]);
    const res = await app.inject({ method: 'GET', url: '/assets/?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assets: Array<unknown>; nextCursor?: string };
    expect(body.assets).toEqual([]);
    expect(body.nextCursor).toBeUndefined();
    expect(Object.keys(body)).not.toContain('nextCursor');
  });

  /* Invalid sourceChain filter: same 400-vs-200 behavior as the
   * Memory branch — the route-layer ChainEnum.safeParse runs BEFORE
   * the repo call so the drizzle delegate is never reached for
   * invalid input. */
  it('GET /assets?sourceChain=bitcoin returns 400 (route-layer validation, parity with Memory)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/?sourceChain=bitcoin',
    });
    expect(res.statusCode).toBe(400);
    // The drizzle select() / where() / orderBy() / limit() chain
    // should NOT have been called — the bad-input early-return
    // short-circuits before the repo delegation.
    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).not.toContain('select');
  });
});
