import type { Metadata } from 'next';

import { AssetsLiveTable } from '@/components/dashboard/assets-live-table';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Assets · StellarDAO',
  description: 'Wrapped assets deployed via the StellarDAO factory.',
};

export default async function AssetsPage() {
  const data = await serverApi.listAssets().catch(() => ({ assets: [] }));
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <span className="text-xs uppercase tracking-widest text-stellar-nova">Asset registry</span>
        <h1 className="text-3xl font-semibold text-white">Every wrapper-token deployed to date</h1>
        <p className="max-w-2xl text-sm text-stellar-haze">
          The factory contract keeps a deterministic mapping from each source-chain token to its dedicated
          wrapper-token contract. New entries appear the instant the corresponding{' '}
          <code className="mono text-stellar-cloud">WrapperCreated</code> event is indexed by Horizon.
        </p>
      </header>
      <AssetsLiveTable initial={data.assets} />
    </div>
  );
}
