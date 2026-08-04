import { chainLabel, type SourceChainId } from '@stellar-payment-gateway/shared';

const colorByChain: Record<SourceChainId | 'stellar', string> = {
  ethereum: 'from-indigo-400 to-blue-500 text-white',
  solana: 'from-fuchsia-400 to-purple-600 text-white',
  polygon: 'from-rose-400 to-orange-400 text-white',
  stellar: 'from-stellar-aurora to-stellar-nova text-white',
};

export const ChainBadge = ({ chain }: { chain: SourceChainId | 'stellar' }) => {
  const label = chain === 'stellar' ? 'Stellar' : chainLabel(chain).name;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-br ${colorByChain[chain]} px-3 py-1 text-[11px] font-semibold uppercase tracking-widest shadow-card`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {label}
    </span>
  );
};
