import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { DEFAULT_RETRY_OPTS, isRetryable, type RetryPolicy, withRetry } from './retry.js';
import { HorizonClient } from './horizon.js';

/* ─────────────────── helpers ─────────────────── */

function makeResponse(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

function httpErr(
  status: number,
  message = `HTTP ${status}`,
  headers: Record<string, string> = {},
): Error {
  return Object.assign(new Error(message), { response: makeResponse(status, '', headers) });
}

function makeClient(opts: { fetcher?: typeof fetch; baseUrl?: string }): HorizonClient {
  return new HorizonClient({
    baseUrl: opts.baseUrl ?? 'https://horizon.test',
    network: 'TESTNET',
    fetchTimeoutMs: 1000,
    fetcher: opts.fetcher,
  });
}

/**
 * Wrap a Promise so the resolved/rejected state is captured into a
 * tagged-union value AND the rejection handler is attached
 * synchronously at construction (before any `await` on the caller
 * side yields control to the event loop).
 *
 * Vitest 2.x's strict unhandled-rejection detector observes a
 * rejection's microtask between the moment the underlying promise
 * settles and any `.then(_, onRejected)` handler attaching. Callers
 * MUST position `settledPromise(p)` BEFORE any timer advancement so
 * V8's `[[PromiseRejectReactions]]` slot is already populated by
 * the time the rejection actually fires.
 *
 * `ok: true as const` / `ok: false as const` are deliberate literal
 * kinds — replacing with a bare `boolean` would collapse the
 * discriminant and force `T | undefined` narrowing everywhere.
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

/* ─────────────────── isRetryable ─────────────────── */

describe('isRetryable', () => {
  it('returns false for DOMException AbortError', () => {
    const err = new DOMException('Aborted', 'AbortError');
    expect(isRetryable(err)).toBe(false);
  });

  it('returns true for a TypeError network error (no .response)', () => {
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true for HTTP 5xx responses', () => {
    expect(isRetryable(httpErr(503))).toBe(true);
    expect(isRetryable(httpErr(500))).toBe(true);
    expect(isRetryable(httpErr(599))).toBe(true);
  });

  it('returns true for HTTP 408 (request timeout)', () => {
    expect(isRetryable(httpErr(408))).toBe(true);
  });

  it('returns true for HTTP 429 (rate limited)', () => {
    expect(isRetryable(httpErr(429))).toBe(true);
  });

  it('returns false for HTTP 4xx programmer errors (other than 408)', () => {
    expect(isRetryable(httpErr(400))).toBe(false);
    expect(isRetryable(httpErr(404))).toBe(false);
    expect(isRetryable(httpErr(422))).toBe(false);
  });

  it('returns false if caller-owned signal is already aborted', () => {
    const ac = new AbortController();
    ac.abort();
    expect(isRetryable(httpErr(503), ac.signal)).toBe(false);
  });
});

/* ─────────────────── withRetry ─────────────────── */

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately on first-attempt success (no backoff)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await settledPromise(withRetry(fn, { rng: () => 0.5 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.val).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors up to maxAttempts and rejects', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const policy: RetryPolicy = { rng: () => 0.5, baseMs: 1, maxMs: 1 };
    // CRITICAL: settledPromise attaches handlers synchronously at
    // construction, BEFORE we drive timers forward. Calling it
    // after `vi.runAllTimersAsync()` would mean the rejection fires
    // without an attached handler, triggering vitest 2.x's strict
    // unhandled-rejection detector.
    const settled = settledPromise(withRetry(fn, policy));
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err).toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-retryable errors (one attempt only)', async () => {
    const fn = vi.fn().mockRejectedValue(httpErr(400, 'bad input'));
    const settled = settledPromise(withRetry(fn, { rng: () => 0.5 }));
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok && isError(result.err)) {
      expect(result.err.message).toBe('bad input');
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx once then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpErr(503))
      .mockResolvedValueOnce('ok');
    const settled = settledPromise(withRetry(fn, { rng: () => 0, baseMs: 1, maxMs: 1 }));
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.val).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('429 with Retry-After: 1 second overrides jitter (~1000ms delay)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpErr(429, 'rate limited', { 'Retry-After': '1' }))
      .mockResolvedValueOnce('ok');
    const policy: RetryPolicy = { rng: () => 0.99, baseMs: 10000, maxMs: 20000 };
    const settled = settledPromise(withRetry(fn, policy));
    // Just below 1000ms — second call shouldn't have fired yet.
    // Uses the Async variant so microtasks are drained between
    // ticks; the non-Async variant would not flush the rejection
    // microtask for the same setTimeout callback.
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    // Cross 1000ms — sleep resolves, second attempt runs
    await vi.advanceTimersByTimeAsync(10);
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clamps 429 Retry-After above maxMs', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpErr(429, 'rate limited', { 'Retry-After': '60' }))
      .mockResolvedValueOnce('ok');
    const settled = settledPromise(
      withRetry(fn, { rng: () => 0, baseMs: 1, maxMs: 100 }),
    );
    // Retry-After: 60s should be clamped to maxMs=100ms
    await vi.advanceTimersByTimeAsync(101);
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT call fn when caller-owned signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort(new Error('user-cancel'));
    const fn = vi.fn().mockResolvedValue('ok');
    // signal aborted → withRetry throws synchronously inside the
    // async body; settledPromise still attaches handlers from its
    // `return p.then(...)` so the rejection is observed.
    const settled = settledPromise(withRetry(fn, { signal: ac.signal }));
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok && isError(result.err)) {
      expect(result.err.message).toBe('user-cancel');
    }
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('exposes DEFAULT_RETRY_OPTS with the documented constants', () => {
    expect(DEFAULT_RETRY_OPTS.baseMs).toBe(200);
    expect(DEFAULT_RETRY_OPTS.maxMs).toBe(2000);
    expect(DEFAULT_RETRY_OPTS.maxAttempts).toBe(3);
  });
});

/* ─────────────────── HorizonClient integration ─────────────────── */

describe('HorizonClient retry integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes fetches through the injected fetcher (no global fetch stubbing needed)', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeResponse(200, '{"status":"ok"}'));
    const client = makeClient({ fetcher });
    const settled = settledPromise(client.ping());
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ping returns true after first-attempt-503-then-200 with retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200, '{"status":"ok"}'));
    const client = makeClient({ fetcher });
    const settled = settledPromise(client.ping());
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('raw() throws on persistent 500 after retry budget exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeResponse(500));
    const client = makeClient({ fetcher });
    const settled = settledPromise(client.raw('/foo'));
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok && isError(result.err)) {
      expect(result.err.message).toMatch(/HTTP 500/);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
