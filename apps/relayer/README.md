# `@stellar-payment-gateway/relayer`

The off-chain piece of Stellar Payment Gateway. It watches source chains (Ethereum /
Solana / Polygon), decides when a `Lock` event warrants minting on
Stellar, and submits a signed attestation batch to the `bridge`
contract.

```
  Locked(token, amount, recipient, nonce)
      │   (EthereumVault / Solana program / PolygonVault)
      ▼
  SourceChainWatcher   ──►  Detector  ──►  Signer  ──►  BridgeContract.submit
                                                            │
                                          ┌─────────────────┘
                                          ▼
                                  Soroban-RPC → Stellar
```

## Pipeline per chain

1. `sources/ethereum.ts` / `solana.ts` / `polygon.ts` keeps a
   `program/logs` subscription alive.
2. `detector.ts` re-attaches on outage with exponential backoff.
3. When `Lock` arrives, we build the bridge `LockPayload` digest and
   pass it to `operator/signer.ts`, which signs with the relayer's
   secp256k1 key and submits via Soroban-RPC.

## Scaffold limits

* Single-operator mode — only `RELAYER_PUBLIC_KEY` signs. The bridge's
  threshold check will reject until `RELAYER_OPERATORS` is implemented
  as a real p2p exchange.
* No replay-protection cache — currently trusts the bridge's nonce set.
* Source watchers are stubs that substitute the *exact* vault program
  address. Replace `STELLAR_PAYMENT_GATEWAY_ETH_VAULT` / `STELLAR_PAYMENT_GATEWAY_SOL_VAULT` /
  `STELLAR_PAYMENT_GATEWAY_POLYGON_VAULT` with the production vault contracts.
