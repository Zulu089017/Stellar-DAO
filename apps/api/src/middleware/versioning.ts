/**
 * API versioning middleware.
 *
 * Prefixes all routes with /v1 so the API can evolve without
 * breaking existing integrations. Future breaking changes will
 * ship under /v2, /v3, etc. The current v1 prefix is transparent
 * to existing clients because the server also registers a
 * redirect from unprefixed paths.
 *
 * Usage — server.ts:
 *   await app.register(versioningPlugin);
 *   await app.register(healthRoutes); // → /v1/health
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    apiVersion: string;
  }
}

export async function versioningPlugin(app: FastifyInstance): Promise<void> {
  app.decorate('apiVersion', 'v1');

  // Redirect unprefixed requests to v1-prefixed paths.
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url;

    // Skip already-prefixed paths, docs, health, and SSE streams.
    if (
      url.startsWith('/v1') ||
      url.startsWith('/docs') ||
      url === '/health' ||
      url.startsWith('/events')
    ) {
      return;
    }

    // Redirect to v1-prefixed path.
    reply.redirect(301, `/v1${url}`);
  });

  // Register all routes under /v1 prefix.
  // Called by server.ts after all route plugins are loaded.
  app.addHook('onRoute', (routeOptions) => {
    const { url } = routeOptions;
    if (!url.startsWith('/docs') && !url.startsWith('/events')) {
      routeOptions.url = `/v1${url}`;
    }
  });
}
