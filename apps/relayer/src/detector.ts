import pino from 'pino';
import type { SourceChainId } from '@stellardao/shared';

import type { LockEvent } from './sources/types.js';

const log = pino({ transport: { target: 'pino-pretty' } });

/**
 * Detector loop.
 *
 * Owns one source-chain watcher at a time. Re-connects on errors so a
 * single chain outage doesn't kill the relayer; per-chain restart uses
 * exponential backoff up to 60s.
 *
 * Accepts an optional `AbortSignal` so callers can:
 *   - shut down the relayer gracefully (e.g. SIGINT/SIGTERM handlers)
 *   - bound the loop in tests with a controlled termination condition
 */
export const detector = async (
  chain: SourceChainId,
  factory: () => Promise<unknown>,
  emit: (event: LockEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> => {
  let attempt = 0;
  while (!signal?.aborted) {
    try {
      const adapter = (await factory()) as {
        watch: (rpcUrl: string, cb: (e: LockEvent) => void) => Promise<void>;
      };
      await adapter.watch(process.env[`${chain.toUpperCase()}_RPC_URL`] ?? '', emit);
      attempt = 0; // reset on healthy attach
    } catch (err) {
      attempt += 1;
      const delay = Math.min(60_000, 1000 * 2 ** attempt);
      log.warn({ chain, attempt, delay, err: (err as Error).message }, 'reconnecting to source chain');
      await new Promise((r) => setTimeout(r, delay));
      if (signal?.aborted) {
        // Caller aborted during the backoff sleep — exit cleanly
        // without running another factory cycle (otherwise we'd log
        // another "reconnecting" line on the way out of the loop).
        return;
      }
    }
  }
};
