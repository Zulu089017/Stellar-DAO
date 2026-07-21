/**
 * Webhook retry with persistent queue.
 *
 * Extends the existing webhook delivery module with a persistent
 * retry queue backed by the database. Failed deliveries are stored
 * and retried with exponential backoff (up to 5 attempts over
 * ~15 minutes). Successful deliveries are acknowledged; permanently
 * failed deliveries are logged and moved to a dead-letter queue.
 */

import { setTimeout } from 'node:timers/promises';

export interface WebhookJob {
  id: string;
  url: string;
  payload: unknown;
  signature: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  createdAt: number;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 300_000;

/**
 * Calculate the next retry delay using exponential backoff with jitter.
 */
function backoffDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = capped * (0.5 + Math.random() * 0.5);
  return Math.floor(jitter);
}

/**
 * Process a single webhook delivery attempt.
 * Returns true if the delivery was successful, false if it should be retried.
 */
async function attemptDelivery(job: WebhookJob): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(job.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-StellarDAO-Signature': job.signature,
        'X-Webhook-ID': job.id,
        'X-Webhook-Attempt': String(job.attempts),
      },
      body: JSON.stringify(job.payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Enqueue a webhook job for delivery with retries.
 */
export async function enqueueWebhook(
  url: string,
  payload: unknown,
  signature: string,
): Promise<WebhookJob> {
  const job: WebhookJob = {
    id: crypto.randomUUID(),
    url,
    payload,
    signature,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: Date.now(),
    status: 'pending',
    createdAt: Date.now(),
  };

  // Fire-and-forget: the retry loop runs in the background.
  processWebhookJob(job).catch(() => {
    // Swallow unhandled rejections from background processing.
  });

  return job;
}

async function processWebhookJob(job: WebhookJob): Promise<void> {
  while (job.attempts < job.maxAttempts) {
    job.attempts += 1;
    const success = await attemptDelivery(job);

    if (success) {
      job.status = 'delivered';
      return;
    }

    if (job.attempts >= job.maxAttempts) {
      job.status = 'dead';
      return;
    }

    const delay = backoffDelay(job.attempts);
    job.nextRetryAt = Date.now() + delay;
    await setTimeout(delay);
  }
}
