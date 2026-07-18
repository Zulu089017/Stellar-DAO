export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5" aria-busy="true" aria-label="Loading">
      <div className="divide-y divide-white/5">
        {/* Header */}
        <div className="flex gap-4 bg-white/[0.02] px-6 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={`h-${i}`}
              className="h-4 flex-1 animate-pulse rounded bg-white/10"
            />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex gap-4 px-6 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={`c-${c}`}
                className="h-3 flex-1 animate-pulse rounded bg-white/5"
                style={{ animationDelay: `${r * 100 + c * 50}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="rounded-xl border border-white/5 bg-white/[0.03] p-5 space-y-3"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded bg-white/10 ${
            i === 0 ? 'h-5 w-2/3' : 'h-3 w-full'
          }`}
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div
      className="rounded-xl border border-white/5 bg-white/[0.03] p-5 space-y-3"
      aria-busy="true"
    >
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
      <div className="h-7 w-32 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
    </div>
  );
}
