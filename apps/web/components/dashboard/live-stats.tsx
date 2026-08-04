'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@stellar-payment-gateway/shared';

export const LiveStats = ({ initial }: { initial: HealthResponse | null }) => {
  const [data, setData] = useState<HealthResponse | null>(initial);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/health`);
        if (res.ok) setData((await res.json()) as HealthResponse);
      } catch {
        /* ignore — keep previous value */
      }
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const cards = [
    {
      label: 'Network',
      value: data?.network ?? 'TESTNET',
      tone: 'text-white',
    },
    {
      label: 'Horizon',
      value: data?.horizon === 'reachable' ? 'live' : data?.horizon === 'down' ? 'down' : '—',
      tone: data?.horizon === 'reachable' ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Bridge contract',
      value: data?.contracts.bridge ? `${data.contracts.bridge.slice(0, 4)}…${data.contracts.bridge.slice(-4)}` : 'unset',
      tone: 'text-stellar-cloud',
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3 text-sm">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-white/10 hover:bg-white/10">
          <dt className="text-[10px] uppercase tracking-widest text-stellar-haze">{c.label}</dt>
          <dd className={`mt-1 font-mono text-base ${c.tone}`}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
};
