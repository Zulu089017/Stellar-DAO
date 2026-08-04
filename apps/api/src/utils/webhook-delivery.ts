import { withRetry } from '../utils/retry.js';

/**
 * Deliver a webhook payload to an external URL with retry logic.
 *
 * Used for notifying external services (indexers, monitoring) of
 * bridge events. The retry uses exponential backoff with jitter
 * so transient outages don't lose events.
 */
export async function deliverWebhook(
  url: string,
  payload: unknown,
  secret?: string,
): Promise<void> {
  await withRetry(
    async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (secret) {
        const { createHmac } = await import('node:crypto');
        const signature = createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-Stellar-Payment-Gateway-Signature'] = signature;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
      }
    },
    `webhook:${url}`,
    { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60_000 },
  );
}
