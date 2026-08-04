import type { Keypair } from '@stellar/stellar-sdk';
import type { SignedAttestation, LockPayload, UnlockPayload } from '@stellar-payment-gateway/shared';
import { BridgeContract, FactoryContract, WrapperTokenContract } from '@stellar-payment-gateway/sdk';

/**
 * Thin orchestration layer so route handlers (`apps/api/src/routes/*`) can
 * call into the bridge / factory / wrapper-token submit pipeline without
 * dragging the SDK surface into every handler. Real implementation
 * delegates to the SDK's Bridge/Factory/WrapperToken simulate-and-submit,
 * which already performs the soroban-rpc round-trip:
 *
 *   simulateTransaction → assembleTransaction → sign → sendTransaction
 *
 * Returns the on-chain transaction hash on success.
 */

export type SimulationResult = {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  hash: string;
};

/* ── bridge: mint_with_attestation ───────────────────────────────────── */

export async function submitBridgeMint(
  contract: BridgeContract,
  relayerPK: string,
  wrapperToken: string,
  payload: LockPayload,
  attestations: SignedAttestation[],
  networkPassphrase: string,
  sorobanRpcUrl: string,
  sourceKeypair: Keypair,
): Promise<string> {
  const invokeOpts = { bridgeContractId: contract.contractId, sourceKeypair, networkPassphrase, sorobanRpcUrl };
  const op = contract.buildMint({ relayer: relayerPK, wrapperToken, payload, attestations });
  return contract.simulateAndSubmit(invokeOpts, op);
}

/* ── bridge: burn_with_attestation ───────────────────────────────────── */

export async function submitBridgeBurn(
  contract: BridgeContract,
  wrapperToken: string,
  relayerPK: string,
  payload: UnlockPayload,
  attestations: SignedAttestation[],
  networkPassphrase: string,
  sorobanRpcUrl: string,
  sourceKeypair: Keypair,
): Promise<string> {
  const invokeOpts = { bridgeContractId: contract.contractId, sourceKeypair, networkPassphrase, sorobanRpcUrl };
  const op = contract.buildBurn(wrapperToken, relayerPK, payload, attestations);
  return contract.simulateAndSubmit(invokeOpts, op);
}

/* ── factory: create_wrapper ────────────────────────────────────────── */

export async function submitFactoryCreateWrapper(
  contract: FactoryContract,
  developerPK: string,
  args: Parameters<FactoryContract['buildCreateWrapperAsset']>[1],
  networkPassphrase: string,
  sorobanRpcUrl: string,
  sourceKeypair: Keypair,
): Promise<string> {
  const invokeOpts = { factoryContractId: contract.contractId, sourceKeypair, networkPassphrase, sorobanRpcUrl };
  const op = contract.buildCreateWrapperAsset(developerPK, args);
  return contract.simulateAndSubmit(invokeOpts, op);
}export { BridgeContract, FactoryContract, WrapperTokenContract };
