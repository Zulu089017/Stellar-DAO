# Invoice Contract

On-chain invoice creation, payment tracking, and cancellation with
partial payment support.

## Overview

- Create invoices payable in XLM or Stellar assets.
- Track cumulative paid amounts — supports full and partial payments.
- Invoices expire after a configurable deadline.
- Creators can cancel unpaid invoices.
- All state transitions emit structured events.

## Lifecycle

```
Created
  │
  ├──► Paid             (full amount received)
  ├──► PartiallyPaid    (partial — stays open for more)
  ├──► Cancelled        (creator cancels before payment)
  └──► Expired          (deadline passed without full payment)
```

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `Admin` | `Address` | Contract administrator |
| `InvoiceCount` | `u64` | Monotonic invoice id counter |
| `Invoice(u64)` | `Invoice` | Invoice state keyed by id |

### Invoice struct

| Field | Type | Description |
|-------|------|-------------|
| `id` | `u64` | Unique invoice identifier |
| `creator` | `Address` | Party requesting payment |
| `payer` | `Address` | Intended payer |
| `token` | `Symbol` | Asset code |
| `total_amount` | `i128` | Total amount due |
| `paid_amount` | `i128` | Cumulative amount paid |
| `expiration_ledger` | `u32` | Ledger when invoice expires |
| `status` | `InvoiceStatus` | Current state |
| `memo` | `Symbol` | Payment reference / description |
| `created_at` | `u32` | Ledger when created |

## Events

| Event | Data | When |
|-------|------|------|
| `invoice::InvoiceCreated` | `(id, creator, payer, token, amount, expiration, memo)` | Invoice created |
| `invoice::InvoicePaid` | `(id, payer, amount, paid, total)` | Payment received |
| `invoice::InvoiceCancelled` | `(id,)` | Creator cancels |
| `invoice::InvoiceExpired` | `(id,)` | Deadline passed |

## Usage

```rust
// Create invoice: 500 USDC payable by bob, expires in 1000 ledgers
let id = invoice.create_invoice(
    &env, &merchant, &bob, &"USDC",
    &500_0000000, &(current + 1000), &"Order #42",
);

// Bob pays in full
invoice.pay_invoice(&env, &bob, &id, &500_0000000);

// Or partial: 300 now, 200 later
invoice.pay_invoice(&env, &bob, &id, &300_0000000);
invoice.pay_invoice(&env, &bob, &id, &200_0000000);
```
