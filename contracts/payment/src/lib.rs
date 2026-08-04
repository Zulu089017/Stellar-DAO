#![no_std]

//! # Payment Contract
//!
//! Handles XLM and Stellar asset transfers with platform fee collection.
//!
//! Responsibilities:
//!   * Send XLM between Stellar accounts.
//!   * Transfer Stellar assets (trustline-based tokens).
//!   * Execute batch payments atomically.
//!   * Collect configurable platform fees (in basis points).
//!   * Emit structured events for every payment.
//!
//! Integration points:
//!   * The admin can set a platform fee (max 5% / 500 bps) that is
//!     deducted from every payment and routed to the fee collector.
//!   * Batch payments are all-or-nothing — if any individual payment
//!     fails the entire batch reverts.
//!   * The pause mechanism lets the admin halt all payments in an emergency.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Symbol, Vec,
};

mod error;
pub use error::PaymentError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    FeeBps,
    FeeCollector,
    Paused,
    /// Persistent: Map<(Address, Symbol), i128> — asset balances held by contract.
    Balance(Address, Symbol),
}

// ── Structs ───────────────────────────────────────────────────────

/// A single payment instruction in a batch.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentInstruction {
    pub recipient: Address,
    pub asset: Symbol,
    pub amount: i128,
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct Payment;

#[contractimpl]
impl Payment {
    // ── Initialization ─────────────────────────────────────────

    /// Initialize the payment contract. One-shot — subsequent calls panic.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, PaymentError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeBps, &0u32);
        env.storage().instance().set(&DataKey::FeeCollector, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Admin getters ──────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    pub fn fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0u32)
    }

    pub fn fee_collector(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FeeCollector).expect("not initialized")
    }

    pub fn paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    // ── Admin management ───────────────────────────────────────

    /// Set the platform fee in basis points. 100 = 1%. Max 5% (500 bps).
    pub fn set_fee(env: Env, fee_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(fee_bps <= 500, "fee cannot exceed 5%");
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "FeeUpdated")),
            (fee_bps,),
        );
    }

    /// Change the fee collector address.
    pub fn set_fee_collector(env: Env, collector: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::FeeCollector, &collector);

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "FeeCollectorUpdated")),
            (collector,),
        );
    }

    // ── Pause / Unpause ────────────────────────────────────────

    /// Pause all payment operations. Admin only.
    pub fn pause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "Paused")),
            (),
        );
    }

    /// Unpause payment operations. Admin only.
    pub fn unpause(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "Unpaused")),
            (),
        );
    }

    // ── Payments ───────────────────────────────────────────────

    /// Send XLM (the native Stellar asset) from `from` to `to`.
    /// The `from` address MUST have authorised this invocation.
    ///
    /// A platform fee (if configured) is deducted from the amount and
    /// routed to the fee collector.
    pub fn send_xlm(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::_check_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(env, PaymentError::InvalidAmount);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0u32);
        let fee = (amount * fee_bps as i128) / 10_000;
        let net = amount - fee;

        if fee > 0 {
            let collector: Address = env.storage().instance().get(&DataKey::FeeCollector).expect("not initialized");
            let collector_balance = Self::balance_of(env.clone(), collector.clone(), Symbol::new(&env, "XLM"));
            env.storage().persistent().set(
                &DataKey::Balance(collector.clone(), Symbol::new(&env, "XLM")),
                &collector_balance.checked_add(fee)
                    .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
            );
        }

        let to_balance = Self::balance_of(env.clone(), to.clone(), Symbol::new(&env, "XLM"));
        env.storage().persistent().set(
            &DataKey::Balance(to.clone(), Symbol::new(&env, "XLM")),
            &to_balance.checked_add(net)
                .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
        );

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "PaymentSent")),
            (from, to, Symbol::new(&env, "XLM"), net, fee),
        );
    }

    /// Transfer a Stellar asset from `from` to `to`.
    /// `asset_code` is the asset code (e.g. "USDC") and `asset_issuer`
    /// is the issuing account. The asset is tracked by the contract.
    pub fn send_asset(
        env: Env,
        from: Address,
        to: Address,
        asset_code: Symbol,
        asset_issuer: Address,
        amount: i128,
    ) {
        from.require_auth();
        Self::_check_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(env, PaymentError::InvalidAmount);
        }

        let asset_key = Self::_asset_key(&env, &asset_code, &asset_issuer);
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0u32);
        let fee = (amount * fee_bps as i128) / 10_000;
        let net = amount - fee;

        if fee > 0 {
            let collector: Address = env.storage().instance().get(&DataKey::FeeCollector).expect("not initialized");
            let collector_balance = Self::balance_of(env.clone(), collector.clone(), asset_key.clone());
            env.storage().persistent().set(
                &DataKey::Balance(collector.clone(), asset_key.clone()),
                &collector_balance.checked_add(fee)
                    .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
            );
        }

        let to_balance = Self::balance_of(env.clone(), to.clone(), asset_key.clone());
        env.storage().persistent().set(
            &DataKey::Balance(to.clone(), asset_key.clone()),
            &to_balance.checked_add(net)
                .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
        );

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "PaymentSent")),
            (from, to, asset_code, asset_issuer, net, fee),
        );
    }

    /// Execute a batch of payments atomically. If any payment in the
    /// batch would fail, the entire batch reverts.
    ///
    /// Each `PaymentInstruction` specifies recipient, asset, and amount.
    /// All payments share the same `from` address.
    pub fn batch_payment(env: Env, from: Address, payments: Vec<PaymentInstruction>) {
        from.require_auth();
        Self::_check_not_paused(&env);

        if payments.is_empty() || payments.len() > 50 {
            panic_with_error!(env, PaymentError::InvalidBatchSize);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0u32);
        let mut total_fee: i128 = 0;

        // Validate all payments first (fail-fast).
        for p in payments.iter() {
            if p.amount <= 0 {
                panic_with_error!(env, PaymentError::InvalidAmount);
            }
            total_fee = total_fee.checked_add((p.amount * fee_bps as i128) / 10_000)
                .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow));
        }

        // Execute all payments.
        let collector: Address = env.storage().instance().get(&DataKey::FeeCollector).expect("not initialized");

        for p in payments.iter() {
            let fee = (p.amount * fee_bps as i128) / 10_000;
            let net = p.amount - fee;

            // Credit fee to collector (use "XLM" as fee denomination for simplicity;
            // in production each asset would track fees separately).
            if fee > 0 {
                let col_bal = Self::balance_of(env.clone(), collector.clone(), p.asset.clone());
                env.storage().persistent().set(
                    &DataKey::Balance(collector.clone(), p.asset.clone()),
                    &col_bal.checked_add(fee)
                        .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
                );
            }

            // Credit net to recipient.
            let rec_bal = Self::balance_of(env.clone(), p.recipient.clone(), p.asset.clone());
            env.storage().persistent().set(
                &DataKey::Balance(p.recipient.clone(), p.asset.clone()),
                &rec_bal.checked_add(net)
                    .unwrap_or_else(|| panic_with_error!(env, PaymentError::Overflow)),
            );
        }

        env.events().publish(
            (Symbol::new(&env, "payment"), Symbol::new(&env, "BatchPaymentExecuted")),
            (from, payments.len() as u32, total_fee),
        );
    }

    /// Query the tracked balance of `account` for `asset`.
    pub fn balance_of(env: Env, account: Address, asset: Symbol) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(account, asset))
            .unwrap_or(0i128)
    }

    // ── Internal helpers ───────────────────────────────────────

    fn _check_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic_with_error!(env, PaymentError::PaymentPaused);
        }
    }

    fn _asset_key(_env: &Env, code: &Symbol, _issuer: &Address) -> Symbol {
        // Asset key derivation: for simplicity we use the asset code directly.
        // Production: combine code + issuer hash for uniqueness.
        code.clone()
    }
}
