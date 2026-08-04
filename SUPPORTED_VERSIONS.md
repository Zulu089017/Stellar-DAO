# Supported Versions

## Release Policy

Stellar Payment Gateway follows [Semantic Versioning](https://semver.org/).

- **Major** (X.0.0): Breaking changes to contracts, APIs, or SDK interfaces
- **Minor** (0.X.0): New features, backwards-compatible
- **Patch** (0.0.X): Bug fixes, security patches

## Current Status

| Version      |      Status      | EOL        |
| ------------ | :--------------: | ---------- |
| 0.3.x (main) |    🟢 Active     | —          |
| 0.2.x        | 🟡 Security-only | 2026-12-31 |
| 0.1.x        |  🔴 End of Life  | 2026-06-30 |

## Component Compatibility Matrix

| Component                          |  0.3.x  | 0.2.x  |
| ---------------------------------- | :-----: | :----: |
| Smart Contracts (Soroban)          | ✅ v22+ | ⚠️ v21 |
| API Server (Fastify 5)             |   ✅    |   ❌   |
| Web App (Next.js 15)               |   ✅    |   ❌   |
| SDK (@stellar-payment-gateway/sdk) |   ✅    |   ⚠️   |
| Relayer                            |   ✅    |   ❌   |
| Soroban Client                     |   ✅    |   ⚠️   |

## Upgrade Path

### 0.2.x → 0.3.x

1. Deploy new contract wasm blobs (12 contracts, all re-audited)
2. Migrate API server to Fastify 5 (breaking middleware changes)
3. Update SDK imports to new contract bindings
4. Run database migrations for invoices + merchants tables

### 0.1.x → 0.2.x

1. Re-deploy bridge + factory contracts (v0.2 bytecode)
2. Update relayer to new event schemas
3. Migrate Horizon SSE to new endpoint

## Long-Term Support (LTS)

LTS releases are designated every 6 months and receive:

- Security patches for 12 months
- Critical bug fixes for 9 months
- No new features

The first LTS release is planned for v1.0.0.
