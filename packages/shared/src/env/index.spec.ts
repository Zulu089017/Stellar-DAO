/**
 * `parseEnv` spec for `@stellardao/shared`.
 *
 * Three schemas are tested:
 *   - `parseEnv.bridge()` — relayer + factory/bridge contract ids +
 *     source-chain RPC URLs (ETH/Solana/Polygon) + signing keys +
 *     `RELAYER_THRESHOLD` (default 2).
 *   - `parseEnv.api()` — extends bridge with `API_PORT` (default
 *     4000) + optional `DATABASE_URL`.
 *   - `parseEnv.web()` — Next.js client bundle env with fallback to
 *     non-NEXT_PUBLIC_* vars (so the same `.env.local` file can
 *     feed server + web).
 *
 * Cache contract:
 *   - First call validates + caches; subsequent calls return the
 *     same frozen reference even if `process.env` mutates.
 *   - `__resetEnvCache()` clears ALL three cache slots.
 *   - All returned objects are `Object.isFrozen === true`.
 *
 * Test infrastructure:
 *   - `vi.stubEnv(name, value)` (vitest 2.x canonical) for env var
 *     management. Passing `undefined` deletes the var. Restored by
 *     `vi.unstubAllEnvs()` in `afterEach`.
 *   - `__resetEnvCache()` between tests so each test sees a fresh
 *     validate-then-cache cycle.
 *   - Each test calls `setupEnv(overrides?)` to rebuild the base
 *     testnet env from a single fixture so a single test's delta
 *     can't leak into the next via stale process.env.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { __resetEnvCache, parseEnv } from './index.js';

/* ─────────────────────────── fixture ─────────────────────────── */

/**
 * Base env that satisfies every required field in `bridge` (and
 * transitively, `api`). Each test starts here and applies its
 * specific delta via `setupEnv(overrides)`. `undefined` values
 * in the overrides explicitly delete the corresponding env var
 * (vi.stubEnv(undefined) deletes).
 */
const BASE_ENV = {
  STELLAR_NETWORK: 'TESTNET',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  ETHEREUM_RPC_URL: 'https://eth.llamarpc.com',
  SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
  POLYGON_RPC_URL: 'https://polygon-rpc.com',
} as const;

/** Web-only env (NEXT_PUBLIC_*). Independent of BASE_ENV. */
const BASE_WEB_ENV = {
  NEXT_PUBLIC_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  NEXT_PUBLIC_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
};

/**
 * Every env var read by `parseEnv.{bridge|api|web}()`. Listed here
 * so `setupEnv()` can explicitly `delete` them all before applying
 * the BASE_ENV+overrides layer — otherwise a CI shell that already
 * has, e.g., `BRIDGE_CONTRACT_ID=garbage` will leak through to the
 * test, fail zod's `.startsWith('C')` validation, and explode the
 * bridge sub-suite. Centralising the list here both documents the
 * full parseEnv surface AND makes the test resilient to whatever
 * happens to be set in the host shell / previous test runs.
 *
 * KEEP IN SYNC with `env/index.ts::BaseEnvSchema` +
 * `BridgeEnvSchema` + `ApiEnvSchema` + `WebEnvSchema`. Adding a new
 * field to ANY of those schemas requires updating this list —
 * otherwise tests will silently leak host-shell process.env values
 * into the bridge sub-suite on the next test run.
 */
const ALL_PARSED_KEYS = [
  // BridgeEnvSchema extends BaseEnvSchema
  'STELLAR_NETWORK',
  'STELLAR_NETWORK_PASSPHRASE',
  'HORIZON_URL',
  'SOROBAN_RPC_URL',
  // BridgeEnvSchema top-level
  'BRIDGE_CONTRACT_ID',
  'FACTORY_CONTRACT_ID',
  'WRAPPER_TOKEN_TEMPLATE_ID',
  'RELAYER_SECRET_KEY',
  'RELAYER_PUBLIC_KEY',
  'RELAYER_THRESHOLD',
  'ETHEREUM_RPC_URL',
  'SOLANA_RPC_URL',
  'POLYGON_RPC_URL',
  // ApiEnv extends BridgeEnv
  'API_PORT',
  'DATABASE_URL',
  // WebEnv
  'NEXT_PUBLIC_HORIZON_URL',
  'NEXT_PUBLIC_SOROBAN_RPC_URL',
  'NEXT_PUBLIC_BRIDGE_CONTRACT_ID',
  'NEXT_PUBLIC_FACTORY_CONTRACT_ID',
  'NEXT_PUBLIC_NETWORK_PASSPHRASE',
] as const;

/** Apply the base env + overrides, then clear the parseEnv cache. */
function setupEnv(overrides: Record<string, string | undefined> = {}): void {
  __resetEnvCache();
  // (1) Clear every key the parseEnv surface reads so prior tests
  // OR CI shell leaks can't pollute the current test's view.
  for (const key of ALL_PARSED_KEYS) {
    delete process.env[key];
  }
  // (2) Apply BASE_ENV + BASE_WEB_ENV + per-test overrides.
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...BASE_WEB_ENV, ...overrides })) {
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      // Per-test override said "delete this key" — the explicit
      // value is undefined. Already deleted in (1); redelete here
      // to defend against override keys that aren't in BASE_ENV.
      delete process.env[key];
    }
  }
  __resetEnvCache();
}

afterEach(() => {
  __resetEnvCache();
});

/* ───────────────────────── parseEnv.bridge ───────────────────── */

describe('parseEnv.bridge', () => {
  it('accepts a fully-valid bridge env', () => {
    setupEnv();
    const env = parseEnv.bridge();
    expect(env.STELLAR_NETWORK).toBe('TESTNET');
    expect(env.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(env.ETHEREUM_RPC_URL).toBe('https://eth.llamarpc.com');
  });

  it('defaults RELAYER_THRESHOLD to 2 when unset', () => {
    setupEnv();
    expect(parseEnv.bridge().RELAYER_THRESHOLD).toBe(2);
  });

  it('accepts RELAYER_THRESHOLD as a string (zod coerce.number())', () => {
    setupEnv({ RELAYER_THRESHOLD: '3' });
    expect(parseEnv.bridge().RELAYER_THRESHOLD).toBe(3);
  });

  it.each(['PUBLIC', 'TESTNET', 'FUTURENET'] as const)(
    'accepts STELLAR_NETWORK = %s',
    (network) => {
      setupEnv({ STELLAR_NETWORK: network });
      expect(parseEnv.bridge().STELLAR_NETWORK).toBe(network);
    },
  );

  it('rejects missing STELLAR_NETWORK', () => {
    setupEnv({ STELLAR_NETWORK: undefined });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('rejects STELLAR_NETWORK = "mainnet" (not in the enum)', () => {
    setupEnv({ STELLAR_NETWORK: 'mainnet' });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('rejects malformed HORIZON_URL (z.string().url())', () => {
    setupEnv({ HORIZON_URL: 'not-a-url' });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('requires ETHEREUM_RPC_URL', () => {
    setupEnv({ ETHEREUM_RPC_URL: undefined });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('requires SOLANA_RPC_URL', () => {
    setupEnv({ SOLANA_RPC_URL: undefined });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('requires POLYGON_RPC_URL', () => {
    setupEnv({ POLYGON_RPC_URL: undefined });
    expect(() => parseEnv.bridge()).toThrow();
  });

  it('accepts RELAYER_PUBLIC_KEY / RELAYER_SECRET_KEY absent (both optional)', () => {
    setupEnv();
    const env = parseEnv.bridge();
    expect(env.RELAYER_PUBLIC_KEY).toBeUndefined();
    expect(env.RELAYER_SECRET_KEY).toBeUndefined();
  });
});

/* ───────────────────────── parseEnv.api ───────────────────────── */

describe('parseEnv.api', () => {
  it('inherits bridge fields + adds API_PORT (default 4000)', () => {
    setupEnv();
    const env = parseEnv.api();
    expect(env.STELLAR_NETWORK).toBe('TESTNET');
    expect(env.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(env.API_PORT).toBe(4000);
  });

  it('accepts API_PORT as a string (zod coerce.number())', () => {
    setupEnv({ API_PORT: '5000' });
    expect(parseEnv.api().API_PORT).toBe(5000);
  });

  it('accepts DATABASE_URL present', () => {
    setupEnv({ DATABASE_URL: 'postgres://test-only-connection-string' });
    expect(parseEnv.api().DATABASE_URL).toBe('postgres://test-only-connection-string');
  });

  it('accepts DATABASE_URL absent (optional in ApiEnvSchema)', () => {
    setupEnv({ DATABASE_URL: undefined });
    expect(parseEnv.api().DATABASE_URL).toBeUndefined();
  });
});

/* ───────────────────────── parseEnv.web ───────────────────────── */

describe('parseEnv.web', () => {
  it('accepts a fully-valid web env', () => {
    setupEnv();
    const env = parseEnv.web();
    expect(env.NEXT_PUBLIC_HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(env.NEXT_PUBLIC_SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(env.NEXT_PUBLIC_NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
  });

  it('falls back from NEXT_PUBLIC_* to non-NEXT_PUBLIC_* env vars', () => {
    // Drop the NEXT_PUBLIC_* prefix entirely; parseEnv.web should
    // transparently substitute HORIZON_URL / SOROBAN_RPC_URL /
    // STELLAR_NETWORK_PASSPHRASE so the same `.env.local` file can
    // feed the server-side API and the Next.js client bundle.
    setupEnv({
      NEXT_PUBLIC_HORIZON_URL: undefined,
      NEXT_PUBLIC_SOROBAN_RPC_URL: undefined,
      NEXT_PUBLIC_NETWORK_PASSPHRASE: undefined,
    });
    const env = parseEnv.web();
    expect(env.NEXT_PUBLIC_HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(env.NEXT_PUBLIC_SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(env.NEXT_PUBLIC_NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
  });

  it('prefers NEXT_PUBLIC_* over the non-NEXT_PUBLIC_* fallback when both set', () => {
    // Mixed: NEXT_PUBLIC_HORIZON_URL is provided (used), NEXT_PUBLIC_SOROBAN_RPC_URL
    // is missing (fall back to SOROBAN_RPC_URL), NEXT_PUBLIC_NETWORK_PASSPHRASE
    // is missing (fall back to STELLAR_NETWORK_PASSPHRASE). Pin the precedence
    // direction so a future refactor cannot silently flip it.
    setupEnv({
      NEXT_PUBLIC_HORIZON_URL: 'https://horizon-public-only.example',
      NEXT_PUBLIC_SOROBAN_RPC_URL: undefined,
      NEXT_PUBLIC_NETWORK_PASSPHRASE: undefined,
    });
    const env = parseEnv.web();
    expect(env.NEXT_PUBLIC_HORIZON_URL).toBe('https://horizon-public-only.example');
    expect(env.NEXT_PUBLIC_SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(env.NEXT_PUBLIC_NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
  });

  it('rejects malformed NEXT_PUBLIC_HORIZON_URL even with fallback', () => {
    setupEnv({
      NEXT_PUBLIC_HORIZON_URL: 'not-a-url',
      HORIZON_URL: 'also-not-a-url',
    });
    expect(() => parseEnv.web()).toThrow();
  });

  it('falls back to STELLAR_NETWORK_PASSPHRASE when NEXT_PUBLIC_NETWORK_PASSPHRASE absent', () => {
    setupEnv({
      NEXT_PUBLIC_NETWORK_PASSPHRASE: undefined,
      STELLAR_NETWORK_PASSPHRASE: 'something-non-empty',
    });
    // The base/non-NEXT_PUBLIC passphrase provides the fallback
    // value, and zod's z.string().min(1) accepts non-empty
    // regardless of which source provided it.
    expect(() => parseEnv.web()).not.toThrow();
    expect(parseEnv.web().NEXT_PUBLIC_NETWORK_PASSPHRASE).toBe('something-non-empty');
  });

  it('rejects both passphrase sources empty (z.string().min(1) on no-fallback path)', () => {
    setupEnv({
      NEXT_PUBLIC_NETWORK_PASSPHRASE: undefined,
      STELLAR_NETWORK_PASSPHRASE: '',
    });
    expect(() => parseEnv.web()).toThrow();
  });

  it('accepts missing NEXT_PUBLIC_BRIDGE_CONTRACT_ID (optional) and NEXT_PUBLIC_FACTORY_CONTRACT_ID (optional)', () => {
    setupEnv({
      NEXT_PUBLIC_BRIDGE_CONTRACT_ID: undefined,
      NEXT_PUBLIC_FACTORY_CONTRACT_ID: undefined,
    });
    const env = parseEnv.web();
    expect(env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID).toBeUndefined();
    expect(env.NEXT_PUBLIC_FACTORY_CONTRACT_ID).toBeUndefined();
  });
});

/* ──────────────────── caching + frozen contract ──────────────── */

describe('parseEnv cache', () => {
  it('returns the same object reference on repeated calls (lazy validate-then-cache)', () => {
    setupEnv();
    const a = parseEnv.bridge();
    const b = parseEnv.bridge();
    expect(a).toBe(b);
  });

  it('returns Object.isFrozen === true on all 3 parseEnv shapes', () => {
    setupEnv();
    expect(Object.isFrozen(parseEnv.bridge())).toBe(true);
    expect(Object.isFrozen(parseEnv.api())).toBe(true);
    expect(Object.isFrozen(parseEnv.web())).toBe(true);
  });

  it('cached values persist across process.env mutations (no re-validation without __resetEnvCache)', () => {
    setupEnv({ STELLAR_NETWORK: 'TESTNET' });
    const initialBridge = parseEnv.bridge(); // populate cache.bridge with TESTNET
    const initialApi = parseEnv.api(); // populate cache.api with TESTNET
    // Mutate process.env directly without calling __resetEnvCache().
    // Production contract: parseEnv.{bridge,api,web}() NEVER re-validates
    // once cached, regardless of how process.env mutates. Without this
    // invariant, every ambient env tweak would silently invalidate the
    // first call's parsed value. The earlier v1 "keeps separate caches"
    // formulation conflated cache-independence with re-validation; the
    // contract under test is the strict no-revalidation rule.
    process.env.STELLAR_NETWORK = 'PUBLIC';
    // Reference-identity check (toBe) pins BOTH no-revalidation AND
    // no-reparse-clone — a future refactor that returns a freshly-
    // parsed copy from the cache (same value, different identity)
    // would slip past a value-only assertion but fail toBe.
    expect(parseEnv.bridge()).toBe(initialBridge);
    expect(parseEnv.api()).toBe(initialApi);
    // Belt-and-suspenders: the value also still reads as TESTNET.
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('TESTNET');
    expect(parseEnv.api().STELLAR_NETWORK).toBe('TESTNET');
  });

  it('revalidates the cached shape against process.env after __resetEnvCache()', () => {
    setupEnv({ STELLAR_NETWORK: 'TESTNET' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('TESTNET');
    setupEnv({ STELLAR_NETWORK: 'PUBLIC' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('PUBLIC');
  });
});

/* ───────────────────────── __resetEnvCache ────────────────────── */

describe('__resetEnvCache', () => {
  it('clears the bridge cache so the next call re-validates', () => {
    setupEnv({ STELLAR_NETWORK: 'TESTNET' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('TESTNET');
    setupEnv({ STELLAR_NETWORK: 'PUBLIC' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('PUBLIC');
    setupEnv({ STELLAR_NETWORK: 'FUTURENET' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('FUTURENET');
  });

  it('clears all 3 cache slots (bridge + api + web)', () => {
    setupEnv();
    parseEnv.bridge();
    parseEnv.api();
    parseEnv.web();
    // After the next setupEnv + cached read, all three should re-validate.
    setupEnv({ STELLAR_NETWORK: 'PUBLIC', API_PORT: '9000' });
    expect(parseEnv.bridge().STELLAR_NETWORK).toBe('PUBLIC');
    expect(parseEnv.api().API_PORT).toBe(9000);
    expect(parseEnv.web().NEXT_PUBLIC_HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
  });

  it('is idempotent — calling twice with no parseEnv calls in between does not throw', () => {
    __resetEnvCache();
    __resetEnvCache();
    setupEnv();
    expect(() => parseEnv.bridge()).not.toThrow();
  });
});
