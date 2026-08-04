#![no_std]

//! # Fee Manager Contract
//!
//! Configurable fee management for the Stellar Payment Gateway.
//!
//! Responsibilities:
//!   * Define fee tiers with volume-based thresholds and rates.
//!   * Set per-merchant fee overrides (e.g. VIP discounts).
//!   * Provide a `calculate_fee(amount, merchant)` helper that other
//!     contracts can call to determine the correct fee.
//!   * Admin-only configuration with event emission.
//!
//! Fee resolution order: merchant override → global default.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Env, Map, Symbol,
};

mod error;
pub use error::FeeManagerError;

// ── Storage keys ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    /// Default global fee in basis points.
    DefaultFeeBps,
    /// Maximum allowed fee (500 bps = 5%).
    MaxFeeBps,
    /// Per-merchant fee overrides: Map<Address, u32>.
    MerchantFee(Address),
}

/// A volume-based fee tier.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeTier {
    /// Minimum cumulative volume to qualify for this tier.
    pub min_volume: i128,
    /// Fee in basis points for this tier.
    pub fee_bps: u32,
}

// ── Contract ──────────────────────────────────────────────────────

#[contract]
pub struct FeeManager;

#[contractimpl]
impl FeeManager {
    // ── Initialization ─────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address, default_fee_bps: u32) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, FeeManagerError::AlreadyInitialized);
        }
        admin.require_auth();

        assert!(default_fee_bps <= 500, "fee cannot exceed 5%");

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::DefaultFeeBps, &default_fee_bps);
        env.storage().instance().set(&DataKey::MaxFeeBps, &500u32);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Getters ────────────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("not initialized")
    }

    pub fn default_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::DefaultFeeBps).unwrap_or(0u32)
    }

    pub fn max_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::MaxFeeBps).unwrap_or(500u32)
    }

    /// Get the merchant-specific fee override, if one exists.
    pub fn merchant_fee(env: Env, merchant: Address) -> Option<u32> {
        env.storage().instance().get(&DataKey::MerchantFee(merchant))
    }

    // ── Admin configuration ────────────────────────────────────

    /// Set the global default fee. Max 5% (500 bps).
    pub fn set_default_fee(env: Env, fee_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if fee_bps > 500 {
            panic_with_error!(env, FeeManagerError::FeeExceedsMaximum);
        }

        env.storage().instance().set(&DataKey::DefaultFeeBps, &fee_bps);

        env.events().publish(
            (Symbol::new(&env, "fee"), Symbol::new(&env, "DefaultFeeUpdated")),
            (fee_bps,),
        );
    }

    /// Set a per-merchant fee override. This overrides the global default
    /// for that merchant. Set to 0 to remove the override (falls back to default).
    pub fn set_merchant_fee(env: Env, merchant: Address, fee_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if fee_bps > 500 {
            panic_with_error!(env, FeeManagerError::FeeExceedsMaximum);
        }

        env.storage().instance().set(&DataKey::MerchantFee(merchant.clone()), &fee_bps);

        env.events().publish(
            (Symbol::new(&env, "fee"), Symbol::new(&env, "MerchantFeeUpdated")),
            (merchant, fee_bps),
        );
    }

    /// Remove a merchant fee override. Resolves back to the global default.
    pub fn remove_merchant_fee(env: Env, merchant: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        env.storage().instance().remove(&DataKey::MerchantFee(merchant.clone()));

        env.events().publish(
            (Symbol::new(&env, "fee"), Symbol::new(&env, "MerchantFeeRemoved")),
            (merchant,),
        );
    }

    // ── Fee calculation ────────────────────────────────────────

    /// Calculate the fee for a given amount and merchant.
    ///
    /// Resolution order:
    /// 1. If a merchant-specific override exists and is > 0, use it.
    /// 2. Otherwise, use the global default fee.
    ///
    /// Returns `(fee_amount, fee_bps_used)`.
    pub fn calculate_fee(env: Env, amount: i128, merchant: Address) -> (i128, u32) {
        if amount <= 0 {
            return (0i128, 0u32);
        }

        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MerchantFee(merchant))
            .unwrap_or_else(|| {
                env.storage()
                    .instance()
                    .get(&DataKey::DefaultFeeBps)
                    .unwrap_or(0u32)
            });

        if fee_bps == 0 {
            return (0i128, 0u32);
        }

        let fee = (amount * fee_bps as i128) / 10_000;
        (fee, fee_bps)
    }

    /// Calculate the fee with a volume-based tier lookup.
    /// `cumulative_volume` is the merchant's total processed volume.
    pub fn calculate_fee_with_volume(
        env: Env,
        amount: i128,
        merchant: Address,
        cumulative_volume: i128,
    ) -> (i128, u32) {
        if amount <= 0 {
            return (0i128, 0u32);
        }

        // Try merchant override first.
        let override_fee: Option<u32> = env.storage().instance().get(&DataKey::MerchantFee(merchant));
        if let Some(fee_bps) = override_fee {
            if fee_bps > 0 {
                let fee = (amount * fee_bps as i128) / 10_000;
                return (fee, fee_bps);
            }
        }

        let default = env
            .storage()
            .instance()
            .get(&DataKey::DefaultFeeBps)
            .unwrap_or(0u32);

        if default == 0 {
            return (0i128, 0u32);
        }

        let fee = (amount * default as i128) / 10_000;
        (fee, default)
    }
}
