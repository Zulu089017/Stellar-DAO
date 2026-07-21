# Contributing to StellarDAO

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Install dependencies: `pnpm install`
3. Build contracts: `pnpm contracts:build`
4. Run tests: `pnpm test`
5. Start dev: `pnpm dev`

See [`docs/SETUP.md`](SETUP.md) for detailed environment setup.

## Development Workflow

### Branching
- `main` — stable, deployable branch
- Feature branches: `feat/descriptive-name`
- Fix branches: `fix/descriptive-name`

### Commit Convention
We use [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(scope): description
fix(scope): description
docs(scope): description
chore(scope): description
test(scope): description
```

### Before Submitting
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all 272+ tests)
- [ ] `cargo check --workspace --lib --bins` passes
- [ ] `pnpm lint` passes
- [ ] New features include tests
- [ ] New contracts include README and event documentation

## Smart Contracts

### Adding a new contract
1. Create directory under `contracts/<name>/`
2. Add `Cargo.toml` with `soroban-sdk = "=21.7.7"` (pinned)
3. Add to workspace members in `contracts/Cargo.toml`
4. Implement `#![no_std]` contract with `#[contract]` and `#[contractimpl]`
5. Add README documenting the interface

### Contract conventions
- Use `#[contracterror]` for error enums
- Use `#[contracttype]` for storage keys and events
- Events use `(Symbol, Symbol)` topic format
- `initialize` is always one-shot (checks `Initialized` storage key)
- `admin.require_auth()` on all privileged operations

## Governance Contributions

When contributing to governance contracts:
- All proposal execution paths must route through the timelock
- Voting power must be checkpointed at the proposal start ledger
- Quorum calculations must use the governance token's `total_supply` at the snapshot
- New proposal types must be documented in the governance README

## Security

See [`docs/SECURITY.md`](SECURITY.md) for the full threat model and audit checklist.

### Reporting vulnerabilities
Email **security@stellardao.dev**. Do not open public issues for security bugs.

## Code Style

- TypeScript: ESLint with `@stellardao/eslint-config`
- Rust: `cargo fmt` (standard Rust style)
- Prettier for all other formats
- Run `pnpm format` before committing

## Issue Labels & Complexity

We use labels to help contributors find appropriate tasks:

| Label | Description | Points (Drips Wave) |
|-------|-------------|---------------------|
| `good first issue` | Great for new contributors | 100 (Trivial) |
| `help wanted` | Open for community contributions | 150 (Medium) |
| `bug` | Something isn't working | 150-200 (Medium-High) |
| `enhancement` | New feature or improvement | 200 (High) |
| `documentation` | Docs improvements | 100 (Trivial) |
| `contracts` | Soroban smart contract work | 200 (High) |
| `security` | Security-related issues | 200 (High) |

## Milestones & Roadmap

### v0.3.0 (Current)
- [ ] Deploy contracts to Stellar testnet
- [ ] Real secp256k1 signature verification (65-byte migration)
- [ ] Source-chain vault contracts (Ethereum, Solana, Polygon)
- [ ] Chain reorg confirmation depth enforcement

### v0.4.0
- [ ] Multi-sig admin via governance
- [ ] Protocol fee collection dashboard
- [ ] Cross-chain analytics (volume by source chain)
- [ ] Webhook retry with persistent queue

### v1.0.0
- [ ] Mainnet deployment
- [ ] Full security audit (external firm)
- [ ] Bug bounty program
- [ ] SDK documentation site

## Grant Platform Participation

StellarDAO is designed for participation on:
- **[Drips Network](https://drips.network)**: Drips Wave bounties
- **[GrantFox](https://grantfox.xyz)**: Stellar/Soroban bounties

See [`docs/GRANT-READINESS.md`](GRANT-READINESS.md) for the full
readiness checklist and compliance details.

### Bounty Workflow
1. Find an issue labeled `help wanted` or `good first issue`
2. Comment on the issue to express interest
3. Wait for assignment from a maintainer
4. Fork → branch → implement → test → PR
5. Maintainer reviews, merges, and triggers payout

## License

MIT — see [`LICENSE`](../LICENSE). All contributions are accepted under this license.
