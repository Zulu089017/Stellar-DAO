/**
 * Spec for `POST /webhooks/factory/confirm`.
 *
 * Closes the `TODO(50-item backlog, factory-confirmation)` left when
 * item 8 added the pre-stage pattern to `POST /assets`. Tests cover
 * the route handler directly via `createServer().inject(...)`:
 *
 *   - happy path (existing pre-stage entry → wrapperToken filled in)
 *   - zod-body rejection (unknown chain, missing wrapperToken)
 *   - strict Soroban contract-id regex rejection (empty + non-C prefix)
 *   - 404-on-missing-pre-stage (no auto-create; see file-header note in
 *     `routes/webhooks.ts` for the race-condition rationale)
 *   - idempotency (repeated webhook leaves entry stable + fires
 *     broadcast every time)
 *   - in-process event bus broadcasts `asset-update` with
 *     `updateType: 'wrapperToken-filled'` (parity with the SSE channel
 *     wired through `horizon-bridge.ts`)
 *
 * Test infrastructure mirrors items 5-8: a per-test `setupTestEnv()`
 * pins the env vars needed by `parseEnv.api()`, and a top-level
 * `beforeEach`/`afterEach` pair fences the asset-repository, the
 * contract-instance singletons, and the in-process event-bus.
 * `FactoryContract.prototype.simulateAndSubmit` is mocked to
 * `mockResolvedValue('a'.repeat(64))` so the pre-stage POST /assets
 * step of the happy-path tests can run without touching real Soroban.
 */
import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { FactoryContract } from '@stellardao/sdk';
import { __resetEnvCache } from '@stellardao/shared';

import { createServer } from '../server.js';
import { __resetAssetRepoForTest } from '../db/repositories/asset-repository.js';
import { __resetContractInstances } from '../soroban/index.js';
import { __resetEventBusForTest, subscribeAssets } from '../sse/event-bus.js';

const setupTestEnv = (): void => {
  process.env.STELLAR_NETWORK = 'TESTNET';
  process.env.STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
  process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
  process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
  process.env.ETHEREUM_RPC_URL = 'https://eth.llamarpc.com';
  process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  process.env.POLYGON_RPC_URL = 'https://polygon-rpc.com';
  // CRITICAL: stub the three contract ids so the lazy singletons in
  // `soroban/index.ts` (`bridge()`, `factory()`, `wrapperToken()`)
  // construct real `Contract` instances. With these unset, the
  // singletons default the contract id to `''`, and the SDK's
  // `Operation.invokeContractFunction({contract: '', ...})` throws
  // `Error: Unsupported address type` — surface as a 500 (NOT a
  // 400, since the throw happens AFTER the route's zod schema
  // already accepted the request). Identical to the pattern in
  // `items/8 :: assets.integration.spec.ts::vi.stubEnv(...)` lines.
  process.env.BRIDGE_CONTRACT_ID =
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
  process.env.FACTORY_CONTRACT_ID =
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
  process.env.WRAPPER_TOKEN_TEMPLATE_ID =
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
  __resetEnvCache();
};

// Real 56-char Soroban contract id derived from canonical SDK
// production output (the strict regex in the route schema rejects
// anything < 56 chars, garbage chars, or non-C prefixes). We don't
// reuse the setupTestEnv env-stub literal here — keeping
// VALID_WRAPPER_TOKEN derived from `StrKey.encodeContract` means the
// happy-path regex assertion exercises what production output
// actually looks like rather than a hand-crafted test string.
const VALID_WRAPPER_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 1));
// Source token address kept hex-shape but arbitrary; doesn't have to
// be a real EVM address because the route doesn't validate it
// beyond non-empty.
const SOURCE_TOKEN = '0xabcd1234';

describe('POST /webhooks/factory/confirm', () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let simulateSpy: MockInstance;
  let assetEvents: Array<{ entry: unknown; updateType: string }>;
  let unsubscribeAssets: (() => void) | undefined;

  // Helper: POST /assets to create the pre-stage entry, then return
  // the dev PK used (for parity with the wrapped txHash flow). Mirrors
  // the integration-spec pattern from item 8 (`assets.integration
  // .spec.ts`).
  const createPreStage = async (overrides: Record<string, unknown> = {}) => {
    const devPK = Keypair.random().publicKey();
    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      headers: { 'x-developer-public-key': devPK },
      payload: {
        source: { chain: 'ethereum', address: SOURCE_TOKEN },
        name: 'Wrapped DAI',
        symbol: 'wDAI',
        decimals: 18,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(202);
    return { devPK, response: res };
  };

  beforeEach(async () => {
    setupTestEnv();
    simulateSpy = vi
      .spyOn(FactoryContract.prototype, 'simulateAndSubmit')
      .mockResolvedValue('a'.repeat(64));
    app = await createServer();
    await __resetAssetRepoForTest();
    __resetContractInstances();
    __resetEventBusForTest();
    assetEvents = [];
    unsubscribeAssets = subscribeAssets((evt) => assetEvents.push(evt));
  });

  afterEach(async () => {
    unsubscribeAssets?.();
    if (app) await app.close();
    simulateSpy.mockRestore();
    await __resetAssetRepoForTest();
    __resetContractInstances();
    __resetEventBusForTest();
  });

  it('fills in wrapperToken for an existing pre-stage entry (happy path)', async () => {
    await createPreStage();

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: VALID_WRAPPER_TOKEN,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json() as { entry: { wrapperToken: string; source: { chain: string; address: string } } };
    expect(body.entry.wrapperToken).toBe(VALID_WRAPPER_TOKEN);
    expect(body.entry.source).toEqual({ chain: 'ethereum', address: SOURCE_TOKEN });
  });

  it('rejects unknown sourceChain via zod enum (chain=\'bitcoin\')', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'bitcoin',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: VALID_WRAPPER_TOKEN,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // Each probe here uses a positional splice `slice(0, 10) + X + slice(11)`
  // so the substitute char lands at offset 10 EVERY time, regardless of
  // what `StrKey.encodeContract(Buffer.alloc(32, 1))` actually produces.
  // The earlier `VALID_WRAPPER_TOKEN.replace(/A/, X)` form was a latent
  // no-op whenever the position-1 'A' happened to slide past the
  // alphabet — and worse, `'O'` and `'I'` are BOTH inside `[A-Z2-7]`
  // (Stellar's strkey alphabet IS the full A-Z range plus `2-7`), so
  // `replace(/A/, 'I')` matched the regex and slipped through to the
  // route, racing with subsequent probes and producing the 404-vs-400
  // inconsistency. The probes below use chars GUARANTEED NOT in the
  // alphabet (`!`, `0`, `8`, lowercase `i`), so each deterministically
  // exercises the alphabet branch and returns 400.
  it.each([
    ['ASCII `!` (splice at offset 10)', VALID_WRAPPER_TOKEN.slice(0, 10) + '!' + VALID_WRAPPER_TOKEN.slice(11)],
    ['digit `0` (splice at offset 10)', VALID_WRAPPER_TOKEN.slice(0, 10) + '0' + VALID_WRAPPER_TOKEN.slice(11)],
    ['digit `8` (splice at offset 10)', VALID_WRAPPER_TOKEN.slice(0, 10) + '8' + VALID_WRAPPER_TOKEN.slice(11)],
    ['lowercase `i` (splice at offset 10)', VALID_WRAPPER_TOKEN.slice(0, 10) + 'i' + VALID_WRAPPER_TOKEN.slice(11)],
  ])('rejects wrapperToken with non-base32 char: %s', async (_name, wrapperToken) => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects wrapperToken with a lowercase prefix (whole-string toLowerCase — fails the prefix-C literal branch)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: VALID_WRAPPER_TOKEN.toLowerCase(),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // Positive control — `O` and `I` are BOTH inside `[A-Z2-7]` because
  // the alphabet is the FULL A–Z range plus `2-7`. This test pins the
  // regression-vector in the OTHER direction: a future "fix" that
  // tightens the regex to exclude `O`/`I`/`0`/`1` (a common
  // over-tightening mistake when the alphabet is misremembered) would
  // silently break production. Use `slice(0, 10) + X + slice(11)` (a
  // positional splice) so the probe doesn't depend on
  // `VALID_WRAPPER_TOKEN` ever containing an `A` at the right offset.
  it.each([
    ['`O` (alphabet-valid char) — splice at offset 10', VALID_WRAPPER_TOKEN.slice(0, 10) + 'O' + VALID_WRAPPER_TOKEN.slice(11)],
    ['`I` (alphabet-valid char) — splice at offset 10', VALID_WRAPPER_TOKEN.slice(0, 10) + 'I' + VALID_WRAPPER_TOKEN.slice(11)],
  ])('POSITIVE-CONTROL accepts (202) wrapperToken with %s', async (_name, wrapperToken) => {
    await createPreStage();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken,
      },
    });
    expect(res.statusCode).toBe(202);
  });

  it('rejects wrapperToken that fails the strict 56-char Soroban contract-id regex (rejects \'garbage\')', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: 'garbage',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty wrapperToken (closes the production-side off-ramp for the empty pre-stage slot itself)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: '',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no pre-stage asset registration exists for the source', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: '0xnonexistent',
        wrapperToken: VALID_WRAPPER_TOKEN,
      },
    });
    expect(res.statusCode).toBe(404);
    // Don't actually expect an asset-update event for 404s.
    expect(assetEvents).toHaveLength(0);
  });

  it('is idempotent — repeated webhook leaves entry stable and broadcasts each time', async () => {
    await createPreStage();
    assetEvents.length = 0; // ignore the registration broadcast from POST /assets

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/factory/confirm',
        payload: {
          sourceChain: 'ethereum',
          sourceToken: SOURCE_TOKEN,
          wrapperToken: VALID_WRAPPER_TOKEN,
        },
      });
      expect(res.statusCode).toBe(202);
      const body = res.json() as { entry: { wrapperToken: string } };
      expect(body.entry.wrapperToken).toBe(VALID_WRAPPER_TOKEN);
    }

    expect(assetEvents).toHaveLength(2);
    // Currently POST /assets does NOT broadcast — only the webhook
    // does. If a future change wires POST /assets to surface an
    // `asset-update` event, the `.filter` here keeps the webhook-
    // only assertion intact (and the test stays green) while the
    // dashboard wiring can advance independently.
    const webhookEvents = assetEvents.filter(
      (e) => e.updateType === 'wrapperToken-filled',
    );
    expect(webhookEvents).toHaveLength(2);
    for (const evt of webhookEvents) {
      expect((evt.entry as { wrapperToken: string }).wrapperToken).toBe(VALID_WRAPPER_TOKEN);
    }
  });

  it('broadcasts updateType=\'wrapperToken-filled\' via the in-process event bus', async () => {
    await createPreStage();
    assetEvents.length = 0; // ignore the POST /assets broadcast

    await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: {
        sourceChain: 'ethereum',
        sourceToken: SOURCE_TOKEN,
        wrapperToken: VALID_WRAPPER_TOKEN,
      },
    });

    // Filter to webhook-shape events so a future POST /assets broadcast
    // (currently absent) doesn't break this assertion.
    const webhookEvents = assetEvents.filter(
      (e) => e.updateType === 'wrapperToken-filled',
    );
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0]?.updateType).toBe('wrapperToken-filled');
    expect((webhookEvents[0]?.entry as { wrapperToken: string }).wrapperToken).toBe(VALID_WRAPPER_TOKEN);
    expect((webhookEvents[0]?.entry as { source: { chain: string; address: string } }).source).toEqual({
      chain: 'ethereum',
      address: SOURCE_TOKEN,
    });
  });
});

/* ─────────────────── POST /webhooks/factory/confirm: HMAC verification ─────────────────── *
 * When `RELAYER_HMAC_SECRET` is configured, the route enforces
 * `X-Stellar-DAO-Signature = hex(hmac_sha256(secret, JSON.stringify(body)))`
 * in constant time. When the secret is empty (test suite default,
 * ephemeral CI, local dev), enforcement is bypassed — that's the
 * path the rest of this file exercises. The block below pins the
 * enforced-mode behaviour: 202 on valid, 401 on every mismatch class.
 */
const HMAC_TEST_SECRET = 'a-test-secret-that-is-32-chars-or-more-stable';

const computeHmac = (body: unknown): string =>
  crypto
    .createHmac('sha256', HMAC_TEST_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

describe('POST /webhooks/factory/confirm (HMAC verification)', () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let simulateSpy: MockInstance;

  const validBody = () => ({
    sourceChain: 'ethereum',
    sourceToken: SOURCE_TOKEN,
    wrapperToken: VALID_WRAPPER_TOKEN,
  });

  beforeEach(async () => {
    setupTestEnv();
    process.env.RELAYER_HMAC_SECRET = HMAC_TEST_SECRET;
    __resetEnvCache();
    simulateSpy = vi
      .spyOn(FactoryContract.prototype, 'simulateAndSubmit')
      .mockResolvedValue('a'.repeat(64));
    app = await createServer();
    await __resetAssetRepoForTest();
    __resetContractInstances();
    __resetEventBusForTest();
    // Establish the pre-stage so the only thing varying across the
    // 401 paths below is the HMAC, not the missing-pre-stage 404
    // branch (which has its own dedicated test above).
    await app.inject({
      method: 'POST',
      url: '/assets',
      headers: { 'x-developer-public-key': Keypair.random().publicKey() },
      payload: {
        source: { chain: 'ethereum', address: SOURCE_TOKEN },
        name: 'Wrapped HMAC',
        symbol: 'wHMAC',
        decimals: 18,
      },
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    simulateSpy.mockRestore();
    await __resetAssetRepoForTest();
    __resetContractInstances();
    delete process.env.RELAYER_HMAC_SECRET;
    __resetEnvCache();
  });

  it('returns 202 on valid HMAC-SHA256 signature (happy path)', async () => {
    const body = validBody();
    const sig = computeHmac(body);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      headers: { 'x-stellar-dao-signature': sig },
      payload: body,
    });
    expect(res.statusCode).toBe(202);
  });

  it('returns 401 when X-Stellar-DAO-Signature header is absent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      payload: validBody(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when one byte of the HMAC digest is flipped (wrong signature)', async () => {
    const body = validBody();
    const good = computeHmac(body);
    // Flip the LAST hex character to a guaranteed-different value so
    // the test doesn't depend on the position-1 byte being a '0' or
    // similar — pick `'1'` if the last char is `'0'`, else `'0'`.
    const last = good.slice(-1);
    const swapped = last === '0' ? '1' : '0';
    const tampered = good.slice(0, -1) + swapped;
    expect(tampered).not.toBe(good);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      headers: { 'x-stellar-dao-signature': tampered },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the body is mutated after signing (HMAC is body-bound)', async () => {
    const original = validBody();
    const sig = computeHmac(original);
    const mutated = { ...original, sourceToken: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' };
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      headers: { 'x-stellar-dao-signature': sig },
      payload: mutated,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the signature header is non-hex garbage (length pre-check fails before timingSafeEqual)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      headers: { 'x-stellar-dao-signature': 'not-hex-at-all!!' },
      payload: validBody(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the signature header is shorter than the expected SHA-256 digest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/factory/confirm',
      headers: { 'x-stellar-dao-signature': 'aabbccdd' }, // 4 hex chars, expected = 64
      payload: validBody(),
    });
    expect(res.statusCode).toBe(401);
  });
});
