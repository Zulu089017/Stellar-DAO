'use client';

import { useEffect, useState } from 'react';

interface BridgeEvent {
  id: string;
  type: string;
  timestamp: string;
  chain: string;
}

export function ActivityMonitor() {
  const [events, setEvents] = useState<BridgeEvent[]>([]);

  useEffect(() => {
    // Placeholder: subscribe to bridge events via SSE.
    const pickChain = (): string => {
      const chains: string[] = ['ethereum', 'solana', 'polygon'];
      return chains[Math.floor(Math.random() * chains.length)] ?? 'ethereum';
    };
    const interval = setInterval(() => {
      setEvents((prev) => {
        const next = [
          {
            id: crypto.randomUUID(),
            type: Math.random() > 0.5 ? 'MintRequested' : 'BurnRequested',
            timestamp: new Date().toISOString(),
            chain: pickChain(),
          },
          ...prev.slice(0, 19),
        ];
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold text-white">Bridge Activity Monitor</h3>
      <p className="mt-1 text-xs text-stellar-haze">Real-time contract events from the bridge</p>

      <div className="mt-4 max-h-64 overflow-y-auto space-y-1">
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-stellar-haze">
            Waiting for bridge events…
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    event.type === 'MintRequested' ? 'bg-stellar-nova' : 'bg-stellar-comet'
                  }`}
                />
                <span className="text-stellar-cloud">{event.type}</span>
              </div>
              <div className="flex items-center gap-3 text-stellar-haze">
                <span>{event.chain}</span>
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
