# Changelog

All notable changes since the project adopted
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
— see `docs/CONTRIBUTING.md` for the type list.

Generated from the last `50` non-merge first-parent commits.
Refresh with `pnpm changelog` (or `bash
scripts/generate-changelog.sh` directly). The CI workflow runs
`--check` and fails the step (not the job — `continue-on-error`)
when this file is stale.


## Other

- chore(repo): add .editorconfig + Conventional Commits section ([91363cc](https://github.com/Zulu089017/Stellar-DAO/commit/91363cc))\n- docs(contracts): update CONTRIBUTING.md for post-E0277 test path ([1616fa8](https://github.com/Zulu089017/Stellar-DAO/commit/1616fa8))\n- fix(ci): switch pnpm audit to npm audit + pin cargo-audit version ([88082bc](https://github.com/Zulu089017/Stellar-DAO/commit/88082bc))\n- ci: add pnpm audit --prod + cargo audit as non-gating advisory steps ([43c62bd](https://github.com/Zulu089017/Stellar-DAO/commit/43c62bd))\n- docs(contracts): extract E0277 rationale into docs/soroban-testutils-issue.md ([5d1b484](https://github.com/Zulu089017/Stellar-DAO/commit/5d1b484))\n- chore(contracts): commit Cargo.lock and drop from gitignore ([9c5e8d1](https://github.com/Zulu089017/Stellar-DAO/commit/9c5e8d1))\n- fix(rust): resolve Soroban dependency version conflict ([0d4977b](https://github.com/Zulu089017/Stellar-DAO/commit/0d4977b))\n- fix(monorepo): regenerate pnpm-lock.yaml after apps/api pg dep promotion ([2b7d786](https://github.com/Zulu089017/Stellar-DAO/commit/2b7d786))\n- feat(api): drizzle/Postgres repos swapped in via DATABASE_URL ([6495bd1](https://github.com/Zulu089017/Stellar-DAO/commit/6495bd1))\n- fix(contracts): Vec::new(&env) test fix + gate cargo CI steps ([53b4349](https://github.com/Zulu089017/Stellar-DAO/commit/53b4349))\n- refactor(shared,web): promote isSourceChain type guard to @stellardao/shared ([ae8bdde](https://github.com/Zulu089017/Stellar-DAO/commit/ae8bdde))\n- feat(web): dashboard polish — chain filter chips + transactions wiring + empty-state CTAs ([533adeb](https://github.com/Zulu089017/Stellar-DAO/commit/533adeb))\n- test(api): integration tests for POST /bridge/wrap ([bf4d826](https://github.com/Zulu089017/Stellar-DAO/commit/bf4d826))\n- feat(web): bind WrapPanel to /bridge/wrap + drive lifecycle from SSE ([1f6ad0b](https://github.com/Zulu089017/Stellar-DAO/commit/1f6ad0b))\n- feat(api): POST /bridge/wrap endpoint with mock Soroban lifecycle ([396632a](https://github.com/Zulu089017/Stellar-DAO/commit/396632a))\n- feat(api): in-process transaction event bus + wire repo upsert ([6e8d6b8](https://github.com/Zulu089017/Stellar-DAO/commit/6e8d6b8))\n- fix(ci): green Lint · Typecheck · Test · Build ([e4ff35f](https://github.com/Zulu089017/Stellar-DAO/commit/e4ff35f))\n- feat(soroban-client): track fallback stub bindings so tsc resolves before contracts deploy ([11d8218](https://github.com/Zulu089017/Stellar-DAO/commit/11d8218))\n- fix(sdk): await resolves assertion in verifySecp256k1 test ([c9f9f28](https://github.com/Zulu089017/Stellar-DAO/commit/c9f9f28))\n- fix(ci): contract refactor + sdk factory Symbol→String to make CI green ([99885a5](https://github.com/Zulu089017/Stellar-DAO/commit/99885a5))\n- chore(lint): auto-fix import/order + replace process.exit with throw ([1a15111](https://github.com/Zulu089017/Stellar-DAO/commit/1a15111))\n- fix(verification): add verify_attestation shim resolving E0432 unresolved import ([5e5859e](https://github.com/Zulu089017/Stellar-DAO/commit/5e5859e))\n- fix(verification): revert secp256r1_verify to defensive stub pending signature schema migration ([056e39c](https://github.com/Zulu089017/Stellar-DAO/commit/056e39c))\n- refactor(contracts): partial migration to soroban-sdk 21.7.7 API surface ([70b37ed](https://github.com/Zulu089017/Stellar-DAO/commit/70b37ed))\n- chore: scaffold StellarDAO monorepo with first-pass CI green ([7e28ff0](https://github.com/Zulu089017/Stellar-DAO/commit/7e28ff0))\n- Scaffold StellarDAO polyrepo + ship v12 SDK fixes + test coverage ([c2e5eb6](https://github.com/Zulu089017/Stellar-DAO/commit/c2e5eb6))\n- Initial commit ([b17b540](https://github.com/Zulu089017/Stellar-DAO/commit/b17b540))\n

## [0.2.0] - 2026-07-18

### Added

- **DAO Governance**: governance token with delegation and checkpointing
- **Governance Proposals**: on-chain proposal creation, voting, and execution
- **Timelock Controller**: delayed execution for governance safety
- **Bridge Security**: pause/unpause emergency stop mechanism
- **Protocol Fees**: configurable fee structure for wrap/unwrap operations
- **Rate Limiting**: in-memory rate limiter middleware for API
- **API Key Auth**: Bearer token authentication for protected endpoints
- **Webhook Retry**: exponential backoff with jitter for webhook delivery
- **Governance Dashboard**: proposal list, voting UI, delegation view
- **Analytics Dashboard**: TVL, volume, and chain breakdown metrics
- **Theme Toggle**: dark/light theme with system preference detection
- **Toast Notifications**: real-time transaction status updates
- **Wallet Integration**: Freighter + Albedo browser wallet support
- **Mobile Navigation**: responsive slide-out navigation drawer
- **Input Sanitization**: SQL injection prevention middleware
- **Skeleton Loading**: loading states for dashboard components
- **Contract Verification**: scripts for block explorer verification
- **Security Documentation**: audit checklist and threat model
- **API Reference**: complete endpoint documentation
- **SDK Governance Bindings**: typed client for on-chain governance
- **SSE Governance Channel**: real-time governance event streaming

### Changed

- Updated `.env.example` with governance and API key variables
- Enhanced wallet connector with multi-provider support
- Added Governance and Analytics links to navigation

### Security

- HMAC webhook signature verification (existing, documented)
- Pause mechanism for emergency bridge shutdown
- Timelock delay on governance execution
