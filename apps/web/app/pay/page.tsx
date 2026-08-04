import type { Metadata } from 'next';

import { PayPageContent } from './pay-content';

export const metadata: Metadata = {
  title: 'Pay · Stellar Payment Gateway',
  description: 'Complete a payment request via Stellar Payment Gateway cross-chain wrap.',
};

export default function PayPage() {
  return <PayPageContent />;
}
