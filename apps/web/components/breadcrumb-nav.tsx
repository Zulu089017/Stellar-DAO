/**
 * Breadcrumb navigation component.
 *
 * Renders a hierarchical breadcrumb trail with links for deep pages.
 * Supports the StellarDAO dashboard's nested route structure:
 *   Home > Governance > Proposal #3
 *   Home > Assets > Ethereum > 0xABCD
 *
 * Each segment is a clickable link except the last (current page).
 */

'use client';

import Link from 'next/link';

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbNavProps {
  segments: BreadcrumbSegment[];
}

export function BreadcrumbNav({ segments }: BreadcrumbNavProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;

        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-stellar-haze/40" aria-hidden="true">
                /
              </span>
            )}
            {isLast || !segment.href ? (
              <span className="text-stellar-cloud font-medium">{segment.label}</span>
            ) : (
              <Link
                href={segment.href}
                className="text-stellar-haze hover:text-white transition"
              >
                {segment.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Pre-built breadcrumb paths for common StellarDAO routes.
 */
export const breadcrumbs = {
  governance: (id?: string): BreadcrumbSegment[] => [
    { label: 'Home', href: '/' },
    { label: 'Governance', href: '/governance' },
    ...(id ? [{ label: `Proposal #${id}` }] : []),
  ],
  assets: (chain?: string, address?: string): BreadcrumbSegment[] => [
    { label: 'Home', href: '/' },
    { label: 'Assets', href: '/assets' },
    ...(chain && address
      ? [
          { label: chain, href: `/assets/${chain}` },
          { label: `${address.slice(0, 10)}…` },
        ]
      : chain
        ? [{ label: chain }]
        : []),
  ],
  transactions: (id?: string): BreadcrumbSegment[] => [
    { label: 'Home', href: '/' },
    { label: 'Transactions', href: '/transactions' },
    ...(id ? [{ label: `${id.slice(0, 8)}…` }] : []),
  ],
  wrap: (): BreadcrumbSegment[] => [
    { label: 'Home', href: '/' },
    { label: 'Wrap' },
  ],
  analytics: (): BreadcrumbSegment[] => [
    { label: 'Home', href: '/' },
    { label: 'Analytics' },
  ],
};
