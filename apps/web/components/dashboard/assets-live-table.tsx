'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssetRegistryEntry } from '@stellardao/shared';

import { AssetsTable } from '@/components/dashboard/assets-table';

/**
 * Client-side wrapper around {@link AssetsTable} that subscribes to the
 * API's `asset-update` SSE channel and triggers a server re-fetch
 * (`router.refresh()`) whenever the asset bus broadcasts a change.
 *
 * Why `router.refresh()` instead of merging the SSE payload into local
 * state? Two reasons:
 *   1. The server is the single source of truth — `GET /assets` is
 *      paginated, sorted and filtered, so an out-of-order SSE delivery
 *      merged into client state could disagree with the canonical list.
 *   2. `router.refresh()` re-runs the server component without
 *      unmounting this client component, so the EventSource stays
 *      open across refreshes — no resubscribe churn.
 *
 * The bus envelope is `{ entry, updateType }` (see
 * `apps/api/src/sse/horizon-bridge.ts`); we ignore `entry`/`updateType`
 * here because the next paint comes from the server.
 *
 * The status dot reflects two independent booleans: whether the user
 * has paused the stream AND whether the underlying EventSource has an
 * open connection (so a dead/reconnecting SSE doesn't masquerade as
 * "live").
 */
export const AssetsLiveTable = ({ initial }: { initial: AssetRegistryEntry[] }) => {
  const router = useRouter();
  const [streamOn, setStreamOn] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!streamOn) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const es = new EventSource(`${apiBase}/events`);

    es.onopen = () => setConnected(true);
    es.addEventListener('asset-update', () => {
      // The payload carries the new entry + updateType, but we let the
      // server produce the next list. This keeps cursor-pagination,
      // chain-filters, and any future sort order canonical.
      router.refresh();
    });
    // `error` fires both on transient drops (browser auto-reconnects)
    // and on hard failures (404, CORS, etc.). Either way, flip the
    // connection indicator so the dot doesn't claim "live" while the
    // socket is dead. `onopen` will re-arm it on the next reconnect.
    es.addEventListener('error', () => setConnected(false));

    return () => {
      es.close();
      setConnected(false);
    };
  }, [streamOn, router]);

  const statusLabel = !streamOn
    ? 'paused'
    : connected
      ? 'live · asset-update'
      : 'reconnecting';
  const statusClass = !streamOn
    ? 'text-stellar-haze/70'
    : connected
      ? 'text-emerald-400'
      : 'text-amber-400';
  const dotClass = !streamOn
    ? 'bg-stellar-haze/40'
    : connected
      ? 'bg-emerald-400 animate-pulse-soft'
      : 'bg-amber-400 animate-pulse-soft';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3 text-xs uppercase tracking-widest">
        <span
          className={`inline-flex items-center gap-2 ${statusClass}`}
          aria-live="polite"
          aria-label={
            !streamOn
              ? 'Asset stream paused'
              : connected
                ? 'Asset stream live'
                : 'Asset stream reconnecting'
          }
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          {statusLabel}
        </span>
        <button
          type="button"
          onClick={() => setStreamOn((v) => !v)}
          className="focus-ring rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-stellar-haze hover:border-white/20 hover:bg-white/10 hover:text-stellar-cloud"
        >
          {streamOn ? 'Pause stream' : 'Resume stream'}
        </button>
      </div>
      <AssetsTable assets={initial} />
    </div>
  );
};
