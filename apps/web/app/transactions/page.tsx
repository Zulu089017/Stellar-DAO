import type { Metadata } from 'next';

import { isSourceChain } from '@stellardao/shared';

import { ChainFilterChips } from '@/components/dashboard/chain-filter-chips';
import { TransactionsPanel } from '@/components/dashboard/transactions-panel';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Transactions · StellarDAO',
  description: 'Live wrap and unwrap transactions, streamed straight from Horizon.',
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ chain?: string; type?: string }>;
}) {
  const sp = await searchParams;
  /**
   * `?chain=ethereum` etc. — when present and a valid SourceChainId, we
   * ask the API for filtered rows. The chain filter chips live as a
   * server-rendered nav above the panel, so toggling them is a plain
   * Link navigation (shareable URL + faster initial paint).
   */
  const chain = isSourceChain(sp.chain) ? sp.chain : undefined;
  const initial = await serverApi
    .listTransactions({ limit: 100, sourceChain: chain })
    .catch(() => ({ transactions: [] }));

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <span className="text-xs uppercase tracking-widest text-stellar-nova">Settlement</span>
        <h1 className="text-3xl font-semibold text-white">Every wrap & unwrap, indexed</h1>
        <p className="max-w-2xl text-sm text-stellar-haze">
          Each row is observed straight from Horizon&apos;s Soroban event stream. Use the chain
          chips below to deep-link into a single source chain&apos;s wrap history.
        </p>
      </header>
      <ChainFilterChips active={chain} />
      <TransactionsPanel initial={initial.transactions} typeFilter={sp.type} />
    </div>
  );
}
