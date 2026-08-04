import { defineConfig } from 'vitest/config';

/**
 * Vitest config for `@stellar-payment-gateway/sdk`.
 *
 * `@noble/hashes` and `@noble/curves` ship as dual ESM/CJS packages; their
 * subpath imports (`@noble/hashes/sha256`, `@noble/curves/secp256k1`) are
 * pure ESM and Vitest's default server-deps externalisation fails to
 * resolve them through Vitest's CJS-loader shim. We force-include any
 * matching specifier so they load through Node's native ESM resolver.
 */
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@noble\//],
      },
    },
  },
});
