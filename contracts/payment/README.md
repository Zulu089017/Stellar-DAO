# Payment Contract

Handles XLM and Stellar asset transfers with configurable platform fees
and atomic batch payment execution.

## Overview

- Send XLM between Stellar accounts with fee deduction.
- Transfer Stellar custom assets (trustline-based tokens).
- Execute up to 50 payments atomically in a single invocation.
- Admin-configurable platform fee (max 5% / 500 bps).
- Emergency pause/unpause mechanism.

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `Admin` | `Address` | Contract administrator |
| `FeeBps` | `u32` | Platform fee in basis points |
| `FeeCollector` | `Address` | Fee destination |
| `Paused` | `bool` | Emergency halt flag |
| `Balance(Address, Symbol)` | `i128` | Tracked asset balance per account |

## Events

| Event | Data | Emitted When |
|-------|------|-------------|
| `payment::FeeUpdated` | `(fee_bps,)` | Admin changes platform fee |
| `payment::FeeCollectorUpdated` | `(collector,)` | Admin changes fee destination |
| `payment::Paused` | `()` | Admin pauses the contract |
| `payment::Unpaused` | `()` | Admin unpauses the contract |
| `payment::PaymentSent` | `(from, to, asset, net, fee)` | Individual payment executed |
| `payment::BatchPaymentExecuted` | `(from, count, total_fee)` | Batch payment completed |

## Usage

```rust
// Send 100 XLM
payment.send_xml(&env, &from, &to, &100_0000000);

// Batch pay 3 recipients
let payments = vec![
    PaymentInstruction { recipient: alice, asset: "XLM", amount: 50_0000000 },
    PaymentInstruction { recipient: bob, asset: "XLM", amount: 30_0000000 },
];
payment.batch_payment(&env, &from, &payments);
```
