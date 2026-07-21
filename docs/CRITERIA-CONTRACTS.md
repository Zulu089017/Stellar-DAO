# Smart Contract Quality Criteria

This document defines the quality gates for StellarDAO Soroban smart contracts
(`contracts/`). These criteria align with Soroban best practices, security audit
readiness, and grant platform expectations.

## Contract Inventory

| Contract | Purpose | Status |
|----------|---------|--------|
| `bridge` | Verify cross-chain attestations, route mint/burn | Production |
| `factory` | Deploy wrapper-token clones, maintain registry | Production |
| `wrapper-token` | SEP-41 token with capped mint/burn authority | Production |
| `governance-token` | SEP-41 token with delegation and checkpointing | Production |
| `governance` | Proposal creation, voting, execution | Production |
| `timelock` | Delayed execution for governance safety | Production |

## Quality Gates

### 1. Compilation & Build (NON-NEGOTIABLE)
- [ ] `cargo check --workspace --lib --bins` passes with zero errors
- [ ] `cargo build --target wasm32-unknown-unknown --release` produces valid WASM
- [ ] `cargo test --workspace --no-run` compiles all test binaries
- [ ] No warnings under `#![deny(warnings)]` (or equivalent in Cargo.toml)

### 2. Soroban SDK Compliance
- [ ] Pinned to `soroban-sdk = "=21.7.7"` (exact version, no caret)
- [ ] `#![no_std]` on every contract crate
- [ ] `#[contract]` and `#[contractimpl]` annotations on all public entry points
- [ ] `#[contracterror]` for error enums with descriptive variant names
- [ ] `#[contracttype]` for storage keys and event types
- [ ] Events use `(Symbol, Symbol)` topic format per Soroban conventions

### 3. Security (NON-NEGOTIABLE)
- [ ] `admin.require_auth()` on all privileged operations
- [ ] `initialize` is one-shot (checks `Initialized` storage key)
- [ ] Nonce replay protection (consumed nonces stored in `persistent`)
- [ ] Integer overflow protection (use `checked_add`/`checked_mul`)
- [ ] No `unwrap()` or `expect()` in contract code (use `?` propagation)
- [ ] Pause/unpause mechanism for emergency stop

### 4. Testing
- [ ] Unit tests for every public contract function
- [ ] Edge cases: zero amounts, max values, empty inputs
- [ ] Auth failure tests (unauthorized callers)
- [ ] State transition tests (pending → active → succeeded → executed)
- [ ] Regression tests for previously-fixed bugs

### 5. Documentation
- [ ] Each contract has a README.md with:
  - Purpose and role in the system
  - Public interface (functions, parameters, return types)
  - Events emitted
  - Authorization model
  - Storage layout
- [ ] Inline doc comments (`///`) on all public functions
- [ ] Error variants documented with when they're returned

### 6. Deployment Readiness
- [ ] Contract WASM hashes recorded in deployment manifest
- [ ] `initialize` parameters documented (admin key, verifier set, etc.)
- [ ] Upgrade path documented (or explicitly noted as immutable)
- [ ] Testnet deployment verified on stellar.expert

## Governance Contract Criteria

### Governance Token
- [ ] `mint` restricted to admin
- [ ] `delegate` updates checkpointed voting power
- [ ] `get_past_votes` returns correct historical snapshot

### Governance
- [ ] Voting power checkpointed at proposal creation ledger
- [ ] Quorum calculated from `total_supply` at snapshot
- [ ] Proposal states transition correctly: Pending → Active → {Succeeded,Defeated} → {Queued, Canceled} → Executed
- [ ] All execution paths route through timelock when applicable

### Timelock
- [ ] Minimum delay enforced (configurable, default ≥ 24h for mainnet)
- [ ] `execute_transaction` checks delay has elapsed
- [ ] `cancel_transaction` restricted to admin/governance

## Audit Checklist

See `docs/SECURITY.md` for the full threat model and audit checklist.
Key items for grant review:

- [ ] Signature verification (currently stubbed — migration to 65-byte `r||s||v` required before mainnet)
- [ ] Replay protection verified
- [ ] Admin compromise mitigation (multi-sig + timelock)
- [ ] Front-running resistance (deterministic addresses + nonce dedup)
- [ ] Chain reorg protection (configurable confirmation depth)
