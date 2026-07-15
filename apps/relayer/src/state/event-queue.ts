import type { Transaction } from '@stellardao/shared';

/**
 * Input shape for `eventQueue.push`.
 *
 * `createdAt` / `updatedAt` are optional — `push()` auto-fills them
 * with `new Date().toISOString()` via the `??` runtime default, so
 * callers don't have to invent timestamps. `status` stays as
 * `TxStatus` (preserved from `Transaction`).
 */
export type TransactionInput = Omit<Transaction, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

/**
 * In-memory queue of in-flight Lock + Burn events.
 *
 * Replaced with a Redis stream in production so multiple relayer
 * workers can coordinate. For the scaffold we just expose a Map-backed
 * queue with `push`/`update`/`list`.
 */
const queue = new Map<string, Transaction>();

const keyFor = (tx: { sourceChain: string; nonce: string }) =>
  `${tx.sourceChain}:${tx.nonce}`;

export const eventQueue = {
  push(event: TransactionInput): Transaction {
    const now = new Date().toISOString();
    const tx: Transaction = {
      ...event,
      createdAt: event.createdAt ?? now,
      updatedAt: event.updatedAt ?? now,
    };
    queue.set(keyFor(tx), tx);
    return tx;
  },

  /** Updates by the canonical `(sourceChain, nonce)` key, not by an arbitrary id. */
  updateById(
    sourceChain: string,
    nonce: string,
    patch: Partial<Transaction>,
  ): Transaction | undefined {
    const key = `${sourceChain}:${nonce}`;
    const existing = queue.get(key);
    if (!existing) return undefined;
    const next: Transaction = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    queue.set(key, next);
    return next;
  },

  update(txKey: string, patch: Partial<Transaction>): Transaction | undefined {
    const existing = queue.get(txKey);
    if (!existing) return undefined;
    const next: Transaction = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    queue.set(txKey, next);
    return next;
  },

  list(): Transaction[] {
    return [...queue.values()];
  },

  /**
   * Test-only: clears the underlying map so a spec's beforeEach can
   * reset state without reaching into the private `queue` symbol.
   * Mirrors the `__clearForTest` pattern on the API's
   * `assetRepository` / `transactionRepository`.
   *
   * TODO(50-item backlog, sourceTxHash dedup): when source-chain
   * receipt integration lands and the dedup key migrates from
   * `${sourceChain}:${nonce}` to `sourceTxHash`, this method still
   * only needs to `clear()` the map — the test-side concern doesn't
   * care which key the production code uses, only that the reset is
   * observable.
   */
  __clearForTest(): void {
    queue.clear();
  },
};
