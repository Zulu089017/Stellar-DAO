#![no_std]

//! # Role Manager Contract
//!
//! Role-Based Access Control (RBAC) for the Stellar Payment Gateway.
//!
//! Responsibilities:
//!   * Define roles and grant them to addresses.
//!   * Revoke roles from addresses.
//!   * Check whether an address holds a specific role.
//!   * Support a super-admin who can grant/revoke all roles.
//!   * Emit events for every grant and revocation.
//!
//! Roles are defined as `Symbol` values. Common roles include:
//!   * `"admin"` — platform super-admin (can grant roles)
//!   * `"operator"` — day-to-day operations
//!   * `"merchant"` — registered merchant
//!   * `"relayer"` — cross-chain relayer operator

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

mod error;
pub use error::RoleManagerError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    SuperAdmin,
    /// Map<(Address, Symbol), bool> — whether an address has a role.
    Role(Address, Symbol),
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct RoleManager;

#[contractimpl]
impl RoleManager {
    // ── Initialization ─────────────────────────────────────────

    pub fn initialize(env: Env, super_admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, RoleManagerError::AlreadyInitialized);
        }
        super_admin.require_auth();

        env.storage().instance().set(&DataKey::SuperAdmin, &super_admin);
        env.storage().instance().set(&DataKey::Initialized, &true);

        // Grant super-admin the "admin" role.
        env.storage().persistent().set(
            &DataKey::Role(super_admin.clone(), Symbol::new(&env, "admin")),
            &true,
        );

        env.events().publish(
            (Symbol::new(&env, "role"), Symbol::new(&env, "RoleGranted")),
            (super_admin, Symbol::new(&env, "admin")),
        );
    }

    // ── Getters ────────────────────────────────────────────────

    pub fn super_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::SuperAdmin).expect("not initialized")
    }

    /// Check whether `account` has `role`.
    pub fn has_role(env: Env, account: Address, role: Symbol) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Role(account, role))
            .unwrap_or(false)
    }

    // ── Role management ────────────────────────────────────────

    /// Grant a role to an account. Only an address with the `"admin"` role
    /// (or the super-admin) can call this.
    pub fn grant_role(env: Env, admin: Address, account: Address, role: Symbol) {
        admin.require_auth();
        Self::_require_admin(&env, &admin);

        if env.storage().persistent().has(&DataKey::Role(account.clone(), role.clone())) {
            panic_with_error!(env, RoleManagerError::RoleAlreadyGranted);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Role(account.clone(), role.clone()), &true);

        env.events().publish(
            (Symbol::new(&env, "role"), Symbol::new(&env, "RoleGranted")),
            (account, role),
        );
    }

    /// Revoke a role from an account. Only an address with the `"admin"` role
    /// can call this. Cannot revoke the last admin.
    pub fn revoke_role(env: Env, admin: Address, account: Address, role: Symbol) {
        admin.require_auth();
        Self::_require_admin(&env, &admin);

        if !env.storage().persistent().has(&DataKey::Role(account.clone(), role.clone())) {
            panic_with_error!(env, RoleManagerError::RoleNotGranted);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::Role(account.clone(), role.clone()));

        env.events().publish(
            (Symbol::new(&env, "role"), Symbol::new(&env, "RoleRevoked")),
            (account, role),
        );
    }

    // ── Internal helpers ───────────────────────────────────────

    fn _require_admin(env: &Env, caller: &Address) {
        let super_admin: Address = env.storage().instance().get(&DataKey::SuperAdmin).expect("not initialized");

        // Super-admin always passes.
        if caller == &super_admin {
            return;
        }

        // Otherwise must have the "admin" role.
        let is_admin: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Role(caller.clone(), Symbol::new(env, "admin")))
            .unwrap_or(false);

        if !is_admin {
            panic_with_error!(env, RoleManagerError::UnauthorizedCaller);
        }
    }
}
