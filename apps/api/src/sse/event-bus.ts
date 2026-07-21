/**
 * In-process pub-sub for the API's SSE relay.
 *
 * Two channels:
 *   - `transaction-update` — every `transactionRepository.upsert` call
 *     from the wrap route + relayer + future webhooks. The
 *     dashboard's TransactionFeed prepends the received `Transaction`
 *     onto its live feed.
 *   - `asset-update` — fired by TWO producers on the asset lifecycle:
 *       * `POST /assets` fires `updateType: 'registered'` once the
 *         pre-stage entry is upserted (the `wrapperToken` slot is
 *         still empty at this point).
 *       * `POST /webhooks/factory/confirm` fires
 *         `updateType: 'wrapperToken-filled'` when the on-chain
 *         wrapper-token contract id fills the empty slot.
 *     The dashboard's AssetsLiveTable calls `router.refresh()` on
 *     every asset-update event so both lifecycle transitions surface
 *     on the `/assets` page without polling. The `updateType`
 *     discriminator lets future consumers (e.g. a dedicated
 *     `AssetTable` row-state flip component) react differently per
 *     transition without parsing the entry shape.
 *
 * Why an EventEmitter instead of a real broker (Redis pub/sub, NATS):
 * the SSE relay only has to back a single Fastify process under
 * `pnpm dev`. Adding infra would buy us nothing — we'd still fan out
 * within one process. The seam here is small enough to swap for an
 * out-of-process broker later: the consumers only see the Listener
 * types, and the producers only have to provide typed updates in
 * order.
 */
import { EventEmitter } from 'node:events';

import type { AssetRegistryEntry, Transaction } from '@stellardao/shared';

export type TransactionEvent = {
  transaction: Transaction;
};

export type AssetEvent = {
  entry: AssetRegistryEntry;
  // Two transition kinds, both currently emitted:
  //   * `'registered'`           — `POST /assets` upserted a new
  //                                pre-stage entry (`wrapperToken`
  //                                is `''` at this point).
  //   * `'wrapperToken-filled'`  — `POST /webhooks/factory/confirm`
  //                                filled the pre-stage slot with
  //                                the on-chain contract id.
  // The union is closed at the type level so a future broadcaster
  // can't silently invent a third variant without a consumer-side
  // update — adding one requires widening both the type and the
  // SSE-bridge enum docs in `horizon-bridge.ts` together.
  updateType: 'registered' | 'wrapperToken-filled';
};

type TxListener = (event: TransactionEvent) => void;
type AssetListener = (event: AssetEvent) => void;

const emitter = new EventEmitter();

/* ─────────────────── transaction-update channel ─────────────────── */

/** Push a transaction update to every connected subscriber. */
export const broadcastTransaction = (tx: Transaction): void => {
  emitter.emit('transaction-update', { transaction: tx });
};

/** Subscribe to transaction updates; returns an unsubscribe function. */
export const subscribeTransactions = (handler: TxListener): (() => void) => {
  emitter.on('transaction-update', handler);
  return () => {
    emitter.off('transaction-update', handler);
  };
};

/* ───────────────────── asset-update channel ─────────────────────── */

/**
 * Push an asset-registry lifecycle update to every connected
 * subscriber. `updateType` is REQUIRED (no default) so every
 * producer is forced to declare which transition it's firing — a
 * silent `updateType` default would let a new producer pick up the
 * wrong variant by accident and break consumers that filter on the
 * discriminator.
 */
export const broadcastAssetUpdate = (
  entry: AssetRegistryEntry,
  updateType: AssetEvent['updateType'],
): void => {
  emitter.emit('asset-update', { entry, updateType });
};

/** Subscribe to asset-registry updates; returns an unsubscribe function. */
export const subscribeAssets = (handler: AssetListener): (() => void) => {
  emitter.on('asset-update', handler);
  return () => {
    emitter.off('asset-update', handler);
  };
};

/* ─────────────────── test-only ─────────────────── */

/** Test-only: wipe listeners on ALL channels so a worker can start from a
 *  clean bus. `EventEmitter.removeAllListeners()` with no argument
 *  removes every listener from every event — this is safe across the
 *  multi-channel split because tests don't want to leak either channel
 *  between specs. */
export const __resetEventBusForTest = (): void => {
  emitter.removeAllListeners();
};
