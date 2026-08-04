import pino from 'pino';
import type { Keypair } from '@stellar/stellar-sdk';
import type { BridgeContract } from '@stellar-payment-gateway/sdk';
import type { LockPayload, SignedAttestation } from '@stellar-payment-gateway/shared';

const log = pino({ transport: { target: 'pino-pretty' } });

/**
 * Submits a single signed `mint_with_attestation` op to the bridge.
 *
 * In production the relayer aggregates signatures from the operator set
 * until the configured threshold is met, then submits in a batch; the
 * scaffold ships with a single-signature path that works when
 * `RELAYER_THRESHOLD=1` and is a clear failure case otherwise (the
 * bridge will accept exactly `(threshold - 1)` sigs and panic on the
 * verifier shortfall — visible in the relayer logs).
 *
 * Real roundtrip:
 *   1. Build a `mint_with_attestation` op via the SDK.
 *   2. `BridgeContract.simulateAndSubmit` does the soroban-rpc
 *      `simulateTransaction → assembleTransaction → sendTransaction`
 *      dance and returns the on-chain tx hash.
 *   3. The returned hash is what the dashboard surfaces under
 *      "minting" status and later under "completed".
 */
export const signer = {
  async submitMintToBridge({
    bridgeContract,
    sourceKeypair,
    relayerPK,
    payload,
    signature,
    networkPassphrase,
    sorobanRpcUrl,
  }: {
    bridgeContract: BridgeContract;
    sourceKeypair: Keypair;
    relayerPK: string;
    payload: LockPayload;
    signature: Uint8Array;
    networkPassphrase: string;
    sorobanRpcUrl: string;
  }): Promise<string> {
    const attestations: SignedAttestation[] = [
      {
        publicKey: relayerPK,
        signature: '0x' + Buffer.from(signature).toString('hex'),
      },
    ];

    const invokeOpts = {
      bridgeContractId: bridgeContract.contractId,
      sourceKeypair,
      networkPassphrase,
      sorobanRpcUrl,
    };

    log.info(
      {
        bridge: bridgeContract.contractId,
        relayer: relayerPK,
        nonce: payload.nonce,
        amount: payload.amount,
      },
      'submitting mint_with_attestation',
    );

    const op = bridgeContract.buildMint({
      relayer: relayerPK,
      wrapperToken: payload.wrapperToken,
      payload,
      attestations,
    });

    return bridgeContract.simulateAndSubmit(invokeOpts, op);
  },
};
