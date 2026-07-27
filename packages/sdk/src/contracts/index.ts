/**
 * StellarDAO SDK — Contract Bindings
 *
 * Typed client modules for interacting with on-chain StellarDAO
 * Soroban contracts from off-chain applications (relayers, dashboards,
 * trading bots, indexers).
 *
 * ## Contract overview
 *
 * | Module               | On-Chain Contract    | Purpose                                      |
 * |----------------------|----------------------|----------------------------------------------|
 * | `bridge.ts`          | `bridge`             | Cross-chain attestation, mint/burn routing   |
 * | `factory.ts`         | `factory`            | Wrapper-token deployment + asset registry    |
 * | `wrapper-token.ts`   | `wrapper-token`      | ERC-20-style token with capped mint/burn     |
 * | `governance.ts`      | `governance`         | Proposal creation, voting, execution         |
 * | `governance-token.ts`| `governance-token`   | SEP-41 governance token with delegation      |
 * | `timelock.ts`        | `timelock`           | Delayed execution for governance safety      |
 *
 * ## Usage
 *
 * ```ts
 * import { BridgeContract, FactoryContract } from '@stellardao/sdk';
 *
 * const bridge = new BridgeContract('C...bridge');
 * const op = bridge.buildMint({ ... });
 *
 * const factory = new FactoryContract('C...factory');
 * const deployOp = factory.buildCreateWrapperAsset(adminPK, input);
 * ```
 *
 * All contract clients are instantiated via factory functions that
 * accept a contract ID string and return a typed interface. In
 * production, the implementation delegates to Soroban RPC's
 * `simulateTransaction` + `sendTransaction` flow. The stub
 * implementations (used when contracts haven't been deployed) return
 * well-typed defaults that let the SDK compile without a live network.
 *
 * @module contracts
 * @packageDocumentation
 */

export { BridgeContract } from './bridge.js';
export type { BridgeInvokeOptions } from './bridge.js';

export { FactoryContract } from './factory.js';
export type { CreateWrapperInput, FactoryInvokeOptions } from './factory.js';

export { WrapperTokenContract } from './wrapper-token.js';
export type { TokenMetadata } from './wrapper-token.js';

export {
  createGovernanceClient,
  createGovernanceTokenClient,
} from './governance.js';
export type {
  GovernanceContractBindings,
  GovernanceTokenBindings,
  TimelockBindings,
} from './governance.js';
