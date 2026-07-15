import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { DEFAULT_WATCH_LOOP_OPTS, watchLoop } from './watch-loop.js';

/* ─────────────────── helpers (mirrored from packages/sdk/src/horizon.spec.ts) ─────────────────── */

/**
 * Wrap a Promise so the resolved/rejected state is captured into a
 * tagged-union value AND the rejection handler is attached
 * synchronously at construction (before any await on the caller
 * side yields control to the event loop). See horizon.spec.ts for
 * the full reasoning on vitest 2.x's strict unhandled-rejection
 * detector.
 */
async function settledPromise<T>(
  p: Promise<T>,
): Promise<{ ok: true; val: T } | { ok: false; err: unknown }> {
  return p.then(
    (val: T) => ({ ok: true as const, val }),
    (err: unknown) => ({ ok: false as const, err }),
  );
}

/** Type-narrowing predicate for `unknown` rejection values. */
function isError(e: unknown): e is Error {
  return e instanceof Error;
}

/* ─────────────────── defaults ─────────────────── */

describe('DEFAULT_WATCH_LOOP_OPTS', () => {
  it('matches the documented constants (base=1000ms, max=60_000ms)', () => {
    expect(DEFAULT_WATCH_LOOP_OPTS.baseIntervalMs).toBe(1000);
    expect(DEFAULT_WATCH_LOOP_OPTS.maxIntervalMs).toBe(60_000);
  });
});

/* ─────────────────── core loop ─────────────────── */

describe('watchLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // Defensive: clear any pending fake timers BEFORE switching back
    // to real timers. Without this, leftover abort-listener cycles on
    // aborted-but-still-queued setTimeouts can accumulate across
    // tests and reintroduce the OOM the spec is built to prevent.
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /* 1. Happy path: any-nonzero observation resets idleStreak + emits once per item. */
  it('emits each item from a non-empty poll and snaps back to base interval', async () => {
    const emitted: Array<{ value: number; attempt: number }> = [];
    let next = 0;
    const pollFn = vi.fn(async () => {
      next += 1;
      // poll 1 → 1 item; poll 2 → 2 items; poll 3+ → idle
      if (next === 1) return [42];
      if (next === 2) return [7, 8];
      return [];
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        emit: (item, meta) => {
          emitted.push({ value: item, attempt: meta.attempt });
        },
        // base=100, max=1000, rng=0.5 → delay = 0.5 * min(1000, 100 * 2^idle)
        //   idle=0: 50ms | idle=1: 100ms | idle=2: 200ms | idle=3: 400ms | idle>=4: 500ms
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask already fired iter 1 (pollFn=[42]→emit→snap-back→sleep 50ms).
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 50 → fires setTimeout(50) → iter 2 (pollFn=[7,8]→emit both→sleep 50ms).
    await vi.advanceTimersByTimeAsync(50);
    expect(emitted).toEqual([
      { value: 42, attempt: 1 },
      { value: 7, attempt: 2 },
      { value: 8, attempt: 2 },
    ]);
    expect(pollFn).toHaveBeenCalledTimes(2);

    // advance 50 → fires setTimeout(50) → iter 3 (pollFn=[]→idleStreak=1→sleep 100ms).
    await vi.advanceTimersByTimeAsync(50);
    expect(pollFn).toHaveBeenCalledTimes(3);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 2. Idle path: 5 empty polls → interval doubles each time up to 5x. */
  it('backs off exponentially when all polls are empty (5 empty polls)', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: iter 1, idleStreak=1, sleep 100ms (0.5 * 200).
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 100 → iter 2, idle=2, sleep 200ms (0.5 * 400).
    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(2);

    // advance 200 → iter 3, idle=3, sleep 400ms (0.5 * 800).
    await vi.advanceTimersByTimeAsync(200);
    expect(pollFn).toHaveBeenCalledTimes(3);

    // advance 400 → iter 4, idle=4, sleep 500ms (0.5 * 1000, capped).
    await vi.advanceTimersByTimeAsync(400);
    expect(pollFn).toHaveBeenCalledTimes(4);

    // advance 500 → iter 5, idle=5, sleep 500ms (still capped).
    await vi.advanceTimersByTimeAsync(500);
    expect(pollFn).toHaveBeenCalledTimes(5);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 3. Snap-back: 3 idle polls → 1 observation → reset interval to base. */
  it('resets idleStreak on the first observed poll after 3 idle polls', async () => {
    const emitted: number[] = [];
    let next = 0;
    const pollFn = vi.fn(async () => {
      next += 1;
      // poll 1-3 → empty. poll 4 → [99]. poll 5+ → idle.
      if (next === 4) return [99];
      return [];
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        emit: (item) => {
          emitted.push(item);
        },
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: iter 1, idle=1, sleep 100ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 100 → iter 2, idle=2, sleep 200ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(2);

    // advance 200 → iter 3, idle=3, sleep 400ms.
    await vi.advanceTimersByTimeAsync(200);
    expect(pollFn).toHaveBeenCalledTimes(3);

    // advance 400 → iter 4, poll=[99], emit, snap-back, sleep 50ms.
    await vi.advanceTimersByTimeAsync(400);
    expect(emitted).toEqual([99]);
    expect(pollFn).toHaveBeenCalledTimes(4);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 4. Cap: 20 empty polls → interval clamps to maxIntervalMs. */
  it('clamps backoff at maxIntervalMs after enough idleStreak accumulates', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        baseIntervalMs: 100,
        // small max so we can assert the clamping behaviour cheaply
        maxIntervalMs: 500,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Math (rng=0.5): idle=0→50ms, idle=1→100ms, idle=2→200ms, idle=3+→250ms (capped).
    // Initial microtask: iter 1, idle=1, sleep 100ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 100 → iter 2, idle=2, sleep 200ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(2);

    // advance 200 → iter 3, idle=3, sleep 250ms (capped at 500*0.5=250).
    await vi.advanceTimersByTimeAsync(200);
    expect(pollFn).toHaveBeenCalledTimes(3);

    // 17 more 250ms advances take us from 4 polls to 20 polls.
    for (let i = 0; i < 17; i += 1) {
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(pollFn).toHaveBeenCalledTimes(20);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 5. Jitter math: rng=0.5 → setTimeout at 0.5 * interval after the FIRST poll (idleStreak=1). */
  it('applies full-jitter delay (rng=0.5 → ≈ 0.5 * interval)', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        // base=1000, max=10000, rng=0.5 → after first poll (idle=1) delay = 0.5 * 2000 = 1000ms.
        baseIntervalMs: 1_000,
        maxIntervalMs: 10_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask fired one poll, scheduled setTimeout at +1000ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Just before the 1000ms boundary: sleep hasn't resolved.
    await vi.advanceTimersByTimeAsync(999);
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Cross it: second poll fires.
    await vi.advanceTimersByTimeAsync(2);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 6. rng=0.999 → delay ≈ 0.999 * interval (long but finite). */
  it('rng=0.999 → delay ≈ 0.999 * interval', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        // base=1000, max=10000, rng=0.999 → after first poll (idle=1) delay = round(0.999 * 2000) = 1998ms.
        baseIntervalMs: 1_000,
        maxIntervalMs: 10_000,
        rng: () => 0.999,
        signal: ac.signal,
      }),
    );

    // Initial microtask fired one poll, scheduled setTimeout at +1998ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Below the boundary: still one poll.
    await vi.advanceTimersByTimeAsync(1997);
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Cross: second poll fires.
    await vi.advanceTimersByTimeAsync(2);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 7. AbortSignal mid-loop → loop exits cleanly, no further polls. */
  it('exits cleanly when signal aborts mid-loop (sleep rejection is a graceful exit, not a throw)', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        baseIntervalMs: 1_000,
        maxIntervalMs: 10_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask fired one poll, scheduled setTimeout at +1000ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Abort before the jittered sleep resolves. The watchLoop's outer
    // catch absorbs the AbortError and returns cleanly.
    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
    // No further polls after abort.
    expect(pollFn).toHaveBeenCalledTimes(1);
  });

  /* 8. onError default: pollFn throws → onError swallowed, loop continues. */
  it('continues after a pollFn throw when no onError hook is provided', async () => {
    let next = 0;
    const pollFn = vi.fn(async () => {
      next += 1;
      if (next === 1) throw new Error('first poll boom');
      return [];
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: iter 1 throws → onError default → idle=1 → sleep 100ms.
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 100 → iter 2 succeeds, idle=2, sleep 200ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 9. onError={stop:true} → loop re-throws the original error. */
  it('re-throws when onError returns { stop: true }', async () => {
    const sentinel = new Error('onError-trip');
    const pollFn = vi.fn(async () => {
      throw sentinel;
    });
    const onError = vi.fn((err: unknown) => {
      expect(err).toBe(sentinel);
      return { stop: true as const };
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        onError,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: throw → onError {stop:true} → throw. Outer catch:
    // signal NOT aborted → re-throw sentinel. watchLoop rejects.
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok && isError(result.err)) {
      expect(result.err).toBe(sentinel);
    }
    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    ac.abort();
  });

  /* 10. emit throws → onError is invoked; if void, loop continues. */
  it('routes emit throws through onError (and continues on a void decision)', async () => {
    let next = 0;
    const pollFn = vi.fn(async () => {
      next += 1;
      if (next === 1) return [1];
      return [];
    });
    const emitErr = new Error('emit boom');
    const emit = vi.fn(async (item: number) => {
      if (item === 1) throw emitErr;
    });
    const onError = vi.fn((err: unknown) => {
      expect(err).toBe(emitErr);
      // no stop decision → continue
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        emit,
        onError,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: iter 1, poll=[1], emit throws → onError default →
    // idle=1 → sleep 100ms. The full body is queued as microtask
    // continuations; `vi.advanceTimersByTimeAsync(0)` drains them
    // without firing any timer scheduled later in the iteration.
    await vi.advanceTimersByTimeAsync(0);
    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    // advance 100 → iter 2, poll=[], idle=2, sleep 200ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 11. Idempotent on emit: each poll item is emitted exactly once. */
  it('emits each item from a single poll exactly once (no duplicates)', async () => {
    const calls: number[] = [];
    let next = 0;
    const pollFn = vi.fn(async () => {
      next += 1;
      if (next === 1) return [1, 2, 3];
      return [];
    });
    const emit = vi.fn((item: number) => {
      calls.push(item);
    });
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        emit,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0.5,
        signal: ac.signal,
      }),
    );

    // Initial microtask: iter 1, poll=[1,2,3], emit all → snap-back → sleep 50ms.
    // The for-loop emit runs in microtask continuations of the await chain;
    // drain them via advanceTimersByTimeAsync(0) so the assertions are
    // observable before any timer fires.
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([1, 2, 3]);
    expect(emit).toHaveBeenCalledTimes(3);
    expect(pollFn).toHaveBeenCalledTimes(1);

    // advance 50 → iter 2, poll=[], idle=1, sleep 100ms.
    await vi.advanceTimersByTimeAsync(50);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 12. Safety net: rng=0 (delay=0) doesn't OOM the worker.
   *
   * With rng=0 the delay rounds to 0 and `sleep(0)` schedules a real
   * `setTimeout(resolve, 0)`. Under vitest 2.x's "drain all same-clock
   * timers" semantic, `vi.advanceTimersByTimeAsync(0)` would otherwise
   * re-enter the loop every advance, eventually OOMing. The fix is to
   * keep this test bounded to a single advance + abort.
   */
  it('rng=0 does not re-introduce the microtask-spin OOM (bounded to one advance)', async () => {
    const pollFn = vi.fn(async () => []);
    const ac = new AbortController();
    const settled = settledPromise(
      watchLoop<number>({
        pollFn,
        baseIntervalMs: 100,
        maxIntervalMs: 1_000,
        rng: () => 0,
        signal: ac.signal,
      }),
    );

    // Initial microtask fired one poll, scheduled setTimeout(resolve, 0).
    expect(pollFn).toHaveBeenCalledTimes(1);

    // Single bounded advance — would-be infinite loop is contained.
    await vi.advanceTimersByTimeAsync(0);
    expect(pollFn).toHaveBeenCalledTimes(2);

    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });
});
