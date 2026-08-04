'use client';

export const BridgeDiagram = () => (
  <div className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/5 bg-stellar-midnight/60 shadow-glow">
    <div
      className="absolute inset-0 opacity-60"
      aria-hidden
      style={{
        backgroundImage:
          'radial-gradient(60% 70% at 20% 50%, rgba(124,92,255,0.30), transparent), radial-gradient(60% 70% at 80% 50%, rgba(34,211,238,0.25), transparent)',
      }}
    />
    <svg
      viewBox="0 0 400 300"
      className="relative h-full w-full"
      role="img"
      aria-label="Three source chains feeding into the Stellar Payment Gateway bridge and out to Stellar."
    >
      <defs>
        <linearGradient id="packet" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.0" />
          <stop offset="50%" stopColor="#7c5cff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Source chains */}
      {[
        { y: 60, label: 'Ethereum' },
        { y: 150, label: 'Polygon' },
        { y: 240, label: 'Solana' },
      ].map((row) => (
        <g key={row.label}>
          <circle cx="40" cy={row.y} r="22" fill="#111728" stroke="rgba(255,255,255,0.15)" />
          <text x="40" y={row.y + 4} textAnchor="middle" className="fill-stellar-haze text-[10px] font-semibold uppercase">
            {row.label}
          </text>
          <line x1="62" y1={row.y} x2="180" y2="150" stroke="rgba(255,255,255,0.15)" strokeDasharray="4 6" />
        </g>
      ))}

      {/* Bridge */}
      <g transform="translate(180, 150)">
        <rect x="-30" y="-30" width="80" height="60" rx="18" fill="#1b233a" stroke="#7c5cff" strokeWidth="1.5" />
        <text x="10" y="-6" textAnchor="middle" className="fill-stellar-cloud text-[12px] font-bold">
          bridge
        </text>
        <text x="10" y="10" textAnchor="middle" className="fill-stellar-haze text-[9px] uppercase tracking-widest">
          attest
        </text>
      </g>

      {/* Stellar */}
      <g transform="translate(340, 150)">
        <circle cx="0" cy="0" r="34" fill="#111728" stroke="#22d3ee" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="14" fill="rgba(34,211,238,0.25)" />
        <text x="0" y="4" textAnchor="middle" className="fill-stellar-cloud text-[12px] font-semibold">
          Stellar
        </text>
      </g>

      {/* Animated packets */}
      <rect x="0" y="0" width="40" height="6" rx="3" fill="url(#packet)">
        <animate attributeName="x" from="62" to="180" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="y" from="60" to="150" dur="2.4s" repeatCount="indefinite" />
      </rect>
      <rect x="0" y="0" width="40" height="6" rx="3" fill="url(#packet)">
        <animate attributeName="x" from="62" to="180" dur="2.4s" begin="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" from="150" to="150" dur="2.4s" begin="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="0" y="0" width="40" height="6" rx="3" fill="url(#packet)">
        <animate attributeName="x" from="62" to="180" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="y" from="240" to="150" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
      </rect>

      {/* Output packets */}
      <rect x="0" y="0" width="40" height="6" rx="3" fill="url(#packet)">
        <animate attributeName="x" from="210" to="306" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="y" from="150" to="150" dur="2.4s" repeatCount="indefinite" />
      </rect>
    </svg>
  </div>
);
