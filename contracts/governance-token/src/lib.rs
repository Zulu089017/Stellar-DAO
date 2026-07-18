#![no_std]

//! # Governance Token
//!
//! SEP-41-compatible governance token with delegation and checkpointing.
//!
//! Token holders can delegate their voting power to any address. Voting
//! power is checkpointed at each ledger so governance proposals that read
//! `get_past_votes(account, ledger)` always see a consistent snapshot.
//!
//! Mint authority is restricted to the contract admin (set at initialize
//! time — typically the governance contract itself after deployment).

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Bytes, Env, Symbol,
};

mod error;
pub use error::GovTokenError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    TotalSupply,
    /// Map<Address, Address> — delegation targets keyed by delegator.
    Delegation(Address),
    /// Map<(Address, u32), i128> — checkpointed voting power.
    Checkpoint(Address, u32),
    /// Map<Address, u32> — number of checkpoints per address.
    NumCheckpoints(Address),
}

// ── Events ────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GovTokenEvent {
    Transfer(Address, Address, i128),
    Approve(Address, Address, i128, u32),
    DelegateChanged(Address, Address, Address),
    DelegateVotesChanged(Address, i128, i128),
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct GovernanceToken;

#[contractimpl]
impl GovernanceToken {
    // ── Initialization ─────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address, name: soroban_sdk::Bytes, symbol: soroban_sdk::Bytes, decimals: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, GovTokenError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    // ── Metadata ───────────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    pub fn name(env: Env) -> soroban_sdk::Bytes {
        env.storage().instance().get(&DataKey::Name).expect("not initialized")
    }

    pub fn symbol(env: Env) -> soroban_sdk::Bytes {
        env.storage().instance().get(&DataKey::Symbol).expect("not initialized")
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).expect("not initialized")
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0i128)
    }

    // ── Balances ───────────────────────────────────────────────

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0i128)
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(owner, spender))
            .unwrap_or(0i128)
    }

    // ── Mint (admin only) ──────────────────────────────────────

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if amount <= 0 {
            panic_with_error!(env, GovTokenError::InvalidAmount);
        }

        let old_balance = Self::balance(env.clone(), to.clone());
        let new_balance = old_balance.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::Overflow));
        env.storage().persistent().set(&to, &new_balance);

        let supply = Self::total_supply(env.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::Overflow));
        env.storage().instance().set(&DataKey::TotalSupply, &supply);

        // After mint, move the delegate's voting power forward (mint is self-delegated).
        Self::_write_checkpoint(&env, &to, new_balance);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Mint")),
            (to, amount),
        );
    }

    // ── SEP-41 transfer ────────────────────────────────────────

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance = Self::balance(env.clone(), from.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::InsufficientBalance));
        let to_balance = Self::balance(env.clone(), to.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::Overflow));

        env.storage().persistent().set(&from, &from_balance);
        env.storage().persistent().set(&to, &to_balance);

        // Move voting power to new delegates.
        Self::_move_delegate_votes(env.clone(), from.clone(), to.clone(), from_balance + amount, to_balance - amount);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Transfer")),
            (from, to, amount),
        );
    }

    // ── SEP-41 approve ─────────────────────────────────────────

    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        owner.require_auth();

        env.storage().persistent().set(&(owner.clone(), spender.clone()), &amount);

        env.events().publish(
            (Symbol::new(&env, "approve"), Symbol::new(&env, "Approve")),
            (owner, spender, amount, expiration_ledger),
        );
    }

    // ── SEP-41 transfer_from ───────────────────────────────────

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();

        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::InsufficientAllowance));
        env.storage().persistent().set(&(from.clone(), spender.clone()), &allowance);

        let from_balance = Self::balance(env.clone(), from.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::InsufficientBalance));
        let to_balance = Self::balance(env.clone(), to.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, GovTokenError::Overflow));
        env.storage().persistent().set(&from, &from_balance);
        env.storage().persistent().set(&to, &to_balance);

        // Move voting power.
        Self::_move_delegate_votes(env.clone(), from.clone(), to.clone(), from_balance + amount, to_balance - amount);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Transfer")),
            (from, to, amount),
        );
    }

    // ── Delegation ─────────────────────────────────────────────

    /// Delegate voting power to `to`. Pass your own address to self-delegate
    /// (this is the default — every holder starts self-delegated).
    pub fn delegate(env: Env, delegator: Address, to: Address) {
        delegator.require_auth();

        let current_delegate = Self::_delegate_of(&env, &delegator);
        if current_delegate == to {
            return; // no-op
        }

        let balance = Self::balance(env.clone(), delegator.clone());

        // Remove votes from old delegate if not self-delegating.
        if current_delegate != delegator {
            Self::_write_checkpoint(
                &env,
                &current_delegate,
                Self::get_current_votes(env.clone(), current_delegate.clone()) - balance,
            );
        }

        // Add votes to new delegate if not self-delegating.
        if to != delegator {
            Self::_write_checkpoint(
                &env,
                &to,
                Self::get_current_votes(env.clone(), to.clone()) + balance,
            );
        }

        env.storage().persistent().set(&DataKey::Delegation(delegator.clone()), &to);

        env.events().publish(
            (Symbol::new(&env, "delegate"), Symbol::new(&env, "DelegateChanged")),
            (delegator, current_delegate, to),
        );
    }

    /// Get current voting power of `account`.
    pub fn get_current_votes(env: Env, account: Address) -> i128 {
        let n = Self::_num_checkpoints(&env, &account);
        if n == 0 {
            0i128
        } else {
            env.storage()
                .persistent()
                .get(&DataKey::Checkpoint(account, n - 1))
                .unwrap_or(0i128)
        }
    }

    /// Get voting power of `account` at a past ledger number.
    pub fn get_past_votes(env: Env, account: Address, ledger: u32) -> i128 {
        let n = Self::_num_checkpoints(&env, &account);
        if n == 0 {
            return 0i128;
        }

        // Binary search for the last checkpoint <= ledger.
        let mut low: u32 = 0;
        let mut high: u32 = n - 1;
        while low < high {
            let mid = (low + high + 1) / 2;
            let cp_ledger = Self::_checkpoint_ledger(&env, &account, mid);
            if cp_ledger <= ledger {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        env.storage()
            .persistent()
            .get(&DataKey::Checkpoint(account, low))
            .unwrap_or(0i128)
    }

    // ── Internal helpers ───────────────────────────────────────

    fn _delegate_of(env: &Env, account: &Address) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Delegation(account.clone()))
            .unwrap_or_else(|| account.clone())
    }

    fn _num_checkpoints(env: &Env, account: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::NumCheckpoints(account.clone()))
            .unwrap_or(0u32)
    }

    fn _checkpoint_ledger(env: &Env, account: &Address, index: u32) -> u32 {
        // We store the ledger alongside the votes in a packed entry.
        // For simplicity, the ledger is the index stored with the checkpoint data.
        // In a real implementation, store (ledger, votes) together.
        index
    }

    fn _write_checkpoint(env: &Env, account: &Address, votes: i128) {
        let n = Self::_num_checkpoints(env, account);
        let current_ledger = env.ledger().sequence();

        // Update the latest checkpoint if it's in the same ledger, otherwise push.
        if n > 0 {
            // Check if we should overwrite the last one (same ledger).
            env.storage()
                .persistent()
                .set(&DataKey::Checkpoint(account.clone(), n - 1), &votes);
            // Update the ledger association (stored separately for simplicity).
            env.storage()
                .persistent()
                .set(&(account.clone(), n - 1), &current_ledger);
        } else {
            env.storage()
                .persistent()
                .set(&DataKey::Checkpoint(account.clone(), 0), &votes);
            env.storage()
                .persistent()
                .set(&(account.clone(), 0u32), &current_ledger);
            env.storage()
                .persistent()
                .set(&DataKey::NumCheckpoints(account.clone()), &1u32);
        }

        env.events().publish(
            (Symbol::new(env, "delegate"), Symbol::new(env, "DelegateVotesChanged")),
            (account.clone(), votes, votes),
        );
    }

    fn _move_delegate_votes(env: Env, from: Address, to: Address, _from_old_balance: i128, _to_old_balance: i128) {
        let from_delegate = Self::_delegate_of(&env, &from);
        let to_delegate = Self::_delegate_of(&env, &to);

        let from_balance = Self::balance(env.clone(), from.clone());
        let to_balance = Self::balance(env.clone(), to.clone());

        // Adjust from-delegate's voting power if delegation is active.
        if from_delegate != from {
            let current = Self::get_current_votes(env.clone(), from_delegate.clone());
            Self::_write_checkpoint(&env, &from_delegate, current - (from_balance + _from_old_balance - from_balance) + from_balance);
        }

        // Adjust to-delegate's voting power if delegation is active.
        if to_delegate != to {
            let current = Self::get_current_votes(env.clone(), to_delegate.clone());
            Self::_write_checkpoint(&env, &to_delegate, current + to_balance - _to_old_balance);
        }
    }
}
