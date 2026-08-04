'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/wrap', label: 'Wrap' },
  { href: '/assets', label: 'Assets' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/governance', label: 'Governance' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/invoices', label: 'Invoices' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-stellar-haze hover:text-white"
        aria-label="Toggle navigation menu"
      >
        {open ? '✕' : '☰'}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <nav className="fixed inset-y-0 right-0 z-40 w-64 border-l border-white/10 bg-stellar-slate p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-semibold text-white">Navigation</span>
              <button onClick={() => setOpen(false)} className="text-stellar-haze hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? 'bg-stellar-steel text-white'
                        : 'text-stellar-haze hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
