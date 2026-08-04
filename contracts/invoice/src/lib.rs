#![no_std]

//! # Invoice Contract
//!
//! On-chain invoice creation, payment tracking, and cancellation.
//!
//! Responsibilities:
//!   * Create invoices payable in XLM or Stellar assets.
//!   * Track cumulative paid amounts — supports full and partial payments.
//!   * Enforce expiration — invoices become unpayable after expiry.
//!   * Allow the creator to cancel an unpaid invoice.
//!   * Emit structured events for every state transition.
//!
//! Lifecycle:
//! ```
//! Created ──► Paid         (full payment by payer)
//!        ──► PartiallyPaid (partial, stays open for more)
//!        ──► Cancelled     (creator cancels before payment)
//!        ──► Expired       (nobody paid before deadline)
//! ```

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

mod error;
pub use error::InvoiceError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    /// Map<u64, Invoice> — invoice by id.
    Invoice(u64),
    /// Monotonic invoice id counter.
    InvoiceCount,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InvoiceStatus {
    Created,
    PartiallyPaid,
    Paid,
    Cancelled,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invoice {
    pub id: u64,
    pub creator: Address,
    pub payer: Address,
    pub token: Symbol,
    pub total_amount: i128,
    pub paid_amount: i128,
    pub expiration_ledger: u32,
    pub status: InvoiceStatus,
    pub memo: Symbol,
    pub created_at: u32,
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    // ── Initialization ─────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, InvoiceError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::InvoiceCount, &0u64);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    // ── Invoice lifecycle ──────────────────────────────────────

    /// Create a new invoice. `creator` is the party requesting payment,
    /// `payer` is the intended payer. The invoice expires at `expiration_ledger`
    /// (minimum 10 ledgers from current).
    pub fn create_invoice(
        env: Env,
        creator: Address,
        payer: Address,
        token: Symbol,
        total_amount: i128,
        expiration_ledger: u32,
        memo: Symbol,
    ) -> u64 {
        creator.require_auth();

        if total_amount <= 0 {
            panic_with_error!(env, InvoiceError::InvalidAmount);
        }
        let current = env.ledger().sequence();
        if expiration_ledger < current + 10 {
            panic_with_error!(env, InvoiceError::InvalidExpiration);
        }

        let count: u64 = env.storage().instance().get(&DataKey::InvoiceCount).unwrap_or(0u64);
        let id = count;

        let invoice = Invoice {
            id,
            creator: creator.clone(),
            payer: payer.clone(),
            token: token.clone(),
            total_amount,
            paid_amount: 0i128,
            expiration_ledger,
            status: InvoiceStatus::Created,
            memo: memo.clone(),
            created_at: current,
        };

        env.storage().persistent().set(&DataKey::Invoice(id), &invoice);
        env.storage().instance().set(&DataKey::InvoiceCount, &(count + 1));

        env.events().publish(
            (Symbol::new(&env, "invoice"), Symbol::new(&env, "InvoiceCreated")),
            (id, creator, payer, token, total_amount, expiration_ledger, memo),
        );

        id
    }

    /// Pay an invoice. Only the designated payer can call this.
    /// Supports partial payments — the invoice stays open until `paid_amount`
    /// equals `total_amount`. Overpayment is rejected.
    pub fn pay_invoice(env: Env, payer: Address, invoice_id: u64, amount: i128) {
        payer.require_auth();

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::InvoiceNotFound));

        if invoice.payer != payer {
            panic_with_error!(env, InvoiceError::UnauthorizedCaller);
        }
        if amount <= 0 {
            panic_with_error!(env, InvoiceError::InvalidAmount);
        }
        if invoice.paid_amount + amount > invoice.total_amount {
            panic_with_error!(env, InvoiceError::PaymentExceedsAmount);
        }
        match invoice.status {
            InvoiceStatus::Paid => panic_with_error!(env, InvoiceError::InvoiceAlreadyPaid),
            InvoiceStatus::Cancelled => panic_with_error!(env, InvoiceError::InvoiceAlreadyCancelled),
            InvoiceStatus::Expired => panic_with_error!(env, InvoiceError::InvoiceExpired),
            _ => {}
        }
        // Check expiration.
        let current = env.ledger().sequence();
        if current > invoice.expiration_ledger {
            invoice.status = InvoiceStatus::Expired;
            env.storage().persistent().set(&DataKey::Invoice(invoice_id), &invoice);
            panic_with_error!(env, InvoiceError::InvoiceExpired);
        }

        invoice.paid_amount = invoice.paid_amount.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::Overflow));

        if invoice.paid_amount == invoice.total_amount {
            invoice.status = InvoiceStatus::Paid;
        } else {
            invoice.status = InvoiceStatus::PartiallyPaid;
        }

        env.storage().persistent().set(&DataKey::Invoice(invoice_id), &invoice);

        env.events().publish(
            (Symbol::new(&env, "invoice"), Symbol::new(&env, "InvoicePaid")),
            (invoice_id, payer, amount, invoice.paid_amount, invoice.total_amount),
        );
    }

    /// Cancel an invoice before it is fully paid. Only the creator can cancel.
    pub fn cancel_invoice(env: Env, creator: Address, invoice_id: u64) {
        creator.require_auth();

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::InvoiceNotFound));

        if invoice.creator != creator {
            panic_with_error!(env, InvoiceError::UnauthorizedCaller);
        }
        if invoice.status == InvoiceStatus::Paid {
            panic_with_error!(env, InvoiceError::InvoiceAlreadyPaid);
        }
        if invoice.status == InvoiceStatus::Cancelled {
            panic_with_error!(env, InvoiceError::InvoiceAlreadyCancelled);
        }

        invoice.status = InvoiceStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Invoice(invoice_id), &invoice);

        env.events().publish(
            (Symbol::new(&env, "invoice"), Symbol::new(&env, "InvoiceCancelled")),
            (invoice_id,),
        );
    }

    /// Mark an invoice as expired. Anyone can call this for efficiency.
    /// Only takes effect if the current ledger exceeds the invoice's expiration.
    pub fn expire_invoice(env: Env, invoice_id: u64) {
        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::InvoiceNotFound));

        let current = env.ledger().sequence();
        if current <= invoice.expiration_ledger {
            panic_with_error!(env, InvoiceError::InvalidExpiration);
        }
        if invoice.status == InvoiceStatus::Paid {
            return; // Already paid — no-op.
        }
        if invoice.status == InvoiceStatus::Cancelled {
            return; // Already cancelled — no-op.
        }

        invoice.status = InvoiceStatus::Expired;
        env.storage().persistent().set(&DataKey::Invoice(invoice_id), &invoice);

        env.events().publish(
            (Symbol::new(&env, "invoice"), Symbol::new(&env, "InvoiceExpired")),
            (invoice_id,),
        );
    }

    /// Query an invoice by id.
    pub fn get_invoice(env: Env, invoice_id: u64) -> Invoice {
        env.storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::InvoiceNotFound))
    }

    /// Total number of invoices created.
    pub fn invoice_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::InvoiceCount).unwrap_or(0u64)
    }

    /// Check if an invoice is payable (Created or PartiallyPaid, not expired).
    pub fn is_payable(env: Env, invoice_id: u64) -> bool {
        let invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(invoice_id))
            .unwrap_or_else(|| panic_with_error!(env, InvoiceError::InvoiceNotFound));

        let current = env.ledger().sequence();
        (invoice.status == InvoiceStatus::Created || invoice.status == InvoiceStatus::PartiallyPaid)
            && current <= invoice.expiration_ledger
    }
}
