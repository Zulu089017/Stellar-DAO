import Link from 'next/link';

const quickLinks = [
  { href: '/', label: '🏠 Dashboard', description: 'Live asset registry and feed' },
  { href: '/wrap', label: '🌉 Wrap Token', description: 'Start a cross-chain wrap' },
  { href: '/transactions', label: '📋 Transactions', description: 'Settlement history' },
  { href: '/governance', label: '🏛️ Governance', description: 'Proposals and voting' },
  { href: '/assets', label: '💎 Assets', description: 'Wrapper token registry' },
  { href: '/analytics', label: '📊 Analytics', description: 'Protocol metrics' },
];

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-10 text-center">
      {/* Emoji + code */}
      <div className="space-y-3">
        <div className="grid h-24 w-24 place-items-center rounded-3xl border border-white/10 bg-white/[0.04] text-5xl">
          🔭
        </div>
        <p className="font-mono text-xs text-stellar-haze">HTTP 404</p>
      </div>

      {/* Message */}
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Page not found</h1>
        <p className="max-w-md text-sm text-stellar-haze">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          If this is a transaction or proposal, it may still be processing on-chain.
        </p>
      </div>

      {/* Quick-nav grid */}
      <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="focus-ring group rounded-xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-white/10 hover:bg-white/[0.05]"
          >
            <div className="text-sm font-medium text-white group-hover:text-stellar-nova">{link.label}</div>
            <div className="mt-1 text-xs text-stellar-haze">{link.description}</div>
          </Link>
        ))}
      </div>

      {/* CTA row */}
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
        >
          ← Back to dashboard
        </Link>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-stellar-cloud hover:border-white/20 hover:bg-white/10"
        >
          View transactions
        </Link>
      </div>

      <p className="max-w-md text-xs text-stellar-haze/60">
        Think this page should exist?{' '}
        <a
          href="https://github.com/stellar-payment-gateway/stellar-payment-gateway-sdk-main/issues/new?template=bug_report.md"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-stellar-cloud"
        >
          Open an issue on GitHub →
        </a>
      </p>
    </div>
  );
}
