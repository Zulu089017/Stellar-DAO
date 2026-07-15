import { z } from 'zod';

const StellarNetworkSchema = z.enum(['PUBLIC', 'TESTNET', 'FUTURENET']);

const BaseEnvSchema = z.object({
  STELLAR_NETWORK: StellarNetworkSchema,
  STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
  HORIZON_URL: z.string().url(),
  SOROBAN_RPC_URL: z.string().url(),
});

const BridgeEnvSchema = BaseEnvSchema.extend({
  // The previous chain `z.string().startsWith('C').optional().default('')`
  // was a latent bug: zod v3 re-applies the `.startsWith('C')`
  // validator to the substituted default value, and `''.startsWith('C')`
  // returns false → ZodError thrown at boot for any deployment that
  // legitimately leaves these unset (e.g. a brand-new env file, an
  // ephemeral CI runner, or a web-only deployment that doesn't yet
  // have the contracts deployed). The `.regex(/^(C|$)/)` form keeps
  // the typo-prevention intent (still rejects `BRIDGE_CONTRACT_ID=foo`)
  // while allowing an empty string to satisfy the default-substitution
  // path. See `packages/shared/src/env/index.spec.ts` for the
  // regression-prevention tests.
  BRIDGE_CONTRACT_ID: z
    .string()
    .regex(/^(C|$)/, 'must start with C or be empty')
    .optional()
    .default(''),
  FACTORY_CONTRACT_ID: z
    .string()
    .regex(/^(C|$)/, 'must start with C or be empty')
    .optional()
    .default(''),
  WRAPPER_TOKEN_TEMPLATE_ID: z
    .string()
    .regex(/^(C|$)/, 'must start with C or be empty')
    .optional()
    .default(''),
  RELAYER_SECRET_KEY: z.string().optional(),
  RELAYER_PUBLIC_KEY: z.string().optional(),
  RELAYER_THRESHOLD: z.coerce.number().int().min(1).default(2),
  ETHEREUM_RPC_URL: z.string().url(),
  SOLANA_RPC_URL: z.string().url(),
  POLYGON_RPC_URL: z.string().url(),
});

const ApiEnvSchema = BridgeEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).optional(),
});

const WebEnvSchema = z.object({
  NEXT_PUBLIC_HORIZON_URL: z.string().url(),
  NEXT_PUBLIC_SOROBAN_RPC_URL: z.string().url(),
  NEXT_PUBLIC_BRIDGE_CONTRACT_ID: z.string().optional(),
  NEXT_PUBLIC_FACTORY_CONTRACT_ID: z.string().optional(),
  NEXT_PUBLIC_NETWORK_PASSPHRASE: z.string().min(1),
});

export type StellarNetwork = z.infer<typeof StellarNetworkSchema>;
export type BridgeEnv = z.infer<typeof BridgeEnvSchema>;
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type WebEnv = z.infer<typeof WebEnvSchema>;

/**
 * Lazy-load and validate environment variables once per process.
 * Returns a frozen object so accidental mutation is caught early.
 */
let cached: Partial<{ bridge: BridgeEnv; api: ApiEnv; web: WebEnv }> = {};

export const parseEnv = {
  bridge(): BridgeEnv {
    if (cached.bridge) return cached.bridge;
    cached.bridge = Object.freeze(BridgeEnvSchema.parse(process.env));
    return cached.bridge!;
  },
  api(): ApiEnv {
    if (cached.api) return cached.api;
    cached.api = Object.freeze(ApiEnvSchema.parse(process.env));
    return cached.api!;
  },
  web(): WebEnv {
    if (cached.web) return cached.web;
    cached.web = Object.freeze(WebEnvSchema.parse({
      ...process.env,
      NEXT_PUBLIC_HORIZON_URL:
        process.env.NEXT_PUBLIC_HORIZON_URL ?? process.env.HORIZON_URL ?? '',
      NEXT_PUBLIC_SOROBAN_RPC_URL:
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? process.env.SOROBAN_RPC_URL ?? '',
      NEXT_PUBLIC_NETWORK_PASSPHRASE:
        process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
        process.env.STELLAR_NETWORK_PASSPHRASE ??
        '',
    }));
    return cached.web!;
  },
};

/** Reset env cache — test-only. */
export const __resetEnvCache = () => {
  cached = {};
};
