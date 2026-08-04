# Stellar Payment Gateway

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/stellar-payment-gateway/stellar-payment-gateway-sdk-main/ci.yml?branch=main&label=CI" alt="CI Status" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/pnpm-9%2B-orange" alt="pnpm 9+" />
  <img src="https://img.shields.io/badge/node-20.11%2B-green" alt="Node 20.11+" />
  <img src="https://img.shields.io/badge/soroban--sdk-21.7.7-purple" alt="Soroban SDK 21.7.7" />
</p>

> **A production-grade payment ecosystem powered by Stellar and Soroban.**
> Cross-chain wrapping, DAO governance, invoicing, merchant payments — all settled on Stellar in under 5 seconds with Horizon-powered real-time updates.

---

## Architecture

Stellar Payment Gateway is a **polyrepo monorepo** built in three layers:

```
┌──────────────────────────────────────────────────────────────────┐
│                      SOURCE CHAINS                                │
│           Ethereum · Solana · Polygon                             │
└──────────────────────┬───────────────────────────────────────────┘
                       │  Lock / Payment Event
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    RELAYER LAYER                                  │
│     apps/relayer — watches source chains, signs attestations     │
│     (secp256k1 · ed25519 · multi-party threshold)                │
└──────────────────────┬───────────────────────────────────────────┘
                       │  Signed Attestation
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                 SOROBAN SMART CONTRACTS                           │
│  bridge → factory → wrapper-token  (asset wrapping)              │
│  governance-token → governance → timelock  (DAO)                 │
└──────────────────────┬───────────────────────────────────────────┘
                       │  Soroban Events
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                                   │
│  apps/api (Fastify)  ───  Horizon SSE  ───  apps/web (Next.js)   │
│       REST + SSE                       Real-time Dashboard        │
└──────────────────────────────────────────────────────────────────┘
```

## Repository Layout

```
stellar-payment-gateway/
├── apps/
│   ├── api/          Fastify REST + SSE API with Postgres
│   ├── relayer/      Cross-chain event watcher & attestation signer
│   └── web/          Next.js 15 dashboard with real-time SSE
├── contracts/        6 Soroban smart contracts (Rust)
│   ├── bridge/               Verify attestations & route mint/burn
│   ├── factory/              Deploy & index wrapper tokens
│   ├── wrapper-token/        Capped-mint ERC-20-style token template
│   ├── governance-token/     SEP-41 token with delegation
│   ├── governance/           Proposal creation, voting & execution
│   └── timelock/             Delayed execution for governance safety
├── packages/
│   ├── sdk/                  Typed Stellar SDK with contract bindings
│   ├── shared/               Shared types, constants, env parsing
│   ├── soroban-client/       Auto-generated TS contract bindings
│   ├── ui/                   Reusable React primitives
│   ├── eslint-config/        Flat ESLint v9 config presets
│   ├── tsconfig/             Shareable TypeScript config presets
│   └── cli/                  Command-line interface
├── docs/                     Architecture, Security, API, Setup guides
├── scripts/                  Deployment, verification, binding generation
├── docker/                   Dockerfiles, Prometheus, Grafana dashboards
└── .github/                  CI/CD, CodeQL, Dependabot, templates
```

## Features

### Cross-Chain Bridge
- **Wrap & Unwrap**: Lock ERC-20/SPL/Polygon tokens → mint wrapped tokens on Stellar
- **Multi-Chain Support**: Ethereum, Solana, Polygon with extensible source adapter pattern
- **Bridge Security**: Multi-sig verifier set with threshold, pause/unpause, nonce replay protection
- **Real-Time Settlement**: Horizon SSE-powered live transaction feed in under 5 seconds

### DAO Governance
- **SEP-41 Governance Token**: Delegation, checkpointing, and vote weight tracking
- **On-Chain Proposals**: Create, vote, queue, and execute proposals
- **Timelock Controller**: Enforced delay on all administrative actions (min 24h)
- **Delegation**: Delegate voting power to any Stellar address

### Platform
- **REST + SSE API**: Rate-limited, API-key authenticated, with OpenAPI docs
- **Webhook System**: HMAC-signed delivery with exponential backoff retry
- **Dashboard**: Real-time asset registry, transaction timeline, governance UI
- **Analytics**: TVL, volume, chain breakdown, fee tracking
- **Wallet Support**: Freighter + Albedo browser extensions

### Developer Experience
- **Typed SDK**: Full TypeScript SDK with contract bindings
- **Docker Compose**: One-command local dev with Postgres, Prometheus, Grafana
- **CI/CD**: GitHub Actions — lint, typecheck, test, build, deploy
- **Code Quality**: ESLint v9 flat config, Prettier, Husky, commitlint, lint-staged
- **Security Scanning**: CodeQL analysis + Dependabot weekly updates

## Quickstart

### Prerequisites

- **Node.js** 20.11+ (`nvm use`)
- **pnpm** 9+ (`npm i -g pnpm`)
- **Rust** + Cargo (for Soroban contracts)
- **stellar-cli** from the [Stellar Developer Tools](https://developers.stellar.org/docs/tools/developer-tools)

### Setup

```bash
# Clone and install
git clone https://github.com/stellar-payment-gateway/stellar-payment-gateway-sdk-main.git
cd stellar-payment-gateway-sdk-main
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Stellar network and contract IDs

# Compile smart contracts to WASM
pnpm contracts:build

# Generate TypeScript contract bindings
pnpm bindings:generate

# Start all services (web, api, relayer)
pnpm dev
```

### Run Individual Services

```bash
pnpm --filter @stellar-payment-gateway/web dev      # Next.js dashboard → :3000
pnpm --filter @stellar-payment-gateway/api dev      # Fastify API → :4000
pnpm --filter @stellar-payment-gateway/relayer dev  # Cross-chain relayer
```

### Docker (with Postgres + Monitoring)

```bash
docker compose up -d
```

## Smart Contracts

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `bridge` | Verify attestations & route mint/burn | `mint()`, `burn()`, `set_verifiers()`, `pause()` |
| `factory` | Deploy & index wrapper tokens | `create_wrapper()`, `get_wrapper()`, `registry()` |
| `wrapper-token` | Capped-mint ERC-20 template | `mint()`, `burn()`, `transfer()`, `approve()` |
| `governance-token` | SEP-41 token with delegation | `delegate()`, `get_votes()`, `checkpoint()` |
| `governance` | Proposal lifecycle | `propose()`, `cast_vote()`, `queue()`, `execute()` |
| `timelock` | Delayed admin execution | `schedule()`, `execute()`, `cancel()` |

All contracts compiled with `soroban-sdk = 21.7.7`, targeting `wasm32-unknown-unknown` with `opt-level = "z"`.

## API Reference

### Base URL
```
https://api.stellar-payment-gateway.dev
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/assets` | List wrapped assets |
| `GET` | `/assets/:chain/:address` | Get asset details |
| `POST` | `/bridge/wrap` | Initiate token wrap |
| `POST` | `/bridge/unwrap` | Initiate token unwrap |
| `GET` | `/transactions` | List transactions |
| `GET` | `/transactions/:id` | Get transaction detail |
| `GET` | `/governance/proposals` | List governance proposals |
| `POST` | `/governance/proposals` | Create proposal |
| `POST` | `/webhooks` | Register webhook endpoint |
| `GET` | `/events` | SSE event stream |

Full API documentation: [`docs/API.md`](docs/API.md)

## Documentation

| Document | Contents |
|----------|----------|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, contract responsibilities, security model |
| [`SETUP.md`](docs/SETUP.md) | Environment setup, daily workflow, troubleshooting |
| [`API.md`](docs/API.md) | REST + SSE API reference |
| [`SMARTCONTRACTS.md`](docs/SMARTCONTRACTS.md) | Contract architecture, event schemas, storage layout |
| [`SECURITY.md`](docs/SECURITY.md) | Threat model, audit checklist, responsible disclosure |
| [`SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) | Findings, severity, remediation status |
| [`DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Testnet/mainnet deployment guide |
| [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Contribution guide, milestones, grant workflow |
| [`ROADMAP.md`](docs/ROADMAP.md) | Feature matrix, milestones, future plans |
| [`FAQ.md`](docs/FAQ.md) | Frequently asked questions |
| [`GRANT-READINESS.md`](docs/GRANT-READINESS.md) | Drips Network & GrantFox readiness |

## Roadmap

### v0.3.0 — Testnet Deployment (Current)
- [ ] Deploy all 6 contracts to Stellar testnet
- [ ] Verify WASM hashes on stellar.expert
- [ ] Configure production verifier set
- [ ] Real secp256k1 signature verification

### v0.4.0 — Production Hardening
- [ ] Source-chain confirmation depth enforcement
- [ ] Multi-sig admin via governance
- [ ] Protocol fee collection and dashboard
- [ ] Persistent webhook queue (Postgres)
- [ ] Database migration management

### v1.0.0 — Mainnet Launch
- [ ] Mainnet deployment
- [ ] External security audit
- [ ] Bug bounty program
- [ ] SDK documentation site
- [ ] Load testing (≥ 1000 concurrent SSE clients)

## Contributing

We welcome contributions! See [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) for guidelines.

- **Commit Convention**: [Conventional Commits](https://www.conventionalcommits.org/)
- **Branch Strategy**: Feature branches → PR → `main`
- **Code Review**: All PRs require passing CI + at least one review

## License

MIT — see [`LICENSE`](LICENSE).

---

<p align="center">
  <sub>Built with ❤️ for the Stellar ecosystem</sub>
</p>
