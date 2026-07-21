import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import type { SourceChainId, Transaction } from '@stellardao/shared';
import { ChainBadge } from '@/components/atoms/chain-badge';
import { StatusDot } from '@stellardao/ui';
import { TransactionTimeline } from '@/components/dashboard/transaction-timeline';

/**
 * Generate explorer URLs for blockchain transactions.
 */
const EXPLORER_URLS: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx',
  solana: 'https://solscan.io/tx',
  polygon: 'https://polygonscan.com/tx',
  stellar: 'https://stellar.expert/explorer/testnet/tx',
};

export const metadata: Metadata = {
  title: 'Transaction · StellarDAO',
};

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tx: Transaction | null = await serverApi
    .getTransaction(id)
    .catch(() => null);

  if (!tx) {
    notFound();
  }

  const explorerUrl = (chain: string, hash: string) => {
    const base = EXPLORER_URLS[chain] ?? '';
    return base ? `${base}/${hash}` : null;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/transactions"
          className="text-sm text-stellar-haze hover:text-white transition"
        >
          ← Back to transactions
        </Link>
      </div>

      <section>
        <h1 className="font-display text-2xl font-semibold text-white">
          Transaction{' '}
          <span className="mono text-stellar-haze">{id.slice(0, 12)}…{id.slice(-6)}</span>
        </h1>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* Transaction Details */}
        <div className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Status Timeline</h2>
            <TransactionTimeline
              status={tx.status}
              sourceChain={tx.sourceChain}
              sourceTxHash={tx.sourceTxHash ?? null}
              stellarTxHash={tx.stellarTxHash ?? null}
              createdAt={tx.createdAt}
              updatedAt={tx.updatedAt}
            />
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Status</dt>
                <dd>
                  <StatusDot status={tx.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Type</dt>
                <dd className="mono text-stellar-cloud">{tx.type ?? 'wrap'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Source Chain</dt>
                <dd>
                  <ChainBadge chain={tx.sourceChain as SourceChainId} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Amount</dt>
                <dd className="mono text-stellar-cloud">{tx.amount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Recipient</dt>
                <dd className="mono text-xs text-stellar-cloud">
                  {tx.recipient}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Source Token</dt>
                <dd className="mono text-xs text-stellar-cloud">
                  {tx.sourceToken}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Created</dt>
                <dd className="mono text-xs text-stellar-cloud">
                  {new Date(tx.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Updated</dt>
                <dd className="mono text-xs text-stellar-cloud">
                  {new Date(tx.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Blockchain Explorer Links */}
        <div className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Blockchain Data</h2>
            <div className="space-y-4">
              {tx.sourceTxHash && (
                <div className="space-y-1.5">
                  <p className="text-xs uppercase tracking-widest text-stellar-haze">
                    Source Transaction
                  </p>
                  <a
                    href={explorerUrl(tx.sourceChain, tx.sourceTxHash) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono block break-all rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-stellar-cloud hover:bg-white/10 hover:border-stellar-nova/30 transition-all"
                  >
                    {tx.sourceTxHash}
                    <span className="ml-2 inline-block text-stellar-nova">↗</span>
                  </a>
                </div>
              )}
              {tx.stellarTxHash && (
                <div className="space-y-1.5">
                  <p className="text-xs uppercase tracking-widest text-stellar-haze">
                    Stellar Transaction
                  </p>
                  <a
                    href={explorerUrl('stellar', tx.stellarTxHash) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono block break-all rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-stellar-cloud hover:bg-white/10 hover:border-stellar-nova/30 transition-all"
                  >
                    {tx.stellarTxHash}
                    <span className="ml-2 inline-block text-stellar-nova">↗</span>
                  </a>
                </div>
              )}
              {!tx.sourceTxHash && !tx.stellarTxHash && (
                <p className="text-xs text-stellar-haze">
                  Transaction hashes will appear here once confirmed on-chain.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Explorer Links</h2>
            <div className="space-y-2">
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-stellar-haze hover:bg-white/5 hover:text-stellar-nova transition-all"
              >
                <span className="inline-block w-4 text-center">✦</span>
                View on Stellar.Expert
                <span className="ml-auto text-stellar-nova">↗</span>
              </a>
              <a
                href={`https://laboratory.stellar.org/#explorer?network=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-stellar-haze hover:bg-white/5 hover:text-stellar-nova transition-all"
              >
                <span className="inline-block w-4 text-center">🔬</span>
                Open Stellar Lab
                <span className="ml-auto text-stellar-nova">↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
