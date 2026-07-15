import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { AssetId, AssetRegistryEntry } from '@stellardao/shared';

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

interface AssetRepository {
  upsertBySource(
    input: Omit<AssetRegistryEntry, 'id'> & { id?: string },
  ): Promise<AssetRegistryEntry>;
  listAll(): Promise<AssetRegistryEntry[]>;
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
