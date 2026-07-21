/**
 * Integration test helpers for the StellarDAO API.
 *
 * Provides reusable test fixtures and setup/teardown utilities
 * for integration tests. Reduces boilerplate across 9 test files
 * and ensures consistent test environment configuration.
 *
 * Usage:
 *   import { setupIntegrationEnv, teardownIntegrationEnv } from '../utils/test-helpers.js';
 *   beforeAll(() => setupIntegrationEnv());
 *   afterAll(() => teardownIntegrationEnv());
 */

import { __resetEnvCache } from '@stellardao/shared';
import { vi } from 'vitest';

/**
 * Standard test environment variables for API integration tests.
 * Uses Stellar testnet defaults matching the CI and local dev.
 */
export function setupIntegrationEnv(): void {
  __resetEnvCache();

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
}

/**
 * Clean up test environment state.
 */
export function teardownIntegrationEnv(): void {
  __resetEnvCache();
}

/**
 * Create a random Stellar public key for tests.
 * Uses a deterministic pattern for reproducible test output.
 */
export function testPublicKey(seed: string = 'test'): string {
  // Deterministic G-address for tests.
  const hash = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = 'G' + 'A'.repeat(55);
  const offset = hash % 26;
  const suffix = String.fromCharCode(65 + offset);
  return base.slice(0, 55) + suffix;
}

/**
 * Create a random 0x-prefixed Ethereum address for tests.
 */
export function testEthereumAddress(seed: number = 0): string {
  return '0x' + seed.toString(16).padStart(40, '0').slice(0, 40);
}
