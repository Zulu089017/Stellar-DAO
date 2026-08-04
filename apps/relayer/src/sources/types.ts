import type { LockPayload, SourceChainId } from '@stellar-payment-gateway/shared';

/** Output of one watcher iteration. */
export type LockEvent = Omit<LockPayload, 'sourceChain'>;

export type SourceAdapter = {
  watch(rpcUrl: string, emit: (event: LockEvent) => void): Promise<void>;
  /** Sync backfill used at startup so we don't miss events on restart. */
  backfill?(rpcUrl: string): Promise<LockEvent[]>;
};

/**
 * Factory signature used by `detector.ts` and `index.ts` — each source-chain
 * module exports a function that, given its RPC URL, returns (or resolves
 * to) a `SourceAdapter`. We allow `Promise<SourceAdapter>` so adapters can
 * lazily establish provider connections (ethers WebSocket upgrades,
 * Solana commitment reads, etc.) without blocking the relayer boot loop.
 */
export type WatcherFactory = (rpcUrl: string) => SourceAdapter | Promise<SourceAdapter>;

export const chainFor = (id: SourceChainId): string => id;
