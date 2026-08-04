# Roadmap & Feature Matrix

This document tracks Stellar Payment Gateway's feature completion status across
all layers: contracts, backend, frontend, and infrastructure.

## Feature Matrix

### Contracts (12 smart contracts)

| Contract | Status | Layer |
|----------|:------:|-------|
| Bridge | ✅ | Bridge — attestation verification, mint/burn |
| Factory | ✅ | Bridge — deterministic wrapper deployment |
| Wrapper Token | ✅ | Bridge — SEP-41 token template |
| Payment | ✅ | Payments — XLM/assets, batch, fees |
| Escrow | ✅ | Payments — 6-state lifecycle, arbiter resolution |
| Invoice | ✅ | Payments — partial payments, expiration |
| Treasury | ✅ | Payments — fee aggregation, withdrawals |
| Governance Token | ✅ | Governance — SEP-41 + delegation + checkpointing |
| Governance | ✅ | Governance — proposals, voting, execution |
| Timelock | ✅ | Governance — delayed execution |
| Fee Manager | ✅ | Infra — global + per-merchant fee config |
| Role Manager | ✅ | Infra — RBAC (admin/operator/merchant/relayer) |

### Backend (API)

| Feature | Status | Notes |
|---------|:------:|-------|
| Asset registry CRUD | ✅ | Paginated, cursor-based |
| Bridge wrap/unwrap | ✅ | POST /bridge/wrap, /bridge/unwrap |
| Transaction lifecycle | ✅ | List, detail, SSE fan-out |
| Governance endpoints | ✅ | Proposals, voting, delegation |
| Invoice CRUD + pay | ✅ | POST/GET/PATCH/DELETE /invoices |
| Merchant onboarding | ✅ | Register, profile, API key rotation |
| Webhook delivery | ✅ | HMAC-signed, retry queue |
| API key auth | ✅ | Bearer token middleware |
| Rate limiting | ✅ | In-memory rate limiter |
| SSE event stream | ✅ | Horizon bridge + governance channel |
| OpenAPI docs | ✅ | Swagger UI at /docs |
| Structured logging | ✅ | pino + pino-pretty |
| JWT auth + RBAC | ⬜ | Token-based auth with role claims |
| Analytics endpoints | ✅ | TVL, volume, chain metrics |
| Database migrations | ✅ | Drizzle schema + bootstrap SQL |
| Notification service | ⬜ | Email, webhook, in-app |

### Frontend (Web Dashboard)

| Feature | Status | Notes |
|---------|:------:|-------|
| Real-time asset table | ✅ | SSE-powered live table |
| Transaction timeline | ✅ | Status dots, chain badges |
| Bridge wrap panel | ✅ | Multi-chain wrap flow |
| Governance dashboard | ✅ | Proposal list, voting, delegation |
| Analytics dashboard | ✅ | TVL, volume, chain breakdown |
| Wallet connect (Freighter) | ✅ | Freighter browser extension |
| Wallet connect (xBull) | ⬜ | xBull browser extension |
| WalletConnect | ⬜ | Mobile wallet via QR |
| Dark/light theme | ✅ | System-preference detection |
| Toast notifications | ✅ | Real-time status updates |
| Mobile navigation | ✅ | Responsive slide-out drawer |
| Invoice dashboard | ⬜ | Create, view, pay invoices |
| Merchant dashboard | ⬜ | Registration, API keys, analytics |
| Admin dashboard | ⬜ | Transactions, revenue, audit logs |
| Payment history | ⬜ | Filterable, exportable |
| QR code payments | ⬜ | Generate/scan for mobile |
| User profile + settings | ⬜ | Security settings, notifications |

### SDK + Developer Experience

| Feature | Status | Notes |
|---------|:------:|-------|
| TypeScript SDK | ✅ | Contract bindings, attestation, horizon |
| Soroban client bindings | ✅ | 12 contract binding stubs |
| ESLint v9 flat config | ✅ | Shared react + node presets |
| Prettier | ✅ | TS/JS/JSON/MD/YAML/Rust |
| Husky pre-commit | ✅ | lint-staged + prettier + eslint |
| Commitlint | ✅ | Conventional Commits enforcement |
| Release Drafter | ✅ | Auto-generated release notes |
| GitHub Labels | ✅ | 30 labels (type/scope/complexity) |
| CodeQL | ✅ | Weekly + PR security scanning |
| Dependabot | ✅ | npm + cargo + actions |
| CLI tool | ✅ | Command-line interface |
| Docker Compose | ✅ | Postgres + Prometheus + Grafana |

### Infrastructure

| Feature | Status | Notes |
|---------|:------:|-------|
| CI pipeline | ✅ | Lint → Typecheck → Test → Build |
| E2E tests (Playwright) | ✅ | Navigation, governance, wrap flow |
| Docker multi-stage builds | ✅ | API, web, relayer |
| Prometheus metrics | ⬜ | Custom app metrics |
| Grafana dashboards | ✅ | Bridge overview dashboard |
| Load testing | ⬜ | ≥ 1000 concurrent SSE clients |
| Disaster recovery runbook | ⬜ | |

---

## Milestones

### ✅ v0.2.0 — Foundation (Completed — July 2026)

- [x] 12 Soroban smart contracts (bridge, factory, wrapper-token, payment, escrow, invoice, treasury, governance-token, governance, timelock, fee-manager, role-manager)
- [x] Fastify REST + SSE API (10 route groups)
- [x] Next.js 15 dashboard (assets, transactions, governance, analytics)
- [x] Cross-chain relayer service
- [x] Typed TypeScript SDK + 12 contract binding stubs
- [x] Docker Compose with Postgres, Prometheus, Grafana
- [x] CI/CD: lint, typecheck, test, build
- [x] Release Drafter + GitHub Labels
- [x] CodeQL + Dependabot
- [x] Invoice + Merchant REST APIs
- [x] Professional README + docs

### 🔜 v0.3.0 — Testnet Readiness (Current)

- [ ] Deploy all 12 contracts to Stellar testnet
- [ ] Verify contract WASM hashes on stellar.expert
- [ ] Generate real TypeScript bindings from deployed contracts
- [ ] Configure production verifier set for bridge
- [ ] JWT authentication + RBAC middleware
- [ ] Invoice dashboard (web) — create, view, pay invoices
- [ ] Wallet management expansion (xBull + WalletConnect)
- [ ] Real secp256k1 signature verification (65-byte migration)

### v0.4.0 — Production Hardening

- [ ] Source-chain confirmation depth enforcement
- [ ] Multi-sig admin via governance
- [ ] Persistent webhook queue (Postgres-backed)
- [ ] Database migration management (drizzle-kit generate)
- [ ] Merchant dashboard — registration, API keys, analytics
- [ ] Payment history with export (web)
- [ ] Notification service (email + webhook)
- [ ] Prometheus custom app metrics

### v1.0.0 — Mainnet Launch

- [ ] Mainnet deployment (all 12 contracts)
- [ ] External security audit
- [ ] Bug bounty program
- [ ] Admin dashboard — transactions, revenue, audit logs
- [ ] SDK documentation site (Docusaurus/VitePress)
- [ ] Load testing (≥ 1000 concurrent SSE clients)
- [ ] Disaster recovery runbook

### Future

- [ ] Mobile wallet integration (WalletConnect)
- [ ] QR code payments
- [ ] Multi-language SDK (Python, Go, Rust)
- [ ] The Graph / SubQuery indexing
- [ ] Liquid staking for governance tokens
- [ ] Cross-chain governance (Snapshot + on-chain execution)
- [ ] SEP-6 / SEP-24 / SEP-31 support
- [ ] Fraud detection abstraction
- [ ] KYC/AML placeholder hooks
