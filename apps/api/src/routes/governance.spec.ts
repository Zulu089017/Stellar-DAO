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

describe('GET /governance/stats', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns 200 with governance stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('totalProposals');
    expect(body).toHaveProperty('activeProposals');
    expect(body).toHaveProperty('quorumNumerator');
    expect(body).toHaveProperty('quorumDenominator');
    expect(body).toHaveProperty('votingPeriod');
    expect(body).toHaveProperty('proposalThreshold');
  });
});

describe('GET /governance/proposals', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns 200 with proposal list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/proposals',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('proposals');
    expect(Array.isArray(body.proposals)).toBe(true);
    expect(body).toHaveProperty('cursor');
  });

  it('respects limit query parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/proposals?limit=5',
    });

    expect(res.statusCode).toBe(200);
  });

  it('clamps limit to 100', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/proposals?limit=200',
    });

    expect(res.statusCode).toBe(200);
  });
});

describe('GET /governance/proposals/:id', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/proposals/not-a-number',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('invalid_proposal_id');
  });

  it('returns 404 for unknown proposal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/proposals/99999',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /governance/proposals/:id/vote', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns 400 when voter is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/governance/proposals/1/vote',
      payload: { voteType: 'for' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when voteType is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/governance/proposals/1/vote',
      payload: { voter: 'GABC' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid voteType', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/governance/proposals/1/vote',
      payload: { voter: 'GABC', voteType: 'invalid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 202 for valid vote', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/governance/proposals/1/vote',
      payload: { voter: 'GABC', voteType: 'for' },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('accepted');
    expect(body.voteType).toBe('for');
  });
});

describe('GET /governance/delegates/:address', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetEnvCache();
    app = await createServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    __resetEnvCache();
  });

  it('returns delegation info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/governance/delegates/GABC123',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('address');
    expect(body).toHaveProperty('delegate');
    expect(body).toHaveProperty('votingPower');
  });
});
