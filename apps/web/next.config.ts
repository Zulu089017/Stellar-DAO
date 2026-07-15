import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stellardao/shared', '@stellardao/sdk', '@stellardao/ui', '@stellardao/soroban-client'],
  // ESM-style TypeScript monorepo: source files use `.js` extensions in
  // their imports (matching what will be the compiled output), but
  // webpack by default doesn't try `.ts`/`.tsx` when resolving `.js`
  // imports inside transpiled workspace packages. The `extensionAlias`
  // re-routes the resolver so a `./types/index.js` import inside
  // `packages/shared/src/index.ts` lands on `./types/index.ts`.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
  // `typedRoutes` graduated from `experimental` in Next.js 15 — moving
  // it up here now also silences the documented migration warning
  // surfaced during `next build`.
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
