use soroban_sdk::{contracttype, Bytes, BytesN, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    Template,
    Bridge,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceTokenKey {
    // `soroban_sdk::String` rather than `Symbol` because `Symbol::to_string()`
    // is only compiled for non-WASM targets in soroban-sdk 21.7.7 — the WASM
    // build of the factory contract would fail otherwise. `String` also lets
    // the off-chain encoder in `apps/sdk/src/contracts/factory.ts` use a
    // straightforward JS `.toString()` without worrying about the Symbol
    // 32-character / limited-alphabet constraints.
    pub source_chain: String,
    pub source_token: Bytes,
}

// Re-export BytesN for convenience in tests.
pub type ContractId = BytesN<32>;
