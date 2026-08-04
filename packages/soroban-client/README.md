# `@stellar-payment-gateway/soroban-client`

Auto-generated TypeScript bindings for the three Stellar Payment Gateway contracts
(`bridge`, `factory`, `wrapper-token`).

These shims are produced by `pnpm bindings:generate`, which delegates to
`stellar contract bindings json …` for each deployed contract and writes
the canonical **method name list** for the contract to
`src/bindings/{contract}.ts`. The `transpilePackages` whitelist in
`apps/web/next.config.ts` means it gets compiled alongside the rest of
the polyrepo without an explicit build step.

## Layout

```
src/
  index.ts                 // re-exports the per-contract bindings
  bindings/
    bridge.ts              // METHOD_NAMES + MethodName union
    factory.ts             // METHOD_NAMES + MethodName union
    wrapper-token.ts       // METHOD_NAMES + MethodName union
```

The committed stubs ship with hand-curated method lists that mirror the
public functions in `contracts/<name>/src/lib.rs`, so the package still
type-checks before the first deploy. After running
`pnpm contracts:deploy && pnpm bindings:generate`, these shims are
overwritten with the canonical list returned by the stellar CLI.

## Usage

### Subpath imports (preferred — typed-narrow)

```ts
import { METHOD_NAMES as BRIDGE_METHODS } from '@stellar-payment-gateway/soroban-client/bridge';
import type { MethodName } from '@stellar-payment-gateway/soroban-client/bridge';

const allUsed = BRIDGE_METHODS.includes('mint_with_attestation' as MethodName); // true
```

### Barrel (generic lookup tables / diagnostics routes)

The package root re-exports each contract's list under a contract-prefixed
alias (the underlying binding files all use the literal names
`METHOD_NAMES` / `MethodName`, so the barrel cannot use `export *` without
collisions):

```ts
import {
  BRIDGE_METHOD_NAMES,
  FACTORY_METHOD_NAMES,
  WRAPPER_TOKEN_METHOD_NAMES,
  type BridgeMethodName,
} from '@stellar-payment-gateway/soroban-client';
```

For real call sites, prefer the higher-level wrappers in
`@stellar-payment-gateway/sdk` (which already validate types against the Soroban host).
The bindings package exists so the dashboard, relayer, and API can
introspect the contract surface without pulling the full stellar-sdk
schema into the browser bundle.
