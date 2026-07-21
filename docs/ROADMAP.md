# Roadmap & Feature Matrix

This document tracks StellarDAO's feature completion status across
all layers: contracts, backend, frontend, and infrastructure.

## Feature Matrix

| Feature | contracts | api | relayer | web | sdk |
|---------|:---------:|:---:|:-------:|:---:|:---:|
| Bridge attestation | ✅ | ✅ | ✅ | — | ✅ |
| Wrapper token factory | ✅ | ✅ | — | ✅ | ✅ |
| Governance token (SEP-41) | ✅ | ✅ | — | ✅ | ✅ |
| Proposal creation/voting | ✅ | ✅ | — | ✅ | ✅ |
| Timelock controller | ✅ | — | — | ✅ | — |
| Real-time SSE events | — | ✅ | — | ✅ | ✅ |
| Multi-chain watching | — | — | ✅ | ✅ | — |
| API key auth | — | ✅ | — | — | — |
| Rate limiting | — | ✅ | — | — | — |
| Webhook delivery | — | ✅ | — | — | — |
| HMAC signatures | — | ✅ | — | — | — |
| Wallet connect | — | — | — | ✅ | — |
| Dark/light theme | — | — | — | ✅ | — |
| Toast notifications | — | — | — | ✅ | — |
| Form validation | — | — | — | ✅ | — |
| Breadcrumb nav | — | — | — | ✅ | — |
| Transaction timeline | — | — | — | ✅ | — |
| OpenAPI docs | — | ✅ | — | — | — |
| Docker Compose | — | — | — | — | — |
| CLI tool | — | — | — | — | — |
| Pre-commit hooks | — | — | — | — | — |
| CI deployment | — | — | — | — | — |
| Error codes | — | ✅ | — | — | — |
| Pagination helper | — | ✅ | — | — | — |
| Response caching | — | ✅ | — | — | — |
| Webhook retry queue | — | ✅ | — | — | — |
| SDK event subscription | — | — | — | — | ✅ |
| Structured logging | — | — | — | — | ✅ |
| Database migrations | — | ✅ | — | — | — |
| Integration test helpers | — | ✅ | — | — | — |

## Milestones

### v0.3.0 — Testnet Deployment (Current)
- [ ] Deploy all 6 contracts to Stellar testnet
- [ ] Verify contract WASM hashes on stellar.expert
- [ ] Configure production verifier set
- [ ] Set up staging API + dashboard
- [ ] Real secp256k1 signature verification (65-byte migration)
- [ ] Source-chain vault contracts

### v0.4.0 — Production Hardening
- [ ] Source-chain confirmation depth enforcement
- [ ] Multi-sig admin via governance
- [ ] Protocol fee collection and dashboard
- [ ] Cross-chain analytics (volume by source chain)
- [ ] Persistent webhook queue (Postgres-backed)
- [ ] Database migration management

### v1.0.0 — Mainnet Launch
- [ ] Mainnet deployment
- [ ] External security audit
- [ ] Bug bounty program
- [ ] SDK documentation site (docusaurus/vitepress)
- [ ] Load testing (≥ 1000 concurrent SSE clients)
- [ ] Disaster recovery runbook

### Future
- [ ] Liquid staking for governance tokens
- [ ] Cross-chain governance (Snapshot + on-chain execution)
- [ ] Mobile wallet integration (WalletConnect)
- [ ] Multi-language SDK (Python, Go, Rust)
- [ ] The Graph / SubQuery indexing
