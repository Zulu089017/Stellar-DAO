# `@stellar-payment-gateway/sdk`

A high-level Stellar client for the rest of the polyrepo. The contract
address space lives in `@stellar-payment-gateway/soroban-client` (auto-generated from
Rust), but everything *application-level* — Horizon queries, attestation
helpers, transaction shapes — is here.

| Module          | Purpose                                                    |
|-----------------|------------------------------------------------------------|
| `horizon`       | Typed Horizon JSON + SSE helpers                           |
| `attestation`   | Domain digest + secp256k1 signer/verifier                  |
| `contracts/bridge`      | Build `mint_with_attestation` & `burn_with_attestation` ops |
| `contracts/factory`     | Build `create_wrapper` ops                |
| `contracts/wrapper-token` | Build SEP-41 token ops + read helpers |

```ts
import { BridgeContract, buildLockDigest, signSecp256k1 } from '@stellar-payment-gateway/sdk';

const bridge = new BridgeContract(env.BRIDGE_CONTRACT_ID);

const digest = buildLockDigest({ ... });
const sig = await signSecp256k1(digest, process.env.RELAYER_SECRET_KEY!);
//  -> submit via relayer/api
```
