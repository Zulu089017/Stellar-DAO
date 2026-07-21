import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { __resetEnvCache, type Transaction } from '@stellardao/shared';

import {
  subscribeTransactions,
  __resetEventBusForTest,
} from '../../sse/event-bus.js';

import {
  transactionRepository,
  initTransactionRepository,
  __resetTransactionRepoForTest,
} from './transaction-repository.js';

/* ─────────────────── env stubs (required for parseEnv cached at module load) ─────────────────── */
vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');

/* ─────────────────── pool.js mock + Proxy-based drizzle-chain ───────────────────
 * `vi.mock('../pool.js')` redirects getDb / bootstrapSchema / __closeDbForTest
 * to vi.fn. The fake `db` returned by getDb is a Proxy-based stub that
 * captures every fluent call (insert / select / values / where / etc.) in
 * a single log so tests assert the call SEQUENCE rather than SQL strings.
 * Drizzle treats chainable queries as promise-awaitable: our Proxy
 * satisfies that by handing back a `then` that resolves to the next
 * queued response (default: empty array).
 *
 * Why hoist: vi.mock factories at top-of-file run BEFORE module imports;
 * the fakes variable must be reachable by the factory, so it's declared
 * via vi.hoisted.
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

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'wrap',
    sourceChain: 'ethereum',
    sourceToken: '0xabababababababababababababababababababab',
    wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
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

function drizzleRowFor(tx: Transaction) {
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

/* ─────────────────── Memory impl tests (default before init) ─────────────────── */

describe('transactionRepository (Memory impl)', () => {
  beforeEach(async () => {
    __resetEnvCache();
    await __resetTransactionRepoForTest();
    __resetEventBusForTest();
  });
  afterEach(async () => {
    await __resetTransactionRepoForTest();
  });

  it('upsert stores + returns the input shape', async () => {
    const tx = makeTx({ id: 'mem-upsert' });
    const result = await transactionRepository.upsert(tx);
    expect(result).toEqual(tx);
  });

  it('upsert overwrites prior record with the same id (lifecycle walk)', async () => {
    const tx = makeTx({ id: 'mem-lifecycle' });
    await transactionRepository.upsert(tx);
    const updated: Transaction = { ...tx, status: 'completed', stellarTxHash: '0x' + 'a'.repeat(128) };
    const result = await transactionRepository.upsert(updated);
    expect(result).toEqual(updated);
    expect((await transactionRepository.findById('mem-lifecycle'))?.status).toBe('completed');
  });

  it('findById returns the stored transaction', async () => {
    const tx = makeTx({ id: 'mem-find' });
    await transactionRepository.upsert(tx);
    expect(await transactionRepository.findById('mem-find')).toEqual(tx);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await transactionRepository.findById('mem-missing')).toBeNull();
  });

  it('listRecent returns most-recent-first (createdAt DESC)', async () => {
    const older = makeTx({ id: 'mem-older', createdAt: '2026-01-01T00:00:00.000Z' });
    const middle = makeTx({ id: 'mem-middle', createdAt: '2026-01-07T00:00:00.000Z' });
    const newer = makeTx({ id: 'mem-newer', createdAt: '2026-01-15T00:00:00.000Z' });
    await transactionRepository.upsert(older);
    await transactionRepository.upsert(middle);
    await transactionRepository.upsert(newer);
    const result = await transactionRepository.listRecent(10);
    expect(result.map((t) => t.id)).toEqual(['mem-newer', 'mem-middle', 'mem-older']);
  });

  it('listRecent respects limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await transactionRepository.upsert(
        makeTx({
          id: `mem-limit-${i}`,
          createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        }),
      );
    }
    const result = await transactionRepository.listRecent(2);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('mem-limit-4');
  });

  it('listRecent with limit 0 returns empty array', async () => {
    await transactionRepository.upsert(makeTx({ id: 'mem-zero-limit' }));
    expect(await transactionRepository.listRecent(0)).toEqual([]);
  });

  it('__clearForTest empties the in-memory map', async () => {
    await transactionRepository.upsert(makeTx({ id: 'mem-clear' }));
    await transactionRepository.__clearForTest();
    expect(await transactionRepository.findById('mem-clear')).toBeNull();
  });

  it('upsert broadcasts via the SSE bus at the delegate level (not impl level)', async () => {
    const events: string[] = [];
    const unsubscribe = subscribeTransactions(({ transaction }) => {
      events.push(transaction.id);
    });
    try {
      await transactionRepository.upsert(makeTx({ id: 'mem-broadcast' }));
      expect(events).toEqual(['mem-broadcast']);
    } finally {
      unsubscribe();
    }
  });
});

/* ─────────────────── initTransactionRepository swap + Drizzle parity ─────────────────── */

describe('initTransactionRepository swap', () => {
  beforeEach(async () => {
    __resetEnvCache();
    await __resetTransactionRepoForTest();
    __resetEventBusForTest();
    fakes.fakeDb.__reset();
  });
  afterEach(async () => {
    await __resetTransactionRepoForTest();
  });

  it('initTransactionRepository(undefined) keeps the Memory default', async () => {
    const tx = makeTx({ id: 'keep-mem' });
    await initTransactionRepository(undefined);
    await transactionRepository.upsert(tx);
    expect(fakes.dbState.callLog).toEqual([]);
    expect(fakes.dbState.bootstrapCalls).toBe(0);
    expect(await transactionRepository.findById('keep-mem')).toEqual(tx);
  });

  it("initTransactionRepository('postgres://…') calls getDb + bootstrapSchema + swaps impl", async () => {
    await initTransactionRepository('postgres://test-only');
    expect(fakes.dbState.bootstrapCalls).toBe(1);
    expect(fakes.fakeDb.insert).toHaveBeenCalledTimes(0); // ...until we upsert
  });

  it('after init, upsert routes through db.insert().values().onConflictDoUpdate()', async () => {
    await initTransactionRepository('postgres://test-only');
    fakes.fakeDb.__reset(); // reset callLog; keep bootstrapCalls
    await transactionRepository.upsert(makeTx({ id: 'drizzle-upsert' }));
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('insert');
  });

  it('after init, findById routes through db.select()', async () => {
    await initTransactionRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    await transactionRepository.findById('drizzle-find');
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('select');
  });

  it('after init, listRecent routes through db.select()', async () => {
    await initTransactionRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    await transactionRepository.listRecent(10);
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('select');
  });

  it('after init, __clearForTest routes through db.execute()', async () => {
    await initTransactionRepository('postgres://test-only');
    fakes.fakeDb.__reset();
    await transactionRepository.__clearForTest();
    expect(fakes.dbState.execCalls).toHaveLength(1);
  });

  it("Drizzle impl maps BigInt amount row → string on the returned Transaction (parity with the JSON-safe string shape)", async () => {
    await initTransactionRepository('postgres://test-only');
    const tx = makeTx({ id: 'drizzle-mapping', amount: '12345' });
    fakes.dbState.queuedSelectResponses.push([drizzleRowFor(tx)]);
    const result = await transactionRepository.findById('drizzle-mapping');
    expect(result?.amount).toBe('12345');
    expect(typeof result?.amount).toBe('string');
  });

  it("Drizzle impl maps Drizzle row → Transaction error field with NULL coalescing", async () => {
    await initTransactionRepository('postgres://test-only');
    const row = drizzleRowFor(makeTx({ id: 'drizzle-error-shape' }));
    // strip the error field — matches the rowToTransaction (`...(row.error ? { error: row.error } : {})`)
    delete (row as { error?: string | null }).error;
    fakes.dbState.queuedSelectResponses.push([row]);
    const result = await transactionRepository.findById('drizzle-error-shape');
    expect(result).toBeDefined();
    expect(result && 'error' in result).toBe(false);
  });

  it('Drizzle impl upsert still broadcasts via the SSE bus at the delegate level', async () => {
    await initTransactionRepository('postgres://test-only');
    const events: string[] = [];
    const unsubscribe = subscribeTransactions(({ transaction }) => {
      events.push(transaction.id);
    });
    try {
      await transactionRepository.upsert(makeTx({ id: 'drizzle-broadcast' }));
      expect(events).toEqual(['drizzle-broadcast']);
    } finally {
      unsubscribe();
    }
  });

  it('__resetTransactionRepoForTest swaps back to Memory + resets state, leaving drizzle id unresolved', async () => {
    await initTransactionRepository('postgres://test-only');
    await transactionRepository.upsert(makeTx({ id: 'drizzle-tx' }));
    expect(fakes.dbState.callLog.map((c) => c.method)).toContain('insert');
    await __resetTransactionRepoForTest();
    // Memory below — finds nothing for the drizzle id
    expect(await transactionRepository.findById('drizzle-tx')).toBeNull();
    // And a Memory upsert doesn't touch the drizzle fakeDb
    fakes.fakeDb.__reset();
    await transactionRepository.upsert(makeTx({ id: 'mem-after-reset' }));
    expect(fakes.dbState.callLog).toEqual([]);
  });
});
