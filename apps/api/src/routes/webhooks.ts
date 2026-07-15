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
 * Security: this endpoint is intentionally UNAUTHENTICATED for item
 * 12 — strict shape validation gates against random payload
 * guessing, and the on-chain confirmation proof is implicit in
 * the partner deciding to POST. Without HMAC, a malicious actor
 * with knowledge of a publicly known sourceToken (e.g. USDC on
 * Ethereum) could POST a fake confirmation here and divert lock
 * events to a wrapper token they control — silent fill-in is the
 * blocking case.
 *
 * TODO(security, future): validate `X-Stellar-DAO-Signature`
 * HMAC-SHA256 of `JSON.stringify(req.body)` against a shared secret
 * loaded from `RELAYER_HMAC_SECRET` env var; constant-time
 * comparison; respond 401 on mismatch. This closes the silent-
 * fill-in attack above without changing the public schema.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
