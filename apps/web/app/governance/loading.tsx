import { SkeletonCard } from '@/components/dashboard/skeleton-loading';

export default function GovernanceLoading() {
  return (
    <div className="space-y-12" aria-busy="true">
      <section>
        <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-white/5" />
      </section>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}
