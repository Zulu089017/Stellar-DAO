import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AssetId, AssetRegistryEntry, SourceChainId } from '@stellardao/shared';

import { bootstrapSchema, getDb, __closeDbForTest } from '../pool.js';
import * as schema from '../schema.js';

/**
 * The composite primary key under which the in-memory Map and the
 * drizzle table both store the row. Lives in the same format the
 * domain `AssetRegistryEntry.id` uses, so the swap is transparent to
 * route handlers.
 */
const keyFor = (source: AssetId): string =>
  `${source.chain}:${source.address.toLowerCase()}`;

/**
 * Result shape returned by `listByFilter`. Mirrors the pagination
 * convention used by `transaction-repository.ts::listRecent`: a
 * `nextCursor` of `null` means "this page is the last one (or
 * matched exactly N rows from a larger table)"; the route layer
 * translates `null` to JSON-omitted (`undefined`) for the wire.
 *
 * Idempotent for the case `entries.length === opts.limit` from a
 * larger table — a follow-up call with the returned `nextCursor` as
 * `?cursor=` will dispatch one more empty page. That extra round-
 * trip is acceptable for the asset registry at realistic sizes
 * (low-thousands max in testnet). If a future maintainer wants to
 * eliminate it, switch to a `limit + 1` peek-and-slice strategy.
 */
export interface ListByFilterResult {
  entries: AssetRegistryEntry[];
  nextCursor: string | null;
}

interface AssetRepository {
  upsertBySource(
    input: Omit<AssetRegistryEntry, 'id'> & { id?: string },
  ): Promise<AssetRegistryEntry>;
  listAll(): Promise<AssetRegistryEntry[]>;
  /**
   * Cursor-paginated listing with optional chain filter. `cursor` is
   * the `assets.id` value returned as `nextCursor` from the previous
   * call; absent on first page. Results are sorted by `id` ASC so
   * the cursor pointer `> prevLastId` is monotonic across calls.
   */
  listByFilter(opts: {
    sourceChain?: SourceChainId;
    limit: number;
    cursor?: string;
  }): Promise<ListByFilterResult>;
  findBySource(
    chain: AssetId['chain'],
    address: string,
  ): Promise<AssetRegistryEntry | null>;
  /**
   * Test-only. `MemoryAssetRepository` returns `void` (in-process Map.clear
   * is sync); `DrizzleAssetRepository` returns `Promise<void>` (DELETE
   * is async). Tests call without `await`, so both signatures are
   * compatible — the delegate forwards to whatever the active impl
   * exposes.
   */
  __clearForTest(): void | Promise<void>;
}

const rowToEntry = (
  row: typeof schema.assets.$inferSelect,
): AssetRegistryEntry => ({
  id: row.id,
  wrapperToken: row.wrapperToken,
  source: {
    chain: row.chain as AssetId['chain'],
    address: row.sourceAddress,
  },
  symbol: row.symbol,
  name: row.name,
  decimals: row.decimals,
});

class MemoryAssetRepository implements AssetRepository {
  private store = new Map<string, AssetRegistryEntry>();

  async upsertBySource(
    input: Omit<AssetRegistryEntry, 'id'> & { id?: string },
  ): Promise<AssetRegistryEntry> {
    const id = input.id ?? keyFor(input.source);
    const entry: AssetRegistryEntry = { id, ...input };
    this.store.set(id, entry);
    return entry;
  }

  async listAll(): Promise<AssetRegistryEntry[]> {
    return [...this.store.values()];
  }

  async listByFilter(opts: {
    sourceChain?: SourceChainId;
    limit: number;
    cursor?: string;
  }): Promise<ListByFilterResult> {
    // Map.values() iterates in insertion order, which is NOT
    // guaranteed to match the composite-id lexicographic order we
    // expose to callers. Sort explicitly so the cursor pointer
    // (`> prevLastId`) is deterministic across Memory + Drizzle
    // impls — without this, a Memory-backed route could land rows
    // in a different sequence than a Drizzle-backed route after
    // upserts land in non-id order, which would surface as a
    // cursor-stability regression only at runtime.
    let filtered = [...this.store.values()];
    // Bind the optional strings to narrowed locals BEFORE entering
    // the `.filter()` callbacks. TypeScript does not narrow
    // `opts.cursor` from `string | undefined` to `string` when the
    // reference is INSIDE a higher-order `.filter()` callback, even
    // after an `if (opts.cursor)` check on the line above. Without
    // the local-bind form here, `tsc` reports TS18048 at the
    // `opts.cursor` reference inside the callback.
    const sourceChain = opts.sourceChain;
    const cursor = opts.cursor;
    if (sourceChain !== undefined) {
      filtered = filtered.filter((e) => e.source.chain === sourceChain);
    }
    if (cursor !== undefined && cursor !== '') {
      filtered = filtered.filter((e) => e.id > cursor);
    }
    filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const slice = filtered.slice(0, opts.limit);
    return {
      entries: slice,
      nextCursor:
        slice.length === opts.limit && slice.length > 0
          ? slice[slice.length - 1]!.id
          : null,
    };
  }

  async findBySource(
    chain: AssetId['chain'],
    address: string,
  ): Promise<AssetRegistryEntry | null> {
    return this.store.get(keyFor({ chain, address })) ?? null;
  }

  __clearForTest(): void {
    this.store.clear();
  }
}

class DrizzleAssetRepository implements AssetRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async upsertBySource(
    input: Omit<AssetRegistryEntry, 'id'> & { id?: string },
  ): Promise<AssetRegistryEntry> {
    const id = input.id ?? keyFor(input.source);
    await this.db
      .insert(schema.assets)
      .values({
        id,
        wrapperToken: input.wrapperToken,
        chain: input.source.chain,
        sourceAddress: input.source.address,
        symbol: input.symbol,
        name: input.name,
        decimals: input.decimals,
      })
      .onConflictDoUpdate({
        target: schema.assets.id,
        set: {
          wrapperToken: input.wrapperToken,
          chain: input.source.chain,
          sourceAddress: input.source.address,
          symbol: input.symbol,
          name: input.name,
          decimals: input.decimals,
        },
      });
    return { id, ...input };
  }

  async listAll(): Promise<AssetRegistryEntry[]> {
    const rows = await this.db.select().from(schema.assets);
    return rows.map(rowToEntry);
  }

  async listByFilter(opts: {
    sourceChain?: SourceChainId;
    limit: number;
    cursor?: string;
  }): Promise<ListByFilterResult> {
    // Build the WHERE clause from whichever optional filters are
    // present. drizzle's `and(...)` is a functional operator (not a
    // chainable method), so the fluent chain recorded by the
    // fakes Proxy is `[select, from, where?, orderBy, limit]` and
    // the presence of `where` alone is sufficient evidence that the
    // filter path was taken.
    // Bind the optional strings to narrowed locals BEFORE the
    // `eq(...)` / `gt(...)` argument evaluation. Inlining
    // `if (opts.cursor) conds.push(gt(schema.assets.id, opts.cursor))`
    // produces a TS18048 ("possibly undefined") on the `gt(...)`
    // call site because TS's narrowing does not always propagate
    // through a complex `if (cond) array.push(call(cond-arg))`
    // expression. The local-bind form below keeps the narrowing
    // explicit so the type-checker is happy and the runtime behavior
    // is unchanged.
    const sourceChain = opts.sourceChain;
    const cursor = opts.cursor;
    const conds = [];
    if (sourceChain !== undefined) {
      conds.push(eq(schema.assets.chain, sourceChain));
    }
    if (cursor !== undefined && cursor !== '') {
      conds.push(gt(schema.assets.id, cursor));
    }
    const where = conds.length ? and(...conds) : undefined;
    const baseQ = this.db.select().from(schema.assets);
    const filteredQ = where ? baseQ.where(where) : baseQ;
    const orderedQ = filteredQ.orderBy(asc(schema.assets.id));
    const limitedQ = orderedQ.limit(opts.limit);
    const rows = await limitedQ;
    const entries = rows.map(rowToEntry);
    return {
      entries,
      nextCursor:
        entries.length === opts.limit && entries.length > 0
          ? entries[entries.length - 1]!.id
          : null,
    };
  }

  async findBySource(
    chain: AssetId['chain'],
    address: string,
  ): Promise<AssetRegistryEntry | null> {
    const id = keyFor({ chain, address });
    const rows = await this.db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, id))
      .limit(1);
    return rows[0] ? rowToEntry(rows[0]) : null;
  }

  async __clearForTest(): Promise<void> {
    await this.db.execute(sql`DELETE FROM assets`);
  }
}

/**
 * Module-level delegate. The active implementation is swapped by
 * `initAssetRepository(dbUrl)` (called from `createServer` and
 * `index.ts`); routes always import the symbol below, so the swap is
 * transparent to them.
 *
 * Test specs that exercise routes don't call `initAssetRepository`
 * themselves — `createServer` reads `parseEnv.api().DATABASE_URL` and
 * sees an absent value in the test env (it's not stubbed), so the
 * memory implementation is selected automatically. The
 * `__clearForTest` hook here delegates to whatever's active.
 */
let activeImpl: AssetRepository = new MemoryAssetRepository();

export const assetRepository: AssetRepository = {
  upsertBySource: (...args) => activeImpl.upsertBySource(...args),
  listAll: () => activeImpl.listAll(),
  listByFilter: (...args) => activeImpl.listByFilter(...args),
  findBySource: (...args) => activeImpl.findBySource(...args),
  __clearForTest: () => activeImpl.__clearForTest(),
};

/**
 * Wire the repository to either the in-memory store (default) or a
 * drizzle-backed pg pool. Idempotent — calling it twice with the same
 * `dbUrl` is a no-op for the connection and idempotent for the table
 * bootstrap (CREATE TABLE IF NOT EXISTS).
 */
export const initAssetRepository = async (
  dbUrl: string | undefined,
): Promise<void> => {
  if (!dbUrl) {
    activeImpl = new MemoryAssetRepository();
    return;
  }
  const db = getDb(dbUrl);
  await bootstrapSchema(db);
  activeImpl = new DrizzleAssetRepository(db);
};

/** Test-only: drop module state back to the in-memory default and
 *  close the pg pool so the worker doesn't leak sockets across runs. */
export const __resetAssetRepoForTest = async (): Promise<void> => {
  activeImpl = new MemoryAssetRepository();
  await __closeDbForTest();
};
