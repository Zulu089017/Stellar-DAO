import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { __resetEnvCache } from '@stellardao/shared';

import { createServer } from '../server.js';

import type { FastifyInstance } from 'fastify';

// ── Env setup (hoisted by vitest, same pattern as server.spec.ts) ──

vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');

describe('GET /events/governance', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    // createServer() already registers the governance SSE route via
    // registerGovernanceSse(app), so we don't re-register here.
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns 200 with SSE content-type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/governance',
      headers: { 'x-test-close': 'true' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('sends connected event on open', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/governance',
      headers: { 'x-test-close': 'true' },
    });

    expect(res.payload).toContain('event: connected');
    expect(res.payload).toContain('clientId');
  });
});
