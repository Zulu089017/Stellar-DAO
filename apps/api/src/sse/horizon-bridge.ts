/**
 * Server-Sent Events bridge.
 *
 * Fans out THREE streams over the same `/events` endpoint using SSE's
 * `event:` discriminator so the dashboard can open a single EventSource
 * and listen for all of them:
 *
 *   • `contract-event`     — every Soroban event observed on the bridge
 *                            contract via Horizon's
 *                            `/contracts/:id/events` stream.
 *   • `transaction-update` — every successful `transactionRepository.upsert`
 *                            call (covers wrap submissions, lifecycle
 *                            walks, future relayer webhooks).
 *   • `asset-update`       — every asset-registry mutation fired by
 *                            `POST /assets` (initial registration) or
 *                            `POST /webhooks/factory/confirm` (the
 *                            on-chain wrapperToken slot fill-in). The
 *                            dashboard's AssetTable listens for this
 *                            to flip a row from "pre-stage" to
 *                            "deployed".
 *
 * Bus-driven events are kept lossless: whatever code path calls
 * `transactionRepository.upsert` automatically fans out here, with no
 * extra plumbing on the producer side.
 */
import type { FastifyInstance } from 'fastify';
import { parseEnv } from '@stellardao/shared';
import { HorizonClient } from '@stellardao/sdk';

import { subscribeAssets, subscribeTransactions } from './event-bus.js';

export const registerSseBridge = async (app: FastifyInstance): Promise<void> => {
  const env = parseEnv.api();
  const horizon = new HorizonClient({
    baseUrl: env.HORIZON_URL,
    network: env.STELLAR_NETWORK,
  });

  app.get('/events', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.hijack();

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    // Closing helper. Idempotent — calling after the underlying
    // writable already ended is a no-op (stream.end on a closed
    // stream raises a benign ERR_STREAM_DESTROYED that we swallow).
    // Without this, the SSE stream technically stays open forever
    // (the for-await can terminus only when Horizon's
    // `_links.next === null`, which it never is in practice on a
    // healthy contract). Per SSE spec, closing tells clients "no
    // more events" — they can reconnect with `Last-Event-ID` to
    // resume. Without it, every dashboard EventSource holds a
    // socket open until process exit.
    const closeStream = (): void => {
      try {
        reply.raw.end();
      } catch {
        /* writable already destroyed — fine */
      }
    };

    writeEvent('hello', { ts: Date.now() });

    if (!env.BRIDGE_CONTRACT_ID) {
      writeEvent('warning', { message: 'BRIDGE_CONTRACT_ID not configured' });
      closeStream();
      return;
    }

    // Subscribe to the in-process transaction bus. Every
    // transactionRepository.upsert call from the wrap route (and from
    // future mint / webhook paths) fires here.
    const unsubscribeTransactions = subscribeTransactions(({ transaction }) => {
      writeEvent('transaction-update', transaction);
    });

    // Subscribe to the in-process asset bus. POST /assets fires
    // `registered` and the factory-confirmation webhook fires
    // `wrapperToken-filled`; both surface here so dashboards don't
    // need a second EventSource for the asset table.
    const unsubscribeAssets = subscribeAssets(({ entry, updateType }) => {
      writeEvent('asset-update', { entry, updateType });
    });

    req.raw.on('close', () => {
      unsubscribeTransactions();
      unsubscribeAssets();
      closeStream();
    });

    try {
      for await (const record of horizon.streamContractEvents(env.BRIDGE_CONTRACT_ID)) {
        writeEvent('contract-event', record);
      }
    } catch (err) {
      // Idempotent write — if `req.raw.on('close')` already ran
      // (client disconnected mid-retry) the stream Writable is
      // destroyed, and `writeEvent` throws ERR_STREAM_DESTROYED.
      // Silently swallow so the handler doesn't reject with the
      // swallow; closeStream() in `finally` ends the stream cleanly.
      try {
        writeEvent('error', { message: (err as Error).message });
      } catch {
        /* writable already destroyed during close race */
      }
    } finally {
      // End the SSE stream when the contract-event source has no
      // more events to deliver (normal exit or upstream throw).
      // The req.raw.on('close') handler covers the client-disconnect
      // path independently. Both paths run when client disconnects
      // mid-retry — the double unsubscribe (`off()` is idempotent)
      // and double `closeStream()` (`reply.raw.end()` is idempotent
      // via the try/catch above) are intentional, so a
      // stream-end-without-disconnect case still cleans up bus
      // subscriptions even when the disconnect path didn't fire.
      unsubscribeTransactions();
      unsubscribeAssets();
      closeStream();
    }
  });
};
