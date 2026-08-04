'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { isSourceChain, type SourceChainId } from '@stellar-payment-gateway/shared';
import Link from 'next/link';

import { FeeCalculator } from '@/components/wrap/fee-calculator';
import { WrapPanel, type WrapPanelInitialValues } from '@/components/wrap/wrap-panel';

function PayForm() {
  const searchParams = useSearchParams();

  const chainParam = searchParams.get('chain');
  const chain: SourceChainId | undefined = isSourceChain(chainParam ?? undefined)
    ? (chainParam as SourceChainId)
    : undefined;

  const tokenParam = searchParams.get('token');
  const amountParam = searchParams.get('amount');
  const recipientParam = searchParams.get('recipient');

  const hasParams = Boolean(chainParam || tokenParam || amountParam || recipientParam);

  const initialValues: WrapPanelInitialValues | undefined = hasParams
    ? {
        chain,
        token: tokenParam ?? undefined,
        amount: amountParam ?? undefined,
        recipient: recipientParam ?? undefined,
      }
    : undefined;

  const paramsCount = [chain, tokenParam, amountParam, recipientParam].filter(Boolean).length;

  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6">
        <header className="space-y-2">
          {hasParams ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-stellar-nova/30 bg-stellar-nova/10 px-3 py-1 text-xs font-medium text-stellar-nova">
                ↗ Payment request
              </span>
              <h1 className="text-3xl font-semibold text-white">
                Complete your <span className="text-stellar-nova">payment</span>.
              </h1>
              <p className="max-w-2xl text-sm text-stellar-haze">
                {paramsCount === 4
                  ? 'All details are pre-filled from the payment link.'
                  : `${paramsCount} of 4 fields pre-filled from the payment link. Complete the remaining fields to continue.`}
              </p>
            </>
          ) : (
            <>
              <span className="text-xs uppercase tracking-widest text-stellar-nova">
                Cross-chain payment
              </span>
              <h1 className="text-3xl font-semibold text-white">
                Send a <span className="text-stellar-aurora">cross-chain payment</span>.
              </h1>
              <p className="max-w-2xl text-sm text-stellar-haze">
                Enter the payment details or use a shared payment link to pre-fill this form.
              </p>
            </>
          )}
        </header>

        <WrapPanel initialValues={initialValues} />
      </section>

      <aside className="space-y-6">
        {hasParams && initialValues && (
          <div className="glass-panel space-y-3 rounded-2xl p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
              Payment details
            </h2>
            <dl className="space-y-2 text-sm">
              {chain && (
                <div className="flex justify-between">
                  <dt className="text-stellar-haze">Chain</dt>
                  <dd className="font-medium text-stellar-cloud capitalize">{chain}</dd>
                </div>
              )}
              {initialValues.token && (
                <div className="flex justify-between">
                  <dt className="text-stellar-haze">Token</dt>
                  <dd className="mono text-xs text-stellar-cloud">
                    {initialValues.token.slice(0, 10)}…{initialValues.token.slice(-6)}
                  </dd>
                </div>
              )}
              {initialValues.amount && (
                <div className="flex justify-between">
                  <dt className="text-stellar-haze">Amount</dt>
                  <dd className="font-semibold text-stellar-nova">{initialValues.amount}</dd>
                </div>
              )}
              {initialValues.recipient && (
                <div className="flex justify-between">
                  <dt className="text-stellar-haze">Recipient</dt>
                  <dd className="mono text-xs text-stellar-cloud">
                    {initialValues.recipient.slice(0, 10)}…{initialValues.recipient.slice(-6)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <FeeCalculator amount={initialValues?.amount ?? '100'} sourceChain={chain ?? 'ethereum'} />

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

        <div className="text-center">
          <Link
            href="/wrap"
            className="text-xs text-stellar-haze underline underline-offset-4 hover:text-stellar-cloud transition"
          >
            Go to full wrap page
          </Link>
        </div>
      </aside>
    </div>
  );
}

export function PayPageContent() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stellar-aurora border-t-transparent" />
        </div>
      }
    >
      <PayForm />
    </Suspense>
  );
}
