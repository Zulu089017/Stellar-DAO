import type { Metadata } from 'next';

import { WrapPageContent } from './wrap-content';

export const metadata: Metadata = {
  title: 'Wrap · Stellar Payment Gateway',
  description:
    'Lock an ERC-20, SPL, or Polygon token and receive the Stellar Payment Gateway wrapper on Stellar.',
};

export default function WrapPage() {
  return <WrapPageContent />;
}
