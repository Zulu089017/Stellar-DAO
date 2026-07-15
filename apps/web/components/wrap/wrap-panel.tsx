'use client';

import { useEffect, useState } from 'react';
import { Button } from '@stellardao/ui';
import {
  SOURCE_CHAINS,
  chainLabel,
  isValidAddress,
  type SourceChainId,
  type Transaction,
  type TxStatus,
} from '@stellardao/shared';

export type WrapStep = 'idle' | 'locking' | 'attesting' | 'minting' | 'completed' | 'failed';

const stepLabel: Record<WrapStep, string> = {
  idle: 'Idle — set parameters and click Wrap',
  locking: 'Submitting your lock request…',
  attesting: 'Operators signing the digest…',
  minting: 'Bridge mints wrapper-token on Stellar…',
  completed: 'Settled · wrapper is in your Stellar account.',
  failed: 'Wrap failed. See your dashboard for details.',
};

/** Map a server-side TX status onto the panel's step bar. */
function txStatusToStep(status: TxStatus): WrapStep {
  switch (status) {
    case 'pending':
    case 'refunded':
      return 'locking';
    case 'attesting':
      return 'attesting';
    case 'minting':
      return 'minting';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
  }
}

// Next inlines NEXT_PUBLIC_* at build time, so these module-level reads
// are stable across SSR + CSR (no hydration mismatch) and don't need
// useEffect. The `as string | undefined` cast narrows the env type so the
// `.startsWith` chain below type-checks cleanly under strict mode.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const BRIDGE_READY = Boolean(
  (process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID ?? '').startsWith('C'),
);

const DEFAULT_WRAPPER_TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

/** Pick a deterministic demo wrapper-token for the demo flow. */
const DEMO_WRAPPER_TOKEN =
  process.env.NEXT_PUBLIC_DEMO_WRAPPER_TOKEN ?? DEFAULT_WRAPPER_TOKEN;

export const WrapPanel = () => {
  const [chain, setChain] = useState<SourceChainId>('ethereum');
  const [token, setToken] = useState('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'); // USDC mainnet
  const [amount, setAmount] = useState('100');
  const [recipient, setRecipient] = useState('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR');
  const [step, setStep] = useState<WrapStep>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = isValidAddress(chain, token) && Number(amount) > 0 && recipient.startsWith('G');

  // Live update: when txId is set, follow the matching transaction-update
  // SSE event and advance the panel's lifecycle bar.
  useEffect(() => {
    if (!txId) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    const es = new EventSource(`${apiBase}/events`);
    es.addEventListener('transaction-update', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as Transaction;
        if (parsed.id !== txId) return;
        setStep(txStatusToStep(parsed.status));
        if (parsed.status === 'completed' || parsed.status === 'failed') {
          es.close();
        }
      } catch {
        /* ignore malformed events */
      }
    });
    return () => es.close();
  }, [txId]);

  const submit = async () => {
    if (!valid) return;
    setError(null);
    setStep('locking');
    setTxId(null);

    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 800));
      setStep('attesting');
      await new Promise((r) => setTimeout(r, 1200));
      setStep('minting');
      await new Promise((r) => setTimeout(r, 800));
      setStep('completed');
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    try {
      const res = await fetch(`${apiBase}/bridge/wrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChain: chain,
          sourceToken: token,
          wrapperToken: BRIDGE_READY
            ? (process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID ?? DEFAULT_WRAPPER_TOKEN)
            : DEMO_WRAPPER_TOKEN,
          recipient,
          amount,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `wrap failed (${res.status})`);
      }
      const data = (await res.json()) as { txId: string; status: TxStatus };
      setTxId(data.txId);
      setStep('attesting');
    } catch (err) {
      setError((err as Error).message);
      setStep('failed');
    }
  };

  const realFlow = !DEMO_MODE && BRIDGE_READY;

  return (
    <div className="glass-panel space-y-6 rounded-3xl p-8">
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <label className="space-y-2 text-sm">
          <span className="text-xs uppercase tracking-widest text-stellar-haze">Source chain</span>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as SourceChainId)}
            className="focus-ring w-full rounded-xl border border-white/10 bg-stellar-ink/40 px-3 py-2 text-stellar-cloud"
          >
            {SOURCE_CHAINS.map((c) => (
              <option key={c} value={c}>
                {chainLabel(c).name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-xs uppercase tracking-widest text-stellar-haze">Source token address</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mono focus-ring w-full rounded-xl border border-white/10 bg-stellar-ink/40 px-3 py-2 text-stellar-cloud"
          />
          {!isValidAddress(chain, token) && (
            <p className="text-xs text-rose-400">Address doesn&apos;t match the {chain} format.</p>
          )}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-xs uppercase tracking-widest text-stellar-haze">Amount</span>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mono focus-ring w-full rounded-xl border border-white/10 bg-stellar-ink/40 px-3 py-2 text-stellar-cloud"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-xs uppercase tracking-widest text-stellar-haze">Stellar recipient</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="mono focus-ring w-full rounded-xl border border-white/10 bg-stellar-ink/40 px-3 py-2 text-stellar-cloud"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-stellar-haze">Status</p>
          <p className="text-sm text-stellar-cloud">{stepLabel[step]}</p>
          {txId && (
            <p className="mono mt-1 text-[11px] text-stellar-haze">
              tx · {txId.slice(0, 16)}…
            </p>
          )}
          {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          {(['attesting', 'minting', 'completed'] as WrapStep[]).map((s) => {
            const order: WrapStep[] = ['attesting', 'minting', 'completed'];
            return (
              <span
                key={s}
                className={`h-1.5 w-10 rounded-full ${
                  order.indexOf(step) >= order.indexOf(s)
                    ? 'bg-gradient-to-r from-stellar-aurora to-stellar-nova'
                    : 'bg-white/10'
                }`}
                aria-label={`step ${order.indexOf(s) + 1}`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={submit}
          disabled={
            !valid ||
            step === 'locking' ||
            step === 'attesting' ||
            step === 'minting' ||
            (!DEMO_MODE && !process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID && !process.env.NEXT_PUBLIC_API_BASE_URL)
          }
        >
          {step === 'idle' || step === 'completed' || step === 'failed' ? 'Wrap →' : 'Working…'}
        </Button>
        <p className="text-xs text-stellar-haze">
          {realFlow
            ? 'Live — your wrap goes through the bridge contract.'
            : DEMO_MODE
              ? 'Demo mode — no backend call.'
              : 'Coming soon — set NEXT_PUBLIC_BRIDGE_CONTRACT_ID and NEXT_PUBLIC_API_BASE_URL to drive the real flow.'}
        </p>
      </div>
    </div>
  );
};
