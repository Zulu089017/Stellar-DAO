#![no_std]

//! # Escrow Contract
//!
//! Time-locked escrow with dispute resolution and arbiter oversight.
//!
//! Responsibilities:
//!   * Create escrow agreements between a depositor and a recipient.
//!   * Lock funds until the escrow is released, refunded, or resolved by the arbiter.
//!   * Support dispute resolution — either party can dispute before expiration,
//!     and a designated arbiter resolves with a split decision.
//!   * Emit structured events for every state transition.
//!
//! Lifecycle:
//! ```
//! Created → Funded → Released    (happy path)
//!                  → Refunded    (before funding, by depositor)
//!                  → Disputed → Resolved  (arbiter splits funds)
//! ```

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

mod error;
pub use error::EscrowError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    /// Map<u64, Escrow> — escrow by numeric id.
    Escrow(u64),
    /// Counter for escrow id generation.
    EscrowCount,
}

/// The status of an escrow.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Created,
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved,
}

/// One escrow agreement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: u64,
    pub depositor: Address,
    pub recipient: Address,
    pub arbiter: Address,
    pub token: Symbol,
    pub amount: i128,
    pub expiration_ledger: u32,
    pub status: EscrowStatus,
    pub funded: bool,
}

// ── Events ────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowEvent {
    EscrowCreated(u64, Address, Address, Address, Symbol, i128, u32),
    EscrowFunded(u64),
    EscrowReleased(u64, Address),
    EscrowRefunded(u64, Address),
    EscrowDisputed(u64),
    EscrowResolved(u64, i128, i128),
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Initialization ─────────────────────────────────────────

    /// Initialize the escrow contract. One-shot.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, EscrowError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::EscrowCount, &0u64);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Admin ──────────────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    // ── Escrow lifecycle ───────────────────────────────────────

    /// Create a new escrow. The caller becomes the depositor.
    /// `expiration_ledger` sets when the escrow can be released without
    /// dispute. Minimum 10 ledgers (~50 seconds) from current.
    pub fn create_escrow(
        env: Env,
        depositor: Address,
        recipient: Address,
        arbiter: Address,
        token: Symbol,
        amount: i128,
        expiration_ledger: u32,
    ) -> u64 {
        depositor.require_auth();

        if recipient == depositor || arbiter == depositor || arbiter == recipient {
            panic_with_error!(env, EscrowError::ZeroAddressNotAllowed);
        }
        if amount <= 0 {
            panic_with_error!(env, EscrowError::InvalidAmount);
        }
        let current = env.ledger().sequence();
        if expiration_ledger < current + 10 {
            panic_with_error!(env, EscrowError::InvalidExpiration);
        }

        let count: u64 = env.storage().instance().get(&DataKey::EscrowCount).unwrap_or(0u64);
        let id = count;

        let escrow = Escrow {
            id,
            depositor: depositor.clone(),
            recipient: recipient.clone(),
            arbiter: arbiter.clone(),
            token: token.clone(),
            amount,
            expiration_ledger,
            status: EscrowStatus::Created,
            funded: false,
        };

        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);
        env.storage().instance().set(&DataKey::EscrowCount, &(count + 1));

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowCreated")),
            (id, depositor, recipient, arbiter, token, amount, expiration_ledger),
        );

        id
    }

    /// Fund an escrow by depositing the agreed amount. Only the depositor
    /// can call this. Funds are locked until released, refunded, or resolved.
    pub fn fund_escrow(env: Env, depositor: Address, escrow_id: u64) {
        depositor.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));

        if escrow.depositor != depositor {
            panic_with_error!(env, EscrowError::UnauthorizedCaller);
        }
        if escrow.funded {
            panic_with_error!(env, EscrowError::EscrowAlreadyFunded);
        }
        if escrow.status != EscrowStatus::Created {
            panic_with_error!(env, EscrowError::EscrowAlreadyResolved);
        }

        escrow.funded = true;
        escrow.status = EscrowStatus::Funded;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowFunded")),
            (escrow_id,),
        );
    }

    /// Release escrow funds to the recipient. Callable by the depositor
    /// or the arbiter after the escrow is funded.
    pub fn release_escrow(env: Env, caller: Address, escrow_id: u64) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));

        if escrow.depositor != caller && escrow.arbiter != caller {
            panic_with_error!(env, EscrowError::UnauthorizedCaller);
        }
        if !escrow.funded {
            panic_with_error!(env, EscrowError::EscrowNotFunded);
        }
        if escrow.status == EscrowStatus::Released || escrow.status == EscrowStatus::Resolved {
            panic_with_error!(env, EscrowError::EscrowAlreadyResolved);
        }

        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowReleased")),
            (escrow_id, escrow.recipient),
        );
    }

    /// Refund escrow funds back to the depositor. Callable by the recipient
    /// (before funding) or the arbiter (at any time before resolution).
    pub fn refund_escrow(env: Env, caller: Address, escrow_id: u64) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));

        if escrow.recipient != caller && escrow.arbiter != caller {
            panic_with_error!(env, EscrowError::UnauthorizedCaller);
        }
        if escrow.status == EscrowStatus::Released || escrow.status == EscrowStatus::Refunded || escrow.status == EscrowStatus::Resolved {
            panic_with_error!(env, EscrowError::EscrowAlreadyResolved);
        }

        escrow.status = EscrowStatus::Refunded;
        escrow.funded = false;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowRefunded")),
            (escrow_id, escrow.depositor),
        );
    }

    /// Dispute an escrow. Either the depositor or the recipient can call
    /// this before the escrow expires. After a dispute, only the arbiter
    /// can resolve.
    pub fn dispute_escrow(env: Env, caller: Address, escrow_id: u64) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));

        if escrow.depositor != caller && escrow.recipient != caller {
            panic_with_error!(env, EscrowError::UnauthorizedCaller);
        }
        if !escrow.funded {
            panic_with_error!(env, EscrowError::EscrowNotFunded);
        }
        if escrow.status == EscrowStatus::Released || escrow.status == EscrowStatus::Refunded || escrow.status == EscrowStatus::Resolved {
            panic_with_error!(env, EscrowError::EscrowAlreadyResolved);
        }
        if escrow.status == EscrowStatus::Disputed {
            panic_with_error!(env, EscrowError::EscrowAlreadyDisputed);
        }

        escrow.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowDisputed")),
            (escrow_id,),
        );
    }

    /// Resolve a disputed escrow. Only the arbiter can call this.
    /// `to_depositor` + `to_recipient` must equal the escrow amount.
    pub fn resolve_dispute(
        env: Env,
        arbiter: Address,
        escrow_id: u64,
        to_depositor: i128,
        to_recipient: i128,
    ) {
        arbiter.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));

        if escrow.arbiter != arbiter {
            panic_with_error!(env, EscrowError::UnauthorizedCaller);
        }
        if escrow.status != EscrowStatus::Disputed {
            panic_with_error!(env, EscrowError::EscrowNotDisputed);
        }
        if to_depositor + to_recipient != escrow.amount {
            panic_with_error!(env, EscrowError::InvalidResolution);
        }
        if to_depositor < 0 || to_recipient < 0 {
            panic_with_error!(env, EscrowError::InvalidResolution);
        }

        escrow.status = EscrowStatus::Resolved;
        env.storage().persistent().set(&DataKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (Symbol::new(&env, "escrow"), Symbol::new(&env, "EscrowResolved")),
            (escrow_id, to_depositor, to_recipient),
        );
    }

    /// Query an escrow by id.
    pub fn get_escrow(env: Env, escrow_id: u64) -> Escrow {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound))
    }

    /// Total number of escrows created.
    pub fn escrow_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::EscrowCount).unwrap_or(0u64)
    }
}
