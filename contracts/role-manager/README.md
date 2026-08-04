# Role Manager Contract

Role-Based Access Control (RBAC) for the Stellar Payment Gateway.

## Overview

- Define roles as `Symbol` values: `"admin"`, `"operator"`, `"merchant"`, `"relayer"`.
- Grant and revoke roles to Stellar addresses.
- `has_role(account, role)` — permission check usable by any contract.
- Super-admin is set at initialization and always holds the `"admin"` role.
- Only admin-role holders can grant or revoke roles.

## Roles

| Role | Symbol | Purpose |
|------|--------|---------|
| Admin | `"admin"` | Can grant/revoke all roles |
| Operator | `"operator"` | Day-to-day platform operations |
| Merchant | `"merchant"` | Registered merchant account |
| Relayer | `"relayer"` | Cross-chain relayer operator |

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `Initialized` | `bool` | One-shot init guard |
| `SuperAdmin` | `Address` | Top-level admin address |
| `Role(Address, Symbol)` | `bool` | Role assignment |

## Events

| Event | Data | When |
|-------|------|------|
| `role::RoleGranted` | `(account, role)` | Role granted |
| `role::RoleRevoked` | `(account, role)` | Role revoked |

## Usage

```rust
// Check if caller is an admin
if !role_manager.has_role(&env, &caller, &"admin") {
    panic!("unauthorized");
}

// Grant merchant role
role_manager.grant_role(&env, &admin, &merchant, &"merchant");
```
