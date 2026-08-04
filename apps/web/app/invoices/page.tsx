import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Invoices · Stellar Payment Gateway',
  description: 'Create, view, and pay invoices on the Stellar network.',
};

/**
 * Invoice data for display — mirrors the shared Invoice type.
 * In production this is fetched from the API; the scaffold page
 * renders static demo data so the UI is reviewable before the
 * API endpoint is wired to the on-chain contract.
 */
interface InvoiceRow {
  id: string;
  creator: string;
  payer: string;
  token: string;
  totalAmount: string;
  paidAmount: string;
  status: 'created' | 'partially_paid' | 'paid' | 'cancelled' | 'expired';
  memo: string;
  createdAt: string;
}

const DEMO_INVOICES: InvoiceRow[] = [
  {
    id: 'inv_8f3a2b1c',
    creator: 'GABC…DEFG',
    payer: 'GXYZ…1234',
    token: 'USDC',
    totalAmount: '5000000000',
    paidAmount: '5000000000',
    status: 'paid',
    memo: 'Order #1042 — Widget shipment',
    createdAt: '2026-08-01T14:22:00Z',
  },
  {
    id: 'inv_7e2d4c9a',
    creator: 'GABC…DEFG',
    payer: 'GLMN…5678',
    token: 'XLM',
    totalAmount: '2500000000',
    paidAmount: '1000000000',
    status: 'partially_paid',
    memo: 'Consulting retainer — August',
    createdAt: '2026-08-02T09:15:00Z',
  },
  {
    id: 'inv_6d1c8b3f',
    creator: 'GABC…DEFG',
    payer: 'GPQR…9012',
    token: 'USDC',
    totalAmount: '10000000000',
    paidAmount: '0',
    status: 'created',
    memo: 'Annual license renewal',
    createdAt: '2026-08-03T16:45:00Z',
  },
  {
    id: 'inv_5c0b7a2e',
    creator: 'GABC…DEFG',
    payer: 'GSTU…3456',
    token: 'XLM',
    totalAmount: '750000000',
    paidAmount: '0',
    status: 'cancelled',
    memo: 'Event sponsorship — cancelled',
    createdAt: '2026-07-28T11:00:00Z',
  },
  {
    id: 'inv_4b9a6d1f',
    creator: 'GABC…DEFG',
    payer: 'GVWX…7890',
    token: 'USDC',
    totalAmount: '2000000000',
    paidAmount: '0',
    status: 'expired',
    memo: 'Invoice #89 — overdue',
    createdAt: '2026-07-15T08:30:00Z',
  },
];

const STATUS_STYLES: Record<string, string> = {
  created: 'border-blue-400/30 bg-blue-400/10 text-blue-400',
  partially_paid: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400',
  paid: 'border-green-400/30 bg-green-400/10 text-green-400',
  cancelled: 'border-stellar-mist/30 bg-stellar-mist/10 text-stellar-mist',
  expired: 'border-red-400/30 bg-red-400/10 text-red-400',
};

function formatAmount(amount: string, token: string): string {
  const num = Number(BigInt(amount) / 10_000_000n) / 100;
  return `${num.toFixed(2)} ${token}`;
}

export default function InvoicesPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Invoices</h1>
          <p className="mt-1 text-sm text-stellar-haze">
            Create, view, and pay invoices. Powered by the on-chain Invoice contract.
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-stellar-aurora to-stellar-nova px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
        >
          + New invoice
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total', value: '5' },
          { label: 'Paid', value: '1' },
          { label: 'Pending', value: '2' },
          { label: 'Volume', value: formatAmount('19000000000', 'USDC') },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <p className="text-xs text-stellar-haze">{s.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-stellar-haze">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Memo</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {DEMO_INVOICES.map((inv) => (
                <tr
                  key={inv.id}
                  className="transition hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-mono text-xs text-stellar-aurora hover:underline"
                    >
                      {inv.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-stellar-haze">
                    {inv.payer}
                  </td>
                  <td className="px-4 py-3 text-white">
                    <div>{formatAmount(inv.totalAmount, inv.token)}</div>
                    {inv.status === 'partially_paid' && (
                      <div className="text-xs text-stellar-haze">
                        {formatAmount(inv.paidAmount, inv.token)} paid
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[inv.status] ?? ''}`}
                    >
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-stellar-haze max-w-[200px] truncate">
                    {inv.memo}
                  </td>
                  <td className="px-4 py-3 text-xs text-stellar-mist">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state — shown when no invoices exist */}
      <div className="hidden rounded-2xl border border-dashed border-white/10 p-12 text-center">
        <p className="text-stellar-haze">No invoices yet.</p>
        <Link href="/invoices/new" className="mt-2 inline-block text-sm text-stellar-aurora hover:underline">
          Create your first invoice →
        </Link>
      </div>
    </div>
  );
}
