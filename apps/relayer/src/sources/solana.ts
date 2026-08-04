import { Connection, PublicKey } from '@solana/web3.js';

import type { LockEvent, SourceAdapter } from './types.js';

/**
 * Solana adapter.
 *
 * Returns a `SourceAdapter` whose `watch` method opens a `programAccount`
 * subscription against the Stellar Payment Gateway Vault program on Solana. The real
 * implementation should use `program.addEventListener('Locked', ...)` from
 * Anchor; the scaffold uses the lowest-level RPC subscription so it runs
 * without an IDL fixture.
 */
export const solanaWatcher = async (rpcUrl: string): Promise<SourceAdapter> => ({
  async watch(overrideRpcUrl: string, emit: (event: LockEvent) => void): Promise<void> {
    const connection = new Connection(overrideRpcUrl || rpcUrl, 'processed');
    const programId = new PublicKey(
      process.env.STELLAR_PAYMENT_GATEWAY_SOL_VAULT ?? PublicKey.default.toBase58(),
    );

    // Subscribe to program account changes — the simplest scaffold that
    // doesn't require an Anchor IDL. Real impl should pass through an
    // event-parser that decodes Anchor's `Locked` event.
    await connection.onProgramAccountChange(programId, (info) => {
      const data = info.accountInfo.data;
      if (data.length < 96) return;
      emit({
        sourceToken: new PublicKey(data.slice(8, 40)).toBase58(),
        wrapperToken: Buffer.alloc(32).toString('hex'),
        recipient: new PublicKey(data.slice(40, 72)).toBase58(),
        amount: data.readBigUInt64LE(72).toString(),
        nonce: Buffer.from(data.slice(80, 112)).toString('hex'),
      } satisfies LockEvent);
    });
  },
});
