# Contributing

## Pull requests

1. Branch off `main`.
2. Keep PRs scoped — one feature/concern per PR.
3. Run before opening a PR:

```bash
pnpm lint && pnpm typecheck && pnpm test
cd contracts && cargo build --target wasm32-unknown-unknown --release
```

4. Add an entry to `CHANGELOG.md` for any user-facing change.

## Coding conventions

- TypeScript: 2-space indent, single quotes, trailing commas, 100 chars
  wide (`prettier` does this automatically).
- Rust: `cargo fmt` + `cargo clippy --all-targets -- -D warnings`.
- Every contract change must include or update a corresponding
  integration test in `contracts/integration-tests/`. The in-process
  `cargo test --workspace` path is intentionally disabled today; see
  `docs/soroban-testutils-issue.md` for the E0277 in
  `soroban-env-host` 21.2.1's `with_test_prng` that prevents it.
- The shared types in `packages/shared` are the source of truth: do
  not duplicate them in `apps/*` or `packages/*`.

## pnpm version pinning

The exact pnpm version is declared exactly once, in `package.json` via
the `packageManager` field (`pnpm@9.12.0`). The GitHub Actions
workflow has no `with: version:` block on `pnpm/action-setup@v4` —
it auto-detects from `packageManager` so local dev and CI stay in sync.

**Do not add an `engines.pnpm` field.** In pnpm 9+, having both
`engines.pnpm` (which is a range / constraint) and `packageManager`
(which is an exact pin) at the same time raises:

```
ERR_PNPM_MULTIPLE_VERSIONS_SPECIFIED  Multiple versions of pnpm specified
```

and breaks every install. If you need a different pnpm version, bump
`packageManager` in `package.json` and update `pnpm-lock.yaml`'s
header alongside it (`pnpm install --no-frozen-lockfile` once locally
to regenerate).

## Updating the contracts

The Soroban host function `secp256k1_verify` may be enabled by future
SDKs. When that lands:

1. Replace the body of `Secp256k1Verifier::verify` in
   `contracts/bridge/src/verification.rs` with the real call.
2. Add an integration test in `contracts/integration-tests/`
   that deploys the bridge against a local Soroban RPC and
   exercises the threshold + signer-uniqueness paths. The
   in-process testutils path is disabled (see
   `docs/soroban-testutils-issue.md`).
3. Bump the workspace version in `contracts/Cargo.toml`.

## Adding a new source chain

1. Add the chain id to `SOURCE_CHAINS` in
   `packages/shared/src/types/chain.ts`.
2. Add a watcher under `apps/relayer/src/sources/<chain>.ts` that
   conforms to `SourceAdapter`.
3. Register it in `apps/relayer/src/index.ts` under `networkSources`.
4. Add a gradient color in
   `apps/web/components/atoms/chain-badge.tsx` so the dashboard
   surfaces the new chain consistently.

## Adding a new Soroban event topic

The events string lives in Rust as `Symbol::new(&env, "…")` and in
TypeScript as `Events.<NAME>` in
`packages/shared/src/constants/index.ts`. Both must be updated
together or the dashboard's live feed will silently drop the event.
