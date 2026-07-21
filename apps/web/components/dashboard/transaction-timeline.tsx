/**
 * Transaction status timeline component.
 *
 * Renders the full lifecycle of a bridge transaction as a vertical
 * timeline with status indicators, timestamps, and chain badges.
 * Used on the transaction detail page.
 */

'use client';

interface TimelineStep {
  status: string;
  label: string;
  timestamp: string | null;
  txHash: string | null;
  chain?: string;
}

interface TransactionTimelineProps {
  status: string;
  sourceChain: string;
  sourceTxHash: string | null;
  stellarTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_ORDER = ['pending', 'attesting', 'minting', 'completed'];

function buildSteps(props: TransactionTimelineProps): TimelineStep[] {
  const { status, sourceChain, sourceTxHash, stellarTxHash, createdAt, updatedAt } = props;
  const currentIdx = STATUS_ORDER.indexOf(status);

  return [
    {
      status: 'pending',
      label: 'Lock detected',
      timestamp: createdAt,
      txHash: sourceTxHash,
      chain: sourceChain,
    },
    {
      status: 'attesting',
      label: 'Relayer attestation',
      timestamp: currentIdx >= 1 ? updatedAt : null,
      txHash: null,
    },
    {
      status: 'minting',
      label: 'Minting on Stellar',
      timestamp: currentIdx >= 2 ? updatedAt : null,
      txHash: stellarTxHash,
      chain: 'stellar',
    },
    {
      status: 'completed',
      label: 'Completed',
      timestamp: currentIdx >= 3 ? updatedAt : null,
      txHash: stellarTxHash,
      chain: 'stellar',
    },
  ];
}

export function TransactionTimeline(props: TransactionTimelineProps) {
  const steps = buildSteps(props);

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isComplete = STATUS_ORDER.indexOf(props.status) >= STATUS_ORDER.indexOf(step.status);
        const isCurrent =
          STATUS_ORDER.indexOf(props.status) === STATUS_ORDER.indexOf(step.status);

        return (
          <div key={step.status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`h-3 w-3 rounded-full border-2 transition ${
                  isComplete
                    ? 'border-stellar-nova bg-stellar-nova'
                    : 'border-white/20 bg-transparent'
                } ${isCurrent ? 'ring-2 ring-stellar-nova/30' : ''}`}
              />
              {!isLast && (
                <div
                  className={`mt-0.5 h-8 w-px ${
                    isComplete ? 'bg-stellar-nova/50' : 'bg-white/10'
                  }`}
                />
              )}
            </div>
            <div className="pb-6">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-medium ${
                    isComplete ? 'text-stellar-cloud' : 'text-stellar-haze'
                  }`}
                >
                  {step.label}
                </p>
                {step.chain && isComplete && (
                  <span className="rounded bg-white/5 px-1.5 py-px text-xs text-stellar-haze">
                    {step.chain}
                  </span>
                )}
              </div>
              {step.timestamp && (
                <p className="mt-0.5 text-xs text-stellar-haze mono">
                  {new Date(step.timestamp).toLocaleString()}
                </p>
              )}
              {step.txHash && (
                <p className="mt-0.5 text-xs text-stellar-haze mono truncate max-w-[240px]">
                  {step.txHash}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
