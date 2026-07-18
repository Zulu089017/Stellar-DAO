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

## License

MIT — see [`LICENSE`](../LICENSE). All contributions are accepted under this license.
