#![no_std]

//! # Factory contract
//!
//! Owns the canonical `wrapper-token` template and the on-chain registry of
//! all wrappers deployed to date.
//!
//! Responsibilities:
//!   * Store the address of the wrapper-token template (the "blueprint").
//!   * Clone the template for each new `(source_chain, source_token)` pair
//!     using Soroban's `Deployer::with_address(...)`.
//!   * Initialize each clone with the configured bridge as the sole minter/burner.
//!   * Maintain a `Map<DataKey, Address>` registry so lookup operations from
//!     the API layer are O(1) and the relayer never has to trust an
//!     off-chain index for asset routing.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, vec, Address, Bytes, BytesN, Env,
    IntoVal, Symbol, Val, Vec,
};

mod error;
mod registry;

pub use error::FactoryError;
pub use registry::{DataKey, SourceTokenKey};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FactoryEvent {
    WrapperCreated {
        source_chain: Symbol,
        source_token: Bytes,
        wrapper_token: Address,
        name: Bytes,
        symbol: Bytes,
        decimals: u32,
    },
}

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    /// Initialize the factory with the wrapper-token template address and an
    /// admin that can rotate future config (but NOT individual wrapper-token
    /// admins; those are pinned at clone time to the bridge).
    pub fn initialize(env: Env, admin: Address, template: Address, bridge: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(env, FactoryError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Template, &template);
        env.storage().instance().set(&DataKey::Bridge, &bridge);
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized))
    }

    pub fn template(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Template)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized))
    }

    pub fn bridge(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Bridge)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized))
    }

    /// Idempotent: if a wrapper-token already exists for `(source_chain, source_token)`,
    /// returns it without creating a new contract.
    pub fn get_wrapper(
        env: Env,
        source_chain: Symbol,
        source_token: Bytes,
    ) -> Address {
        let key = SourceTokenKey {
            source_chain,
            source_token,
        };
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::WrapperNotFound))
    }

    /// Public entry point for any developer integrating with StellarDAO.
    ///
    /// `name` and `symbol` should match the source ERC-20 metadata
    /// (`"Stellar Dollar"` / `"wUSD"`, etc.). They become the wrapper-token's
    /// stellar SAC metadata so wallets display the right thing to users.
    pub fn create_wrapper(
        env: Env,
        caller: Address,
        source_chain: Symbol,
        source_token: Bytes,
        name: Bytes,
        symbol: Bytes,
        decimals: u32,
    ) -> Address {
        caller.require_auth();

        let key = SourceTokenKey {
            source_chain: source_chain.clone(),
            source_token: source_token.clone(),
        };

        if let Some(existing) = env.storage().persistent().get::<SourceTokenKey, Address>(&key) {
            return existing;
        }

        let template: Address = env
            .storage()
            .instance()
            .get(&DataKey::Template)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized));
        let bridge: Address = env
            .storage()
            .instance()
            .get(&DataKey::Bridge)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized));

        // Clone the wrapper-token template. `Deployer::with_address` emits
        // a `contract_id` derived from `(template, salt)` — relying on
        // `template` + a length-tagged salt ensures deterministic addresses
        // for the same input. The 5-arg `initialize(admin, bridge, name,
        // symbol, decimals)` is passed directly to `deploy` so the new
        // contract is initialised atomically — without this, a malicious
        // caller could front-run the factory and call `initialize` first.
        // `admin == bridge` because the wrapper-token exposes no admin-only
        // methods today; rotate both together via a new factory deployment.
        let salt = Self::build_salt(&env, &source_chain, &source_token);
        let constructor_args: Vec<Val> = vec![
            &env,
            bridge.into_val(&env), // admin (== bridge; see comment above)
            bridge.into_val(&env), // mint/burn authority
            name.into_val(&env),
            symbol.into_val(&env),
            decimals.into_val(&env),
        ];
        let new_addr = env
            .deployer()
            .with_address(template, salt)
            .deploy(constructor_args);

        // Persist the registry entry and emit the indexer event. (The
        // wrapper-token is now fully initialised — no separate
        // `invoke_contract` call needed, so the front-run window above is
        // closed.)
        env.storage().persistent().set(&key, &new_addr);

        env.events().publish(
            (Symbol::new(&env, "factory"), Symbol::new(&env, "WrapperCreated")),
            (source_chain, source_token, new_addr, name, symbol, decimals),
        );

        new_addr
    }

    /// Admin rotation hook — never delete this entry point; bridges accrue
    /// upgrades (new signature schemes, governance post-launch) and the
    /// factory must be able to keep up.
    pub fn set_bridge(env: Env, new_bridge: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized));
        admin.require_auth();
        env.storage().instance().set(&DataKey::Bridge, &new_bridge);
    }

    fn build_salt(env: &Env, source_chain: &Symbol, source_token: &Bytes) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.extend_from_slice(b"STELLARDAO_FACTORY_V1");
        buf.extend_from_slice(source_chain.clone().into_val(env).serialize(env).as_slice());
        buf.extend_from_slice(source_token.as_slice());
        // `env.crypto().sha256` returns `soroban_sdk::crypto::Hash<32>` in
        // soroban-sdk 21.x. `BytesN<32>` is `From<Hash<32>>` (cheap newtype
        // wrap around the same 32-byte buffer), so `.into()` converts at
        // zero cost without an extra allocation.
        env.crypto().sha256(&buf).into()
    }
}
