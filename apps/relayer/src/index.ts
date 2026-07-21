import pino from 'pino';
import { Keypair } from '@stellar/stellar-sdk';
import { parseEnv, type SourceChainId } from '@stellardao/shared';
import {
  BridgeContract,
  buildLockDigest,
  signEd25519,
} from '@stellardao/sdk';

import { ethereumWatcher } from './sources/ethereum.js';
import { solanaWatcher } from './sources/solana.js';
import { polygonWatcher } from './sources/polygon.js';
import { detector } from './detector.js';
import { eventQueue } from './state/event-queue.js';
import { signer } from './operator/signer.js';
import { handleLockEvent } from './operator/relay-pipeline.js';
import type { LockEvent } from './sources/types.js';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty' },
});

const env = parseEnv.api();

async function main() {
  log.info({ network: env.STELLAR_NETWORK }, 'StellarDAO relayer starting');

  if (!env.RELAYER_PUBLIC_KEY || !env.RELAYER_SECRET_KEY) {
    log.warn('relayer signing key not set — submissions will be dry-run');
  }

  const bridge = new BridgeContract(env.BRIDGE_CONTRACT_ID ?? '');
  const sourceKeypair = env.RELAYER_SECRET_KEY
    ? Keypair.fromSecret(env.RELAYER_SECRET_KEY)
    : Keypair.random();

  const networkSources: Record<SourceChainId, (rpcUrl: string) => Promise<unknown>> = {
    ethereum: (rpcUrl) => ethereumWatcher(rpcUrl),
    solana: (rpcUrl) => solanaWatcher(rpcUrl),
    polygon: (rpcUrl) => polygonWatcher(rpcUrl),
  };

  // `env` is `ApiEnv`; the three RPC URLs are `ETHEREUM_RPC_URL`,
  // `SOLANA_RPC_URL`, `POLYGON_RPC_URL`. The template-literal index
  // `${chain}_RPC_URL` can't be statically resolved against the
  // `ApiEnv` key set (TS7053), so we narrow via a typed lookup.
  const rpcUrlFor = (chain: SourceChainId): string => {
    switch (chain) {
      case 'ethereum':
        return env.ETHEREUM_RPC_URL;
      case 'solana':
        return env.SOLANA_RPC_URL;
      case 'polygon':
        return env.POLYGON_RPC_URL;
    }
  };

  // Common deps shared by every chain's emit handler. `handleLockEvent`
  // (in `./operator/relay-pipeline.ts`) takes this deps struct so the
  // production wiring and the test seam (relay-pipeline.spec.ts) can
  // share the exact same shape.
  const pipelineDeps = {
    eventQueue,
    buildLockDigest,
    signEd25519,
    signer,
    bridge,
    sourceKeypair,
    relayerPK: env.RELAYER_PUBLIC_KEY ?? '',
    relayerSecretKey: env.RELAYER_SECRET_KEY,
    networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    sorobanRpcUrl: env.SOROBAN_RPC_URL,
  };

  for (const chain of Object.keys(networkSources) as SourceChainId[]) {
    void detector(
      chain,
      async () => networkSources[chain](rpcUrlFor(chain)),
      (event: LockEvent) => handleLockEvent(chain, event, pipelineDeps),
    );
  }
}

main().catch((err) => log.error(err));
