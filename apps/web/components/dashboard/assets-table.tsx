import Link from 'next/link';
import { chainLabel, type AssetRegistryEntry } from '@stellardao/shared';

import { ChainBadge } from '@/components/atoms/chain-badge';
import { AddressDisplay } from '@/components/atoms/address-display';

export const AssetsTable = ({ assets }: { assets: AssetRegistryEntry[] }) => {
  if (assets.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center gap-5 rounded-3xl p-14 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl font-semibold text-stellar-aurora">
          ✦
        </div>
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-stellar-haze">No assets deployed yet</p>
          <p className="mx-auto max-w-md text-sm text-stellar-haze">
            Once a developer calls{' '}
            <code className="mono text-stellar-cloud">factory.create_wrapper</code> for a source-chain
            token, the wrapper appears here. To exercise the full pipeline without standing up a real
            factory, kick off a wrap on testnet — it&apos;ll route through the same mocks.
          </p>
        </div>
        <Link
          href="/wrap"
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
        >
          Wrap a token →
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-3xl">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-widest text-stellar-haze">
          <tr>
            <th className="px-5 py-3">Asset</th>
            <th className="px-5 py-3">Source</th>
            <th className="px-5 py-3">Wrapper contract</th>
            <th className="px-5 py-3 text-right">Decimals</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {assets.map((asset) => (
            <tr key={asset.id} className="bg-stellar-slate/40 transition hover:bg-stellar-slate/60">
              <td className="px-5 py-4">
                <Link
                  href={`/assets/${asset.source.chain}/${asset.source.address}`}
                  className="focus-ring flex items-center gap-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-white/10 to-white/0 text-sm font-semibold text-white">
                    {asset.symbol.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-semibold text-white">{asset.name}</span>
                    <span className="block text-xs text-stellar-haze mono">{asset.symbol}</span>
                  </span>
                </Link>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <ChainBadge chain={asset.source.chain} />
                  <AddressDisplay value={asset.source.address} truncateChars={4} />
                </div>
                <p className="mt-1 text-xs text-stellar-haze">{chainLabel(asset.source.chain).explorer}</p>
              </td>
              <td className="px-5 py-4">
                <AddressDisplay value={asset.wrapperToken} />
              </td>
              <td className="px-5 py-4 text-right mono text-stellar-cloud">{asset.decimals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
