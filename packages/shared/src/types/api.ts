import type { AssetId } from './chain.js';
import type { Transaction } from './transaction.js';

export type CreateAssetRequest = {
  source: AssetId;
  name: string;
  symbol: string;
  decimals: number;
};

export type CreateAssetResponse = {
  wrapperToken: string;
  txHash: string;
};

export type ListAssetsResponse = {
  assets: Array<{
    id: string;
    source: AssetId;
    wrapperToken: string;
    symbol: string;
    name: string;
    decimals: number;
  }>;
  /**
   * Opaque cursor for the next page. The client passes it back as
   * `?cursor=<value>` to read the slice immediately after this one,
   * ordered by the asset registry's composite primary key
   * (`${chain}:${lowercase(address)}`, lexicographic ASC).
   *
   * `nextCursor` is OMITTED from the JSON response when the
   * current page is the last one — clients should round-trip the
   * request with the last-seen `nextCursor` once and detect the
   * final empty page OR check that the returned `assets.length`
   * is less than `?limit=` (mirroring how transactions pagination
   * signals exhaustion). Undefined-on-the-wire matches the
   * optional-fields convention the rest of the API uses (see
   * `Transaction.sourceTxHash` for the canonical example).
   */
  nextCursor?: string;
};

export type GetTransactionResponse = {
  transaction: Transaction;
};

export type ListTransactionsResponse = {
  transactions: Transaction[];
};

export type HealthResponse = {
  status: 'ok';
  network: string;
  horizon: 'reachable' | 'down';
  contracts: {
    bridge: string;
    factory: string;
    wrapperTokenTemplate: string;
  };
};
