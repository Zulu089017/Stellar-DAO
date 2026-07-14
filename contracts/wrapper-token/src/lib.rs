#![no_std]

//! # Wrapper-Token contract
//!
//! SEP-41-compatible token contract whose mint and burn authority is
//! restricted to a single `bridge` address. The factory clones one of
//! these per `(source_chain, source_token)` pair.
//!
//! Responsibilities:
//!   * Maintain a SEP-41-faithful balance/allowance ledger.
//!   * Authorise only the bridge to call `mint` / `burn`.
//!   * Expose token metadata (`name`, `symbol`, `decimals`) so wallets and
//!     market data services can identify each wrapper.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Bytes, Env, Symbol,
};

mod error;
mod metadata;

pub use error::TokenError;
pub use metadata::{AllowanceKey, DataKey};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenEvent {
    // Tuple variants because `#[contracttype]` in soroban-sdk 21.x forbids
    // named fields on enum variants — the SCVal wire format encodes
    // variants by index + payload order, not by name. We keep these as
    // canonical SEP-41 event shapes; the bridge's own published events
    // (using `(Symbol, Symbol)` topics) are unaffected by this rename.
    Mint(Address, i128),
    Burn(Address, i128),
    Transfer(Address, Address, i128),
    Approve(Address, Address, i128, u32),
    BurnFrom(Address, Address, i128),
}

#[contract]
pub struct WrapperToken;

#[contractimpl]
impl WrapperToken {
    /// Called once by the factory at clone time. Pinning `bridge` here
    /// makes it impossible for anyone else (including a future factory
    /// admin) to mint or burn against this wrapper-token.
    pub fn initialize(
        env: Env,
        admin: Address,
        bridge: Address,
        name: Bytes,
        symbol: Bytes,
        decimals: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, TokenError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Bridge, &bridge);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    pub fn bridge(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Bridge).expect("not initialized")
    }

    pub fn name(env: Env) -> Bytes {
        env.storage().instance().get(&DataKey::Name).expect("not initialized")
    }

    pub fn symbol(env: Env) -> Bytes {
        env.storage().instance().get(&DataKey::Symbol).expect("not initialized")
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).expect("not initialized")
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0i128)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0i128)
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(owner.clone(), spender))
            .unwrap_or(0i128)
    }

    /// Mint — only callable by the bridge.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let bridge: Address = env
            .storage()
            .instance()
            .get(&DataKey::Bridge)
            .expect("not initialized");
        bridge.require_auth();

        if amount <= 0 {
            panic_with_error!(env, TokenError::InvalidAmount);
        }

        let new_balance = Self::balance(env.clone(), to.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::Overflow));
        env.storage().persistent().set(&to, &new_balance);

        let supply = Self::total_supply(env.clone()).checked_add(amount).unwrap_or_else(
            || panic_with_error!(env, TokenError::Overflow),
        );
        env.storage().instance().set(&DataKey::TotalSupply, &supply);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Mint")),
            (to, amount),
        );
    }

    /// Burn — only callable by the bridge.
    pub fn burn(env: Env, from: Address, amount: i128) {
        let bridge: Address = env
            .storage()
            .instance()
            .get(&DataKey::Bridge)
            .expect("not initialized");
        bridge.require_auth();

        if amount <= 0 {
            panic_with_error!(env, TokenError::InvalidAmount);
        }

        let new_balance = Self::balance(env.clone(), from.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::InsufficientBalance));
        env.storage().persistent().set(&from, &new_balance);

        let supply = Self::total_supply(env.clone()).checked_sub(amount).unwrap_or_else(
            || panic_with_error!(env, TokenError::Overflow),
        );
        env.storage().instance().set(&DataKey::TotalSupply, &supply);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Burn")),
            (from, amount),
        );
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance = Self::balance(env.clone(), from.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::InsufficientBalance));
        let to_balance = Self::balance(env.clone(), to.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::Overflow));

        env.storage().persistent().set(&from, &from_balance);
        env.storage().persistent().set(&to, &to_balance);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Transfer")),
            (from, to, amount),
        );
    }

    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        owner.require_auth();

        env.storage()
            .persistent()
            .set(&(owner.clone(), spender.clone()), &amount);
        // 3-tuple `(owner, spender, DataKey::AllowanceExpiry)` Map keys are
        // rejected by the soroban-sdk 21.x host. Use the `AllowanceKey`
        // struct wrapped in the `DataKey::AllowanceExpiry` variant instead.
        env.storage()
            .persistent()
            .set(
                &DataKey::AllowanceExpiry(AllowanceKey {
                    owner: owner.clone(),
                    spender: spender.clone(),
                }),
                &expiration_ledger,
            );

        env.events().publish(
            (Symbol::new(&env, "approve"), Symbol::new(&env, "Approve")),
            (owner, spender, amount, expiration_ledger),
        );
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();

        let expiry: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::AllowanceExpiry(AllowanceKey {
                owner: from.clone(),
                spender: spender.clone(),
            }))
            .unwrap_or(0u32);
        if expiry != 0 && expiry < env.ledger().sequence() {
            panic_with_error!(env, TokenError::AllowanceExpired);
        }

        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::InsufficientAllowance));
        env.storage()
            .persistent()
            .set(&(from.clone(), spender.clone()), &allowance);

        let from_balance = Self::balance(env.clone(), from.clone())
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::InsufficientBalance));
        let to_balance = Self::balance(env.clone(), to.clone())
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, TokenError::Overflow));
        env.storage().persistent().set(&from, &from_balance);
        env.storage().persistent().set(&to, &to_balance);

        env.events().publish(
            (Symbol::new(&env, "transfer"), Symbol::new(&env, "Transfer")),
            (from, to, amount),
        );
    }
}
