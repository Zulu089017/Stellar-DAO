'use client';

import { useEffect, useState, useCallback } from 'react';

interface BridgeEvent {
  id: string;
  type: string;
  timestamp: string;
  chain: string;
  txHash?: string;
}

export function ActivityMonitor() {
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback((data: string) => {
    try {
      const raw = JSON.parse(data) as Record<string, unknown>;
      const typeVal = typeof raw.type === 'string' ? raw.type : '';
      if (!typeVal) return;
      const idVal = typeof raw.id === 'string' ? raw.id : crypto.randomUUID();
      const tsVal = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString();
      const chainVal = typeof raw.chain === 'string' ? raw.chain : 'ethereum';
      const txHashVal = typeof raw.txHash === 'string' ? raw.txHash : undefined;
      setEvents((prev) => [
        { id: idVal, type: typeVal, timestamp: tsVal, chain: chainVal, txHash: txHashVal },
        ...prev.slice(0, 49),
      ]);
    } catch {
      /* ignore malformed data */
    }
  }, []);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    if (!apiBase) return;

    const es = new EventSource(`${apiBase}/events`);

    es.addEventListener('open', () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener('contract-event', (event) => {
      handleEvent((event as MessageEvent).data);
    });

    es.addEventListener('error', () => {
      setConnected(false);
      setError('SSE connection lost. Retrying…');
      // EventSource auto-reconnects by spec
    });

    return () => es.close();
  }, [handleEvent]);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Bridge Activity Monitor</h3>
        <span
          className={`inline-flex h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
      <p className="mt-1 text-xs text-stellar-haze">
        Real-time contract events from the bridge
        {!connected && <span className="ml-2 text-amber-400">(connecting…)</span>}
      </p>

      {error && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-4 max-h-64 overflow-y-auto space-y-1">
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-stellar-haze">
            {connected
              ? 'Connected — waiting for bridge events…'
              : 'Connecting to event stream…'}
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    event.type === 'MintRequested' ? 'bg-stellar-nova' : 'bg-stellar-comet'
                  }`}
                />
                <span className="text-stellar-cloud truncate">{event.type}</span>
                {event.txHash && (
                  <span className="mono text-stellar-haze hidden sm:inline truncate max-w-[100px]">
                    {event.txHash.slice(0, 8)}…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-stellar-haze shrink-0">
                <span className="hidden sm:inline">{event.chain}</span>
                <span className="mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
