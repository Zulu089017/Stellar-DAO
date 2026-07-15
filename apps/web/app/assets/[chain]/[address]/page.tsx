import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chainLabel, isSourceChain } from '@stellardao/shared';

import { ChainBadge } from '@/components/atoms/chain-badge';
import { AddressDisplay } from '@/components/atoms/address-display';
import { EventStreamPanel } from '@/components/dashboard/event-stream-panel';
import { serverApi } from '@/lib/server-api';

type Params = { chain: string; address: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { address, chain } = await params;
  return {
    title: `${address.slice(0, 6)}…${address.slice(-4)} · StellarDAO`,
    description: `Wrap detail for ${chainLabel(chain as never)?.name ?? chain} token ${address}.`,
  };
}

export default async function AssetDetailPage({ params }: { params: Promise<Params> }) {
  const { chain, address } = await params;
  if (!isSourceChain(chain)) notFound();

  const [assets, transactions] = await Promise.all([
    serverApi.listAssets().catch(() => ({ assets: [] })),
    serverApi
      .listTransactions({ limit: 50, sourceChain: chain })
      .catch(() => ({ transactions: [] })),
  ]);

  const asset = assets.assets.find((a) => a.source.address.toLowerCase() === address.toLowerCase());
  if (!asset) {
    return (
      <div className="glass-panel rounded-2xl p-10 text-center">
        <h1 className="text-xl font-semibold text-white">No wrapper-token yet</h1>
        <p className="mt-2 text-sm text-stellar-haze">
          Once a developer calls <code className="mono text-stellar-cloud">factory.create_wrapper</code>{' '}
          for this address, the wrapper appears here.
        </p>
        <Link
          href="/wrap"
          className="focus-ring mt-6 inline-flex rounded-xl bg-stellar-aurora px-4 py-2 text-sm font-semibold text-white"
        >
          Create the wrap →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="glass-panel rounded-3xl border border-white/5 p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <ChainBadge chain={chain} />
            <h1 className="text-3xl font-semibold text-white">{asset.name}</h1>
            <p className="text-sm text-stellar-haze">
              {asset.symbol} · wrapped on Stellar via factory contract{' '}
              <AddressDisplay value={asset.wrapperToken} truncateChars={6} />
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-6 self-start text-sm">
            <div>
              <dt className="text-stellar-haze">Decimals</dt>
              <dd className="mono text-white">{asset.decimals}</dd>
            </div>
            <div>
              <dt className="text-stellar-haze">Source</dt>
              <dd className="mono text-white">{chain}</dd>
            </div>
            <div>
              <dt className="text-stellar-haze">Kind</dt>
              <dd className="mono text-white">wrapper-token</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
          Live events for this wrapper
        </h2>
        <EventStreamPanel
          contractId={asset.wrapperToken}
          placeholder="Listening to Horizon for wrapper-token Transfer, Mint and Burn events…"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
          Related transactions
        </h2>
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
          {transactions.transactions
            .filter((t) => t.sourceToken.toLowerCase() === address.toLowerCase())
            .slice(0, 20)
            .map((tx) => (
              <li key={tx.id} className="flex items-center justify-between bg-stellar-slate/40 px-5 py-3 text-sm">
                <span className="mono text-stellar-cloud">{tx.id}</span>
                <span className="text-xs text-stellar-haze">{tx.status}</span>
              </li>
            ))}
          {transactions.transactions.length === 0 && (
            <li className="px-5 py-6 text-center text-xs text-stellar-haze">No transactions yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
