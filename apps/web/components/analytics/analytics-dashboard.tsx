'use client';

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
}

function MetricCard({ label, value, change }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-wider text-stellar-haze">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-white">{value}</p>
      {change && (
        <p
          className={`mt-1 text-xs ${
            change.startsWith('+') ? 'text-green-400' : 'text-stellar-flare'
          }`}
        >
          {change}
        </p>
      )}
    </div>
  );
}

export function AnalyticsDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">Protocol Analytics</h2>
        <p className="text-sm text-stellar-haze">
          Real-time metrics for the StellarDAO bridge protocol.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Value Locked" value="$0.00" />
        <MetricCard label="24h Volume" value="$0.00" />
        <MetricCard label="Total Transactions" value="0" />
        <MetricCard label="Active Users" value="0" change="+0 this week" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {['Ethereum', 'Solana', 'Polygon'].map((chain) => (
          <div
            key={chain}
            className="rounded-xl border border-white/5 bg-white/[0.03] p-5"
          >
            <h3 className="text-sm font-semibold text-white">{chain}</h3>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stellar-haze">TVL</span>
                <span className="mono text-stellar-cloud">$0.00</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stellar-haze">Volume</span>
                <span className="mono text-stellar-cloud">$0.00</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stellar-haze">Transactions</span>
                <span className="mono text-stellar-cloud">0</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stellar-haze">Relayer</span>
                <span className="inline-flex items-center gap-1 text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Unknown
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
