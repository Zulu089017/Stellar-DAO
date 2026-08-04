import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Invoice, InvoiceStatus } from '@stellar-payment-gateway/shared';

import { bootstrapSchema, getDb, __closeDbForTest } from '../pool.js';
import * as schema from '../schema.js';

interface InvoiceRepository {
  upsert(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  listAll(): Promise<Invoice[]>;
  __clearForTest(): void | Promise<void>;
}

const rowToInvoice = (row: typeof schema.invoices.$inferSelect): Invoice => ({
  id: row.id,
  creator: row.creator,
  payer: row.payer,
  token: row.token,
  totalAmount: row.totalAmount.toString(),
  paidAmount: row.paidAmount.toString(),
  expirationLedger: row.expirationLedger,
  status: row.status as InvoiceStatus,
  memo: row.memo,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

class MemoryInvoiceRepository implements InvoiceRepository {
  private byId = new Map<string, Invoice>();

  async upsert(invoice: Invoice): Promise<Invoice> {
    this.byId.set(invoice.id, invoice);
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.byId.get(id) ?? null;
  }

  async listAll(): Promise<Invoice[]> {
    return [...this.byId.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  __clearForTest(): void {
    this.byId.clear();
  }
}

class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async upsert(invoice: Invoice): Promise<Invoice> {
    await this.db
      .insert(schema.invoices)
      .values({
        id: invoice.id,
        creator: invoice.creator,
        payer: invoice.payer,
        token: invoice.token,
        totalAmount: BigInt(invoice.totalAmount),
        paidAmount: BigInt(invoice.paidAmount),
        expirationLedger: invoice.expirationLedger,
        status: invoice.status,
        memo: invoice.memo,
      })
      .onConflictDoUpdate({
        target: schema.invoices.id,
        set: {
          paidAmount: BigInt(invoice.paidAmount),
          status: invoice.status,
          updatedAt: new Date(),
        },
      });
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
      .limit(1);
    return rows[0] ? rowToInvoice(rows[0]) : null;
  }

  async listAll(): Promise<Invoice[]> {
    const rows = await this.db
      .select()
      .from(schema.invoices)
      .orderBy(sql`created_at DESC`);
    return rows.map(rowToInvoice);
  }

  async __clearForTest(): Promise<void> {
    await this.db.execute(sql`DELETE FROM invoices`);
  }
}

let activeImpl: InvoiceRepository = new MemoryInvoiceRepository();

export const invoiceRepository = {
  upsert: (...args: Parameters<InvoiceRepository['upsert']>) =>
    activeImpl.upsert(...args),
  findById: (...args: Parameters<InvoiceRepository['findById']>) =>
    activeImpl.findById(...args),
  listAll: () => activeImpl.listAll(),
  __clearForTest: () => activeImpl.__clearForTest(),
};

export const initInvoiceRepository = async (
  dbUrl: string | undefined,
): Promise<void> => {
  if (!dbUrl) {
    activeImpl = new MemoryInvoiceRepository();
    return;
  }
  const db = getDb(dbUrl);
  await bootstrapSchema(db);
  activeImpl = new DrizzleInvoiceRepository(db);
};

export const __resetInvoiceRepoForTest = async (): Promise<void> => {
  activeImpl = new MemoryInvoiceRepository();
  await __closeDbForTest();
};
