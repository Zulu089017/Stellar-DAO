/**
 * In-process pub-sub for the API's SSE relay.
 *
 * Two channels:
 *   - `transaction-update` — every `transactionRepository.upsert` call
 *     from the wrap route + relayer + future webhooks. The
 *     dashboard's TransactionFeed prepends the received `Transaction`
 *     onto its live feed.
 *   - `asset-update` — fired by `POST /webhooks/factory/confirm` when
 *     the on-chain wrapper-token contract id (previously empty in
 *     the pre-stage) is filled in. The dashboard's AssetRow flips
 *     from "pre-stage" to "deployed" once the event arrives.
 *     `POST /assets` does NOT currently broadcast — initial load
 *     still relies on the synchronous GET /assets response.
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
  // Currently only `'wrapperToken-filled'` is emitted (by the
  // factory-confirmation webhook handler in `routes/webhooks.ts`).
  // The parameter stays on the signature so a future broadcaster
  // (e.g. a `POST /assets` change that surfaces initial registration
  // through SSE) can route through the same channel without
  // breaking the spec contract.
  updateType: 'wrapperToken-filled';
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
 * Push an asset-registry slot-fill update to every connected
 * subscriber. `updateType` defaults to the only currently-emitted
 * variant (`'wrapperToken-filled'`) so the single producer (the
 * factory-confirmation webhook) doesn't have to pass it explicitly.
 */
export const broadcastAssetUpdate = (
  entry: AssetRegistryEntry,
  updateType: AssetEvent['updateType'] = 'wrapperToken-filled',
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
