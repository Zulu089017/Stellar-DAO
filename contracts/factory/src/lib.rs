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
    IntoVal, String, Symbol, Val, Vec,
};

mod error;
mod registry;

pub use error::FactoryError;
pub use registry::{DataKey, SourceTokenKey};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FactoryEvent {
    // Tuple variant — `#[contracttype]` in soroban-sdk 21.x rejects
    // enum variants with named fields; the wire format encodes by
    // discriminant + payload order, not by name. This mirrors the
    // TokenEvent tuple-rename in the wrapper-token contract.
    //
    // First payload field is `String` (not `Symbol`) for the same reason
    // `SourceTokenKey::source_chain` is `String` — `Symbol::to_string()`
    // is stripped from the WASM build of soroban-sdk 21.7.7.
    WrapperCreated(String, Bytes, Address, Bytes, Bytes, u32),
}

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    /// Initialize the factory with the wrapper-token template wasm hash and an
    /// admin that can rotate future config (but NOT individual wrapper-token
    /// admins; those are pinned at clone time to the bridge).
    ///
    /// `template` is the `BytesN<32>` SHA-256 of the wrapper-token wasm as
    /// returned by `Env::deployer().upload_contract_wasm(...)`. In
    /// soroban-sdk 21.x the host function `create_contract` deploys a new
    /// contract instance from a wasm hash (it does NOT clone an existing
    /// contract by address the way the 22.x `with_address` API does), so the
    /// factory has to ship the wasm hash and pass it to `deploy(wasm_hash)`
    /// rather than pointing at a pre-deployed template.
    pub fn initialize(env: Env, admin: Address, template: BytesN<32>, bridge: Address) {
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

    pub fn template(env: Env) -> BytesN<32> {
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
    ///
    /// `source_chain` is `soroban_sdk::String` rather than `Symbol` because
    /// the WASM build of the contract needs to read the chain's raw bytes
    /// (in `build_salt`) and `Symbol::to_string()` is only compiled for
    /// non-WASM targets in soroban-sdk 21.7.7.
    pub fn get_wrapper(
        env: Env,
        source_chain: String,
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
        source_chain: String,
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

        let template: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::Template)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized));
        let bridge: Address = env
            .storage()
            .instance()
            .get(&DataKey::Bridge)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized));

        // Clone the wrapper-token template. In soroban-sdk 21.x the factory
        // stores the wasm hash of the template and calls
        // `Deployer::with_address(deployer, salt).deploy(wasm_hash)` to spin
        // up a new instance whose address is deterministically derived from
        // `(deployer, salt)`. We use the factory contract itself as the
        // deployer so the create_contract host function emits a child
        // contract address that's easy to reason about. After deploy we
        // call `initialize(admin, bridge, name, symbol, decimals)` on the
        // new contract — this is atomic with the deploy in the same
        // transaction, so no one can front-run the initialize call.
        // `admin == bridge` because the wrapper-token exposes no admin-only
        // methods today; rotate both together via a new factory deployment.
        let salt = Self::build_salt(&env, &source_chain, &source_token);
        let new_addr = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy(template);
        let init_args: Vec<Val> = vec![
            &env,
            bridge.into_val(&env), // admin (== bridge; see comment above)
            bridge.into_val(&env), // mint/burn authority
            name.into_val(&env),
            symbol.into_val(&env),
            decimals.into_val(&env),
        ];
        env.invoke_contract::<Val>(&new_addr, &Symbol::new(&env, "initialize"), init_args);

        // Persist the registry entry and emit the indexer event. (The
        // wrapper-token is now fully initialised — no separate
        // `invoke_contract` call needed, so the front-run window above is
        // closed.)
        env.storage().persistent().set(&key, &new_addr);

        env.events().publish(
            (Symbol::new(&env, "factory"), Symbol::new(&env, "WrapperCreated")),
            (source_chain, source_token, new_addr.clone(), name, symbol, decimals),
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

    fn build_salt(env: &Env, source_chain: &String, source_token: &Bytes) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.extend_from_slice(b"STELLARDAO_FACTORY_V1");
        // `source_chain` is `soroban_sdk::String` (see the field type
        // change on `SourceTokenKey`). `copy_into_slice` is the only way in
        // 21.7.7 to get raw bytes from a host-managed `String` on both host
        // and WASM targets — `Symbol::to_string()` is stripped from WASM
        // and `String` has no `iter()` / `get(i)` accessor. The off-chain
        // `apps/sdk/src/contracts/factory.ts` encoder uses the same
        // `chain.toString()` UTF-8 bytes for matching.
        let mut chain_bytes = [0u8; 128];
        let chain_len = source_chain.len() as usize;
        if chain_len > chain_bytes.len() {
            panic!("source_chain exceeds 128-byte digest buffer");
        }
        source_chain.copy_into_slice(&mut chain_bytes[..chain_len]);
        buf.extend_from_slice(&chain_bytes[..chain_len]);
        // `Bytes::as_slice()` was removed in soroban-sdk 21.x. Use
        // `Bytes::append(&Bytes)` instead, which copies the host-managed
        // bytes into our buffer without an intermediate `&[u8]` slice.
        buf.append(source_token);
        // `env.crypto().sha256` returns `soroban_sdk::crypto::Hash<32>` in
        // soroban-sdk 21.x. `BytesN<32>` is `From<Hash<32>>` (cheap newtype
        // wrap around the same 32-byte buffer), so `.into()` converts at
        // zero cost without an extra allocation.
        env.crypto().sha256(&buf).into()
    }
}
