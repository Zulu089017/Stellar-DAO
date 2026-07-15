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

## Conventional Commits

Every commit message on `main` follows
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
Format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

The first line must read cleanly as a `git log --oneline` entry and
the subject is in the **imperative mood** ("add X", not "added X" or
"adds X"), with no trailing period and ≤ 72 characters.

**Allowed `<type>` prefixes**:

- **`feat:`** — a new user-facing feature (new API endpoint, new
  contract surface, new dashboard panel).
- **`fix:`** — a user-facing bug fix (broken handler, race condition,
  incorrect return value).
- **`perf:`** — a code change that improves performance without
  changing behaviour (caching, indexing, query rewrite).
- **`refactor:`** — a code change that neither fixes a bug nor adds a
  feature (extract function, rename module, reorganise types).
- **`docs:`** — documentation-only changes (`README`,
  `CONTRIBUTING.md`, `docs/*.md`, inline doc-comments).
- **`test:`** — adding or correcting tests, including the move from
  deleted in-process `cargo test` to the planned
  `contracts/integration-tests/` harness.
- **`build:`** — changes to the build system or external dependencies
  (`Cargo.toml` bump, `pnpm-lock.yaml` regen, toolchain change).
- **`ci:`** — changes to CI configuration (`.github/workflows/*.yml`,
  new advisory step, cache tweaks).
- **`chore:`** — anything else (gitignore, package metadata, lockfile
  commit, repo-wide housekeeping).

**Scope** is optional but encouraged. Use the affected module:

- `feat(api):`, `fix(web):`, `docs(readme):`
- `chore(repo):` for repo-wide changes that don't belong to a single
  package
- `ci:` (no scope, since `.github/workflows/*.yml` is one surface)

**`<body>`** explains **what** changed and **why** (not how). Wrap
at 72 chars. Include enough context that a reviewer can understand
the change without reading the diff.

**`<footer>`** carries the conventional tokens:

- `BREAKING CHANGE: <description>` — any commit that changes the
  public API surface in an incompatible way. Drives the `!` marker:
  `feat(api)!: rename /v1/wrap to /v1/bridge`.
- `Refs: #123` — links to the issue or PR being closed.

### Examples

```
feat(api): add /v1/assets endpoint with chain filter

Adds GET /v1/assets?chain=ethereum returning the wrapper-tokens the
factory has registered for the given chain, sliced from the in-memory
asset registry. 200 on hit, 404 when no wrapper exists, 400 on chain
that isn't in SOURCE_CHAINS.

Refs: #142
```

```
fix(contracts): Vec::new(&env) test fix + gate cargo CI steps
```

```
chore(repo): add .editorconfig + Conventional Commits convention
```

Use the `.editorconfig` in this repo for the cross-tool indent
invariants; `prettier` and `rustfmt` own the rest.

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
