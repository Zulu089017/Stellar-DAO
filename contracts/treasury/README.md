# Treasury Contract

Fee aggregation and fund management for the Stellar Payment Gateway.

## Overview

- Accept deposits in XLM and Stellar assets from authorised contracts.
- Track balances per asset type.
- Admin-controlled withdrawals to any destination.
- Whitelist of authorised depositor contracts.
- Emergency pause/unpause.

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `Admin` | `Address` | Contract administrator |
| `Paused` | `bool` | Emergency halt flag |
| `AuthorizedDepositors` | `Vec<Address>` | Contracts allowed to deposit |
| `Balance(Symbol)` | `i128` | Treasury balance per asset |

## Events

| Event | Data | When |
|-------|------|------|
| `treasury::DepositorAdded` | `(depositor,)` | New authorised depositor |
| `treasury::DepositorRemoved` | `(depositor,)` | Depositor revoked |
| `treasury::Paused` / `Unpaused` | `()` | Emergency toggle |
| `treasury::Deposit` | `(depositor, asset, amount, new_balance)` | Funds deposited |
| `treasury::Withdrawal` | `(destination, asset, amount, new_balance)` | Admin withdraws |

## Usage

```rust
// Authorise the payment contract to deposit fees
treasury.add_depositor(&env, &payment_contract);

// Payment contract routes fees here
treasury.deposit(&env, &payment_contract, &"XLM", &100_0000000);

// Admin withdraws accumulated fees
treasury.withdraw(&env, &admin, &treasury_addr, &"XLM", &500_0000000);
```
