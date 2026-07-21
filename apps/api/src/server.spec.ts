import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { __resetEnvCache } from '@stellardao/shared';
import { FactoryContract } from '@stellardao/sdk';

import { createServer } from './server.js';
import { __resetContractInstances } from './soroban/index.js';
import { __resetEventBusForTest, subscribeTransactions } from './sse/event-bus.js';
import { assetRepository } from './db/repositories/asset-repository.js';
import { transactionRepository } from './db/repositories/transaction-repository.js';

/**
 * Vitest env stubs.
 *
 * `vi.stubEnv` calls at module top are hoisted (like `vi.mock`), so the
 * stubs land BEFORE `server.ts` is imported — meaning the first call to
 * `parseEnv.api()` inside `createServer` reads valid values into its
 * module-level cache.
 *
 * `__resetEnvCache()` in `beforeEach` defeats cache pollution from any
 * other spec that runs in the same Vitest worker (Fastify tests, the
 * shared env module, etc.). The combination guarantees every test starts
 * from a parseEnv cache that's freshly built from the stubs below.
 */
vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');
// `BRIDGE_CONTRACT_ID` / `FACTORY_CONTRACT_ID` / `WRAPPER_TOKEN_TEMPLATE_ID`
// are validated as C-prefixed contract addresses by the zod schema. Empty
// defaults would fail `.startsWith('C')`, so we stub the same test address
// Stellar uses for the friendbot contract on testnet.
vi.stubEnv('BRIDGE_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('FACTORY_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('WRAPPER_TOKEN_TEMPLATE_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');

// In-memory repos hold state across tests in the same worker; clear them
// after each test so a later spec doesn't see a phantom entry.
afterEach(() => {
  assetRepository.__clearForTest();
  transactionRepository.__clearForTest();
  __resetEventBusForTest();
});

describe('GET /health', () => {
  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
  });

  it('returns ok with horizon status', async () => {
    const app = await createServer();
    const res = await app.inject({ method: 'GET', url: '/health/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.network).toMatch(/PUBLIC|TESTNET|FUTURENET/);
    await app.close();
  });
});

describe('GET /assets/:chain/:address (not found)', () => {
  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
  });

  it('returns 404 for an unknown asset', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'GET',
      url: '/assets/ethereum/0x0000000000000000000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /assets (happy path)', () => {
  /**
   * Spy on `FactoryContract.prototype.simulateAndSubmit` to stub the
   * soroban-rpc round-trip. The real implementation builds a
   * `TransactionBuilder`, calls `server.simulateTransaction`, assembles,
   * signs, and submits — every step of which would fail in a unit test
   * with no live Soroban RPC. Spying on the prototype intercepts calls
   * on ANY `FactoryContract` instance the route lazily constructs.
   */
  let simulateAndSubmitSpy: MockInstance;

  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
    simulateAndSubmitSpy = vi
      .spyOn(FactoryContract.prototype, 'simulateAndSubmit')
      .mockResolvedValue('a'.repeat(64));
  });

  afterEach(() => {
    simulateAndSubmitSpy.mockRestore();
  });

  it('returns 202 with wrapperToken + txHash for a valid body + x-developer-public-key header', async () => {
    // Use a real G-address from a randomly-generated keypair so the
    // stellar-sdk `Address` constructor's strkey checksum validation
    // passes inside `buildCreateWrapperAsset` (the SDK throws on bad
    // checksums, which would surface as a 500 from the route).
    const developerPK = Keypair.random().publicKey();

    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/assets/',
      headers: {
        'x-developer-public-key': developerPK,
      },
      payload: {
        source: {
          chain: 'ethereum',
          address: '0xabababababababababababababababababababab',
        },
        name: 'Wrapped AB',
        symbol: 'wAB',
        decimals: 18,
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toMatchObject({ txHash: 'a'.repeat(64) });
    expect(body).toHaveProperty('wrapperToken');
    await app.close();
  });
});

describe('POST /assets (validation)', () => {
  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/assets/',
      payload: { source: { chain: 'ethereum', address: '0xab' } }, // name/symbol/decimals missing
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when x-developer-public-key header is missing', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/assets/',
      payload: {
        source: {
          chain: 'ethereum',
          address: '0xabababababababababababababababababababab',
        },
        name: 'Wrapped AB',
        symbol: 'wAB',
        decimals: 18,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/x-developer-public-key/);
    await app.close();
  });
});

describe('POST /bridge/mint (body validation)', () => {
  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
  });

  it('returns 400 when body is empty (MintRequest zod schema fires)', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/mint',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when attestations array is missing', async () => {
    const app = await createServer();
    // Use a real G-address so future SDK bumps that add Address validation
    // upstream of the zod schema don't silently break this assertion.
    const validRelayer = Keypair.random().publicKey();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/mint',
      payload: {
        relayer: validRelayer,
        wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        payload: {
          sourceChain: 'ethereum',
          sourceToken: '0xabababababababababababababababababababab',
          wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
          recipient: Keypair.random().publicKey(),
          amount: '1000',
          nonce: '0'.repeat(64),
        },
        // attestations missing
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /bridge/wrap', () => {
  beforeEach(() => {
    __resetEnvCache();
    __resetContractInstances();
  });

  const validPayload = () => ({
    sourceChain: 'ethereum',
    sourceToken: '0xabababababababababababababababababababab',
    wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    recipient: Keypair.random().publicKey(),
    amount: '100',
  });

  it('returns 202 with txId + pending status for a valid body', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: validPayload(),
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(typeof body.txId).toBe('string');
    expect(body.txId.length).toBeGreaterThan(0);
    await app.close();
  });

  it('persists a Transaction row in the repository on POST', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: validPayload(),
    });
    const { txId } = res.json();
    const tx = await transactionRepository.findById(txId);
    expect(tx).not.toBeNull();
    expect(tx?.id).toBe(txId);
    expect(tx?.type).toBe('wrap');
    expect(tx?.status).toBe('pending');
    expect(tx?.stellarTxHash).toBeNull();
    expect(tx?.amount).toBe('100');
    await app.close();
  });

  it('appears on GET /transactions/ right after POST', async () => {
    const app = await createServer();
    await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: validPayload(),
    });
    const list = await app.inject({ method: 'GET', url: '/transactions/' });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.transactions.length).toBe(1);
    expect(body.transactions[0]).toMatchObject({ type: 'wrap' });
    await app.close();
  });

  it('returns 400 when required fields are missing (validation)', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: { sourceChain: 'ethereum' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('validation_failed');
    await app.close();
  });

  it('returns 400 when amount is non-numeric', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: { ...validPayload(), amount: 'abc' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when wrapperToken is not a C-address', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: { ...validPayload(), wrapperToken: 'NOTACADDRESS' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when sourceChain is unsupported', async () => {
    const app = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/bridge/wrap',
      payload: { ...validPayload(), sourceChain: 'bitcoin' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  /**
   * Verifies the in-process SSE bus fans out on every wrap submission.
   * We subscribe BEFORE the POST so we don't miss the initial
   * `pending` upsert, which is the only synchronous broadcast — the
   * later lifecycle steps are timer-driven and not deterministic
   * inside the test runner.
   *
   * NOTE: `scheduleMockLifecycle` in the route is fire-and-forget
   * (`void`), so orphaned lifecycle timers from a previous spec can
   * still fire during this test, broadcasting `'attesting'` events
   * before this test's own `'pending'` broadcast arrives. Rather than
   * asserting the first event's status (which picks up orphan noise),
   * we verify that a `'pending'` event exists somewhere in the batch.
   */
  it('broadcasts transaction-update via the in-process bus on POST', async () => {
    const pendingIds = new Set<string>();
    const unsubscribe = subscribeTransactions(({ transaction }) => {
      if (transaction.status === 'pending') {
        pendingIds.add(transaction.id);
      }
    });

    const app = await createServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/bridge/wrap',
        payload: validPayload(),
      });
      expect(res.statusCode).toBe(202);
      const { txId } = res.json();
      // The POST returns after the synchronous `upsert(initial)`, so
      // at minimum the initial broadcast has fired.
      expect(pendingIds.has(txId)).toBe(true);
    } finally {
      unsubscribe();
      await app.close();
    }
  });
});
