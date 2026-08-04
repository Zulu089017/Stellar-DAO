/**
 * Postgres schema (drizzle). `assetRepository` and `transactionRepository`
 * swap to these tables when `DATABASE_URL` is present.
 *
 * `assets.id` is the composite key `${chain}:${address.toLowerCase()}`
 * produced by `keyFor()` in `asset-repository.ts` so that inserts are
 * idempotent on the source pair (no need for a surrogate key + unique
 * constraint) and the in-memory `Map<string, AssetRegistryEntry>` lives
 * under the same identifier — keeping the schema aligned with the
 * domain means the repo layer never has to translate between two
 * identifier spaces.
 */
import { pgTable, text, varchar, timestamp, bigint, integer } from 'drizzle-orm/pg-core';

export const assets = pgTable('assets', {
  id: varchar('id', { length: 150 }).primaryKey(),
  wrapperToken: varchar('wrapper_token', { length: 64 }).notNull(),
  chain: varchar('chain', { length: 16 }).notNull(),
  sourceAddress: varchar('source_address', { length: 128 }).notNull(),
  symbol: varchar('symbol', { length: 16 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  decimals: integer('decimals').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: varchar('id', { length: 64 }).primaryKey(),
  creator: varchar('creator', { length: 64 }).notNull(),
  payer: varchar('payer', { length: 64 }).notNull(),
  token: varchar('token', { length: 16 }).notNull(),
  totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),
  paidAmount: bigint('paid_amount', { mode: 'bigint' }).notNull().default(0n),
  expirationLedger: integer('expiration_ledger').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('created'),
  memo: varchar('memo', { length: 256 }).notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const merchants = pgTable('merchants', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  email: varchar('email', { length: 256 }).notNull(),
  website: varchar('website', { length: 512 }),
  webhookUrl: varchar('webhook_url', { length: 512 }),
  apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(),
  apiKeyPrefix: varchar('api_key_prefix', { length: 16 }).notNull(),
  roles: varchar('roles', { length: 256 }).notNull().default('merchant'),
  active: varchar('active', { length: 1 }).notNull().default('t'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  type: varchar('type', { length: 8 }).notNull(),
  sourceChain: varchar('source_chain', { length: 16 }).notNull(),
  sourceToken: varchar('source_token', { length: 128 }).notNull(),
  wrapperToken: varchar('wrapper_token', { length: 64 }).notNull(),
  recipient: varchar('recipient', { length: 64 }).notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  sourceTxHash: varchar('source_tx_hash', { length: 128 }),
  stellarTxHash: varchar('stellar_tx_hash', { length: 128 }),
  nonce: varchar('nonce', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  error: text('error'),
});
