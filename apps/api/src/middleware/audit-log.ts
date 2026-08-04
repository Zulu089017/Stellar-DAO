/**
 * Audit log middleware for the API server.
 *
 * Logs every mutating request (POST/PUT/PATCH/DELETE) with structured
 * metadata: timestamp, actor (JWT sub or IP), HTTP method, path,
 * status code, response time, and a derived action/resource pair.
 *
 * Output is structured JSON via pino (Fastify's built-in logger),
 * which can be piped to any log aggregator (ELK, Datadog, CloudWatch,
 * Grafana Loki, etc.).
 *
 * Controlled by `AUDIT_LOG_ENABLED` env var (default: true).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/* ── Helpers ──────────────────────────────────────────────────── */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Derive an action name from the HTTP method. */
function deriveAction(method: string): string {
  switch (method) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

/** Derive a resource name from pre-computed path segments. */
function deriveResource(segments: string[]): string {
  // Return the first meaningful segment (e.g., /invoices/abc123 → invoices)
  return segments[0] ?? 'unknown';
}

/** Extract the actor identity — JWT subject first, then IP as fallback. */
function deriveActor(req: FastifyRequest): string {
  // Fastify stores decoded JWT payload on request via the jwt-auth plugin.
  // Cast through unknown to avoid structural incompatibility.
  const raw = req as unknown as Record<string, unknown>;
  const user = raw.user as { sub?: string; roles?: string[] } | undefined;
  if (user?.sub) return user.sub;
  return req.ip ?? 'unknown';
}

/** Safelist of headers safe to include in audit logs. */
const SAFE_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'content-type',
  'content-length',
  'origin',
  'referer',
  'user-agent',
  'x-request-id',
  'x-correlation-id',
]);

/** Extract only safelisted headers for audit log inclusion. */
function safeHeaders(req: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!SAFE_HEADERS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') headers[key] = value;
  }
  return headers;
}

/* ── Plugin ───────────────────────────────────────────────────── */

export async function auditLogPlugin(app: FastifyInstance): Promise<void> {
  const enabled = process.env.AUDIT_LOG_ENABLED !== 'false';
  // Fastify types mark `log` as optional, but it's always present
  // when the server is running (pino is a hard dependency of Fastify).
  const log = app.log!;

  if (!enabled) {
    log.info('Audit log middleware disabled (AUDIT_LOG_ENABLED=false)');
    return;
  }

  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const method = req.method;
    if (!MUTATING_METHODS.has(method)) return;

    // Fallback for Fastify v5 types where url/ip can be undefined
    const url = req.url ?? '';
    const ip = req.ip ?? '';

    // `reply.elapsedTime` is set by Fastify in onResponse hook
    const responseTimeMs = Math.round(reply.elapsedTime ?? 0);

    const action = deriveAction(method);

    // Pre-compute path segments once (used by both resource and resourceId).
    const pathSegments = url.split('?')[0]!.split('/').filter(Boolean);
    const resource = deriveResource(pathSegments);

    const auditEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: 'audit',
      actor: deriveActor(req),
      action,
      resource,
      resourceId: pathSegments.slice(1).join('/') || undefined,
      method,
      path: url,
      statusCode: reply.statusCode,
      responseTimeMs,
      ip,
      userAgent: (req.headers['user-agent'] as string)?.slice(0, 200) ?? undefined,
      headers: safeHeaders(req),
    };

    // Log as structured JSON via pino
    log.info(auditEntry, `AUDIT: ${action} ${resource}`);
  });

  log.info('Audit log middleware enabled');
}
