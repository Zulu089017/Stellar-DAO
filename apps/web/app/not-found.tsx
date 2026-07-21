import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-white/[0.04] text-4xl">
        🔍
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Page not found</h1>
        <p className="max-w-md text-sm text-stellar-haze">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          If this is a transaction, it may still be processing.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
        >
          Back to dashboard
        </Link>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-stellar-cloud hover:border-white/20 hover:bg-white/10"
        >
          View transactions
        </Link>
      </div>
    </div>
  );
}
