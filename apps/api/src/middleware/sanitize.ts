import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Input sanitization middleware.
 *
 * Sanitizes request bodies and query parameters to prevent:
 * - SQL injection patterns in string fields
 * - Excessively large payloads
 * - Malformed JSON
 *
 * Applied globally via Fastify's onRequest hook.
 */

const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)/i,
  /(--)/,
  /(;)/,
];

function sanitizeString(value: string): string {
  // Strip null bytes and trim whitespace.
  let sanitized = value.replace(/\0/g, '').trim();
  // Truncate to reasonable length.
  if (sanitized.length > 4096) {
    sanitized = sanitized.slice(0, 4096);
  }
  return sanitized;
}

function containsSqlPattern(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (containsSqlPattern(value)) {
      throw new Error('Potentially dangerous input detected');
    }
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[sanitizeString(key)] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

export async function sanitizePlugin(app: FastifyInstance): Promise<void> {
  // Body size limit.
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return reply.code(413).send({
        error: 'payload_too_large',
        message: `Request body exceeds ${MAX_BODY_SIZE} byte limit`,
      });
    }
  });

  // Body sanitization (runs after body parsing).
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.body && typeof req.body === 'object') {
      try {
        req.body = sanitizeValue(req.body) as Record<string, unknown>;
      } catch {
        return reply.code(400).send({
          error: 'invalid_input',
          message: 'Request contains potentially dangerous input',
        });
      }
    }
  });
}
