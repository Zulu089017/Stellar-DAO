import type { Metadata } from 'next';

import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

export const metadata: Metadata = {
  title: 'Analytics · Stellar Payment Gateway',
  description: 'Protocol analytics — TVL, volume, transactions, and chain breakdown.',
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="font-display text-3xl font-semibold text-white">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm text-stellar-haze">
          Real-time protocol metrics for the Stellar Payment Gateway bridge. Data is sourced
          from on-chain events and updated every ledger.
        </p>
      </section>

      <AnalyticsDashboard />
    </div>
  );
}
