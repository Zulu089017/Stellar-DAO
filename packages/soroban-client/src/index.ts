/**
 * Barrel for the generated Soroban bindings.
 *
 * The per-contract shims in `bindings/{bridge,factory,wrapper-token}.ts` are
 * produced by `scripts/generate-bindings.ts` (or `stellar contract bindings
 * json`). Each shim exports the canonical method list under the same name
 * (`METHOD_NAMES`, `MethodName`), so the barrel re-exports them under
 * contract-prefixed aliases to avoid an ambiguous re-export.
 *
 * For typed access to a single contract's method list, prefer the per-contract
 * subpath imports — they keep the type alias narrow and avoid the renaming:
 *
 *   import { METHOD_NAMES } from '@stellar-payment-gateway/soroban-client/bridge';
 *   import type { MethodName } from '@stellar-payment-gateway/soroban-client/bridge';
 *
 * Use the barrel when you want a single import surface — for example, to
 * build a `CONTRACT_METHODS` lookup table in a tooltip or a /diagnostics
 * dashboard route.
 */

export {
  METHOD_NAMES as BRIDGE_METHOD_NAMES,
  type MethodName as BridgeMethodName,
} from './bindings/bridge.js';

export {
  METHOD_NAMES as FACTORY_METHOD_NAMES,
  type MethodName as FactoryMethodName,
} from './bindings/factory.js';

export {
  METHOD_NAMES as WRAPPER_TOKEN_METHOD_NAMES,
  type MethodName as WrapperTokenMethodName,
} from './bindings/wrapper-token.js';
