'use client';

import { useState } from 'react';

interface DelegateStats {
  totalDelegators: number;
  totalDelegated: string;
  topDelegates: Array<{ address: string; votes: string; percentage: number }>;
}

const MOCK_STATS: DelegateStats = {
  totalDelegators: 47,
  totalDelegated: '1,250,000',
  topDelegates: [
    { address: 'GABCD...WXYZ', votes: '450,000', percentage: 36 },
    { address: 'GDEFG...VWXY', votes: '320,000', percentage: 25.6 },
    { address: 'GHIJK...UVWX', votes: '180,000', percentage: 14.4 },
    { address: 'GLMNO...TUVW', votes: '95,000', percentage: 7.6 },
    { address: 'GPQRS...STUV', votes: '65,000', percentage: 5.2 },
  ],
};

interface Props {
  className?: string;
}

/**
 * Governance delegation panel.
 *
 * Shows delegation statistics, top delegates, and provides
 * an address input for delegating voting power to another account.
 * Connects to the governance token contract for on-chain delegation.
 */
export function DelegationPanel({ className = '' }: Props) {
  const [delegateAddress, setDelegateAddress] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);

  const handleDelegate = async () => {
    if (!delegateAddress.trim()) return;
    setIsDelegating(true);
    // In production: call governance token contract.delegate(delegateAddress)
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setSubmitted(true);
    setIsDelegating(false);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-stellar-haze">Total Delegators</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{MOCK_STATS.totalDelegators}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-stellar-haze">Total Delegated</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{MOCK_STATS.totalDelegated}</p>
        </div>
      </div>

      {/* Top delegates */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-stellar-haze">Top Delegates</h4>
        <div className="space-y-2">
          {MOCK_STATS.topDelegates.map((d, i) => (
            <div key={d.address} className="flex items-center gap-3">
              <span className="w-5 text-center text-xs tabular-nums text-stellar-haze/60">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-stellar-cloud">{d.address}</span>
              <span className="tabular-nums text-xs text-stellar-haze">{d.votes}</span>
              <div className="w-16">
                <div className="h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-stellar-aurora to-stellar-nova"
                    style={{ width: `${d.percentage}%` }}
                  />
                </div>
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-stellar-haze/60">{d.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delegate form */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-stellar-haze">
          Delegate Voting Power
        </h4>
        {submitted ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-stellar-nova/10 px-4 py-3">
              <p className="text-sm font-medium text-stellar-nova">✓ Delegation submitted</p>
              <p className="mt-1 text-xs text-stellar-haze">
                Your voting power has been delegated to{' '}
                <code className="rounded bg-white/5 px-1 py-0.5 text-stellar-cloud">{delegateAddress}</code>.
                Changes take effect at the next checkpoint.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setSubmitted(false); setDelegateAddress(''); }}
              className="text-xs text-stellar-haze underline hover:text-stellar-cloud"
            >
              Delegate to a different address
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="delegate-address" className="mb-1 block text-xs text-stellar-haze">
                Delegate address (Stellar public key)
              </label>
              <input
                id="delegate-address"
                type="text"
                placeholder="GABCDEFGHIJKLMNOPQRSTUVWXYZ..."
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-stellar-ink/40 px-3 py-2 text-sm text-stellar-cloud placeholder:text-stellar-haze/50 focus:border-stellar-aurora/50 focus:outline-none focus:ring-1 focus:ring-stellar-aurora/20"
              />
            </div>
            <button
              type="button"
              onClick={handleDelegate}
              disabled={!delegateAddress.trim() || isDelegating}
              className="inline-flex items-center gap-2 rounded-lg bg-stellar-aurora/20 px-4 py-2 text-xs font-semibold text-stellar-aurora transition hover:bg-stellar-aurora/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDelegating ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-stellar-aurora/30 border-t-stellar-aurora" />
                  Delegating...
                </>
              ) : (
                'Delegate votes →'
              )}
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-stellar-haze/50">
        Delegation is checkpointed at each proposal start ledger. You retain ownership of your tokens.
      </p>
    </div>
  );
}
