import Link from 'next/link';

import { AssetsTable } from '@/components/dashboard/assets-table';
import { TransactionFeed } from '@/components/dashboard/transaction-feed';
import { LiveStats } from '@/components/dashboard/live-stats';
import { BridgeDiagram } from '@/components/landing/bridge-diagram';
import { FaqSection } from '@/components/landing/faq-section';
import { serverApi } from '@/lib/server-api';

export default async function HomePage() {
  const [assets, transactions, stats] = await Promise.all([
    serverApi.listAssets().catch(() => ({ assets: [] })),
    serverApi.listTransactions({ limit: 8 }).catch(() => ({ transactions: [] })),
    serverApi.health().catch(() => null),
  ]);

  return (
    <div className="space-y-24">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-white/5 bg-aurora-gradient px-8 py-16 lg:px-14 lg:py-24">
        <div
          className="absolute inset-0 -z-10 opacity-50"
          aria-hidden
          style={{ backgroundImage: 'radial-gradient(60% 60% at 20% 0%, rgba(124,92,255,0.35), transparent), radial-gradient(40% 40% at 80% 0%, rgba(34,211,238,0.30), transparent)' }}
        />
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-stellar-haze">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-stellar-nova" />
              Live · Testnet
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Wrap any ERC-20, SPL or Polygon token onto Stellar
              <span className="block bg-gradient-to-r from-stellar-aurora via-stellar-nova to-white bg-clip-text text-transparent">
                in one keystone transaction.
              </span>
            </h1>
            <p className="max-w-xl text-base text-stellar-haze sm:text-lg">
              Stellar Payment Gateway is a middleware that listens to your source chain, posts a signed
              attestation to the bridge contract, and mints a wrapped SAC-level token on
              Stellar — finality in under 5 seconds and fees measured in cents of a cent.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/wrap"
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Start a wrap →
              </Link>
              <Link
                href="/transactions"
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-stellar-cloud hover:border-white/20 hover:bg-white/10"
              >
                See live feed
              </Link>
            </div>
            <LiveStats initial={stats} />
          </div>
          <BridgeDiagram />
        </div>
      </section>

      {/* ── Asset registry + live feed ───────────────────────── */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Live asset registry</h2>
            <p className="text-sm text-stellar-haze">Every wrapper deployed via the factory contract.</p>
          </div>
          <Link
            href="/assets"
            className="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stellar-haze hover:border-white/20 hover:text-white"
          >
            View all assets →
          </Link>
        </div>
        <AssetsTable assets={assets.assets} />
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Real-time settlement feed</h2>
            <p className="text-sm text-stellar-haze">
              Streaming straight from Horizon. Every <code className="mono text-stellar-cloud">MintRequested</code>{' '}
              event from the bridge surfaces here as you watch.
            </p>
          </div>
          <Link
            href="/transactions"
            className="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stellar-haze hover:border-white/20 hover:text-white"
          >
            Open transactions →
          </Link>
        </div>
        <TransactionFeed initial={transactions.transactions} />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <FaqSection />
    </div>
  );
}
