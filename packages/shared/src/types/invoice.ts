/** Invoice status mirroring contracts/invoice/src/lib.rs::InvoiceStatus */
export type InvoiceStatus =
  | 'created'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'expired';

/** Domain model mirroring the Soroban Invoice struct */
export interface Invoice {
  id: string;
  creator: string;
  payer: string;
  token: string;
  totalAmount: string;
  paidAmount: string;
  expirationLedger: number;
  status: InvoiceStatus;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceRequest {
  payer: string;
  token: string;
  totalAmount: string;
  expirationLedger: number;
  memo?: string;
}

export interface PayInvoiceRequest {
  amount: string;
}

export interface CreateInvoiceResponse {
  invoice: Invoice;
}

export interface GetInvoiceResponse {
  invoice: Invoice;
}

export interface ListInvoicesResponse {
  invoices: Invoice[];
}
