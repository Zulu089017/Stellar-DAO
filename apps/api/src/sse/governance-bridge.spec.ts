import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('GET /events/governance', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ logger: false });
    await app.register(async (instance) => {
      const { registerGovernanceSse } = await import('../sse/governance-bridge.js');
      await registerGovernanceSse(instance);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with SSE content-type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/governance',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('sends connected event on open', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/governance',
    });

    expect(res.payload).toContain('event: connected');
    expect(res.payload).toContain('clientId');
  });
});
