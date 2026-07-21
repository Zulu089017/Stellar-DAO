---
name: Pull Request
about: Submit a change to the StellarDAO codebase
title: ''
labels: ''
assignees: ''
---

## Description
A clear description of what this PR changes and why.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Dependency update

## Scope
- [ ] Smart contracts (Rust/Soroban)
- [ ] API (Fastify)
- [ ] Relayer
- [ ] Web dashboard (Next.js)
- [ ] SDK
- [ ] Shared packages
- [ ] CI / tooling

## Quality Checklist
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all tests)
- [ ] `cargo check --workspace --lib --bins` passes
- [ ] New tests added for new functionality
- [ ] Documentation updated (README, API docs, inline comments)
- [ ] No `console.log` left in production code

## UI Changes
If this PR includes UI changes:
- [ ] Screenshots attached (light + dark mode)
- [ ] Responsive at mobile (375px), tablet (768px), desktop (1440px)
- [ ] Loading, empty, and error states handled

## Contract Changes
If this PR includes contract changes:
- [ ] `cargo test --workspace` passes
- [ ] Events documented in contract README
- [ ] Storage layout changes documented
- [ ] Testnet deployment verified on stellar.expert

## Related Issues
Closes # (issue number)

## Additional Notes
Any additional context for reviewers.
