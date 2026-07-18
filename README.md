# StellarDAO

> A cross-chain wrapping middleware for the Stellar ecosystem.
> Spin up wrapped versions of your Ethereum, Solana, or Polygon tokens on Stellar in minutes — leveraging Stellar's ultra-low fees and Horizon-powered real-time settlement.

StellarDAO is a **polyrepo (monorepo)** that ships:

- **Soroban smart contracts** — `bridge`, `factory`, and a `wrapper-token` template that mints/burns on Stellar in response to signed cross-chain messages.
- **A relayer** that watches source chains for `Lock` events and posts signed attestations to the `bridge` contract.
- **A REST/SSE API** that powers the dashboard and exposes the asset registry.
- **A real-time dashboard** built with Next.js 15 that streams Horizon events straight to the user's browser.

```
                 ┌────────────────────────────┐
                 │  source chains (Ethereum,  │
                 │  Solana, Polygon…)         │
                 └─────────────┬──────────────┘
                               │  Lock event
                               ▼
       ┌──────────────────────────────────────────┐
       │  relayer (apps/relayer)                  │
       │  – observes lock                         │
       │  – signs attestation (secp256k1/ed25519) │
       └─────────────┬────────────────────────────┘
                     │  signed attestation
                     ▼
       ┌──────────────────────────────────────────┐
       │  Soroban:  bridge ─► factory ─► wrapper  │
       │   (contracts/)    deploys   mint/burn    │
       └─────────────┬────────────────────────────┘
                     │  Soroban events
                     ▼
              ┌──────────────┐    ┌────────────────────┐
              │  Horizon SSE │◄───┤  apps/api  apps/web │
              └──────────────┘    └────────────────────┘
```

## Repository layout (polyrepo)

```
stellardao/
├── apps/
│   ├── api/        Fastify REST + SSE   (service layer over Horizon)
│   ├── relayer/    Node watcher        (off-chain cross-chain orchestrator)
│   └── web/        Next.js 15 frontend (real-time wrap dashboard)
├── contracts/
│   ├── bridge/            verify attestations, route to wrapper-token
│   ├── factory/           registry + deploy new wrapper-tokens
│   ├── wrapper-token/     capped-mint template the factory clones
│   ├── governance-token/  SEP-41 token with delegation and checkpointing
│   ├── governance/        proposal creation, voting, and execution
│   └── timelock/          delayed execution for governance safety
├── packages/
│   ├── shared/         cross-package types, constants, env utils
│   ├── sdk/            high-level Stellar client (TxBuilder, asset ops)
│   ├── soroban-client/ auto-generated TS bindings
│   ├── ui/             shared React components
│   ├── eslint-config/  shareable ESLint preset
│   └── tsconfig/       shareable tsconfig presets
├── scripts/             deploy.ts, generate-bindings.ts, verify.ts
├── docs/                ARCHITECTURE.md, SECURITY.md, API.md, SETUP.md, CONTRIBUTING.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Features

- **Cross-chain wrapping**: Lock ERC-20/SPL/Polygon tokens → mint wrapped tokens on Stellar
- **DAO Governance**: On-chain proposals, voting, delegation, and timelocked execution
- **Real-time dashboard**: Horizon SSE-powered live transaction and asset feed
- **Bridge security**: Multi-sig verifier set, pause/unpause, nonce replay protection
- **Protocol fees**: Configurable fee structure in basis points
- **Multi-wallet support**: Freighter and Albedo browser extensions
- **API**: REST + SSE with rate limiting, API key auth, and input sanitization
- **Analytics**: TVL, volume, and chain-level protocol metrics

## Quickstart

Prerequisites:

- Node 20.11+  (`nvm use`)
- pnpm 9+      (`npm i -g pnpm`)
- Rust + cargo (for the Soroban contracts)
- `stellar-cli` from the [Stellar release page](https://developers.stellar.org/docs/tools/developer-tools)

```bash
pnpm install
cp .env.example .env          # then fill in your keys / contract IDs
pnpm contracts:build          # compile Soroban contracts to WASM
pnpm bindings:generate        # emit TypeScript bindings -> packages/soroban-client
pnpm dev                      # run web/api/relayer in parallel
```

Or run individual pieces:

```bash
pnpm --filter @stellardao/web dev      # next.js dashboard only
pnpm --filter @stellardao/api dev      # fastify api only
pnpm --filter @stellardao/relayer dev  # relayer only
```

For deeper context, see:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/SETUP.md`](docs/SETUP.md)
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)

## License

MIT — see [`LICENSE`](LICENSE).
