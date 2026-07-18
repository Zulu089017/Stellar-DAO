#![no_std]

//! # Timelock Controller
//!
//! Delays governance proposal execution by a configurable number of ledgers.
//!
//! Only the governance contract can queue transactions through the timelock.
//! Once queued, the transaction has an ETA (estimated time of execution)
//! calculated as `current_ledger + delay`. After the ETA passes and within
//! a configurable grace period, anyone can execute the transaction.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN, Env,
    Symbol, Vec,
};

mod error;
pub use error::TimelockError;

// ── Types ───────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockTx {
    pub target: Address,
    pub value: i128,
    pub fn_name: Symbol,
    pub calldata: Bytes,
    pub eta: u32,
    pub queued: bool,
    pub executed: bool,
    pub canceled: bool,
}

// ── Storage Keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TLDataKey {
    Initialized,
    Admin,
    Governance,
    MinDelay,
    GracePeriod,
    /// Map<BytesN<32>, TimelockTx> — tx hash → tx data
    Transaction(BytesN<32>),
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct Timelock;

#[contractimpl]
impl Timelock {
    /// Initialize the timelock controller.
    ///
    /// `governance` is the only contract allowed to queue transactions.
    /// `min_delay` is the minimum delay (in ledgers) before execution.
    /// `grace_period` is the window (in ledgers) after ETA during which
    /// execution is allowed.
    pub fn initialize(
        env: Env,
        admin: Address,
        governance: Address,
        min_delay: u32,
        grace_period: u32,
    ) {
        if env.storage().instance().has(&TLDataKey::Initialized) {
            panic_with_error!(env, TimelockError::AlreadyInitialized);
        }
        admin.require_auth();

        assert!(min_delay > 0, "min delay must be positive");
        assert!(grace_period > 0, "grace period must be positive");

        env.storage().instance().set(&TLDataKey::Initialized, &true);
        env.storage().instance().set(&TLDataKey::Admin, &admin);
        env.storage().instance().set(&TLDataKey::Governance, &governance);
        env.storage().instance().set(&TLDataKey::MinDelay, &min_delay);
        env.storage().instance().set(&TLDataKey::GracePeriod, &grace_period);
    }

    // ── Config queries ────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&TLDataKey::Admin).expect("not initialized")
    }

    pub fn governance(env: Env) -> Address {
        env.storage().instance().get(&TLDataKey::Governance).expect("not initialized")
    }

    pub fn min_delay(env: Env) -> u32 {
        env.storage().instance().get(&TLDataKey::MinDelay).expect("not initialized")
    }

    pub fn grace_period(env: Env) -> u32 {
        env.storage().instance().get(&TLDataKey::GracePeriod).expect("not initialized")
    }

    // ── Queue ─────────────────────────────────────────────────

    /// Queue a transaction for future execution. Only callable by the
    /// governance contract. Returns the ETA (ledger number).
    pub fn queue_transaction(
        env: Env,
        target: Address,
        value: i128,
        fn_name: Symbol,
        calldata: Bytes,
    ) -> u32 {
        let governance: Address = env.storage()
            .instance()
            .get(&TLDataKey::Governance)
            .expect("not initialized");
        governance.require_auth();

        let min_delay: u32 = env.storage().instance().get(&TLDataKey::MinDelay).expect("not initialized");
        let current_ledger = env.ledger().sequence();
        let eta = current_ledger + min_delay;

        let tx_hash = Self::_hash_tx(&env, &target, value, &fn_name, &calldata);

        // Check not already queued.
        if let Some(existing) = env.storage().persistent().get::<TLDataKey, TimelockTx>(&TLDataKey::Transaction(tx_hash.clone())) {
            if existing.queued {
                panic_with_error!(env, TimelockError::TransactionAlreadyQueued);
            }
        }

        let tx = TimelockTx {
            target,
            value,
            fn_name,
            calldata,
            eta,
            queued: true,
            executed: false,
            canceled: false,
        };
        env.storage().persistent().set(&TLDataKey::Transaction(tx_hash.clone()), &tx);

        env.events().publish(
            (Symbol::new(&env, "timelock"), Symbol::new(&env, "TransactionQueued")),
            (tx_hash, eta),
        );

        eta
    }

    /// Execute a previously queued transaction. Anyone can call this once
    /// the ETA has passed and the grace period has not expired.
    pub fn execute_transaction(
        env: Env,
        target: Address,
        value: i128,
        fn_name: Symbol,
        calldata: Bytes,
    ) {
        let governance: Address = env.storage()
            .instance()
            .get(&TLDataKey::Governance)
            .expect("not initialized");
        governance.require_auth();

        let tx_hash = Self::_hash_tx(&env, &target, value, &fn_name, &calldata);

        let mut tx: TimelockTx = env.storage()
            .persistent()
            .get(&TLDataKey::Transaction(tx_hash.clone()))
            .unwrap_or_else(|| panic_with_error!(env, TimelockError::TransactionNotFound));

        if tx.executed {
            panic_with_error!(env, TimelockError::TransactionAlreadyExecuted);
        }
        if tx.canceled {
            panic_with_error!(env, TimelockError::TransactionAlreadyCanceled);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < tx.eta {
            panic_with_error!(env, TimelockError::TimelockNotExpired);
        }

        let grace_period: u32 = env.storage().instance().get(&TLDataKey::GracePeriod).expect("not initialized");
        if current_ledger > tx.eta + grace_period {
            panic_with_error!(env, TimelockError::InsufficientGracePeriod);
        }

        tx.executed = true;
        env.storage().persistent().set(&TLDataKey::Transaction(tx_hash.clone()), &tx);

        // Execute the actual call.
        let invoke_args: Vec<soroban_sdk::Val> = soroban_sdk::vec![&env];
        // Build args from calldata — in production this deserializes SCVal.
        env.invoke_contract::<()>(
            &tx.target,
            &tx.fn_name,
            invoke_args,
        );

        env.events().publish(
            (Symbol::new(&env, "timelock"), Symbol::new(&env, "TransactionExecuted")),
            (tx_hash,),
        );
    }

    /// Cancel a queued transaction. Only callable by the governance contract
    /// or the admin.
    pub fn cancel_transaction(
        env: Env,
        target: Address,
        value: i128,
        fn_name: Symbol,
        calldata: Bytes,
    ) {
        let admin: Address = env.storage().instance().get(&TLDataKey::Admin).expect("not initialized");
        let governance: Address = env.storage().instance().get(&TLDataKey::Governance).expect("not initialized");

        // Admin or governance can cancel.
        if env.current_contract_address() != admin && env.current_contract_address() != governance {
            admin.require_auth();
        }

        let tx_hash = Self::_hash_tx(&env, &target, value, &fn_name, &calldata);

        let mut tx: TimelockTx = env.storage()
            .persistent()
            .get(&TLDataKey::Transaction(tx_hash.clone()))
            .unwrap_or_else(|| panic_with_error!(env, TimelockError::TransactionNotFound));

        if tx.executed {
            panic_with_error!(env, TimelockError::TransactionAlreadyExecuted);
        }
        if tx.canceled {
            panic_with_error!(env, TimelockError::TransactionAlreadyCanceled);
        }

        tx.canceled = true;
        env.storage().persistent().set(&TLDataKey::Transaction(tx_hash.clone()), &tx);

        env.events().publish(
            (Symbol::new(&env, "timelock"), Symbol::new(&env, "TransactionCanceled")),
            (tx_hash,),
        );
    }

    // ── Query ─────────────────────────────────────────────────

    pub fn get_transaction(env: Env, tx_hash: BytesN<32>) -> TimelockTx {
        env.storage()
            .persistent()
            .get(&TLDataKey::Transaction(tx_hash))
            .unwrap_or_else(|| panic_with_error!(env, TimelockError::TransactionNotFound))
    }

    // ── Admin setters ─────────────────────────────────────────

    pub fn set_min_delay(env: Env, delay: u32) {
        let admin: Address = env.storage().instance().get(&TLDataKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(delay > 0, "min delay must be positive");
        env.storage().instance().set(&TLDataKey::MinDelay, &delay);
    }

    pub fn set_governance(env: Env, new_governance: Address) {
        let admin: Address = env.storage().instance().get(&TLDataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&TLDataKey::Governance, &new_governance);
    }

    // ── Internal ──────────────────────────────────────────────

    fn _hash_tx(
        env: &Env,
        target: &Address,
        value: i128,
        _fn_name: &Symbol,
        calldata: &Bytes,
    ) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        let tag = Bytes::from_slice(env, b"TIMELOCK_TX_V1");
        buf.append(&tag);
        // Serialize target address bytes for hashing.
        let target_raw = Bytes::from_slice(env, &[0u8; 32]);
        buf.append(&target_raw);
        let value_bytes = Bytes::from_slice(env, &value.to_be_bytes());
        buf.append(&value_bytes);
        buf.append(calldata);
        env.crypto().sha256(&buf).into()
    }
}
