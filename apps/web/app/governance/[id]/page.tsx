import type { Metadata } from 'next';
import Link from 'next/link';
import { VotePanel } from '@/components/governance/vote-panel';

export const metadata: Metadata = {
  title: 'Proposal · StellarDAO',
};

export default function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const proposalId = parseInt(params.id, 10);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/governance"
          className="text-sm text-stellar-haze hover:text-white transition"
        >
          ← Back to governance
        </Link>
      </div>

      <section>
        <div className="flex items-center gap-3">
          <span className="mono text-xs text-stellar-haze">#{params.id}</span>
          <span className="inline-flex items-center rounded-full bg-stellar-nova/20 px-2 py-0.5 text-xs font-medium text-stellar-nova ring-1 ring-inset ring-stellar-nova/30">
            Active
          </span>
        </div>
        <h1 className="font-display mt-2 text-2xl font-semibold text-white">
          Proposal #{params.id}
        </h1>
        <p className="mt-1 text-sm text-stellar-haze">
          Proposed by GABC... · Voting ends at ledger ~{999999 - proposalId * 1000}
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
            <h2 className="text-sm font-semibold text-white">Description</h2>
            <p className="mt-2 text-sm text-stellar-haze leading-relaxed">
              This proposal seeks to expand the StellarDAO bridge ecosystem by adding a new
              wrapped token, improving cross-chain liquidity and expanding the protocol's
              reach to more users and developers in the ecosystem.
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
            <h2 className="text-sm font-semibold text-white">Actions</h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-stellar-haze">Call contract</p>
                <p className="mono text-sm text-stellar-cloud">factory.create_wrapper</p>
                <p className="mono mt-1 text-xs text-stellar-haze">Target: C...</p>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white">Results</h3>
            <dl className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <dt className="text-green-400">For</dt>
                  <dd className="mono text-stellar-cloud">15,000</dd>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/5">
                  <div className="h-full w-[75%] rounded-full bg-green-500" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <dt className="text-stellar-flare">Against</dt>
                  <dd className="mono text-stellar-cloud">2,000</dd>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/5">
                  <div className="h-full w-[10%] rounded-full bg-stellar-flare" />
                </div>
              </div>
            </dl>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-stellar-haze">
                Quorum: 4% · Threshold: {">"}50% for votes
              </p>
            </div>
          </div>

          <VotePanel proposalId={proposalId} hasVoted={false} />
        </aside>
      </div>
    </div>
  );
}
