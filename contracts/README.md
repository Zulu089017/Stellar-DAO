# Stellar Payment Gateway Smart Contracts

Three Soroban contracts implement the cross-chain wrapping protocol.

| Contract | Responsibility |
|----------|----------------|
| `bridge`         | Verifies relayer attestations and routes `mint`/`burn` calls to the correct wrapper-token. |
| `factory`        | Maps `(source_chain, source_token_address)` → `wrapper_token_id` and deploys new wrapper-tokens from the shared template. |
| `wrapper-token`  | Standard SEP-41-ish token whose mint/burn authority is restricted to the `bridge` contract. |

## Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

Built WASM artefacts are emitted into each contract's
`target/wasm32-unknown-unknown/release/*.wasm` and consumed by
`scripts/generate-bindings.ts`.

## Deploy

```bash
pnpm contracts:deploy
```

The deploy script writes the resulting contract IDs to your `.env`
so the `api`, `relayer`, and `web` apps pick them up at startup.

## Test

```bash
cargo test --workspace
```

See each contract's individual README for specification details:

- [`bridge/`](bridge/README.md)
- [`factory/`](factory/README.md)
- [`wrapper-token/`](wrapper-token/README.md)
