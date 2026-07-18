/**
 * Fastify server factory.
 *
 * Split out from `index.ts` so test suites can spin up isolated instances
 * via `createServer().then((app) => app.inject(...))`.
 *
 * Mirrors the production wiring in `index.ts`: same plugins, same routes,
 * same SSE registration, same `sorobanSigner` / `networkPassphrase` /
 * `sorobanRpcUrl` decoration that the bridge routes rely on. The only
 * difference from `index.ts` is that the factory does NOT start
 * `app.listen()` — tests inject requests into the same instance instead.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { Keypair } from '@stellar/stellar-sdk';
import { parseEnv } from '@stellardao/shared';

import { initAssetRepository } from './db/repositories/asset-repository.js';
import { initTransactionRepository } from './db/repositories/transaction-repository.js';
import { assetRoutes } from './routes/assets.js';
import { bridgeRoutes } from './routes/bridge.js';
import { healthRoutes } from './routes/health.js';
import { transactionRoutes } from './routes/transactions.js';
import { webhookRoutes } from './routes/webhooks.js';
import { governanceRoutes } from './routes/governance.js';
import { analyticsRoutes } from './routes/analytics.js';
import { registerSseBridge } from './sse/horizon-bridge.js';
import { rateLimitPlugin } from './middleware/rate-limit.js';
import { apiKeyAuthPlugin } from './middleware/api-key-auth.js';

export type ServerOptions = {
  logger?: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    sorobanSigner: Keypair;
    networkPassphrase: string;
    sorobanRpcUrl: string;
  }
}

export const createServer = async (opts: ServerOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: opts.logger ?? false,
    // FSTDEP023: top-level `disableRequestLogging` removed for
    // fastify@6 forward-compat. Verified: with `logger: false` and
    // 89/89 `@stellardao/api` tests passing, per-request log lines
    // stay silent via pino's full opt-out — no separate toggle is
    // needed. If a future regression surfaces request lines in test
    // stderr, reintroduce a granular toggle via
    // `logController.disableRequestLogging`.
  });

  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
  });

  const env = parseEnv.api();
  const apiKeypair: Keypair | null = env.RELAYER_SECRET_KEY
    ? Keypair.fromSecret(env.RELAYER_SECRET_KEY)
    : null;
app.decorate(
  'sorobanSigner',
  apiKeypair ??
    ({
      sign: () => {
        throw new Error('API_RELAYER_SECRET_KEY not configured — see .env.example');
      },
    } as unknown as Keypair),
);
  app.decorate('networkPassphrase', env.STELLAR_NETWORK_PASSPHRASE);
  app.decorate('sorobanRpcUrl', env.SOROBAN_RPC_URL);

  // Repository swap is driven by `DATABASE_URL` — present in the
  // env means a Postgres-backed drizzle impl; absent keeps the
  // in-memory default. Doing it at createServer time (rather than at
  // module import) lets tests use createServer multiple times in the
  // same worker without leaking the swap between specs — the env
  // cache is reset in each beforeEach via `__resetEnvCache()`.
  await initAssetRepository(env.DATABASE_URL);
  await initTransactionRepository(env.DATABASE_URL);

  await app.register(rateLimitPlugin);
  await app.register(apiKeyAuthPlugin);

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(assetRoutes, { prefix: '/assets' });
  await app.register(bridgeRoutes, { prefix: '/bridge' });
  await app.register(transactionRoutes, { prefix: '/transactions' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(governanceRoutes, { prefix: '/governance' });
  await app.register(analyticsRoutes, { prefix: '/' });

  await registerSseBridge(app);

  return app;
};
