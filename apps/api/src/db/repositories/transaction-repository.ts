import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
  SourceChainId,
  Transaction,
  TxStatus,
} from '@stellardao/shared';

import { broadcastTransaction } from '../../sse/event-bus.js';
import { bootstrapSchema, getDb, __closeDbForTest } from '../pool.js';
import * as schema from '../schema.js';

interface TransactionRepository {
  upsert(tx: Transaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  listRecent(limit: number): Promise<Transaction[]>;
  /** Test-only. Memory is sync `void`; Drizzle is `Promise<void>`. */
  __clearForTest(): void | Promise<void>;
}

const rowToTransaction = (
  row: typeof schema.transactions.$inferSelect,
): Transaction => ({
  id: row.id,
  type: row.type as Transaction['type'],
  sourceChain: row.sourceChain as SourceChainId,
  sourceToken: row.sourceToken,
  wrapperToken: row.wrapperToken,
  recipient: row.recipient,
  // bigint → string at the repo boundary so the rest of the system
  // (route handlers, SSE payload, dashboard render) keeps using the
  // JSON-safe `string` shape from the shared `Transaction` type. The
  // bigint stays strictly inside the repo.
  amount: row.amount.toString(),
  status: row.status as TxStatus,
  sourceTxHash: row.sourceTxHash,
  stellarTxHash: row.stellarTxHash,
  nonce: row.nonce,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  ...(row.error ? { error: row.error } : {}),
});

const txToRow = (
  tx: Transaction,
  opts: { withTimestamps?: boolean } = {},
): typeof schema.transactions.$inferInsert => {
  const row: typeof schema.transactions.$inferInsert = {
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
    error: tx.error ?? null,
  };
  // Default NOW() on the column fills these on the first insert. On
  // a subsequent upsert (lifecycle walk) we want the column updated to
  // the caller's wall-clock — pass through explicitly.
  if (opts.withTimestamps) {
    row.createdAt = new Date(tx.createdAt);
    row.updatedAt = new Date(tx.updatedAt);
  }
  return row;
};

class MemoryTransactionRepository implements TransactionRepository {
  private byId = new Map<string, Transaction>();

  async upsert(tx: Transaction): Promise<Transaction> {
    this.byId.set(tx.id, tx);
    return tx;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.byId.get(id) ?? null;
  }

  async listRecent(limit: number): Promise<Transaction[]> {
    return [...this.byId.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  __clearForTest(): void {
    this.byId.clear();
  }
}

class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async upsert(tx: Transaction): Promise<Transaction> {
    await this.db
      .insert(schema.transactions)
      .values(txToRow(tx))
      .onConflictDoUpdate({
        target: schema.transactions.id,
        set: {
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
          updatedAt: new Date(),
          error: tx.error ?? null,
        },
      });
    // Drizzle's `.returning()` would also work, but the input row is
    // already the canonical post-write shape; the broadcast happens
    // in the delegate (so both impls share the hook) — see below.
    return tx;
  }

  async findById(id: string): Promise<Transaction | null> {
    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .limit(1);
    return rows[0] ? rowToTransaction(rows[0]) : null;
  }

  async listRecent(limit: number): Promise<Transaction[]> {
    // Sort by created_at DESC to match the in-memory implementation
    // (Date.parse(b.createdAt) - Date.parse(a.createdAt)). Lifecycle
    // walks update `updated_at` but the in-memory variant sorted on
    // `created_at`, and the route / dashboard read both orderings the
    // same way when only one wrap is in flight; keeping the original
    // sort order preserves the previous behaviour.
    const rows = await this.db
      .select()
      .from(schema.transactions)
      .orderBy(sql`created_at DESC`)
      .limit(limit);
    return rows.map(rowToTransaction);
  }

  async __clearForTest(): Promise<void> {
    await this.db.execute(sql`DELETE FROM transactions`);
  }
}

/**
 * Module-level delegate. The active implementation is swapped by
 * `initTransactionRepository(dbUrl)`; routes always import the symbol
 * below.
 *
 * The `broadcastTransaction` hook lives at the delegate level, NOT in
 * either implementation. That way, switching implementations can never
 * forget to wire the SSE fan-out — every successful `upsert` is
 * broadcast, regardless of which backing store it lands in.
 */
let activeImpl: TransactionRepository = new MemoryTransactionRepository();

export const transactionRepository = {
  async upsert(tx: Transaction): Promise<Transaction> {
    const stored = await activeImpl.upsert(tx);
    broadcastTransaction(stored);
    return stored;
  },
  findById: (id: string): Promise<Transaction | null> => activeImpl.findById(id),
  listRecent: (limit: number): Promise<Transaction[]> => activeImpl.listRecent(limit),
  __clearForTest: () => activeImpl.__clearForTest(),
};

export const initTransactionRepository = async (
  dbUrl: string | undefined,
): Promise<void> => {
  if (!dbUrl) {
    activeImpl = new MemoryTransactionRepository();
    return;
  }
  const db = getDb(dbUrl);
  await bootstrapSchema(db);
  activeImpl = new DrizzleTransactionRepository(db);
};

export const __resetTransactionRepoForTest = async (): Promise<void> => {
  activeImpl = new MemoryTransactionRepository();
  await __closeDbForTest();
};
