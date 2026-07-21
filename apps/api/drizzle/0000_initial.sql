/**
 * Database migration — initial schema.
 *
 * Creates the core tables for the StellarDAO API:
 *   • assets         — wrapped asset registry
 *   • transactions   — bridge transaction lifecycle
 *   • api_keys       — API key management
 *
 * Run via:  pnpm --filter @stellardao/api drizzle-kit push
 */

import { pgTable, text, timestamp, integer, numeric, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';

export const txStatusEnum = pgEnum('tx_status', [
  'pending',
  'attesting',
  'minting',
  'completed',
  'failed',
  'refunded',
]);

export const sourceChainEnum = pgEnum('source_chain', ['ethereum', 'solana', 'polygon']);

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    sourceChain: sourceChainEnum('source_chain').notNull(),
    sourceAddress: text('source_address').notNull(),
    wrapperToken: text('wrapper_token'),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    decimals: integer('decimals').notNull().default(18),
    totalSupply: numeric('total_supply').default('0'),
    deployedAt: timestamp('deployed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: uniqueIndex('assets_source_idx').on(table.sourceChain, table.sourceAddress),
    wrapperIdx: uniqueIndex('assets_wrapper_idx').on(table.wrapperToken),
  }),
);

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['wrap', 'unwrap'] }).notNull(),
  sourceChain: sourceChainEnum('source_chain').notNull(),
  sourceToken: text('source_token').notNull(),
  wrapperToken: text('wrapper_token').notNull(),
  recipient: text('recipient').notNull(),
  amount: numeric('amount').notNull(),
  status: txStatusEnum('status').notNull().default('pending'),
  sourceTxHash: text('source_tx_hash'),
  stellarTxHash: text('stellar_tx_hash'),
  nonce: text('nonce').notNull(),
  error: text('error'),
  attestations: text('attestations').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  permissions: text('permissions').array().default(['read']),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
