import { randomBytes, randomUUID, createHmac } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  GetMerchantResponse,
  Merchant,
  RegisterMerchantRequest,
  RegisterMerchantResponse,
  RotateApiKeyResponse,
} from '@stellar-payment-gateway/shared';

import { requireRole } from '../middleware/rbac.js';

const HMAC_SECRET = process.env.RELAYER_HMAC_SECRET ?? 'dev-secret';

const hashApiKey = (key: string): string =>
  createHmac('sha256', HMAC_SECRET).update(key).digest('hex');

const generateApiKey = (): { full: string; prefix: string; hash: string } => {
  const full = `spg_${randomBytes(24).toString('hex')}`;
  const prefix = full.slice(0, 10);
  const hash = hashApiKey(full);
  return { full, prefix, hash };
};

const RegisterMerchantSchema = z.object({
  name: z.string().min(2).max(128),
  email: z.string().email().max(256),
  website: z.string().url().max(512).optional(),
  webhookUrl: z.string().url().max(512).optional(),
});

const UpdateMerchantSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  email: z.string().email().max(256).optional(),
  website: z.string().url().max(512).optional(),
  webhookUrl: z.string().url().max(512).optional(),
});

/** In-memory store for merchants (mirrors the invoice/asset repo pattern). */
class MemoryMerchantStore {
  private byId = new Map<string, Merchant>();

  async upsert(merchant: Merchant): Promise<Merchant> {
    this.byId.set(merchant.id, merchant);
    return merchant;
  }

  async findById(id: string): Promise<Merchant | null> {
    return this.byId.get(id) ?? null;
  }

  async findByApiKeyHash(hash: string): Promise<Merchant | null> {
    for (const m of this.byId.values()) {
      if (m.apiKeyHash === hash) return m;
    }
    return null;
  }

  clear(): void {
    this.byId.clear();
  }
}

const merchantStore = new MemoryMerchantStore();

export const merchantRoutes = async (app: FastifyInstance): Promise<void> => {
  /** Register a new merchant. Returns the full API key (only once). */
  app.post<{ Body: RegisterMerchantRequest }>(
    '/',
    async (req, reply): Promise<RegisterMerchantResponse> => {
      const parsed = RegisterMerchantSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest(parsed.error.message);

      const { name, email, website, webhookUrl } = parsed.data;
      const { full, prefix, hash } = generateApiKey();

      const merchant: Merchant = {
        id: randomUUID(),
        name,
        email,
        website: website ?? '',
        webhookUrl: webhookUrl ?? '',
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        roles: 'merchant',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await merchantStore.upsert(merchant);
      return reply.code(201).send({ merchant, apiKey: full });
    },
  );

  /** Get a merchant by id. */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply): Promise<GetMerchantResponse> => {
    const merchant = await merchantStore.findById(req.params.id);
    if (!merchant) return reply.notFound('merchant not found');
    const { apiKeyHash: _, ...safe } = merchant;
    return { merchant: safe };
  });

  /** Update merchant profile. Authenticated merchant or admin only. */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireRole('merchant', 'admin')] },
    async (req, reply) => {
      const parsed = UpdateMerchantSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest(parsed.error.message);

      const merchant = await merchantStore.findById(req.params.id);
      if (!merchant) return reply.notFound('merchant not found');

      const authHeader = req.headers['authorization'] as string | undefined;
      if (authHeader) {
        const token = authHeader.replace(/^Bearer /, '');
        if (hashApiKey(token) !== merchant.apiKeyHash) {
          return reply.unauthorized('invalid API key');
        }
      }

      Object.assign(merchant, parsed.data, { updatedAt: new Date().toISOString() });
      await merchantStore.upsert(merchant);

      const { apiKeyHash: _, ...safe } = merchant;
      return { merchant: safe };
    },
  );

  /** Rotate API key. Authenticated merchant or admin only. Returns the new key (only once). */
  app.post<{ Params: { id: string } }>(
    '/:id/rotate-key',
    { preHandler: [requireRole('merchant', 'admin')] },
    async (req, reply): Promise<RotateApiKeyResponse> => {
      const merchant = await merchantStore.findById(req.params.id);
      if (!merchant) return reply.notFound('merchant not found');

      const authHeader = req.headers['authorization'] as string | undefined;
      if (authHeader) {
        const token = authHeader.replace(/^Bearer /, '');
        if (hashApiKey(token) !== merchant.apiKeyHash) {
          return reply.unauthorized('invalid API key');
        }
      }

      const { full, prefix, hash } = generateApiKey();
      merchant.apiKeyHash = hash;
      merchant.apiKeyPrefix = prefix;
      merchant.updatedAt = new Date().toISOString();
      await merchantStore.upsert(merchant);

      return { apiKey: full, apiKeyPrefix: prefix };
    },
  );
};
