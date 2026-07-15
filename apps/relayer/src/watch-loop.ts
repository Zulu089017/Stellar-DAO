/**
 * Generic adaptive-interval watch loop.
 *
 * Pulls observations from a caller-supplied `pollFn` and emits each
 * one through a caller-supplied `emit` hook. The poll cadence adapts
 * to the observation rate:
 *
 *   - any non-empty observation resets `idleStreak` to 0 — the loop
 *     snaps back to the base interval.
 *   - every empty poll increments `idleStreak` — the loop backs
 *     off exponentially (`base * 2 ^ idleStreak`) clamped at
 *     `maxIntervalMs`.
 *   - on any error from `pollFn` or `emit`, the loop calls `onError`
 *     and either continues (void return) or re-throws the original
 *     error (`{ stop: true }` return).
 *
 * The same full-jitter shape used in
 * `packages/sdk/src/retry.ts::withRetry` is applied here: each
 * computed interval is scaled by `rng() ∈ [0, 1)`, capped at
 * `maxIntervalMs`, so loops running in lockstep don't thunder on
 * every idle-tick. The `rng` seam is the test handle for
 * deterministic delay values.
 *
 * Independent of `detector.ts` — the detector keeps its chain-spanning
 * loop with reconnect semantics; this primitive is a generic, reusable
 * building block for future poll-and-emit tasks (SSE feeds, source-chain
 * back-pressure, etc.) without coupling to a single chain.
 */

export type WatchLoopDecision = void | { stop: true };

export type WatchLoopOptions<T> = {
  /**
   * Returns the next batch of observations. Empty array = "no
   * events"; non-empty = "events observed, snap back to base".
   * Throwing triggers the `onError` path with exponential backoff.
   */
  pollFn: (signal?: AbortSignal) => Promise<T[]>;
  /**
   * Called once per item from `pollFn`. Optional — return value is
   * ignored. A throw routes through `onError` exactly like a
   * `pollFn` throw.
   */
  emit?: (item: T, meta: { attempt: number }) => void | Promise<void>;
  /**
   * Error triage hook. Default behaviour: swallow and continue.
   * Returning `{ stop: true }` re-throws the error and ends the
   * loop. The `meta.idleStreak` value reported here is the streak
   * EXCLUDING the current (errored) attempt — caller can use it
   * for telemetry without re-deriving.
   */
  onError?: (
    err: unknown,
    meta: { attempt: number; idleStreak: number },
  ) => WatchLoopDecision;
  /**
   * Initial poll cadence. Default 1000ms — matches the healthy
   * cadence `detector.ts` reconnects with.
   */
  baseIntervalMs?: number;
  /**
   * Hard ceiling on the backoff interval, applied AFTER the
   * `base * 2^nidleStreak` ladder. Default 60000ms — matches
   * `detector.ts`'s reconnect cap.
   */
  maxIntervalMs?: number;
  /**
   * Random number source for full-jitter scaling. Defaults to
   * `Math.random`. Override in tests to deterministic midpoints
   * (mirrors `withRetry`'s `rng` seam in
   * `packages/sdk/src/retry.ts`).
   */
  rng?: () => number;
  /**
   * Caller-owned AbortSignal. When aborted, the loop exits cleanly
   * after the in-flight poll resolves — no further ticks are
   * scheduled. Errors from the abort reason surface through the
   * underlying sleep rejection, but the outer watch-loop treats
   * them like normal aborts.
   */
  signal?: AbortSignal;
};

export const DEFAULT_WATCH_LOOP_OPTS = {
  baseIntervalMs: 1_000,
  maxIntervalMs: 60_000,
  rng: Math.random as () => number,
} as const;

/**
 * Drives `pollFn → emit, sleep, repeat` until the caller aborts or
 * `onError` says to stop. Returns when the signal fires; never
 * resolves on a successful "we will never poll again" condition —
 * the loop is intentionally open-ended by design (caller chooses
 * the termination).
 */
export async function watchLoop<T>(opts: WatchLoopOptions<T>): Promise<void> {
  const baseIntervalMs = opts.baseIntervalMs ?? DEFAULT_WATCH_LOOP_OPTS.baseIntervalMs;
  const maxIntervalMs = opts.maxIntervalMs ?? DEFAULT_WATCH_LOOP_OPTS.maxIntervalMs;
  const rng = opts.rng ?? DEFAULT_WATCH_LOOP_OPTS.rng;

  let idleStreak = 0;
  let attempt = 0;

  while (!opts.signal?.aborted) {
    attempt += 1;
    try {
      let items: T[];
      try {
        items = await opts.pollFn(opts.signal);
      } catch (err) {
        const decision = await opts.onError?.(err, { attempt, idleStreak });
        if (isStopDecision(decision)) throw err;
        idleStreak += 1;
        await sleepJittered(
          idleIntervalMs(idleStreak, baseIntervalMs, maxIntervalMs),
          rng,
          opts.signal,
        );
        continue;
      }

      try {
        if (items.length === 0) {
          idleStreak += 1;
        } else {
          for (const item of items) {
            await opts.emit?.(item, { attempt });
          }
          // Snap back to base interval after observing; the upcoming
          // jittered sleep will use `idleStreak = 0` even though
          // mid-batch emit errors could have advanced it.
          idleStreak = 0;
        }
      } catch (err) {
        const decision = await opts.onError?.(err, { attempt, idleStreak });
        if (isStopDecision(decision)) throw err;
        // Emit failed mid-batch — treat the rest of the batch as
        // unconsumed and back off via the same exponential ladder.
        idleStreak += 1;
        await sleepJittered(
          idleIntervalMs(idleStreak, baseIntervalMs, maxIntervalMs),
          rng,
          opts.signal,
        );
        continue;
      }

      await sleepJittered(
        idleIntervalMs(idleStreak, baseIntervalMs, maxIntervalMs),
        rng,
        opts.signal,
      );
    } catch (err) {
      // A sleepJittered rejection (or any uncaught throw that
      // slipped past the inner onError path) bubbles up here. If
      // the caller aborts the loop, that's a clean exit, not a
      // throw — production callers fire-and-forget this promise
      // and don't want to handle AbortError on graceful shutdown.
      if (opts.signal?.aborted) return;
      throw err;
    }
  }
}

const idleIntervalMs = (idleStreak: number, base: number, max: number): number => {
  // `idleStreak === 0` (after observation) → base. Otherwise exponential
  // ladder. Clamped at `max` so wildly-growing idleStreak values don't
  // blow past the cap.
  return Math.min(max, base * 2 ** idleStreak);
};

const isStopDecision = (decision: WatchLoopDecision | undefined): decision is { stop: true } =>
  typeof decision === 'object' && decision !== null && decision.stop === true;

/**
 * Apply full-jitter scaling: `delay = round(rng() * window)` so
 * the actual sleep is in `[0, window]`. Mirrors `withRetry`.
 */
const sleepJittered = (
  window: number,
  rng: () => number,
  signal?: AbortSignal,
): Promise<void> => {
  if (window <= 0) return sleep(0, signal);
  return sleep(Math.round(rng() * window), signal);
};

/**
 * Signal-aware sleep. Always schedules a real `setTimeout`, even at
 * `ms = 0`, so the loop yields to the event loop dispatcher rather
 * than spinning inside the microtask queue. Skipping this when
 * `rng * window` rounds to 0 (a legitimate edge case for tests using
 * `rng: () => 0` and for production callers whose rng happens to
 * produce small fractional delays) used to short-circuit to
 * `Promise.resolve()`, turning every iteration into a microtask and
 * causing the worker to OOM under repeated runs.
 *
 * Under vitest's fake timers the same `setTimeout(0)` is queued and
 * drained by `vi.advanceTimersByTimeAsync(0)` so the test fixtures
 * keep the same semantics as production.
 *
 * An already-aborted signal rejects without ever scheduling a timer.
 */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
