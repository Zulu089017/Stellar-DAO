import { SkeletonTable } from '@/components/dashboard/skeleton-loading';

export default function AssetsLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <header className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        <div className="h-8 w-96 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
      </header>
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}
