import type { FastifyInstance } from 'fastify';
import type { Transaction, ListTransactionsResponse, GetTransactionResponse } from '@stellar-payment-gateway/shared';

import { transactionRepository } from '../db/repositories/transaction-repository.js';

export const transactionRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get<{ Querystring: { limit?: string } }>('/', async ({ query }): Promise<ListTransactionsResponse> => {
    const requested = Number(query.limit ?? 50);
    const limit = Math.min(Number.isFinite(requested) ? requested : 50, 200);
    const transactions: Transaction[] = await transactionRepository.listRecent(limit);
    return { transactions };
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply): Promise<GetTransactionResponse> => {
    const tx = await transactionRepository.findById(req.params.id);
    if (!tx) return reply.notFound('transaction not found');
    return { transaction: tx };
  });
};
