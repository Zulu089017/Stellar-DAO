'use client';

import { useState } from 'react';

import { FeeCalculator } from '@/components/wrap/fee-calculator';
import { PaymentLink } from '@/components/wrap/payment-link';
import { WrapPanel, type WrapPanelInitialValues } from '@/components/wrap/wrap-panel';

export function WrapPageContent() {
  const [formValues, setFormValues] = useState<WrapPanelInitialValues>({
    chain: 'ethereum',
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    amount: '100',
    recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
  });

  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6">
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-widest text-stellar-nova">
            Cross-chain wrap
          </span>
          <h1 className="text-3xl font-semibold text-white">
            Mint a Stellar wrapper for{' '}
            <span className="text-stellar-aurora">any source-chain token</span>.
          </h1>
          <p className="max-w-2xl text-sm text-stellar-haze">
            Select a source chain and token, lock it in the matching Stellar Payment Gateway vault,
            and watch the operator set sign + the bridge mint on Stellar in real time.
          </p>
        </header>
        <WrapPanel onValuesChange={setFormValues} />
      </section>
      <aside className="space-y-6">
        <PaymentLink values={formValues} />
        <FeeCalculator
          amount={formValues.amount ?? '100'}
          sourceChain={formValues.chain ?? 'ethereum'}
        />
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
            How a wrap settles
          </h2>
          <ol className="mt-4 space-y-4 text-sm text-stellar-cloud">
            {[
              [
                'Lock',
                'Submit your tx on the source chain: tokens are custodied in the Stellar Payment Gateway vault.',
              ],
              [
                'Attest',
                'Operators off-chain sign the canonical bridge digest until threshold is met.',
              ],
              [
                'Mint',
                'Relayer posts the signed payload to the bridge contract — wrapper-token mints to your Stellar address.',
              ],
              [
                'Confirm',
                'Soroban emits the event, Horizon indexes it, and you see the credit land here in under 5 s.',
              ],
            ].map(([label, body], idx) => (
              <li key={label} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-stellar-steel text-xs text-stellar-aurora">
                  {idx + 1}
                </span>
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  <p className="text-stellar-haze">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
            Safety checklist
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-stellar-haze">
            <li>→ Verify the bridge contract address on Stellar Expert before signing.</li>
            <li>
              → Operate only with dev/testnet keys until the production verifier set is published.
            </li>
            <li>
              → Subscribe to <code className="mono text-stellar-cloud">/api/health</code> for outage
              alerts.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
