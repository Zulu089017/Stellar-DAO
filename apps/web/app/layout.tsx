import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';

import { Providers } from './providers';

import { CommandPalette, CommandPaletteGlobalShortcut } from '@/components/command-palette';
import { ErrorBoundary } from '@/components/error-boundary';
import { TopNav } from '@/components/nav/top-nav';
import { ToastContainer } from '@/components/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stellar-payment-gateway.dev';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Stellar Payment Gateway — Cross-Chain Wraps on Stellar',
    template: '%s · Stellar Payment Gateway',
  },
  description:
    'Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar. Real-time settlements confirmed by Horizon — finality in under 5 seconds.',
  keywords: [
    'Stellar',
    'Soroban',
    'cross-chain',
    'bridge',
    'token wrap',
    'ERC-20',
    'SPL',
    'Polygon',
    'DAO',
    'governance',
    'blockchain',
    'wrapped tokens',
    'DeFi',
    'Horizon',
  ],
  authors: [
    {
      name: 'Stellar Payment Gateway Contributors',
      url: 'https://github.com/stellar-payment-gateway/stellar-payment-gateway-sdk-main',
    },
  ],
  creator: 'Stellar Payment Gateway',
  publisher: 'Stellar Payment Gateway',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Stellar Payment Gateway',
    title: 'Stellar Payment Gateway — Cross-Chain Wraps on Stellar',
    description:
      'Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar. Real-time settlements confirmed by Horizon.',
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Stellar Payment Gateway — Cross-Chain Wraps on Stellar',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stellar Payment Gateway — Cross-Chain Wraps on Stellar',
    description:
      'Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar. Real-time settlements confirmed by Horizon.',
    images: [`${siteUrl}/og-image.png`],
    creator: '@stellar-payment-gateway',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/icon.svg',
  },
  manifest: '/manifest.webmanifest',
  category: 'technology',
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} style={{ overflowX: 'clip' }}>
      <body
        className="min-h-screen bg-aurora-gradient text-stellar-cloud"
        style={{ overflowX: 'clip' }}
      >
        <Providers>
          <CommandPaletteGlobalShortcut />
          <TopNav />
          <ErrorBoundary>
            <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-10">{children}</main>
          </ErrorBoundary>
          <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-stellar-haze sm:px-6 lg:px-10">
            Stellar Payment Gateway is an open-source scaffold — never commit funds; always verify
            contract IDs against the latest release.
          </footer>
          <CommandPalette />
          <ToastContainer />
        </Providers>
      </body>
    </html>
  );
}
