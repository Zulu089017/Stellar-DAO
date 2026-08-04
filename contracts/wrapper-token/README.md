# `wrapper-token` contract

A SEP-41-compatible Stellar token. One instance is deployed per
`(source_chain, source_token)` pair by the [`factory`](../factory) contract.

## Why a custom token instead of SAC?

The standard Stellar Asset Contract (SAC) requires a `ClassicAsset` issuer
account, which would force every wrapper to be issued by a real Stellar
account. Stellar Payment Gateway keeps everything inside Soroban:

* Mint/burn authority is **the bridge contract**, not a Stellar account.
* Metadata (`name`, `symbol`, `decimals`) is set at clone time and never
  rotates, so wallets can cache it.
* The factory can deterministically re-derive the same contract address
  without ever touching the SAC.

## Authorisation matrix

| Function   | Caller must be |
|------------|----------------|
| `transfer` | `from` (auth)  |
| `approve`  | `owner` (auth) |
| `transfer_from`  | `spender` (auth) |
| `mint`     | `bridge` (auth) |
| `burn`     | `bridge` (auth) |
| `initialize` | factory, once |

That last row is what makes the wrapper safe: even if a future factory
admin misbehaves, they cannot mint against an already-initialised
wrapper-token — `initialize` panics on the second call.
