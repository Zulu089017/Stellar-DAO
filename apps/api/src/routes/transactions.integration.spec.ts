import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { __resetEnvCache, type Transaction } from '@stellardao/shared';

import { createServer } from '../server.js';
import {
  __resetTransactionRepoForTest,
  transactionRepository,
} from '../db/repositories/transaction-repository.js';
import { __resetEventBusForTest } from '../sse/event-bus.js';

/* ─────────────────── env stubs (module-top, hoisted) ─────────────────── */
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

/* ─────────────────── pool.js mock + drizzle chain ─────────────────── */
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

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'wrap',
    sourceChain: 'ethereum',
    sourceToken: '0xabababababababababababababababababababab',
    wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    // Use a real G-address from a randomly-generated keypair so the
    // stellar-sdk Address constructor's strkey checksum validation
    // (used in any future bump that validates the recipient upstream
    // of the route) doesn't silently break this fixture.
    recipient: Keypair.random().publicKey(),
    amount: '100',
    status: 'pending',
    sourceTxHash: null,
    stellarTxHash: null,
    nonce: '0x' + '0'.repeat(64),
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function drizzleRowFor(tx: Transaction): Record<string, unknown> {
  return {
    id: tx.id,
    type: tx.type,
    sourceChain: tx.sourceChain,
    sourceToken: tx.sourceToken,
    wrapperToken: tx.wrapperToken,
    recipient: tx.recipient,
    amount: BigInt(tx.amount),
    status: tx.status,
    sourceTxHash: tx.sourceTxHash,
    stellarTxHash: tx.stellarTxHash,
    nonce: tx.nonce,
    createdAt: new Date(tx.createdAt),
    updatedAt: new Date(tx.updatedAt),
    error: tx.error ?? null,
  };
}

/* ─────────────────── Memory impl ─────────────────── */

describe('transaction routes (Memory impl)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    __resetEnvCache();
    await __resetTransactionRepoForTest();
    __resetEventBusForTest();
    fakes.fakeDb.__reset();
    app = await createServer();
  });
  afterEach(async () => {
    if (app) await app.close();
    await __resetTransactionRepoForTest();
  });

  /* Empty registry round-trip: route returns 200 with an empty
   * `transactions` array. Confirms the in-memory impl is the active
   * repo (no Drizzle calls leak through). */
  it('GET /transactions returns 200 with an empty array when no transactions exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/transactions/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ transactions: [] });
    expect(fakes.dbState.callLog).toEqual([]);
  });

  /* Two seeded transactions appear in the listing. Confirms the
   * route's mapping from `Transaction[]` → `{transactions: T[]}`. */
  it('GET /transactions echoes all entries seeded through the repository', async () => {
    const a = makeTx({ id: 'list-a' });
    const b = makeTx({ id: 'list-b' });
    await transactionRepository.upsert(a);
    await transactionRepository.upsert(b);

    const res = await app.inject({ method: 'GET', url: '/transactions/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions.map((t: Transaction) => t.id).sort()).toEqual(
      ['list-a', 'list-b'].sort(),
    );
  });

  /* `?limit=N` parameter is honored. The route reads `Number(query.limit ?? 50)`
   * then clamps at 200. Verify the smaller bound is observable by seeding
   * 5 rows + asking for 2. */
  it('GET /transactions?limit=2 honours the limit parameter', async () => {
    for (let i = 0; i < 5; i += 1) {
      await transactionRepository.upsert(makeTx({ id: `limit-${i}` }));
    }
    const res = await app.inject({
      method: 'GET',
      url: '/transactions/?limit=2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toHaveLength(2);
  });

  /* 404 fallback: unknown id, no row. */
  it('GET /transactions/:id returns 404 when the transaction is not found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/transactions/missing-id',
    });
    expect(res.statusCode).toBe(404);
  });

  /* Route round-trip: GET /transactions/:id returns the seeded
   * transaction. End-to-end Memory → route → response shape. */
  it('GET /transactions/:id returns the stored transaction when found', async () => {
    const tx = makeTx({ id: 'mem-find-success' });
    await transactionRepository.upsert(tx);

    const res = await app.inject({
      method: 'GET',
      url: '/transactions/mem-find-success',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transaction).toEqual(tx);
  });

  /* Negative / non-numeric `?limit` falls back to the default 50
   * rather than crashing the route. */
  it('GET /transactions?limit=abc falls back to the default limit of 50', async () => {
    for (let i = 0; i < 3; i += 1) {
      await transactionRepository.upsert(makeTx({ id: `fallback-${i}` }));
    }
    const res = await app.inject({
      method: 'GET',
      url: '/transactions/?limit=abc',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toHaveLength(3);
  });
});

/* ─────────────────── Drizzle impl ─────────────────── */

describe('transaction routes (Drizzle impl)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test-only');
    __resetEnvCache();
    await __resetTransactionRepoForTest();
    __resetEventBusForTest();
    fakes.fakeDb.__reset();
    app = await createServer();
  });
  afterEach(async () => {
    if (app) await app.close();
    await __resetTransactionRepoForTest();
    // Drop the Drizzle-mode DATABASE_URL stub via `process.env` delete
    // rather than `vi.unstubEnv` because the host vitest build
    // doesn't always expose that helper (depends on the picker).
    delete process.env.DATABASE_URL;
    __resetEnvCache();
  });

  /* POST /bridge/wrap → transactionRepository.upsert → db.insert().
   * The route passes through `upsertBySource` and exercises the
   * drizzle path. Lists under transactionRepository because the
   * bridge route also handles events there.
   *
   * `recipient` uses `Keypair.random().publicKey()` (rather than the
   * `'G' + 'A'.repeat(55)` placeholder shape) so the strkey checksum
   * is valid. The wrap route currently doesn't call `new Address()`
   * on the recipient so the placeholder would technically survive,
   * but using a real PK uniformly across both integration specs
   * closes the strkey placeholder foot-gun class entirely. */
  it('POST /bridge/wrap routes through transactionRepository (db.insert)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        recipient: Keypair.random().publicKey(),
        amount: '100',
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(typeof body.txId).toBe('string');
    expect(body.status).toBe('pending');

    const methods = fakes.dbState.callLog.map((c) => c.method);
    expect(methods).toContain('insert');
    expect(methods).toContain('values');
    expect(methods).toContain('onConflictDoUpdate');
  });

  /* GET /transactions/:id after a Drizzle-backed insert reads back
   * via `db.select()`. We queue a single-row response matching a
   * drizzle-shaped row so `rowToTransaction` can map it back. */
  it('GET /transactions/:id routes through db.select()', async () => {
    const tx = makeTx({ id: 'drizzle-find-success' });
    fakes.dbState.queuedSelectResponses.push([drizzleRowFor(tx)]);

    const res = await app.inject({
      method: 'GET',
      url: '/transactions/drizzle-find-success',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transaction.id).toBe(tx.id);
    expect(body.transaction.amount).toBe(tx.amount);

    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('select');
  });
});
