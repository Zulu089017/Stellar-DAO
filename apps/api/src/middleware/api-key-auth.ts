import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * API key authentication middleware for integrator endpoints.
 *
 * Consumers pass `Authorization: Bearer <api-key>` and the middleware
 * validates the key against a configured set of allowed keys.
 * Keys are loaded from `API_KEYS` env var (comma-separated).
 *
 * Protected routes are those under `/bridge/mint`, `/bridge/burn`,
 * and `/webhooks/*` — read-only routes under `/assets`, `/transactions`,
 * and `/health` are public.
 */

const PROTECTED_PREFIXES = ['/bridge/mint', '/bridge/burn', '/webhooks'];

function getAllowedKeys(): Set<string> {
  const raw = process.env.API_KEYS ?? '';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  );
}

export async function apiKeyAuthPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url;
    const isProtected = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (!isProtected) return;

    const allowedKeys = getAllowedKeys();
    if (allowedKeys.size === 0) return; // Auth not configured — allow all.

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header. Use: Bearer <api-key>',
      });
    }

    const key = authHeader.slice(7); // strip "Bearer "
    if (!allowedKeys.has(key)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid API key.',
      });
    }
  });
}
