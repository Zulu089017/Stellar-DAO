# Architecture

Stellar Payment Gateway is a **three-layer** system that wraps ERC-20, SPL, and Polygon
tokens on Stellar. The diagram below traces a wrap from the moment a
user locks tokens on a source chain to the moment the wrapper-token lands
in their Stellar wallet.

## System diagram

```
                                       ┌──────────────────────────┐
                                       │  source chains (Ethereum, │
                                       │  Solana, Polygon…)       │
                                       └──────────┬───────────────┘
                                                  │  Lock event
                                                  ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  apps/relayer  (Node + @noble/curves)                              │
        │                                                                    │
        │  ethereum.ts ─── solana.ts ─── polygon.ts                          │
        │      │            │            │                                  │
        │      └─────►  detector.ts  (reconnect/backoff)  ───►  signer.ts    │
        │                                                  (secp256k1)        │
        └────────────────────────────────┬───────────────────────────────────┘
                                         │  signed attestation
                                         ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  contracts/  (Soroban · Rust)                                       │
        │                                                                    │
        │  bridge  ───►  factory  ───►  wrapper-token clones                 │
        │     verify              deploy                                       │
        │     nonce-set          registry                                     │
        │     delegate mint/burn                                              │
        └────────────────────────────────┬───────────────────────────────────┘
                                         │  Soroban events
                                         ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Horizon SSE  ───►  apps/api  ───►  apps/web (Next.js 15 dashboard)│
        └────────────────────────────────────────────────────────────────────┘
```

## Contract responsibilities

| Contract         | Inputs                                       | Outputs (events)   |
|------------------|----------------------------------------------|--------------------|
| `bridge`         | Signed Lock/Unlock payload + attestations    | `MintRequested`, `BurnRequested` |
| `factory`        | `(source_chain, source_token)` key + meta    | `WrapperCreated` |
| `wrapper-token`  | `mint(recipient, amount)` from bridge only  | `mint/disallow/burn/transfer/approve` |

Visit each contract's README for the full surface.

## Real-time feed

Soroban emits events for **every** state transition from every contract
above. Horizon's `GET /contracts/{id}/events` endpoint exposes the
stream. The dashboard subscribes directly to Horizon. The `api`
service also exposes `/events` as an SSE fallback so browsers behind
restrictive CORS or networks don't lose state.

## Security model (v1)

1. **Bridge authorisation** — a verifier set + threshold governs which
   relayer operators can authorise a mint/burn. Updating the set is
   admin-only (`bridge.set_verifiers`).
2. **Replay protection** — every accepted payload burns its `nonce` in
   `persistent` storage. Repeating the same nonce panics.
3. **Wrapper-token pin** — `initialize` is one-shot — once the bridge
   address is recorded at clone time it cannot be moved, even by a
   future factory admin.
4. **Deterministic addresses** — `factory.create_wrapper` produces
   the same contract id every time, so attackers can't pre-claim.

## Out-of-scope for v1

- Real bridge verifiers (secp256k1 host function is not available in
  this scaffold SDK; the verifier trait is wired but returns `false`
  so signature checks panic until enabled).
- Source-chain vault contracts — `Lock` events are emitted by a
  placeholder; the production Ethereum/Solana/Polygon vault programs
  are deliberately left as TODO so the scaffold compiles standalone.
- Governance — explicitly dropped per the project's chosen focus on
  the wrapping middleware alone.
