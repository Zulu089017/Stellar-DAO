import pino from 'pino';

const log = pino({ transport: { target: 'pino-pretty' } });

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Retry a function with exponential backoff + jitter.
 *
 * Used for webhook delivery to external services. Each retry waits
 * `min(baseDelay * 2^attempt + jitter, maxDelay)` before trying again.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 60_000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxAttempts) break;

      const jitter = Math.random() * 1000;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + jitter,
        maxDelayMs,
      );

      log.warn(
        { label, attempt, delay: Math.round(delay), err: lastError.message },
        'webhook delivery retry',
      );

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(
    `${label} failed after ${maxAttempts} attempts: ${lastError?.message}`,
  );
}
