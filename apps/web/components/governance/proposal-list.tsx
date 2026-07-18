'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Proposal {
  id: number;
  proposer: string;
  description: string;
  status: string;
  forVotes: string;
  againstVotes: string;
  endLedger: number;
}

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 1,
    proposer: 'GABC...1234',
    description: 'Add Solana USDC as a supported wrapped token on Stellar',
    status: 'active',
    forVotes: '15000000000000000000000',
    againstVotes: '2000000000000000000000',
    endLedger: 999999,
  },
  {
    id: 0,
    proposer: 'GDEF...5678',
    description: 'Reduce protocol fee from 10 bps to 5 bps',
    status: 'executed',
    forVotes: '25000000000000000000000',
    againstVotes: '0',
    endLedger: 900000,
  },
];

const statusColors: Record<string, string> = {
  active: 'bg-stellar-nova/20 text-stellar-nova ring-stellar-nova/30',
  succeeded: 'bg-green-500/20 text-green-400 ring-green-500/30',
  queued: 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30',
  executed: 'bg-green-500/20 text-green-400 ring-green-500/30',
  defeated: 'bg-stellar-flare/20 text-stellar-flare ring-stellar-flare/30',
  canceled: 'bg-stellar-haze/20 text-stellar-haze ring-stellar-haze/30',
};

export function ProposalList() {
  const [filter, setFilter] = useState<string>('all');

  const filtered = MOCK_PROPOSALS.filter(
    (p) => filter === 'all' || p.status === filter,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Governance Proposals</h2>
        <div className="flex gap-2">
          {['all', 'active', 'succeeded', 'executed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? 'bg-stellar-aurora/30 text-white'
                  : 'text-stellar-haze hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((proposal) => (
          <Link
            key={proposal.id}
            href={`/governance/${proposal.id}`}
            className="block rounded-xl border border-white/5 bg-white/[0.03] p-5 transition hover:border-white/10 hover:bg-white/[0.05]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="mono text-xs text-stellar-haze">#{proposal.id}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      statusColors[proposal.status] ?? 'text-stellar-haze'
                    }`}
                  >
                    {proposal.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-stellar-cloud">
                  {proposal.description}
                </p>
                <p className="mono text-xs text-stellar-haze">
                  by {proposal.proposer}
                </p>
              </div>
              <div className="text-right text-xs text-stellar-haze">
                <p className="mono text-stellar-cloud">{proposal.forVotes.slice(0, 6)} for</p>
                <p>{proposal.againstVotes.slice(0, 6)} against</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
