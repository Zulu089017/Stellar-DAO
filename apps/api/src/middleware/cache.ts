/**
 * Response caching middleware for the StellarDAO API.
 *
 * Sets Cache-Control headers on read-only GET endpoints to
 * reduce load on Horizon/Soroban RPC. Different TTLs for
 * different resource types:
 *
 *   - Static resources (asset metadata): 5 minutes
 *   - Semi-dynamic (transaction lists): 30 seconds
 *   - Real-time (governance stats): 10 seconds
 *
 * All caching is opt-in per route — the middleware is registered
 * globally but only activates when a route decorates its reply
 * with `reply.cacheTTL(seconds)`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyReply {
    cacheTTL: (seconds: number) => void;
  }
}

export async function cachePlugin(app: FastifyInstance): Promise<void> {
  app.decorateReply('cacheTTL', function (this: FastifyReply, seconds: number) {
    if (seconds <= 0) {
      this.header('Cache-Control', 'no-store');
      return;
    }
    this.header('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds}`);
  });

  app.addHook('onSend', async (_req: FastifyRequest, reply: FastifyReply) => {
    // Only set caching headers if the route hasn't already set them.
    if (!reply.hasHeader('Cache-Control') && reply.statusCode === 200) {
      reply.header('Cache-Control', 'no-store');
    }
  });
}
