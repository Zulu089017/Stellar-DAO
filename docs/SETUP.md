# Setup

## Prerequisites

1. **Node 20.11+** — `nvm use 20.11.0`
2. **pnpm 9+** — `npm i -g pnpm`
3. **Rust + cargo** — install via [rustup](https://rustup.rs)
4. **WASM target** — `rustup target add wasm32-unknown-unknown`
5. **stellar-cli** — <https://developers.stellar.org/docs/tools/developer-tools>
6. *(optional)* **Postgres 14+** — only needed if you swap the in-memory
   repos for the Drizzle schema in `apps/api/src/db/schema.ts`.

## First-time setup

```bash
nvm use                     # pick the .nvmrc version
pnpm install                # bootstrap the polyrepo
cp .env.example .env        # fill in RPCs / network / signing key
```

## Build, test, run

```bash
# Soroban contracts
pnpm contracts:build        # cargo build --target wasm32-unknown-unknown --release
pnpm contracts:test         # cargo test --workspace

# TypeScript packages
pnpm lint
pnpm typecheck
pnpm test

# Run the stack
pnpm --filter @stellar-payment-gateway/api dev         # Fastify on :4000
pnpm --filter @stellar-payment-gateway/relayer dev     # cross-chain watcher in cluster mode
pnpm --filter @stellar-payment-gateway/web dev         # Next.js on :3000

# Or run everything in parallel via Turbo:
pnpm dev
```

## Deploying contracts to Testnet

```bash
pnpm contracts:deploy
```

The script:

1. Compiles all Soroban contracts to WASM.
2. Calls `stellar contract deploy` against your configured network.
3. Records the resulting contract ids back into `.env`.

## Generating TS bindings

```bash
pnpm bindings:generate
```

Writes `packages/soroban-client/src/bindings/{bridge,factory,wrapper-token}.ts`.

## Daily workflow

| Task                                         | Command |
|----------------------------------------------|---------|
| Edit a contract                              | `cd contracts/<name> && cargo test` |
| Edit the API                                 | `pnpm --filter @stellar-payment-gateway/api dev` |
| Edit the dashboard                           | `pnpm --filter @stellar-payment-gateway/web dev` |
| Edit the relayer                             | `pnpm --filter @stellar-payment-gateway/relayer dev` |
| Reset all build artefacts                    | `pnpm clean` |
