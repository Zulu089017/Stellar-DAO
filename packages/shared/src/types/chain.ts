/**
 * Every supported source chain surfaced by the relayer + dashboard.
 * Adding a new chain requires only an entry here plus a fresh watcher
 * inside `apps/relayer/src/sources/`.
 */
export type SourceChainId = 'ethereum' | 'solana' | 'polygon';

export const SOURCE_CHAINS: readonly SourceChainId[] = [
  'ethereum',
  'solana',
  'polygon',
] as const;

export type AssetId = {
  chain: SourceChainId;
  /** EVM: 0x-prefixed 20-byte address. Solana: base58 32-byte pubkey. */
  address: string;
};

/** Display helpers for the UI layer. */
export const CHAIN_LABELS: Record<SourceChainId, { name: string; symbol: string; explorer: string }> =
  {
    ethereum: { name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
    solana: { name: 'Solana', symbol: 'SOL', explorer: 'https://solscan.io' },
    polygon: { name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com' },
  };

export const chainLabel = (chain: SourceChainId) => CHAIN_LABELS[chain];

/* ── Source address validators — keep these consistent with the relayer ── */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isValidAddress = (chain: SourceChainId, address: string): boolean => {
  switch (chain) {
    case 'ethereum':
    case 'polygon':
      return EVM_ADDRESS.test(address);
    case 'solana':
      return SOLANA_ADDRESS.test(address);
  }
};

/**
 * Pre-built Set gives O(1) lookup for the type guard below. Typed as
 * `Set<string>` (not `Set<SourceChainId>`) so `.has(value)` accepts
 * `string` directly without a cast — the runtime invariant (only
 * SourceChainId strings ever end up in the set) still holds.
 */
const SOURCE_CHAIN_SET: ReadonlySet<string> = new Set<string>(SOURCE_CHAINS);

/**
 * Type guard for untrusted strings (URL search params, user input,
 * external API responses). Centralised here so the routes that promote
 * a `string | undefined` into a `SourceChainId` don't each re-implement
 * the `SOURCE_CHAINS.includes` dance.
 */
export const isSourceChain = (value: string | undefined): value is SourceChainId =>
  value !== undefined && SOURCE_CHAIN_SET.has(value);
