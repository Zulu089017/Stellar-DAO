import { SkeletonCard } from '@/components/dashboard/skeleton-loading';

export default function WrapLoading() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]" aria-busy="true">
      <section className="space-y-6">
        <header className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
          <div className="h-8 w-full max-w-xl animate-pulse rounded bg-white/10" />
          <div className="h-4 w-96 animate-pulse rounded bg-white/5" />
        </header>
        <div className="space-y-4 rounded-3xl border border-white/5 bg-white/[0.03] p-8">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-2">
              <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
          </div>
        </div>
      </section>
      <aside className="space-y-6">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={3} />
      </aside>
    </div>
  );
}
