import type { Metadata } from 'next';

import { ProposalList } from '@/components/governance/proposal-list';

export const metadata: Metadata = {
  title: 'Governance · StellarDAO',
  description: 'DAO governance — propose, vote, and execute protocol changes.',
};

export default function GovernancePage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="font-display text-3xl font-semibold text-white">Governance</h1>
        <p className="mt-2 max-w-2xl text-sm text-stellar-haze">
          StellarDAO is governed by token holders. Create proposals, delegate votes,
          and shape the future of the protocol.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <ProposalList />
        <aside className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white">Governance Stats</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Voting Period</dt>
                <dd className="mono text-stellar-cloud">~7 days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Quorum</dt>
                <dd className="mono text-stellar-cloud">4%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Proposal Threshold</dt>
                <dd className="mono text-stellar-cloud">1,000 tokens</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stellar-haze">Timelock Delay</dt>
                <dd className="mono text-stellar-cloud">2 days</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white">Your Delegation</h3>
            <p className="mt-2 text-xs text-stellar-haze">
              Connect your wallet to view your voting power and delegate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
