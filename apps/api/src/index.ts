import Fastify from 'fastify';
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
import { registerSseBridge } from './sse/horizon-bridge.js';

const env = parseEnv.api();

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: { target: 'pino-pretty' },
  },
});

await app.register(sensible);
await app.register(helmet);
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? false : true,
});

// Decorate the Fastify instance with the Soroban signing keypair and the
// network passphrase so route handlers can submit transactions without
// re-reading env.
const apiKeypair: Keypair | null = env.RELAYER_SECRET_KEY
  ? Keypair.fromSecret(env.RELAYER_SECRET_KEY)
  : null;
app.decorate(
  'sorobanSigner',
  apiKeypair ?? {
    sign: () => {
      throw new Error('API_RELAYER_SECRET_KEY not configured — see .env.example');
    },
  } as unknown as Keypair,
);
app.decorate('networkPassphrase', env.STELLAR_NETWORK_PASSPHRASE);
app.decorate('sorobanRpcUrl', env.SOROBAN_RPC_URL);

// Repository swap mirrors the createServer wiring: presence of
// DATABASE_URL enables the drizzle-backed repos (with raw-SQL
// `CREATE TABLE IF NOT EXISTS` bootstrap); absence keeps the in-memory
// defaults so the scaffold still boots against an empty `.env`.
await initAssetRepository(env.DATABASE_URL);
await initTransactionRepository(env.DATABASE_URL);

declare module 'fastify' {
  interface FastifyInstance {
    sorobanSigner: Keypair;
    networkPassphrase: string;
    sorobanRpcUrl: string;
  }
}

await app.register(healthRoutes, { prefix: '/health' });
await app.register(assetRoutes, { prefix: '/assets' });
await app.register(bridgeRoutes, { prefix: '/bridge' });
await app.register(transactionRoutes, { prefix: '/transactions' });

await registerSseBridge(app);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  // `process.exit(0)` is intentional here — the SIGINT/SIGTERM handler
  // is the explicit termination point. The `no-process-exit` lint rule
  // is too aggressive for a long-running server's signal handlers, so
  // we explicitly opt out for this single line.
  // eslint-disable-next-line no-process-exit
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

app.listen({ port: env.API_PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    // Surface the bind error to whoever started the process. Throwing is
    // the lint-preferred path (`no-process-exit`) — the Node.js entrypoint
    // already prints the uncaught rejection and exits with code 1.
    app.log.error(err);
    throw err;
  }
  app.log.info(`StellarDAO API listening at ${address}`);
});
