# Fee Manager Contract

Configurable fee management with per-merchant overrides and volume-based tiers.

## Overview

- Global default fee rate (configurable, max 5% / 500 bps).
- Per-merchant fee overrides for VIP/discount pricing.
- `calculate_fee(amount, merchant)` — resolves merchant override → global default.
- `calculate_fee_with_volume(amount, merchant, cumulative_volume)` — volume-aware.
- Admin-only configuration with event emission.

## Fee Resolution Order

```
merchant override  →  use it (if > 0)
       ↓ (no override)
global default     →  use it
```

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `Admin` | `Address` | Contract administrator |
| `DefaultFeeBps` | `u32` | Global default fee |
| `MaxFeeBps` | `u32` | Fee ceiling (500) |
| `MerchantFee(Address)` | `u32` | Per-merchant override |

## Events

| Event | Data | When |
|-------|------|------|
| `fee::DefaultFeeUpdated` | `(fee_bps,)` | Admin changes global fee |
| `fee::MerchantFeeUpdated` | `(merchant, fee_bps)` | Override set |
| `fee::MerchantFeeRemoved` | `(merchant,)` | Override removed |

## Usage

```rust
// Set global fee to 1%
fee_manager.set_default_fee(&env, &100);

// Give merchant a 0.5% discount
fee_manager.set_merchant_fee(&env, &merchant, &50);

// Calculate fee for a 1000 USDC payment
let (fee, rate) = fee_manager.calculate_fee(&env, &1000_0000000, &merchant);
```
