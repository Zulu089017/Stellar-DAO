import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StellarDAO — Cross-Chain Wraps on Stellar',
    short_name: 'StellarDAO',
    description:
      'Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar. Live confirmed by Horizon.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05070d',
    theme_color: '#05070d',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['finance', 'blockchain', 'defi', 'developer tools'],
    screenshots: [
      {
        src: '/screenshot-dashboard.png',
        sizes: '1280x800',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Dashboard — live asset registry and transaction feed',
      },
    ],
  };
}
