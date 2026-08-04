/**
 * Bridge contract wrapper.
 *
 * Translates Lock/UnlockPayload + SignedAttestation[] into a Soroban
 * InvokeContractOperation ready to be wrapped in a Transaction.
 */
import {
  Account,
  Address,
  type Keypair,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToBigInt,
} from '@stellar/stellar-sdk';
import type { LockPayload, MintRequest, SignedAttestation, UnlockPayload } from '@stellar-payment-gateway/shared';

export type BridgeInvokeOptions = {
  bridgeContractId: string;
  sourceKeypair: Keypair;
  networkPassphrase: string;
  sorobanRpcUrl: string;
  fee?: number;
};

export class BridgeContract {
  constructor(public readonly contractId: string) {}

  /**
   * Build (but do not submit) a `mint_with_attestation` operation.
   * Return type is inferred for stellar-sdk v12 type narrowing.
   */
  buildMint(_request: MintRequest) {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: 'mint_with_attestation',
      args: this.encodeMintArgs(_request),
    });
  }

  /** Build a `burn_with_attestation` operation. */
  buildBurn(
    _wrapperToken: string,
    relayerPK: string,
    payload: UnlockPayload,
    attestations: SignedAttestation[],
  ) {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: 'burn_with_attestation',
      args: [
        new Address(relayerPK).toScVal(),
        new Address(_wrapperToken).toScVal(),
        nativeToScVal(payload),
        nativeToScVal(attestations),
      ],
    });
  }

  private encodeMintArgs(request: MintRequest) {
    const { wrapperToken, relayer, payload, attestations } = request;
    return [
      new Address(relayer).toScVal(),
      new Address(wrapperToken).toScVal(),
      nativeToScVal(payload satisfies LockPayload),
      nativeToScVal(attestations),
    ];
  }

  /**
   * Simulate + submit an operation against Soroban RPC.
   *
   * stellar-sdk v12 requires `TransactionBuilder` to accept an `Account`,
   * not a bare `Keypair`. We wrap the keypair into a zero-sequence `Account`
   * using `xdrAccountId()` — Soroban's `assembleTransaction` recomputes the
   * sequence number from the ledger during preparation, so the placeholder
   * is correct for the simulate → assemble → sign → send pipeline used here.
   */
  async simulateAndSubmit(
    opts: BridgeInvokeOptions,
    op: ReturnType<typeof Operation.invokeContractFunction>,
  ): Promise<string> {
    const tx = new TransactionBuilder(
      // `publicKey()` returns the strkey G-address string; v12 Account
      // requires a string `accountId`. The '0' sequence is a placeholder
      // — `assembleTransaction` re-fetches the real sequence from the
      // ledger during preparation, so this is safe for the
      // simulate → assemble → sign → send pipeline used here.
      new Account(opts.sourceKeypair.publicKey(), '0'),
      {
        networkPassphrase: opts.networkPassphrase,
        fee: (opts.fee ?? 100).toString(),
      },
    )
      .setTimeout(30)
      .addOperation(op)
      .build();

    const server = new SorobanRpc.Server(opts.sorobanRpcUrl);
    const simulated = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simulated)) {
      throw new Error(`bridge simulation failed: ${simulated.error}`);
    }
    const prepared = SorobanRpc.assembleTransaction(tx, simulated).build();
    prepared.sign(opts.sourceKeypair);
    const sent = await server.sendTransaction(prepared);
    return sent.hash;
  }

  static decodeAmount(scVal: unknown): bigint {
    return scValToBigInt(scVal as Parameters<typeof scValToBigInt>[0]);
  }
}
