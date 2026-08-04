# `@stellar-payment-gateway/api`

The middle layer between the source-chain relayer, the Soroban
contracts, and the dashboard. Fastify because of the rich plugin
ecosystem (cors, helmet, SSE, status routes for k8s healthchecks). All
persistent state currently lives in in-memory stubs in
`src/db/repositories/*` — the Postgres schema is wired via Drizzle in
`src/db/schema.ts` and `drizzle.config.ts` so the swap is mechanical.

## Routes

| Method | Path                                  | Notes |
|--------|---------------------------------------|-------|
| GET    | `/health`                             | horizon ping + contract IDs snapshot |
| GET    | `/assets`                             | full registry list |
| GET    | `/assets/:chain/:address`             | lookup single wrapper-token by source |
| POST   | `/assets`                             | create a new wrapper-token (developer-key signed request) |
| GET    | `/transactions`                       | recent transactions (50 by default, max 200) |
| GET    | `/transactions/:id`                   | single transaction by id |
| POST   | `/bridge/mint`                        | submit signed `mint_with_attestation` op |
| POST   | `/bridge/burn`                        | submit signed `burn_with_attestation` op |
| GET    | `/events`                             | SSE stream of all bridge contract events |

## Scripts

```bash
pnpm dev      # tsx-watch
pnpm build
pnpm start
pnpm test
```

## What's NOT in the scaffold

`bridge.simulateAndSubmit` and `factory.simulateAndSubmit` throw;
filling them in means calling soroban-rpc `simulateTransaction` →
`sendTransaction` and writing the tx hash back to the in-memory repos.
The shim lives in `src/soroban/contracts-shim.ts` for clarity.
