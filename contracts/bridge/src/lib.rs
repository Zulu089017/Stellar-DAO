#![no_std]

// `Symbol::to_string()` is implemented via `alloc` types (String +
// ToString trait). The no_std contract author must `extern crate alloc;`
// to opt in to the `alloc` API surface even though `soroban-sdk` already
// links `alloc` internally — without this Rust 2021 no_std rejects any
// `use alloc::...` or `.to_string()` on `alloc`-backed types.
extern crate alloc;


//! # Bridge Contract
//!
//! Single entry point for cross-chain wrap/unwrap operations.
//!
//! Responsibilities:
//!   * Maintain a verifier set (operators) with a configurable signing threshold
//!     for source-chain attestations.
//!   * Verify signed `(nonce, source_chain, source_token, recipient, amount, wrapper_token_id)`
//!     payloads produced by [`apps/relayer`](../apps/relayer).
//!   * Prevent replay attacks by tracking consumed nonces.
//!   * On a verified `Lock` event, charge mint authority to the corresponding
//!     `wrapper-token` contract.
//!   * On a verified `Unlock` event, burn on the wrapper-token and record the
//!     outbound transfer for the relayer to act on.
//!
//! The signature scheme is intentionally pluggable: the relayer produces
//! secp256k1 signatures today (cheap, broadly supported on EVM chains) but
//! the verifier interface can be swapped for ed25519 or a Wormhole/LayerZero
//! proof without changing the contract surface.

use alloc::string::ToString;

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

mod storage;
mod verification;

pub use storage::{DataKey, LockPayload, UnlockPayload};
pub use verification::{verify_attestation, AttestationError, AttestationVerifier};

#[contract]
pub struct Bridge;

#[contractimpl]
impl Bridge {
    /// Initialize the bridge with a verifier set and threshold.
    /// Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        operators: Vec<BytesN<32>>,
        threshold: u32,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("bridge already initialized");
        }
        admin.require_auth();

        assert!(!operators.is_empty(), "operators must not be empty");
        assert!(
            threshold as usize >= 1 && threshold as usize <= operators.len() as usize,
            "invalid threshold",
        );

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Operators, &operators);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        env.storage()
            .instance()
            .set(&DataKey::Initialized, &true);
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("bridge not initialized")
    }

    pub fn threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Threshold)
            .expect("bridge not initialized")
    }

    pub fn operators(env: Env) -> Vec<BytesN<32>> {
        env.storage()
            .instance()
            .get(&DataKey::Operators)
            .expect("bridge not initialized")
    }

    /// Update the verifier set and threshold. Callable by admin only.
    pub fn set_verifiers(
        env: Env,
        operators: Vec<BytesN<32>>,
        threshold: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("bridge not initialized");
        admin.require_auth();

        assert!(!operators.is_empty(), "operators must not be empty");
        assert!(
            threshold as usize >= 1 && threshold as usize <= operators.len() as usize,
            "invalid threshold",
        );

        env.storage().instance().set(&DataKey::Operators, &operators);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
    }

    /// Wrap (mint) entry point — called by the relayer after observing a `Lock`
    /// event on a source chain.
    ///
    /// `wrapper_token` MUST be a contract previously created by the
    /// [`factory`](../factory) for the `(source_chain, source_token)` pair
    /// declared in `payload`.
    pub fn mint_with_attestation(
        env: Env,
        relayer: Address,
        wrapper_token: Address,
        payload: LockPayload,
        attestations: Vec<(BytesN<32>, BytesN<64>)>,
    ) {
        relayer.require_auth();

        // CRITICAL: verify signatures BEFORE persisting the nonce. The
        // previous ordering let any caller spamm pre-computed payloads to
        // exhaust persistent storage rent.
        Self::verify_lock(env.clone(), &payload, &attestations);
        assert!(
            !env.storage().persistent().has(&payload.nonce),
            "nonce reused"
        );

        // Cross-contract auth: in soroban-sdk 21.x the bridge must declare
        // an InvokerContractAuthEntry for every wrapper-token sub-invocation
        // ahead of time so that `wrapper-token.mint`'s `bridge.require_auth()`
        // call resolves against a host-verifiable auth tree. In 21.x the
        // entry is constructed as a struct literal (there is no
        // `InvokerContractAuthEntry::new` constructor at this SDK version);
        // the inner Vec<InvokerContractAuthEntry> is the recursive sub-tree
        // for nested calls — empty for the leaf mint call. The `fn_name`
        // field + arg list must EXACTLY match the `invoke_contract` call
        // below or the host errors at apply-time, so we build the args once
        // and reuse them.
        let mint_args: Vec<Val> = vec![
            &env,
            payload.recipient.clone().into_val(&env),
            payload.amount.into_val(&env),
        ];
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: wrapper_token.clone(),
                    fn_name: Symbol::new(&env, "mint"),
                    args: mint_args.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);
        env.invoke_contract::<()>(
            &wrapper_token,
            &Symbol::new(&env, "mint"),
            mint_args,
        );

        env.storage().persistent().set(&payload.nonce, &true);

        env.events().publish(
            (Symbol::new(&env, "bridge"), Symbol::new(&env, "MintRequested")),
            (
                wrapper_token.clone(),
                payload.recipient.clone(),
                payload.amount,
                payload.source_chain.to_string(),
                payload.source_token.clone(),
                payload.nonce.clone(),
            ),
        );
    }

    /// Unwrap (burn) entry point — called by a user wanting to redeem their
    /// wrapped tokens back to the source chain. Burns on Stellar, the relayer
    /// notices the `BurnRequested` event and submits the matching `Unlock`
    /// transaction on the source chain.
    pub fn burn_with_attestation(
        env: Env,
        relayer: Address,
        wrapper_token: Address,
        payload: UnlockPayload,
        attestations: Vec<(BytesN<32>, BytesN<64>)>,
    ) {
        relayer.require_auth();

        Self::verify_unlock(env.clone(), &payload, &attestations);
        assert!(
            !env.storage().persistent().has(&payload.nonce),
            "nonce reused"
        );

        // Mirror of `mint_with_attestation`: declare the exact auth entry
        // for the wrapper-token.burn sub-invocation before invoking it.
        let burn_args: Vec<Val> = vec![
            &env,
            payload.source_address.clone().into_val(&env),
            payload.amount.into_val(&env),
        ];
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: wrapper_token.clone(),
                    fn_name: Symbol::new(&env, "burn"),
                    args: burn_args.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);
        env.invoke_contract::<()>(
            &wrapper_token,
            &Symbol::new(&env, "burn"),
            burn_args,
        );

        env.storage().persistent().set(&payload.nonce, &true);

        env.events().publish(
            (Symbol::new(&env, "bridge"), Symbol::new(&env, "BurnRequested")),
            (
                wrapper_token.clone(),
                payload.source_address.clone(),
                payload.amount,
                payload.nonce.clone(),
            ),
        );
    }

    fn verify_lock(
        env: Env,
        payload: &LockPayload,
        attestations: &Vec<(BytesN<32>, BytesN<64>)>,
    ) {
        let operators: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::Operators)
            .expect("bridge not initialized");
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .expect("bridge not initialized");

        let digest = payload.digest(&env);
        verify_threshold(&env, &operators, threshold, &digest, attestations)
            .unwrap_or_else(|err| panic!("attestation rejected: {:?}", err));
    }

    fn verify_unlock(
        env: Env,
        payload: &UnlockPayload,
        attestations: &Vec<(BytesN<32>, BytesN<64>)>,
    ) {
        let operators: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::Operators)
            .expect("bridge not initialized");
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .expect("bridge not initialized");

        let digest = payload.digest(&env);
        verify_threshold(&env, &operators, threshold, &digest, attestations)
            .unwrap_or_else(|err| panic!("attestation rejected: {:?}", err));
    }
}
