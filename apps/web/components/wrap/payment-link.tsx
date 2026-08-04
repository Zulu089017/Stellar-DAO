'use client';

/**
 * Payment Link — Generate shareable payment URLs with QR codes.
 *
 * Reads current wrap-form values and builds a /pay?chain=...&token=...&amount=...&recipient=...
 * URL. Renders a QR code (via free QRServer API), copy-to-clipboard button,
 * and share actions.
 *
 * Zero external dependencies — QR code rendered as an <img> from
 * api.qrserver.com, a widely-used free QR generation service.
 */

import { useCallback, useEffect, useState } from 'react';

import type { WrapPanelInitialValues } from './wrap-panel';

interface PaymentLinkProps {
  values: WrapPanelInitialValues;
}

function buildPayUrl(values: WrapPanelInitialValues): string {
  const params = new URLSearchParams();
  if (values.chain) params.set('chain', values.chain);
  if (values.token) params.set('token', values.token);
  if (values.amount) params.set('amount', values.amount);
  if (values.recipient) params.set('recipient', values.recipient);
  return `${window.location.origin}/pay?${params.toString()}`;
}

function buildQrUrl(payUrl: string): string {
  const encoded = encodeURIComponent(payUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=05070d&color=ffffff&margin=8`;
}

export function PaymentLink({ values }: PaymentLinkProps) {
  const [payUrl, setPayUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPayUrl(buildPayUrl(values));
  }, [values]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
      const input = document.createElement('input');
      input.value = payUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [payUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Stellar Payment Gateway — Payment Request',
          text: `Send ${values.amount ?? '?'} tokens via Stellar Payment Gateway`,
          url: payUrl,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  }, [payUrl, values.amount, handleCopy]);

  const hasAllFields = values.chain && values.token && values.amount && values.recipient;
  const isValid =
    hasAllFields && Number(values.amount) > 0 && (values.recipient ?? '').startsWith('G');

  return (
    <div className="glass-panel space-y-4 rounded-2xl p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-stellar-haze">
        Payment link
      </h2>

      {!isValid ? (
        <p className="text-xs text-stellar-haze">
          Fill in all fields to generate a shareable payment link.
        </p>
      ) : (
        <>
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white p-3">
              <img
                src={buildQrUrl(payUrl)}
                alt="QR code for payment link"
                width={200}
                height={200}
                className="block h-48 w-48"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-stellar-cloud transition hover:bg-white/10"
            >
              {copied ? '✓ Copied' : '⎘ Copy link'}
            </button>
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-stellar-cloud transition hover:bg-white/10"
            >
              ↗ Share
            </button>
          </div>

          {/* URL preview */}
          <p className="mono break-all text-[10px] text-stellar-haze/60">{payUrl}</p>

          {/* Summary */}
          <div className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <p className="text-xs text-stellar-haze">Recipient will see:</p>
            <p className="mono text-xs text-stellar-cloud">
              {values.chain && (
                <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
                  {values.chain}
                </span>
              )}
              {values.amount && (
                <span className="font-semibold text-stellar-nova">{values.amount} tokens</span>
              )}
            </p>
            {values.recipient && (
              <p className="mono text-[10px] text-stellar-haze">
                to {values.recipient.slice(0, 12)}…{values.recipient.slice(-6)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
