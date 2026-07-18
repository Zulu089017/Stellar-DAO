'use client';

import { useState } from 'react';

interface VotePanelProps {
  proposalId: number;
  hasVoted: boolean;
}

export function VotePanel({ proposalId, hasVoted }: VotePanelProps) {
  const [selected, setSelected] = useState<'for' | 'against' | 'abstain' | null>(null);
  const [submitted, setSubmitted] = useState(hasVoted);

  const submitVote = async () => {
    if (!selected) return;
    setSubmitted(true);
    // In production: call serverApi.castVote(proposalId, selected)
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-stellar-nova/20 bg-stellar-nova/5 p-6 text-center">
        <p className="text-sm font-medium text-stellar-nova">Vote cast successfully</p>
        <p className="mt-1 text-xs text-stellar-haze">
          Your voting power has been recorded for proposal #{proposalId}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
      <h3 className="mb-4 text-sm font-semibold text-white">Cast your vote</h3>
      <div className="mb-4 flex gap-3">
        {(['for', 'against', 'abstain'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setSelected(option)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              selected === option
                ? 'border-stellar-aurora bg-stellar-aurora/20 text-white'
                : 'border-white/10 text-stellar-haze hover:border-white/20 hover:text-white'
            }`}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <button
        onClick={submitVote}
        disabled={!selected}
        className="w-full rounded-lg bg-gradient-to-r from-stellar-aurora to-stellar-nova px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit vote
      </button>
    </div>
  );
}
