import { ethers } from 'ethers';

import type { LockEvent, SourceAdapter } from './types.js';

/**
 * Polygon adapter.
 *
 * Reads `Locked(address,uint256,bytes32,address)` events from the
 * Stellar Payment Gateway Vault contract deployed on Polygon. The vault program is
 * deliberately stubbed — production deploys supply `STELLAR_PAYMENT_GATEWAY_POLYGON_VAULT`
 * with the actual ERC-20 vault contract address.
 *
 * Mirrors `ethereum.ts` exactly: same event signature, same payload
 * layout, same ethers provider. The relay pipeline doesn't differentiate
 * between EVM chains; only the RPC URL and vault address change.
 */
export const polygonWatcher = async (rpcUrl: string): Promise<SourceAdapter> => ({
  async watch(overrideRpcUrl: string, emit: (event: LockEvent) => void): Promise<void> {
    const provider = new ethers.JsonRpcProvider(overrideRpcUrl || rpcUrl);
    // TODO: replace with the actual vault address used by Stellar Payment Gateway on Polygon.
    const vault = new ethers.Contract(
      process.env.STELLAR_PAYMENT_GATEWAY_POLYGON_VAULT ?? ethers.ZeroAddress,
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
