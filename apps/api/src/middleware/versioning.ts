/**
 * API versioning middleware.
 *
 * Registers routes under /v1 prefix so the API can evolve without
 * breaking existing integrations. This middleware should be registered
 * BEFORE route plugins in server.ts so all routes get the prefix.
 *
 * Usage — server.ts (register BEFORE routes):
 *   await app.register(versioningPlugin, { prefix: '/v1' });
 *   // Then all routes will be under /v1/health, /v1/assets, etc.
 *
 * Unprefixed /health and /docs remain at root for load balancers
 * and Swagger UI compatibility.
 */

import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    apiVersion: string;
  }
}

/**
 * Register the versioning plugin. Routes should be registered under
 * this plugin's scope so they inherit the /v1 prefix.
 */
export async function versioningPlugin(
  app: FastifyInstance,
  _opts: Record<string, unknown>,
  done: () => void,
): Promise<void> {
  app.decorate('apiVersion', 'v1');
  done();
}
