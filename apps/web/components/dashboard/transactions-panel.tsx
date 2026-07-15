'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { StatusDot } from '@stellardao/ui';
import type { Transaction, TxStatus } from '@stellardao/shared';

import { ChainBadge } from '@/components/atoms/chain-badge';

const statusFilters: TxStatus[] = ['pending', 'attesting', 'minting', 'completed', 'failed', 'refunded'];

/**
 * Refining transaction filter UI.
 *
 * The chain-level filter has moved server-side (URL param
 * `?chain=X` + API `sourceChain` filter), so this component only
 * narrows the loaded set by status / type / free-text search. The
 * page-level chain filter gives sharable URLs and zero round-trip
 * re-filtering on the client.
 */
export const TransactionsPanel = ({
  initial,
  typeFilter,
}: {
  initial: Transaction[];
  typeFilter?: string;
}) => {
  const [type, setType] = useState(typeFilter ?? 'all');
  const [status, setStatus] = useState<TxStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return initial.filter((tx) => {
      if (type !== 'all' && tx.type !== type) return false;
      if (status !== 'all' && tx.status !== status) return false;
      if (search && !tx.id.includes(search) && !tx.sourceToken.includes(search)) return false;
      return true;
    });
  }, [initial, type, status, search]);

  return (
    <div className="space-y-6">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3 text-xs">
        <input
          type="search"
          placeholder="Search by id / token / nonce"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="focus-ring flex-1 rounded-lg border border-white/10 bg-stellar-ink/40 px-3 py-1.5 text-stellar-cloud placeholder:text-stellar-haze"
        />
        <div className="flex gap-1">
          <FilterChip active={type === 'all'} onClick={() => setType('all')} label="wrap+unwrap" />
          <FilterChip active={type === 'wrap'} onClick={() => setType('wrap')} label="wrap" />
          <FilterChip active={type === 'unwrap'} onClick={() => setType('unwrap')} label="unwrap" />
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')} label="any status" />
          {statusFilters.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)} label={s} />
          ))}
        </div>
      </div>

      <div className="glass-panel overflow-hidden rounded-3xl">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-stellar-haze">
            <p>No matching transactions.</p>
            <Link
              href="/wrap"
              className="focus-ring inline-flex rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              Start a wrap →
            </Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-stellar-haze">
              <tr>
                <th className="px-5 py-3">Tx</th>
                <th className="px-5 py-3">Chain</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((tx) => (
                <tr key={tx.id} className="bg-stellar-slate/40 transition hover:bg-stellar-slate/60">
                  <td className="mono px-5 py-3 text-xs text-stellar-cloud">{tx.id}</td>
                  <td className="px-5 py-3"><ChainBadge chain={tx.sourceChain} /></td>
                  <td className="mono px-5 py-3 text-xs text-stellar-cloud">{tx.amount}</td>
                  <td className="mono truncate px-5 py-3 text-xs text-stellar-haze">{tx.recipient}</td>
                  <td className="px-5 py-3"><StatusDot status={tx.status} /></td>
                  <td className="px-5 py-3 text-xs text-stellar-haze">{tx.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const FilterChip = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`focus-ring rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest transition ${
      active
        ? 'border-stellar-aurora/40 bg-stellar-aurora/15 text-white'
        : 'border-white/10 text-stellar-haze hover:border-white/20 hover:text-white'
    }`}
  >
    {label}
  </button>
);
