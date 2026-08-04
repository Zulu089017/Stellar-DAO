import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import { auditLogPlugin } from './audit-log.js';

/**
 * Audit log middleware tests.
 *
 * Calls `auditLogPlugin(app)` directly at the root level (matching
 * the production pattern in `server.ts`) so the onResponse hook and
 * test routes share the same Fastify encapsulation context.
 *
 * Fastify hooks do NOT propagate across sibling plugin contexts,
 * which is why `server.ts` calls middleware plugins directly instead
 * of via `app.register()`.
 */

function createLogCapture(): { lines: string[]; stream: { write: (chunk: string) => void } } {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write(chunk: string) {
        lines.push(...chunk.split('\n').filter(Boolean));
      },
    },
  };
}

/** Parse pino JSON lines, returning only entries with an `action` field (audit entries). */
function getAuditEntries(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((e): e is Record<string, unknown> => e !== null && typeof e.action === 'string');
}

describe('auditLogPlugin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when enabled', () => {
    it('logs audit entries for POST requests', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app); // Direct call — hooks at root level
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/invoices' });
      expect(res.statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('create');
      expect(entries[0]!.resource).toBe('invoices');
      expect(entries[0]!.method).toBe('POST');
      expect(entries[0]!.statusCode).toBe(200);

      await app.close();
    });

    it('logs audit entries for PUT with update action', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.put('/invoices/123', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'PUT', url: '/invoices/123' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('update');
      expect(entries[0]!.resource).toBe('invoices');
      expect(entries[0]!.resourceId).toBe('123');

      await app.close();
    });

    it('logs audit entries for PATCH with update action', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.patch('/invoices/123', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'PATCH', url: '/invoices/123' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('update');

      await app.close();
    });

    it('logs audit entries for DELETE with delete action', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.delete('/invoices/123', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'DELETE', url: '/invoices/123' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('delete');

      await app.close();
    });

    it('does NOT log audit entries for GET requests', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.get('/invoices', async (_req, _reply) => ({ ok: true }));
      app.get('/health', async (_req, _reply) => ({ status: 'ok' }));
      await app.ready();

      await app.inject({ method: 'GET', url: '/invoices' });
      await app.inject({ method: 'GET', url: '/health' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(0);

      await app.close();
    });

    it('derives actor from IP when no JWT user present', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/invoices' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.actor).toBe('127.0.0.1');

      await app.close();
    });

    it('derives actor from JWT user.sub when present', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      // Simulate a JWT-authenticated request by setting user on the request.
      app.addHook('onRequest', async (req) => {
        // Cast to set the user property that jwt-auth would normally set.
        const raw = req as unknown as Record<string, unknown>;
        raw.user = { sub: 'GABC123XYZ', roles: ['admin'] };
      });
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/invoices' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.actor).toBe('GABC123XYZ');

      await app.close();
    });

    it('only includes safelisted headers in audit entries', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({
        method: 'POST',
        url: '/invoices',
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
          'x-api-key': 'secret-key',
          'content-type': 'application/json',
          'user-agent': 'vitest',
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      const headers = entries[0]!.headers as Record<string, string>;
      // Authorization, cookie, and x-api-key are NOT safelisted
      expect(headers).not.toHaveProperty('authorization');
      expect(headers).not.toHaveProperty('cookie');
      expect(headers).not.toHaveProperty('x-api-key');
      // Safelisted headers ARE included
      expect(headers['content-type']).toBe('application/json');
      expect(headers['user-agent']).toBe('vitest');

      await app.close();
    });

    it('truncates userAgent to 200 chars', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({
        method: 'POST',
        url: '/invoices',
        headers: { 'user-agent': 'A'.repeat(500) },
      });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.userAgent).toBe('A'.repeat(200));

      await app.close();
    });
  });

  describe('when disabled', () => {
    it('does NOT log audit entries for mutating requests', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'false');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/invoices', async (_req, _reply) => ({ ok: true }));
      app.delete('/invoices/123', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/invoices' });
      await app.inject({ method: 'DELETE', url: '/invoices/123' });
      await new Promise((r) => setTimeout(r, 50));

      expect(getAuditEntries(capture.lines).length).toBe(0);
      await app.close();
    });

    it('logs a disabled notice on startup', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'false');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      await app.ready();

      const hasMsg = capture.lines.some((line) => {
        try {
          const p = JSON.parse(line) as Record<string, unknown>;
          return typeof p.msg === 'string' && (p.msg as string).includes('disabled');
        } catch {
          return line.includes('disabled');
        }
      });
      expect(hasMsg).toBe(true);
      await app.close();
    });
  });

  describe('resource derivation', () => {
    it('returns "unknown" for root path', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.resource).toBe('unknown');
      expect(entries[0]!.resourceId).toBeUndefined();

      await app.close();
    });

    it('strips query strings from path and resourceId', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.delete('/invoices/123', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'DELETE', url: '/invoices/123?reason=duplicate' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.resource).toBe('invoices');
      expect(entries[0]!.resourceId).toBe('123');
      expect(entries[0]!.path).toBe('/invoices/123?reason=duplicate');

      await app.close();
    });

    it('derives nested resourceId from multi-segment paths', async () => {
      vi.stubEnv('AUDIT_LOG_ENABLED', 'true');
      const capture = createLogCapture();
      const app = Fastify({ logger: { level: 'info', stream: capture.stream } });

      await auditLogPlugin(app);
      app.post('/merchants/abc123/api-keys', async (_req, _reply) => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/merchants/abc123/api-keys' });
      await new Promise((r) => setTimeout(r, 50));

      const entries = getAuditEntries(capture.lines);
      expect(entries.length).toBe(1);
      expect(entries[0]!.resource).toBe('merchants');
      expect(entries[0]!.resourceId).toBe('abc123/api-keys');

      await app.close();
    });
  });
});
