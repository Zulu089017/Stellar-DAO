/**
 * `handleFactoryConfirmation` webhook.
 *
 * Closes the `TODO(50-item backlog, factory-confirmation)` from
 * `routes/assets.ts::POST /assets`. That route creates the asset
 * registry entry with `wrapperToken: ''` as a pre-stage pattern so
 * the dashboard can subscribe to confirmations BEFORE the on-chain
 * contract exists. Once Soroban confirms the factory deployment
 * transaction and the on-chain wrapper-token contract id is known,
 * the partner (relayer or sender SDK) POSTs here to fill the empty
 * slot.
 *
 * 404 on missing pre-stage is INTENTIONAL — auto-creating an entry
 * on the fly would race with the user's POST /assets (which writes
 * `wrapperToken: ''` unconditionally and would overwrite the
 * just-arrived fill-in). 404 forces the partner to retry AFTER the
 * user's POST has established the pre-stage; the relayer control
 * loop already does this (see `apps/relayer/operator/relay-pipeline
 * .ts`).
 *
 * Security: HMAC-SHA256 verification of `X-Stellar-DAO-Signature`
 * is MANDATORY when `RELAYER_HMAC_SECRET` is configured. The
 * signature is `hex(hmac_sha256(RELAYER_HMAC_SECRET,
 * JSON.stringify(body))`; the server compares in constant time via
 * `crypto.timingSafeEqual` after a length pre-check (to avoid the
 * comparison call throwing on length mismatch). 401 on any
 * mismatch — missing header, malformed hex, wrong digest,
 * length-mismatched hex, body that doesn't match. When the secret
 * is empty (test suite / local dev / ephemeral CI), the endpoint
 * still enforces strict zod shape validation but skips the HMAC
 * check; this is intentional and documented in `env/index.ts`.
 *
 * Body canonicalization: `JSON.stringify(req.body)` is the simple
 * form here. Fastify's flat body parser preserves insertion order
 * when the producer side uses the same parser (the test suite
 * injects JSON-shaped payloads directly, so producer + consumer
 * agree). A future hardening pass to switch to canonical JSON
 * (`safe-stable-stringify`) is tracked as a follow-up.
 */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { parseEnv } from '@stellardao/shared';

import { assetRepository } from '../db/repositories/asset-repository.js';
import { broadcastAssetUpdate } from '../sse/event-bus.js';

/**
 * Soroban contract id is `StrKey.encodeContract(32-byte-hash)` =
 * RFC 4648 base32 of `(version-byte || 32-byte-hash || 2-byte-crc16)`
 * = **(1 prefix + 55 base32) = exactly 56 chars total**.
 *
 * The `C` prefix is NOT appended; it IS the version byte's base32
 * representation (the contract version byte `0x02` was chosen such
 * that its base32 starts with `C`). This is why the regex requires
 *   - leading `C` prefix (contract addresses only — account
 *     addresses start with `G`)
 *   - exactly 55 chars of `[A-Z2-7]` AFTER the prefix
 *
 * Stellar's strkey encoding uses RFC 4648 base32 alphabet which
 * **excludes `0`, `O`, `I`, `1`** to avoid visual ambiguity. The
 * accepted character set is `[A-Z2-7]` (32 distinct symbols → no
 * padding, no lowercase).
 *
 * This is intentionally stricter than the env-time
 * `.regex(/^(C|$)/)` form used in `env/index.ts` for `BRIDGE_CONTRACT_ID`
 * etc. — the webhook's SOLE contract is "deliver the deployed
 * contract id", so empty / malformed values can only be a bug or
 * hostile input.
 */
const SOROBAN_CONTRACT_ID = /^C[A-Z2-7]{55}$/;

const FactoryConfirmationSchema = z.object({
  sourceChain: z.enum(['ethereum', 'solana', 'polygon']),
  sourceToken: z.string().min(1),
  wrapperToken: z.string().regex(SOROBAN_CONTRACT_ID, 'expected 56-char Soroban contract id'),
});

export const webhookRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post<{ Body: z.infer<typeof FactoryConfirmationSchema> }>(
    '/factory/confirm',
    async (req, reply) => {
      const parsed = FactoryConfirmationSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest(parsed.error.message);

      const { sourceChain, sourceToken, wrapperToken } = parsed.data;

      // HMAC verification — only enforced when the secret is configured.
      // Empty secret => dev/test/ephemeral-CI mode (still shape-validated
      // above, but producers don't need to sign). Production deployments
      // set `RELAYER_HMAC_SECRET` so a malicious actor with knowledge of
      // a publicly-known sourceToken cannot POST a fake confirmation.
      const env = parseEnv.api();
      const secret = env.RELAYER_HMAC_SECRET;
      if (secret) {
        const provided = req.headers['x-stellar-dao-signature'];
        if (typeof provided !== 'string' || provided.length === 0) {
          return reply.unauthorized('missing X-Stellar-DAO-Signature');
        }
        // Producer-coupling assumption: the partner MUST compute the
        // signature as `hex(hmac_sha256(RELAYER_HMAC_SECRET,
        // JSON.stringify(body)))` using the same compact, no-space
        // JSON.stringify() that Fastify's body parser emits on the wire.
        // A producer that pretty-prints (`.stringify(body, null, 2)`)
        // or that re-orders keys will fail HMAC here even though the
        // parsed JSON is semantically equivalent — the simple form
        // is sufficient for every existing producer (relayer +
        // sender SDK both use compact stringification). Track
        // canonical JSON via `safe-stable-stringify` as a future
        // hardening pass so new producers can pretty-print without
        // a contract bump.
        const expectedHex = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(req.body))
          .digest('hex');
        const providedBuf = Buffer.from(provided, 'hex');
        const expectedBuf = Buffer.from(expectedHex, 'hex');
        // `timingSafeEqual` throws on length mismatch — pre-check first
        // so we still emit a 401 (not a 500) for length-bad headers.
        if (
          providedBuf.length !== expectedBuf.length ||
          !crypto.timingSafeEqual(providedBuf, expectedBuf)
        ) {
          return reply.unauthorized('X-Stellar-DAO-Signature mismatch');
        }
      }

      const existing = await assetRepository.findBySource(sourceChain, sourceToken);
      if (!existing) {
        return reply.notFound(
          'no pre-stage asset registration for this source; POST /assets first',
        );
      }

      const entry = await assetRepository.upsertBySource({
        ...existing,
        wrapperToken,
      });

      broadcastAssetUpdate(entry, 'wrapperToken-filled');
      reply.code(202).send({ entry });
    },
  );
};
