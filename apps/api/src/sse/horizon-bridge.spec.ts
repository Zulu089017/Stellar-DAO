/**
 * Spec for `GET /events` (SSE bridge) end-to-end.
 *
 * The bridge fans out THREE live streams over a single response:
 *   • `contract-event`     — every record from `HorizonClient
 *                            .streamContractEvents(BRIDGE_CONTRACT_ID)`.
 *   • `transaction-update` — every bus emission from in-process
 *                            `broadcastTransaction` (fired by
 *                            `transactionRepository.upsert`).
 *   • `asset-update`       — every bus emission from in-process
 *                            `broadcastAssetUpdate` (fired by
 *                            POST /webhooks/factory/confirm).
 *
 * Plus the unconditional `hello` opening event, a `warning` fallback
 * when `BRIDGE_CONTRACT_ID` is empty, and an `error` event when the
 * upstream stream throws. The contract-event stream is an infinite
 * async generator — we mock it to a finite yield in tests so the
 * handler's `for await` loop terminates deterministically and the
 * SSE stream closes naturally via `reply.raw.end()` (a production
 * change made at the same commit to comply with the SSE spec's
 * "no more events" signal).
 *
 * Body-capture works directly through `app.inject()` because the
 * handler ends the stream after the contract-event source exhausts.
 * fastify inject's Promise form captures the full body of a
 * completed handler response.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { HorizonClient } from '@stellardao/sdk';
import { Keypair } from '@stellar/stellar-sdk';
import {
  __resetEnvCache,
  type AssetRegistryEntry,
  type Transaction,
} from '@stellardao/shared';

import { createServer } from '../server.js';
import { __resetContractInstances } from '../soroban/index.js';
import {
  __resetAssetRepoForTest,
  assetRepository,
} from '../db/repositories/asset-repository.js';
import {
  __resetTransactionRepoForTest,
  transactionRepository,
} from '../db/repositories/transaction-repository.js';
import {
  __resetEventBusForTest,
  broadcastAssetUpdate,
  broadcastTransaction,
  subscribeAssets,
  subscribeTransactions,
} from './event-bus.js';

/* ─────────────────── env stubs (module-top, hoisted) ─────────────────── */
vi.stubEnv('STELLAR_NETWORK', 'TESTNET');
vi.stubEnv('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
vi.stubEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org');
vi.stubEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.llamarpc.com');
vi.stubEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');
vi.stubEnv('BRIDGE_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('FACTORY_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
vi.stubEnv('WRAPPER_TOKEN_TEMPLATE_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');

afterEach(() => {
  assetRepository.__clearForTest();
  transactionRepository.__clearForTest();
  __resetEventBusForTest();
  vi.restoreAllMocks();
  // Drop the warning-test's per-test env override, if any
  delete process.env.BRIDGE_CONTRACT_ID;
  vi.stubEnv('BRIDGE_CONTRACT_ID', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
});

/* ─────────────────── fixtures ─────────────────── */

const stubTx: Transaction = {
  id: 'live-tx-1',
  type: 'wrap',
  sourceChain: 'ethereum',
  sourceToken: '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd',
  wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  recipient: Keypair.random().publicKey(),
  amount: '100',
  status: 'pending',
  sourceTxHash: null,
  stellarTxHash: null,
  nonce: '0x' + '0'.repeat(64),
  createdAt: '2026-01-15T12:00:00.000Z',
  updatedAt: '2026-01-15T12:00:00.000Z',
};

const stubAsset: AssetRegistryEntry = {
  id: 'ethereum:0xabcd1234',
  wrapperToken: '',
  source: { chain: 'ethereum', address: '0xabcd1234' },
  symbol: 'wTST',
  name: 'Wrapped Test',
  decimals: 18,
};

/* ─────────────────── GET /events (SSE bridge) ─────────────────── */

describe('GET /events (SSE bridge)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let streamSpy: MockInstance;

  beforeEach(async () => {
    __resetEnvCache();
    __resetContractInstances();
    await __resetAssetRepoForTest();
    await __resetTransactionRepoForTest();
    // Mock the infinite streamContractEvents to yield 2 records, then
    // SYNCHRONOUSLY (no event-loop race) fire the bus broadcasts
    // inline between yields, then yield one more record so the
    // handler keeps order deterministic. The bus subscribers are
    // attached by the handler BEFORE the for-await begins, so the
    // inline broadcasts land on already-attached listeners.
    streamSpy = vi
      .spyOn(HorizonClient.prototype, 'streamContractEvents')
      .mockImplementation(async function* () {
        yield { id: 'rec-1', type: 'CONTRACT', payload: 'event-1' };
        broadcastTransaction(stubTx);
        broadcastAssetUpdate(stubAsset, 'wrapperToken-filled');
        yield { id: 'rec-2', type: 'CONTRACT', payload: 'event-2' };
      });
    app = await createServer();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  /**
   * The `hello` event is the first chunk the bridge writes, BEFORE any
   * bus subscribers are attached. The handler sets the
   * `text/event-stream` content-type up before hijacking.
   */
  it('writes `hello` event as the first SSE chunk (with text/event-stream content-type)', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.body).toMatch(/^event: hello\ndata: \{"ts":\d+\}\n\n/);
  });

  /**
   * `contract-event` chunks mirror every record yielded by
   * `HorizonClient.streamContractEvents`. The mock above yields 2
   * records; the response body must carry BOTH ids.
   */
  it('writes `contract-event` chunks for every record yielded by streamContractEvents', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.body).toContain('event: contract-event');
    expect(res.body).toMatch(/"id":"rec-1"/);
    expect(res.body).toMatch(/"id":"rec-2"/);
  });

  /**
   * `transaction-update` events fan out from the in-process
   * `transactionRepository.upsert` bus. Bus fires inside the mock
   * while the for-await loop is in flight; the handler's
   * `subscribeTransactions` callback writes to the SSE stream.
   */
  it('writes `transaction-update` chunks for in-process transactionBus broadcasts', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.body).toContain('event: transaction-update');
    expect(res.body).toMatch(/"id":"live-tx-1"/);
  });

  /**
   * `asset-update` events fan out from the in-process
   * `broadcastAssetUpdate` bus. Without this the dashboard's
   * AssetTable never flips rows from "pre-stage" to "deployed".
   */
  it('writes `asset-update` chunks for in-process assetBus broadcasts (with updateType)', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.body).toContain('event: asset-update');
    expect(res.body).toContain('wrapperToken-filled');
    expect(res.body).toContain('"id":"ethereum:0xabcd1234"');
  });

  /**
   * When `BRIDGE_CONTRACT_ID` is empty, the bridge short-circuits
   * with a `warning` event and skips the contract-event stream.
   * We must NOT observe any `contract-event` chunks in this branch.
   */
  it('writes `warning` event + skips contract-event stream when BRIDGE_CONTRACT_ID is empty', async () => {
    vi.stubEnv('BRIDGE_CONTRACT_ID', '');
    __resetEnvCache();
    __resetContractInstances();
    await app.close();
    app = await createServer();
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.body).toContain('event: hello');
    expect(res.body).toContain('event: warning');
    expect(res.body).toContain('BRIDGE_CONTRACT_ID not configured');
    expect(res.body).not.toContain('event: contract-event');
  });

  /**
   * If `HorizonClient.streamContractEvents` throws, the bridge
   * catches and writes a single `error` event then resolves. A 500
   * here would kill the dashboard's EventSource reconnect loop.
   */
  it('writes `error` event + resolves when streamContractEvents throws', async () => {
    streamSpy.mockImplementation(async function* () {
      throw new Error('simulated horizon stream failure');
    });
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('event: error');
    expect(res.body).toContain('simulated horizon stream failure');
  });

  /**
   * Two concurrent SSE clients connected via `Promise.all` on
   * `app.inject()`. The default `streamContractEvents` mock fires
   * one `broadcastTransaction` and one `broadcastAssetUpdate`
   * synchronously between yields; the in-process EventEmitter fans
   * out to BOTH subscribers' `writeEvent` callbacks (one per open
   * SSE response). The assertion confirms the fan-out isn't
   * limited to the first subscriber — without multi-subscriber
   * correctness, a future refactor that, e.g., switches to a
   * per-channel listener counter would silently drop events for
   * the second client. Both response bodies must contain BOTH
   * event types AND the seed-payload data (the tx id and the asset
   * id) so the cross-client fan-out is verified end-to-end.
   */
  it('multi-subscriber: two parallel SSE clients both receive every bus broadcast', async () => {
    const [res1, res2] = await Promise.all([
      app.inject({ method: 'GET', url: '/events' }),
      app.inject({ method: 'GET', url: '/events' }),
    ]);
    for (const res of [res1, res2]) {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.body).toContain('event: transaction-update');
      expect(res.body).toContain('event: asset-update');
      expect(res.body).toMatch(/"id":"live-tx-1"/);
      expect(res.body).toContain('ethereum:0xabcd1234');
    }
  });

  /**
   * Channel isolation: each SSE chunk's `event:` line must
   * correspond to the bus channel that emitted the data, so a
   * client filtering with `addEventListener('asset-update', ...)`
   * never sees transaction-shaped payloads (and vice versa).
   *
   * Note: the bridge unwraps the bus event envelope for the
   * transaction channel (writes the `Transaction` object
   * directly, not the wrapping `{ transaction }` shape) but
   * preserves the `{ entry, updateType }` shape for the asset
   * channel. So on-wire data is: `event: transaction-update` →
   * `Transaction` (id + sourceChain + ...), `event: asset-update`
   * → `{ entry, updateType }`. See `horizon-bridge.ts::registerSseBridge`
   * for the per-channel `writeEvent` calls.
   */
  it('channel isolation: each SSE chunk\'s event name matches its data shape (no tx data on asset events, no asset data on tx events)', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(200);

    // SSE chunks are separated by a blank line ("\n\n"). The handler
    // writes `event: <name>\ndata: <json>\n\n` for every broadcast.
    const chunks = res.body
      .split('\n\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const txChunks = chunks.filter((c) => /^event: transaction-update/m.test(c));
    const assetChunks = chunks.filter((c) => /^event: asset-update/m.test(c));

    // Both event types must appear at least once — the test exercises
    // the bridge's "not one-or-the-other" invariant.
    expect(txChunks.length).toBeGreaterThanOrEqual(1);
    expect(assetChunks.length).toBeGreaterThanOrEqual(1);

    // Every `event: transaction-update` chunk carries a Transaction
    // object (id + sourceChain + ...), never an `entry` field.
    for (const chunk of txChunks) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      expect(dataLine).toBeDefined();
      const data = dataLine!.replace('data: ', '').trim();
      const obj = JSON.parse(data) as Record<string, unknown>;
      expect(obj.id).toBeDefined();
      expect(obj.sourceChain).toBeDefined();
      // Must NOT carry the asset-event envelope.
      expect(obj.entry).toBeUndefined();
    }

    // Every `event: asset-update` chunk carries `{ entry, updateType }`,
    // never a Transaction-shaped `id` field. The `updateType` check
    // is structural (any string) rather than literal so a future
    // broadcaster can add new variants without breaking the
    // channel-isolation contract — the bus-side docblock in
    // `event-bus.ts` already anticipates future variants
    // (e.g. `'initial-registration'`).
    for (const chunk of assetChunks) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      expect(dataLine).toBeDefined();
      const data = dataLine!.replace('data: ', '').trim();
      const obj = JSON.parse(data) as Record<string, unknown>;
      expect(obj.entry).toBeDefined();
      expect(obj.updateType).toEqual(expect.any(String));
      // Must NOT carry Transaction-shaped fields.
      expect(obj.id).toBeUndefined();
    }
  });
});

/* ─────────────────── __resetEventBusForTest wipe contract ─────────────────── */

describe('event-bus __resetEventBusForTest wipe contract', () => {
  afterEach(() => {
    __resetEventBusForTest();
  });

  /**
   * The wipe is the only thing standing between specs that subscribe
   * to the bus and a degenerate state where handlers from a prior
   * test keep firing against a fresh server. We verify the wipe
   * INDIRECTLY by counting handler invocations: a pending listener
   * sees its count increment on a broadcast; after reset, the count
   * must NOT move on subsequent broadcasts.
   */
  it('removes all listeners from transaction-update + asset-update channels', () => {
    let txCount = 0;
    let assetCount = 0;
    subscribeTransactions(() => {
      txCount += 1;
    });
    subscribeAssets(() => {
      assetCount += 1;
    });

    broadcastTransaction(stubTx);
    broadcastAssetUpdate(stubAsset, 'wrapperToken-filled');
    expect(txCount).toBe(1);
    expect(assetCount).toBe(1);

    // CRITICAL: do NOT call the unsubscribe fns returned by
    // subscribe() — we want the reset side-effect to do the cleanup,
    // not the listener's own off() call. If __resetEventBusForTest
    // were a no-op, the broadcasts below would still increment the
    // counters.
    __resetEventBusForTest();
    txCount = 0;
    assetCount = 0;

    broadcastTransaction(stubTx);
    broadcastAssetUpdate(stubAsset, 'wrapperToken-filled');
    expect(txCount).toBe(0);
    expect(assetCount).toBe(0);
  });
});
