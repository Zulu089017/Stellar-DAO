'use client';

import { useEffect, useState, useCallback } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  txHash?: string;
}

const EVENT_NAME = 'stellardao-toast';

export function toast(message: string, type: Toast['type'] = 'info', txHash?: string) {
  window.dispatchEvent(
    new CustomEvent<Toast>(EVENT_NAME, {
      detail: { id: crypto.randomUUID(), message, type, txHash },
    }),
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Toast>).detail;
      setToasts((prev) => [...prev, detail]);
      setTimeout(() => remove(detail.id), 6000);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [remove]);

  if (toasts.length === 0) return null;

  const colors: Record<Toast['type'], string> = {
    success: 'border-green-500/30 bg-green-500/10',
    error: 'border-stellar-flare/30 bg-stellar-flare/10',
    info: 'border-stellar-aurora/30 bg-stellar-aurora/10',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-in rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${colors[t.type]}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-white">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="text-stellar-haze hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {t.txHash && (
            <p className="mono mt-1 text-xs text-stellar-haze">
              tx: {t.txHash.slice(0, 10)}…{t.txHash.slice(-6)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
