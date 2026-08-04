# `@stellar-payment-gateway/shared`

Cross-package primitives: source-chain types, transaction lifecycle, payload
schemas, environment validation, and any string constant that's referenced
from more than one package.

## Rules of thumb

- Adding a new event topic? Put it in `src/constants/index.ts` **and** wire
  the same name into the contract `Symbol::new(&env, "…")` call.
- Adding a new DTO? Mirror it in the API and re-use from the web app — do
  not duplicate types in either.
- Adding a new env var? Add a Zod schema in `src/env/index.ts`. Both api and
  web call `parseEnv.{api,web}()` and will explode loudly if anything is
  missing.

## Quick example

```ts
import { SOURCE_CHAINS, assetIdFor, parseEnv } from '@stellar-payment-gateway/shared';

const env = parseEnv.api();
console.log('connecting to', env.HORIZON_URL);

const id = assetIdFor('ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
// => "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```
