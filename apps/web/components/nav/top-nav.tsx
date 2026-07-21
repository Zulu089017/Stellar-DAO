'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WalletConnect } from './wallet-connect';

import { LogoMark } from '@/components/atoms/logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { MobileNav } from '@/components/mobile-nav';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/wrap', label: 'Wrap' },
  { href: '/assets', label: 'Assets' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/governance', label: 'Governance' },
  { href: '/analytics', label: 'Analytics' },
];

export const TopNav = () => {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-stellar-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Link href="/" className="focus-ring flex items-center gap-3 text-white">
          <LogoMark />
          <span className="font-display text-base font-semibold tracking-tight">StellarDAO</span>
          <span className="hidden rounded-full border border-stellar-aurora/30 bg-stellar-aurora/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-stellar-aurora sm:inline">
            testnet
          </span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-full border border-white/5 bg-white/5 p-1 text-sm text-stellar-haze md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`focus-ring rounded-full px-3 py-1.5 transition ${
                  active ? 'bg-stellar-steel text-white shadow-card' : 'hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletConnect />
          <MobileNav />
        </div>
      </div>
    </header>
  );
};
