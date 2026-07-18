import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

const store: RateLimitStore = {};

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100; // per window

/**
 * Simple in-memory rate limiter middleware.
 *
 * Production deployments should swap this for a Redis-backed implementation
 * (e.g. @fastify/rate-limit) so limits survive process restarts and scale
 * across multiple API instances.
 */
export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip health checks from rate limiting.
    if (req.url === '/health' || req.url === '/health/') {
      return;
    }

    const now = Date.now();
    const key = req.ip;

    if (!store[key] || store[key].resetAt < now) {
      store[key] = { count: 1, resetAt: now + WINDOW_MS };
      return;
    }

    store[key].count += 1;

    if (store[key].count > MAX_REQUESTS) {
      reply.header('Retry-After', Math.ceil((store[key].resetAt - now) / 1000));
      return reply.code(429).send({
        error: 'rate_limited',
        message: `Too many requests. Try again in ${Math.ceil((store[key].resetAt - now) / 1000)} seconds.`,
      });
    }
  });

  // Periodic cleanup of expired entries to prevent memory leaks.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (store[key].resetAt < now) {
        delete store[key];
      }
    }
  }, 60_000);

  app.addHook('onClose', () => {
    clearInterval(cleanup);
  });
}
