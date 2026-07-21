import { SkeletonTable } from '@/components/dashboard/skeleton-loading';

export default function TransactionsLoading() {
  return (
    <div className="space-y-10" aria-busy="true">
      <header className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
        <div className="h-8 w-96 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-72 animate-pulse rounded bg-white/5" />
      </header>
      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-full bg-white/5" />
        <div className="h-8 w-20 animate-pulse rounded-full bg-white/5" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-white/5" />
      </div>
      <SkeletonTable rows={8} cols={4} />
    </div>
  );
}
