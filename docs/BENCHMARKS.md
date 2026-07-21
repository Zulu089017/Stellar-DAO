# Performance Benchmarks

Benchmarks for StellarDAO core operations. Run with:
```bash
pnpm --filter @stellardao/sdk bench
```

## Horizon Client

| Operation | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|-----------|----------|----------|----------|----------|
| `ping()` | 85 | 72 | 145 | 210 |
| `streamContractEvents` (first event) | 320 | 280 | 520 | 680 |
| `raw('/assets')` (10 items) | 180 | 155 | 310 | 420 |
| `raw('/transactions')` (10 items) | 195 | 165 | 340 | 450 |

Environment: Stellar testnet, 100ms simulated latency.

## Bridge Operations

| Operation | Avg (ms) | Notes |
|-----------|----------|-------|
| `attestation.sign()` (secp256k1) | 0.8 | Native @noble/curves |
| `attestation.verify()` (secp256k1) | 1.2 | Single signature |
| `buildMintTx()` | 4.5 | TransactionBuilder + sim |
| `submitToBridge()` | 1,200 | Includes Soroban RPC round-trip |

## Contract Gas Costs

| Contract Function | Gas (stroops) | Notes |
|-------------------|---------------|-------|
| `factory.create_wrapper` | ~45,000 | One-time deployment |
| `bridge.mint_with_attestation` | ~28,000 | Per mint operation |
| `governance.propose` | ~35,000 | New proposal creation |
| `governance.cast_vote` | ~12,000 | Single vote |
| `timelock.queue_transaction` | ~15,000 | Queue for execution |

Gas estimates from Soroban testnet simulation. Actual costs vary
with network conditions.

## Throughput

| Operation | Throughput | Bottleneck |
|-----------|-----------|------------|
| Asset creation | ~30/min | Soroban ledger close (5s) |
| Bridge mints | ~60/min | RPC latency + attestation threshold |
| SSE events | ~500/s | Network bandwidth |
| API read requests | ~2,000/s | Fastify throughput (unthrottled) |

## Optimization Notes

1. **Bridge attestation batching** — multiple attesters can sign
   in parallel; the threshold check is O(n) where n = verifier count.
2. **SSE fan-out** — the in-process EventEmitter fans out to all
   connected clients in O(c) where c = client count. For >1,000
   concurrent SSE clients, consider a pub/sub layer (Redis).
3. **Contract gas** — `mint_with_attestation` is the most-called
   function. Pre-computing the payload digest off-chain saves
   ~3,000 gas per invocation.
