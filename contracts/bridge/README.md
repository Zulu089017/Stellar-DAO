# `bridge` contract

The bridge is the single entry point that orchestrates wrap and unwrap
operations on Stellar.

## Lifecycle

1. `initialize(admin, operators, threshold)` — called exactly once at deploy time.
2. `set_verifiers(operators, threshold)` — admin-only rotation of the verifier set.
3. `mint_with_attestation(relayer, wrapper_token, payload, attestations)` — invoked by the
   relayer after a `Lock` event on the source chain. Verifies that threshold-many
   operators signed the payload digest, then delegates mint authority on the
   target wrapper-token.
4. `burn_with_attestation(relayer, wrapper_token, payload, attestations)` — mirror
   path: burns wrapped tokens and emits a `BurnRequested` event for the relayer
   to act on the source chain.

## Message format

All signed messages start with a 16-byte ASCII tag so signatures cannot be
cross-used between the two directions:

```
STELLAR_PAYMENT_GATEWAY_LOCK_V1   || source_chain_symbol
                     || source_token_bytes
                     || wrapper_token_addr (32 bytes)
                     || recipient_addr
                     || amount_be128
                     || nonce_32bytes
STELLAR_PAYMENT_GATEWAY_UNLOCK_V1 || source_chain_symbol
                     || wrapper_token_addr (32 bytes)
                     || source_address_bytes
                     || amount_be128
                     || nonce_32bytes
```

The full digest is `sha256(tag || … )`.

## Signature scheme

`secp256k1` is the default verifier — it pairs naturally with EVM-based
source chains (Ethereum, Polygon). An `AttestationVerifier` trait keeps the
contract surface switchable to `ed25519` (Solana, native Stellar keys) or to
Wormhole/LayerZero proofs without a contract migration.

## Events emitted

```text
(MintRequested) -> (wrapper_token, recipient, amount, source_chain, source_token, nonce)
(BurnRequested) -> (wrapper_token, source_address, amount, nonce)
```

These are surfaced automatically by Horizon's Soroban event indexer.
