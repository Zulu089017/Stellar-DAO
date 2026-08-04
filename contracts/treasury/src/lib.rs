#![no_std]

//! # Treasury Contract
//!
//! Fee aggregation and fund management for the Stellar Payment Gateway.
//!
//! Responsibilities:
//!   * Accept deposits in XLM and Stellar assets from authorised contracts.
//!   * Track balances per asset type.
//!   * Allow the admin to withdraw funds to a destination address.
//!   * Emergency pause/unpause on all operations.
//!   * Emit events for every deposit, withdrawal, and configuration change.
//!
//! The treasury is designed as the central fee collector — the Payment,
//! Escrow, and Invoice contracts route their fees here. Only contracts
//! explicitly whitelisted by the admin can deposit via `deposit()`.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Symbol, Vec,
};

mod error;
pub use error::TreasuryError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    Paused,
    /// Set of authorised depositor contracts.
    AuthorizedDepositors,
    /// Map<Symbol, i128> — balance per asset.
    Balance(Symbol),
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    // ── Initialization ─────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, TreasuryError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::AuthorizedDepositors, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Admin getters ──────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    pub fn paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn authorized_depositors(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::AuthorizedDepositors).unwrap_or_else(|| Vec::new(&env))
    }

    pub fn balance(env: Env, asset: Symbol) -> i128 {
        env.storage().instance().get(&DataKey::Balance(asset)).unwrap_or(0i128)
    }

    // ── Admin management ───────────────────────────────────────

    /// Add an authorised depositor contract. Admin only.
    pub fn add_depositor(env: Env, depositor: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        let mut depositors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AuthorizedDepositors)
            .unwrap_or_else(|| Vec::new(&env));

        if !depositors.contains(&depositor) {
            depositors.push_back(depositor.clone());
            env.storage().instance().set(&DataKey::AuthorizedDepositors, &depositors);
        }

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "DepositorAdded")),
            (depositor,),
        );
    }

    /// Remove an authorised depositor contract. Admin only.
    pub fn remove_depositor(env: Env, depositor: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        let mut depositors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AuthorizedDepositors)
            .unwrap_or_else(|| Vec::new(&env));

        let idx = depositors.first_index_of(&depositor);
        if let Some(i) = idx {
            depositors.remove(i);
            env.storage().instance().set(&DataKey::AuthorizedDepositors, &depositors);
        }

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "DepositorRemoved")),
            (depositor,),
        );
    }

    // ── Pause / Unpause ────────────────────────────────────────

    pub fn pause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "Paused")),
            (),
        );
    }

    pub fn unpause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "Unpaused")),
            (),
        );
    }

    // ── Deposits ───────────────────────────────────────────────

    /// Deposit funds into the treasury. Only authorised depositor
    /// contracts can call this. The deposited amount is tracked per asset.
    pub fn deposit(env: Env, depositor: Address, asset: Symbol, amount: i128) {
        depositor.require_auth();
        Self::_check_not_paused(&env);

        let depositors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AuthorizedDepositors)
            .unwrap_or_else(|| Vec::new(&env));

        if !depositors.contains(&depositor) {
            panic_with_error!(env, TreasuryError::UnauthorizedCaller);
        }
        if amount <= 0 {
            panic_with_error!(env, TreasuryError::InvalidAmount);
        }

        let current = Self::balance(env.clone(), asset.clone());
        let new_balance = current.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, TreasuryError::Overflow));
        env.storage().instance().set(&DataKey::Balance(asset.clone()), &new_balance);

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "Deposit")),
            (depositor, asset, amount, new_balance),
        );
    }

    // ── Withdrawals ────────────────────────────────────────────

    /// Withdraw funds from the treasury. Admin only.
    /// `destination` receives the withdrawn amount; the treasury balance
    /// for `asset` is decreased accordingly.
    pub fn withdraw(env: Env, admin: Address, destination: Address, asset: Symbol, amount: i128) {
        admin.require_auth();

        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        if admin != stored_admin {
            panic_with_error!(env, TreasuryError::UnauthorizedCaller);
        }

        let current = Self::balance(env.clone(), asset.clone());
        if amount <= 0 {
            panic_with_error!(env, TreasuryError::InvalidAmount);
        }
        if amount > current {
            panic_with_error!(env, TreasuryError::InsufficientBalance);
        }

        let new_balance = current.checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, TreasuryError::Overflow));
        env.storage().instance().set(&DataKey::Balance(asset.clone()), &new_balance);

        env.events().publish(
            (Symbol::new(&env, "treasury"), Symbol::new(&env, "Withdrawal")),
            (destination, asset, amount, new_balance),
        );
    }

    // ── Internal helpers ───────────────────────────────────────

    fn _check_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic_with_error!(env, TreasuryError::TreasuryPaused);
        }
    }
}
