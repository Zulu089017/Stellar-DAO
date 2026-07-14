/**
 * Factory SDK wrapper. Wraps create_wrapper() with a typed helper.
 */
import {
  Account,
  Address,
  type Keypair,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import type { AssetId } from '@stellardao/shared';

export type CreateWrapperInput = {
  sourceChain: AssetId['chain'];
  sourceToken: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type FactoryInvokeOptions = {
  factoryContractId: string;
  sourceKeypair: Keypair;
  networkPassphrase: string;
  sorobanRpcUrl: string;
  fee?: number;
};

export class FactoryContract {
  constructor(public readonly contractId: string) {}

  buildCreateWrapperAsset(developerPK: string, input: CreateWrapperInput) {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: 'create_wrapper',
      args: [
        new Address(developerPK).toScVal(),
        // On-chain `Factory::create_wrapper` takes `source_chain` as
        // `soroban_sdk::String` (not `Symbol`) since the 21.7.7 WASM build
        // — `Symbol::to_string()` is stripped from the WASM target of
        // soroban-sdk and the contract's `build_salt` reads the chain's
        // raw bytes via `String::copy_into_slice`. The off-chain digest in
        // `packages/sdk/src/attestation.ts::buildLockDigest` already uses
        // UTF-8 bytes (`encoder.encode(sourceChain)`), so the on-chain
        // `String` and the off-chain `string` line up byte-for-byte.
        nativeToScVal(input.sourceChain, { type: 'string' }),
        nativeToScVal(Buffer.from(input.sourceToken.replace(/^0x/, ''), 'hex')),
        nativeToScVal(Buffer.from(input.name)),
        nativeToScVal(Buffer.from(input.symbol)),
        nativeToScVal(input.decimals, { type: 'u32' }),
      ],
    });
  }

  async simulateAndSubmit(
    opts: FactoryInvokeOptions,
    op: ReturnType<typeof Operation.invokeContractFunction>,
  ): Promise<string> {
    const tx = new TransactionBuilder(
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
      throw new Error(`factory simulation failed: ${simulated.error}`);
    }
    const prepared = SorobanRpc.assembleTransaction(tx, simulated).build();
    prepared.sign(opts.sourceKeypair);
    const sent = await server.sendTransaction(prepared);
    return sent.hash;
  }
}
