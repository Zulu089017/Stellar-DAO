# Architecture

Stellar Payment Gateway is a **four-layer** payment ecosystem powered by Stellar and
Soroban. It combines cross-chain asset wrapping, on-chain payment primitives,
DAO governance, and a real-time API/dashboard layer.

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
   │  contracts/  (Soroban · Rust — 12 smart contracts)                 │
   │                                                                    │
   │  ┌── Bridge Layer ──┐  ┌── Payment Primitives ──┐                │
   │  │ bridge            │  │ payment               │                │
   │  │ factory           │  │ escrow                │                │
   │  │ wrapper-token     │  │ invoice               │                │
   │  └───────────────────┘  │ treasury              │                │
   │                         └───────────────────────┘                │
   │  ┌── Governance ────┐  ┌── Platform Infra ─────┐                │
   │  │ governance-token  │  │ fee-manager           │                │
   │  │ governance        │  │ role-manager          │                │
   │  │ timelock          │  └───────────────────────┘                │
   │  └───────────────────┘                                           │
   └────────────────────────────────┬───────────────────────────────────┘
                                    │  Soroban events
                                    ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  apps/api (Fastify)  ───  Horizon SSE  ───  apps/web (Next.js 15)  │
   │                                                                    │
   │  /assets  /bridge  /transactions  /governance  /analytics         │
   │  /invoices  /merchants  /webhooks  /events                        │
   └────────────────────────────────────────────────────────────────────┘
```

## Contract responsibilities

### Bridge Layer (cross-chain asset wrapping)
| Contract | Purpose | Key Events |
|----------|---------|------------|
| `bridge` | Verify relayer attestations, route mint/burn | `MintRequested`, `BurnRequested`, `Paused` |
| `factory` | Deterministic wrapper-token deployment + registry | `WrapperCreated` |
| `wrapper-token` | SEP-41 token — mint/burn restricted to bridge | `Mint`, `Burn`, `Transfer`, `Approve` |

### Payment Primitives (on-chain value transfer)
| Contract | Purpose | Key Events |
|----------|---------|------------|
| `payment` | Send XLM/assets, batch payments (≤50), fee deduction | `PaymentSent`, `BatchPaymentExecuted` |
| `escrow` | Time-locked escrow with dispute resolution by arbiter | `EscrowCreated`, `EscrowReleased`, `EscrowResolved` |
| `invoice` | On-chain invoices with partial payment support | `InvoiceCreated`, `InvoicePaid`, `InvoiceCancelled` |
| `treasury` | Fee aggregation, authorised deposits, admin withdrawals | `Deposit`, `Withdrawal` |

### Governance (DAO operations)
| Contract | Purpose | Key Events |
|----------|---------|------------|
| `governance-token` | SEP-41 token with delegation + checkpointing | `DelegateChanged`, `DelegateVotesChanged` |
| `governance` | Proposal creation, voting, queueing, execution | `ProposalCreated`, `VoteCast`, `ProposalExecuted` |
| `timelock` | Delayed execution for governance safety | `TransactionQueued`, `TransactionExecuted` |

### Platform Infrastructure
| Contract | Purpose | Key Events |
|----------|---------|------------|
| `fee-manager` | Configurable fees — global default + per-merchant overrides | `DefaultFeeUpdated`, `MerchantFeeUpdated` |
| `role-manager` | RBAC — grant/revoke roles (`admin`, `operator`, `merchant`, `relayer`) | `RoleGranted`, `RoleRevoked` |

## Real-time feed

Soroban emits events for every state transition from all 12 contracts.
Horizon's `GET /contracts/{id}/events` endpoint exposes the stream. The
dashboard subscribes directly to Horizon. The `api` service also exposes
`/events` as an SSE fallback.

## API surface

| Prefix | Purpose |
|--------|---------|
| `/health` | Service health + network status |
| `/assets` | Wrapped asset registry (CRUD + pagination) |
| `/bridge` | Wrap/unwrap endpoints |
| `/transactions` | Bridge transaction lifecycle |
| `/governance` | Proposals, voting, delegation |
| `/invoices` | Invoice CRUD + payment |
| `/merchants` | Merchant registration, API keys, profile |
| `/webhooks` | Webhook endpoint management |
| `/events` | SSE event stream |
| `/` | Analytics + protocol metrics |

## Security model

1. **Bridge authorisation** — verifier set + threshold governs relayer operators
2. **Replay protection** — consumed nonces burned in persistent storage
3. **Wrapper-token pin** — bridge address pinned at clone time, immutable
4. **Deterministic addresses** — factory produces same contract ID every time
5. **RBAC** — role-manager enforces admin/operator/merchant/relayer roles across all contracts
6. **Fee caps** — fee-manager enforces 5% max; payment contract independently caps at 5%
7. **Timelock** — governance execution delayed by configurable minimum (default 24h)
8. **Pause mechanisms** — bridge, payment, and treasury contracts support emergency pause
9. **Escrow arbiter** — third-party arbiter resolves disputes with split decisions
10. **Invoice expiration** — invoices automatically become unpayable after deadline
