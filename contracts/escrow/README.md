# Escrow Contract

Time-locked escrow with dispute resolution and arbiter oversight.

## Overview

- Create escrow agreements between a depositor and a recipient.
- Funds are locked until released, refunded, or resolved by the arbiter.
- Either party can dispute before expiration — the arbiter resolves
  with a split decision that must sum to the escrowed amount.
- All state transitions emit structured events.

## Lifecycle

```
Created
  │
  ▼
Funded ────────────────────────────────────────────┐
  │                                                 │
  ├──► Released   (depositor or arbiter calls)      │
  │                                                 │
  ├──► Refunded   (recipient or arbiter calls)      │
  │                                                 │
  └──► Disputed   (either party calls)              │
         │                                          │
         └──► Resolved  (arbiter splits funds) ◄────┘
```

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `Admin` | `Address` | Contract administrator |
| `EscrowCount` | `u64` | Monotonic escrow id counter |
| `Escrow(u64)` | `Escrow` | Escrow state keyed by id |

### Escrow struct

| Field | Type | Description |
|-------|------|-------------|
| `id` | `u64` | Unique escrow identifier |
| `depositor` | `Address` | Party locking funds |
| `recipient` | `Address` | Intended beneficiary |
| `arbiter` | `Address` | Dispute resolver |
| `token` | `Symbol` | Asset code |
| `amount` | `i128` | Escrowed amount |
| `expiration_ledger` | `u32` | Ledger when escrow matures |
| `status` | `EscrowStatus` | Current state |
| `funded` | `bool` | Whether funds are deposited |

## Events

| Event | Data | Emitted When |
|-------|------|-------------|
| `escrow::EscrowCreated` | `(id, depositor, recipient, arbiter, token, amount, expiration)` | Escrow created |
| `escrow::EscrowFunded` | `(id,)` | Depositor funds escrow |
| `escrow::EscrowReleased` | `(id, recipient)` | Funds released to recipient |
| `escrow::EscrowRefunded` | `(id, depositor)` | Funds refunded to depositor |
| `escrow::EscrowDisputed` | `(id,)` | Party raises dispute |
| `escrow::EscrowResolved` | `(id, to_depositor, to_recipient)` | Arbiter resolves dispute |

## Usage

```rust
// Create escrow: 1000 USDC, expires in 100 ledgers
let id = escrow.create_escrow(
    &env, &buyer, &seller, &arbiter,
    &"USDC", &1000_0000000, &(current_ledger + 100),
);

// Fund
escrow.fund_escrow(&env, &buyer, &id);

// Release to seller
escrow.release_escrow(&env, &buyer, &id);

// Or dispute → resolve
escrow.dispute_escrow(&env, &buyer, &id);
escrow.resolve_dispute(&env, &arbiter, &id, &500_0000000, &500_0000000);
```
