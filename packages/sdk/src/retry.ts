/**
 * Generic exponential-backoff-with-jitter retry helper for
 * Horizon-style network calls. Decoupled from the domain module so
 * the retry shape is unit-testable independently of HorizonClient.
 *
 * Backoff shape (defaults to 3 attempts = 1 initial + 2 retries):
 *   delayMs = full jitter in [0, baseMs * 2^(attempt-1)) clamped to maxMs.
 *
 * Full jitter (vs simple random multiplier) matches the AWS
 * Architecture Blog recommendation and avoids the thundering-herd
 * pattern that bare exponential suffers from. The `rng` seam lets
 * tests assert exact delay values without waiting wall-clock time.
 *
 * 429 responses honour `Retry-After` per RFC 7231 §7.1.3 — either
 * delta-seconds integer ("120") or HTTP-date — clamped to maxMs so
 * a malicious server can't pin the prod SDK to a long wait.
 *
 * Caller-supplied `signal` cancels all pending retries immediately
 * on `signal.aborted` and propagates the underlying error (or
 * `signal.reason`). Fetch's own AbortError (from internal timeout
 * controllers) is also surfaced without retrying.
 */

export type RetryPolicy = {
  /** Initial exponential factor. Default 200ms. */
  baseMs?: number;
  /** Maximum single-attempt delay. Default 2000ms. */
  maxMs?: number;
  /** Total attempts including the initial call. Default 3. */
  maxAttempts?: number;
  /**
   * Random in [0, 1). Override in tests so deterministic midpoints
   * (e.g. `() => 0.5`) yield predictable delay values without
   * waiting wall-clock time.
   */
  rng?: () => number;
  /**
   * Caller-owned AbortSignal. When `aborted`, retries stop and the
   * underlying error (or `signal.reason`) propagates without further
   * sleeping.
   */
  signal?: AbortSignal;
};

export const DEFAULT_RETRY_OPTS = {
  baseMs: 200,
  maxMs: 2000,
  maxAttempts: 3,
  rng: Math.random as () => number,
} as const;

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryPolicy = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_OPTS, ...opts };
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (policy.signal?.aborted) {
      throw policy.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err, policy.signal)) throw err;
      if (attempt === policy.maxAttempts) throw err;
      const response = (err as { response?: Response } | null)?.response;
      const retryAfterMs = parseRetryAfter(response?.headers.get('retry-after') ?? '');
      const expWindow = policy.baseMs * 2 ** (attempt - 1);
      const jittered = policy.rng() * Math.min(policy.maxMs, expWindow);
      const delayMs =
        retryAfterMs !== null ? Math.min(retryAfterMs, policy.maxMs) : Math.round(jittered);
      await sleep(delayMs, policy.signal);
    }
  }
  /* istanbul ignore next: for-loop is bounded by maxAttempts */
  throw lastError;
}

/**
 * Decide whether `err` should trigger another attempt. Caller-owned
 * aborts always short-circuit (a node-graceful-shutdown during a
 * retry loop must not queue more retries).
 *
 * Decision matrix:
 *   - caller-owned `signal.aborted` → false (the caller wants out)
 *   - DOMException AbortError → false (fetch's own abort)
 *   - error has no `response` → true (network error)
 *   - response status 5xx → true
 *   - response status 408 / 429 → true
 *   - any other status (2xx/3xx return path, 4xx programmer error) →
 *     false
 */
export function isRetryable(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  const response = (err as { response?: Response } | null)?.response;
  if (!response) return true;
  const status = response.status;
  return status >= 500 || status === 408 || status === 429;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    if (ms <= 0) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Parses Retry-After per RFC 7231 §7.1.3: either a delta-seconds
 * integer ("120") or an HTTP-date ("Wed, 21 Oct 2015 07:28:00 GMT").
 * Malformed values yield null and `withRetry` falls through to
 * default exponential backoff.
 */
function parseRetryAfter(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  }
  const dateMs = Date.parse(trimmed);
  return Number.isFinite(dateMs) ? dateMs - Date.now() : null;
}
