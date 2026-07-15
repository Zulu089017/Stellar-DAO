import Link from 'next/link';
import { SOURCE_CHAINS, chainLabel, type SourceChainId } from '@stellardao/shared';

/**
 * Source-chain filter chips for `/transactions`.
 *
 * Implemented as a server component so clicking a chip is a plain
 * `<Link>` navigation — the page is re-rendered with `?chain=X` and
 * the API pre-filters server-side. This keeps the filtered URL
 * shareable and the initial paint fast (no client round-trip for
 * filtering). The active chip is determined by the `active` prop, set
 * by the page from `searchParams.chain`.
 *
 * Clicking the *active* chip clears the filter (links back to plain
 * `/transactions`) so users don't need a separate "All chains" toggle
 * as the leading link — keeping both would force an extra tap to
 * unset.
 */
export const ChainFilterChips = ({ active }: { active?: SourceChainId }) => {
  return (
    <nav
      aria-label="Filter transactions by source chain"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs uppercase tracking-widest text-stellar-haze">Source chain</span>
      {SOURCE_CHAINS.map((c) => {
        const isActive = active === c;
        return (
          <Link
            key={c}
            href={isActive ? '/transactions' : `/transactions?chain=${c}`}
            aria-current={isActive ? 'page' : undefined}
            className={`focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest transition ${
              isActive
                ? 'border-stellar-aurora/40 bg-stellar-aurora/15 text-white'
                : 'border-white/10 text-stellar-haze hover:border-white/20 hover:text-white'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-stellar-aurora to-stellar-nova"
              aria-hidden
            />
            {chainLabel(c).name}
          </Link>
        );
      })}
    </nav>
  );
};
