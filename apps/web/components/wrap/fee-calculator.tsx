'use client';

import { useEffect, useState } from 'react';

interface FeeBreakdown {
  bridgeFeeBps: number;
  bridgeFeeAmount: number;
  attestationGas: number;
  estimatedTotal: number;
  estimatedReceive: number;
}

interface Props {
  amount: string;
  sourceChain: string;
  className?: string;
}

const DEFAULT_FEE_BPS = 10; // 0.10%
const AVG_GAS_COST_STROOPS = 28_000; // ~bridge.mint_with_attestation

/**
 * Real-time bridge fee calculator.
 *
 * Estimates protocol fees, gas costs, and final receive amount
 * based on the user's input amount and selected source chain.
 */
export function FeeCalculator({ amount, sourceChain, className = '' }: Props) {
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setBreakdown(null);
      return;
    }

    const feeBps = sourceChain === 'polygon' ? DEFAULT_FEE_BPS / 2 : DEFAULT_FEE_BPS;
    const feeAmount = (parsed * feeBps) / 10_000;

    // Gas estimation: stroops are 1e-7 XLM. Conservative estimate ~0.003 XLM.
    const gasXlm = (AVG_GAS_COST_STROOPS * 1.5) / 10_000_000;
    const estimatedTotal = feeAmount + gasXlm;
    const estimatedReceive = parsed - estimatedTotal;

    setBreakdown({
      bridgeFeeBps: feeBps,
      bridgeFeeAmount: feeAmount,
      attestationGas: gasXlm,
      estimatedTotal,
      estimatedReceive: Math.max(0, estimatedReceive),
    });
  }, [amount, sourceChain]);

  if (!breakdown) {
    return (
      <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-4 ${className}`}>
        <p className="text-xs text-stellar-haze">Enter an amount to see estimated fees.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-stellar-haze">Fee Breakdown</h4>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-stellar-haze">Protocol fee ({breakdown.bridgeFeeBps} bps)</span>
          <span className="tabular-nums text-stellar-cloud">{breakdown.bridgeFeeAmount.toFixed(6)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-stellar-haze">Est. gas (attestation)</span>
          <span className="tabular-nums text-stellar-cloud">{breakdown.attestationGas.toFixed(6)} XLM</span>
        </div>

        <div className="border-t border-white/5 pt-2">
          <div className="flex justify-between">
            <span className="text-stellar-haze">Total fee</span>
            <span className="tabular-nums text-stellar-cloud">{breakdown.estimatedTotal.toFixed(6)}</span>
          </div>
        </div>

        <div className="rounded-lg bg-stellar-nova/10 px-3 py-2">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-stellar-cloud">You receive</span>
            <span className="tabular-nums text-stellar-nova">~{breakdown.estimatedReceive.toFixed(6)}</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-stellar-haze/60">
        Fees are estimated on testnet gas costs and the current protocol fee schedule.
        Actual costs may vary with network conditions.
      </p>
    </div>
  );
}
