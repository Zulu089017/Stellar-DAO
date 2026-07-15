import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ListAssetsResponse,
  CreateAssetRequest,
  CreateAssetResponse,
  AssetRegistryEntry,
  SourceChainId,
} from '@stellardao/shared';

import { factory } from '../soroban/index.js';
import { assetRepository } from '../db/repositories/asset-repository.js';

const ChainEnum = z.enum(['ethereum', 'solana', 'polygon']);

const CreateAssetSchema = z.object({
  source: z.object({
    chain: z.enum(['ethereum', 'solana', 'polygon']),
    address: z.string().min(8),
  }),
  name: z.string().min(2).max(64),
  symbol: z.string().min(1).max(16),
  decimals: z.number().int().min(0).max(18),
});

export const assetRoutes = async (app: FastifyInstance): Promise<void> => {
  /**
   * Default page size + ceiling. Mirrors `transactions.ts` so the
   * API surface is consistent across aggregated read endpoints;
   * callers who attempt `?limit=999` get capped silently (the wire
   * response shape is unchanged) rather than a 400.
   */
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 200;

  app.get<
    { Querystring: { limit?: string; sourceChain?: string; cursor?: string } }
  >('/', async (req, reply): Promise<ListAssetsResponse> => {
    if (req.query.sourceChain !== undefined) {
      const parsed = ChainEnum.safeParse(req.query.sourceChain);
      if (!parsed.success) {
        return reply.badRequest('unsupported sourceChain');
      }
    }
    // Clamp `limit` to the [1, MAX_LIMIT] range so negative inputs
    // (`?limit=-5`) or zero inputs (`?limit=0`) can't squeeze a
    // negative `slice()` argument into the repo layer
    // (`Array.prototype.slice(0, -5)` returns the first `N-5` rows,
    // which is the OPPOSITE of "return zero rows"). Mirror the
    // transactions.ts shape for cross-route parity, then add the
    // Math.max(1, …) floor that transactions.ts is missing.
    const requested = Number(req.query.limit ?? DEFAULT_LIMIT);
    const limit = Math.max(
      1,
      Math.min(
        Number.isFinite(requested) ? requested : DEFAULT_LIMIT,
        MAX_LIMIT,
      ),
    );
    const cursor = req.query.cursor ?? '';
    const sourceChain = req.query.sourceChain as SourceChainId | undefined;
    const { entries, nextCursor } = await assetRepository.listByFilter({
      sourceChain,
      limit,
      cursor,
    });
    return {
      assets: entries.map((entry) => ({
        id: entry.id,
        source: entry.source,
        wrapperToken: entry.wrapperToken,
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
      })),
      // Translate repo-level `null` (last-page marker) to JS-undefined
      // so JSON serialization drops the key entirely. Matches the
      // optional-fields convention used by Transaction.sourceTxHash.
      ...(nextCursor ? { nextCursor } : {}),
    };
  });

  app.get<{ Params: { chain: string; address: string } }>(
    '/:chain/:address',
    async (req, reply) => {
      const { chain, address } = req.params;
      const parsedChain = ChainEnum.safeParse(chain);
      if (!parsedChain.success) {
        return reply.badRequest('unsupported chain');
      }
      const typedChain: SourceChainId = parsedChain.data;
      const entry: AssetRegistryEntry | null = await assetRepository.findBySource(typedChain, address);
      if (!entry) return reply.notFound('no wrapper deployed for this source token');
      return entry;
    },
  );

  app.post<{ Body: CreateAssetRequest }>('/', async (req, reply) => {
    const parsed = CreateAssetSchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { source, name, symbol, decimals } = parsed.data;

    const developerPK = req.headers['x-developer-public-key'];
    if (typeof developerPK !== 'string' || !developerPK.startsWith('G')) {
      return reply.badRequest('missing or invalid x-developer-public-key header');
    }

    const factoryContract = factory();
    const op = factoryContract.buildCreateWrapperAsset(developerPK, {
      sourceChain: source.chain,
      sourceToken: source.address,
      name,
      symbol,
      decimals,
    });

    const txHash = await factoryContract.simulateAndSubmit(
      {
        factoryContractId: factoryContract.contractId,
        sourceKeypair: app.sorobanSigner,
        networkPassphrase: app.networkPassphrase,
        sorobanRpcUrl: app.sorobanRpcUrl,
      },
      op,
    );

    // Pre-stage pattern: `factory.simulateAndSubmit` returns the txHash
    // synchronously, but the on-chain wrapper-token contract address is
    // computed only after Soroban confirms the deployment (filling the
    // slot is the responsibility of the future `handleFactoryConfirmation`
    // webhook — TODO(50-item backlog, factory-confirmation)). The
    // registry entry is upserted with an empty `wrapperToken` so the
    // dashboard can subscribe to confirmations BEFORE the on-chain
    // contract exists. Asset integration tests assert this empty-string
    // pre-stage; do NOT replace with a stub value without updating
    // `apps/api/src/routes/assets.integration.spec.ts` accordingly.
    const entry = await assetRepository.upsertBySource({
      wrapperToken: '',
      source,
      symbol,
      name,
      decimals,
    });

    const body: CreateAssetResponse = { wrapperToken: entry.wrapperToken, txHash };
    reply.code(202).send(body);
  });
};
