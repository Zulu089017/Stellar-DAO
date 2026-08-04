import { parseEnv } from '@stellar-payment-gateway/shared';
import { BridgeContract, FactoryContract, WrapperTokenContract } from '@stellar-payment-gateway/sdk';

/**
 * Lazy contract instances.
 *
 * `parseEnv.api()` reads `process.env` (and validates it via zod), so it
 * MUST NOT run at module-import time — vitest's `vi.stubEnv` hoists
 * stubbing above spec imports, but other workers (and prod boot) do not
 * have stubs in place. Constructing the contracts lazily defers env
 * resolution to first use, so test files can import this module without
 * triggering the zod schema.
 */
let _bridge: BridgeContract | null = null;
let _factory: FactoryContract | null = null;
let _wrapperToken: WrapperTokenContract | null = null;

function getEnv() {
  return parseEnv.api();
}

export const bridge = (): BridgeContract => {
  if (!_bridge) _bridge = new BridgeContract(getEnv().BRIDGE_CONTRACT_ID ?? '');
  return _bridge;
};

export const factory = (): FactoryContract => {
  if (!_factory) _factory = new FactoryContract(getEnv().FACTORY_CONTRACT_ID ?? '');
  return _factory;
};

export const wrapperToken = (): WrapperTokenContract => {
  if (!_wrapperToken)
    _wrapperToken = new WrapperTokenContract(getEnv().WRAPPER_TOKEN_TEMPLATE_ID ?? '');
  return _wrapperToken;
};

/** Test-only: clear the lazy singletons so subsequent calls re-read env. */
export const __resetContractInstances = (): void => {
  _bridge = null;
  _factory = null;
  _wrapperToken = null;
};
