'use client';

import { useEffect, useState } from 'react';
import { StatusDot } from '@stellardao/ui';
import type { Transaction } from '@stellardao/shared';

import { ChainBadge } from '@/components/atoms/chain-badge';
import { AddressDisplay } from '@/components/atoms/address-display';

export const TransactionFeed = ({ initial }: { initial: Transaction[] }) => {
  const [items, setItems] = useState<Transaction[]>(initial);
  const [streamOn, setStreamOn] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!streamOn) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const es = new EventSource(`${apiBase}/events`);

    /**
     * Merge an incoming transaction row from any SSE event type.
     * Either event shape is `Transaction` (the bus broadcasts raw
     * rows; Horizon events are projected into the same shape so a
     * Soroban mint lands on the feed identically to a wrap).
     * De-dupe by id so lifecycle walks (`pending → completed`) and
     * duplicate deliveries don't prepend phantom entries.
     */
    const upsertItem = (tx: Transaction) => {
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === tx.id);
        if (idx === -1) return [tx, ...prev.slice(0, 19)];
        const next = [...prev];
        next[idx] = tx;
        return next;
      });
    };

    es.addEventListener('transaction-update', (event) => {
      try {
        upsertItem(JSON.parse((event as MessageEvent).data) as Transaction);
      } catch {
        /* ignore malformed events */
      }
    });
    es.addEventListener('contract-event', (event) => {
      try {
        upsertItem(JSON.parse((event as MessageEvent).data) as Transaction);
      } catch {
        /* ignore malformed events */
      }
    });

    return () => es.close();
  }, [streamOn]);

  return (
    <div className="glass-panel overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3 text-xs uppercase tracking-widest text-stellar-haze">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-emerald-400" />
          Live · Horizon Soroban events
        </div>
        <button
          type="button"
          onClick={() => setStreamOn((v) => !v)}
          className="focus-ring rounded-md border border-white/10 px-2 py-0.5 text-[10px] hover:bg-white/10"
        >
          {streamOn ? 'Pause stream' : 'Resume stream'}
        </button>
      </div>
      {!mounted ? (
        <ul className="divide-y divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="shimmer-stripe h-14 bg-stellar-steel/40" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="p-10 text-center text-sm text-stellar-haze">
          No transactions yet. Wrap a token to see it show up here.
        </div>
      ) : (
        <ul className="divide-y divide-white/5 text-sm">
          {items.map((tx) => (
            <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 bg-stellar-slate/30 px-5 py-3">
              <div className="flex items-center gap-3">
                <ChainBadge chain={tx.sourceChain} />
                <div>
                  <p className="font-mono text-xs text-stellar-cloud">
                    {tx.amount} · {tx.sourceToken.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-stellar-haze">to <AddressDisplay value={tx.recipient} truncateChars={4} /></p>
                </div>
              </div>
              <StatusDot status={tx.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
