/**
 * Lazy-initialised pg.Pool + drizzle instance, plus a raw-SQL bootstrap
 * that brings the schema up to date via `CREATE TABLE IF NOT EXISTS`.
 *
 * Why raw SQL instead of `drizzle-kit generate` + `migrate()`:
 *
 *   - The scaffold has no migration runner in production yet. A
 *     `drizzle/` migrations folder would have to be committed + shipped
 *     + applied at deploy time, which is a separate infrastructure
 *     concern from "swap the in-memory Map for Postgres".
 *   - For a scaffold that boots into a fresh database, `CREATE TABLE IF
 *     NOT EXISTS … (columns match the drizzle schema byte-for-byte)`
 *     is one less moving part. The real production swap will replace
 *     this with `drizzle-kit`-managed migrations once the schema is
 *     stabilised.
 *
 * The pool is cached as a module-level singleton, mirroring the lazy
 * contract-instance pattern used in `apps/api/src/soroban/index.ts`.
 */
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

import * as schema from './schema.js';

let cachedPool: pg.Pool | null = null;
let cachedDb: NodePgDatabase<typeof schema> | null = null;

/** Connect lazily and reuse the same pool across requests. */
export const getDb = (connectionString: string): NodePgDatabase<typeof schema> => {
  if (!cachedDb || !cachedPool) {
    cachedPool = new pg.Pool({ connectionString });
    cachedDb = drizzle(cachedPool, { schema });
  }
  return cachedDb;
};

/**
 * Idempotent schema bootstrap. The SQL below mirrors the column shape
 * in `./schema.ts` exactly — and the drizzle `defaultNow()` constraint
 * is preserved by `DEFAULT NOW()` server-side. If `drizzle-kit`'s
 * generated migrations ever diverge from this bootstrap, the SQL
 * below becomes the source of truth and `drizzle.config.ts` exists so
 * that running `pnpm drizzle-kit generate` will still produce a
 * matching migration file.
 */
export const bootstrapSchema = async (
  db: NodePgDatabase<typeof schema>,
): Promise<void> => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(150) PRIMARY KEY,
      wrapper_token VARCHAR(64) NOT NULL,
      chain VARCHAR(16) NOT NULL,
      source_address VARCHAR(128) NOT NULL,
      symbol VARCHAR(16) NOT NULL,
      name VARCHAR(128) NOT NULL,
      decimals INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(8) NOT NULL,
      source_chain VARCHAR(16) NOT NULL,
      source_token VARCHAR(128) NOT NULL,
      wrapper_token VARCHAR(64) NOT NULL,
      recipient VARCHAR(64) NOT NULL,
      amount BIGINT NOT NULL,
      status VARCHAR(16) NOT NULL,
      source_tx_hash VARCHAR(128),
      stellar_tx_hash VARCHAR(128),
      nonce VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      error TEXT
    );
  `);
};

/**
 * Test-only: close the pool (releasing its open sockets) and drop the
 * cached references so the next `getDb(...)` reconnects. Renamed from
 * a sync `__reset*` because `pg.Pool.end()` returns a Promise — leaving
 * the pool unended across many test runs leaks file descriptors in
 * long-lived workers.
 */
export const __closeDbForTest = async (): Promise<void> => {
  if (cachedPool) {
    await cachedPool.end();
  }
  cachedDb = null;
  cachedPool = null;
};
