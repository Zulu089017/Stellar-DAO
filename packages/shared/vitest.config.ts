import { defineConfig } from 'vitest/config';

// Minimal vitest config. The packages/sdk and apps/api configs need
// `test.server.deps.inline` for `@noble/*` / `@stellar/*` SDKs that
// ship dual ESM/CJS, but `@stellar-payment-gateway/shared` is pure TS + zod —
// nothing in the tree needs inline transformation, so defaults are
// fine here.

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
