import { ethers } from 'ethers';

import type { LockEvent, SourceAdapter } from './types.js';

/**
 * Ethereum adapter.
 *
 * Returns a `SourceAdapter` whose `watch` method opens a `Locked(...)`
 * subscription on the Stellar Payment Gateway Vault contract. Hex-decodes the event
 * payload directly into the bridge `LockPayload` layout.
 *
 * The factory itself does not connect; the connection is established
 * lazily inside `watch` so the relayer can boot even when a single chain
 * RPC is unavailable.
 */
export const ethereumWatcher = async (rpcUrl: string): Promise<SourceAdapter> => ({
  async watch(overrideRpcUrl: string, emit: (event: LockEvent) => void): Promise<void> {
    const provider = new ethers.JsonRpcProvider(overrideRpcUrl || rpcUrl);
    // TODO: replace with the actual vault address used by Stellar Payment Gateway L1 Ethereum.
    const vault = new ethers.Contract(
      process.env.STELLAR_PAYMENT_GATEWAY_ETH_VAULT ?? ethers.ZeroAddress,
      [
        'event Locked(address indexed token, uint256 amount, bytes32 indexed nonce, address indexed sender)',
      ],
      provider,
    );

    vault.on('Locked', (token, amount, nonce, sender) => {
      emit({
        sourceToken: token as string,
        wrapperToken: '0x' + '00'.repeat(32),
        recipient: sender as string,
        amount: amount.toString(),
        nonce: '0x' + Buffer.from(nonce.slice(2), 'hex').toString('hex'),
      } satisfies LockEvent);
    });
  },
});
