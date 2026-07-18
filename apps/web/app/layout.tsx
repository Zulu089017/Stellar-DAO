import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';

import { Providers } from './providers';

import { TopNav } from '@/components/nav/top-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { ToastContainer } from '@/components/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'StellarDAO — Cross-Chain Wraps on Stellar',
  description:
    'Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar. Live confirmed by Horizon.',
  metadataBase: new URL('http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-aurora-gradient text-stellar-cloud">
        <Providers>
          <TopNav />
          <ThemeToggle />
          <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-10">
            {children}
          </main>
          <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-stellar-haze lg:px-10">
            StellarDAO is an open-source scaffold — never commit funds; always verify
            contract IDs against the latest release.
          </footer>
          <ToastContainer />
        </Providers>
      </body>
    </html>
  );
}
