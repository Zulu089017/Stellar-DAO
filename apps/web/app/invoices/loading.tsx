export default function InvoicesLoading() {
  return (
    <div className="space-y-8">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-white/5" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-white/[0.02]" />
    </div>
  );
}
