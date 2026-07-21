import { SkeletonStatCard, SkeletonCard } from '@/components/dashboard/skeleton-loading';

export default function AnalyticsLoading() {
  return (
    <div className="space-y-12" aria-busy="true">
      <section>
        <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-white/5" />
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={8} />
        <SkeletonCard lines={8} />
      </div>
    </div>
  );
}
