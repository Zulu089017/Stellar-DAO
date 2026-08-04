import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  GetInvoiceResponse,
  Invoice,
  ListInvoicesResponse,
  PayInvoiceRequest,
} from '@stellar-payment-gateway/shared';

import { invoiceRepository } from '../db/repositories/invoice-repository.js';
import { requireAuth } from '../middleware/rbac.js';

const CreateInvoiceSchema = z.object({
  payer: z.string().min(1),
  token: z.string().min(1).max(16),
  totalAmount: z.string().regex(/^\d+$/, 'must be a positive integer string'),
  expirationLedger: z.number().int().positive(),
  memo: z.string().max(256).optional(),
});

const PayInvoiceSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'must be a positive integer string'),
});

export const invoiceRoutes = async (app: FastifyInstance): Promise<void> => {
  /** Create an invoice. The authenticated caller becomes the creator. */
  app.post<{ Body: CreateInvoiceRequest }>(
    '/',
    { preHandler: [requireAuth] },
    async (req, reply): Promise<CreateInvoiceResponse> => {
      const parsed = CreateInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest(parsed.error.message);

      const { payer, token, totalAmount, expirationLedger, memo } = parsed.data;
      const creator = req.user!.sub;

      const invoice: Invoice = {
        id: randomUUID(),
        creator,
        payer,
        token,
        totalAmount,
        paidAmount: '0',
        expirationLedger,
        status: 'created',
        memo: memo ?? '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await invoiceRepository.upsert(invoice);
      return reply.code(201).send({ invoice });
    },
  );

  /** List all invoices, newest first. */
  app.get('/', async (): Promise<ListInvoicesResponse> => {
    const invoices = await invoiceRepository.listAll();
    return { invoices };
  });

  /** Get an invoice by id. */
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (req, reply): Promise<GetInvoiceResponse> => {
      const invoice = await invoiceRepository.findById(req.params.id);
      if (!invoice) return reply.notFound('invoice not found');
      return { invoice };
    },
  );

  /** Pay an invoice (full or partial). Only the designated payer can call this. */
  app.patch<{ Params: { id: string }; Body: PayInvoiceRequest }>(
    '/:id/pay',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const parsed = PayInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest(parsed.error.message);

      const payer = req.user!.sub;
      if (!payer) {
        return reply.unauthorized('missing x-authenticated-address header');
      }

      const invoice = await invoiceRepository.findById(req.params.id);
      if (!invoice) return reply.notFound('invoice not found');
      if (invoice.payer !== payer) return reply.forbidden('only the designated payer can pay this invoice');
      if (invoice.status === 'paid') return reply.badRequest('invoice already paid');
      if (invoice.status === 'cancelled') return reply.badRequest('invoice is cancelled');
      if (invoice.status === 'expired') return reply.badRequest('invoice has expired');

      const amount = BigInt(parsed.data.amount);
      const paidSoFar = BigInt(invoice.paidAmount);
      const total = BigInt(invoice.totalAmount);
      const newPaid = paidSoFar + amount;
      if (newPaid > total) return reply.badRequest('payment exceeds total amount');

      invoice.paidAmount = newPaid.toString();
      invoice.status = newPaid === total ? 'paid' : 'partially_paid';
      invoice.updatedAt = new Date().toISOString();

      await invoiceRepository.upsert(invoice);
      return { invoice };
    },
  );

  /** Cancel an invoice. Only the creator can cancel. */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const creator = req.user!.sub;

      const invoice = await invoiceRepository.findById(req.params.id);
      if (!invoice) return reply.notFound('invoice not found');
      if (invoice.creator !== creator) return reply.forbidden('only the creator can cancel this invoice');
      if (invoice.status === 'paid') return reply.badRequest('cannot cancel a paid invoice');
      if (invoice.status === 'cancelled') return reply.badRequest('invoice already cancelled');

      invoice.status = 'cancelled';
      invoice.updatedAt = new Date().toISOString();
      await invoiceRepository.upsert(invoice);
      return { invoice };
    },
  );
};
