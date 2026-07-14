use soroban_sdk::{contracttype, Address, Bytes};

/// Composite key for the SEP-41 allowance + expiry pair. We can't use a
/// raw `(Address, Address, DataKey::AllowanceExpiry)` 3-tuple as a
/// persistent-storage map key in soroban-sdk 21.x — the host rejects
/// mixed enum/tuple nesting inside Map keys. Wrapping the pair in a
/// `#[contracttype]` struct (and putting it inside a `DataKey` variant)
/// gives the host a single, statically-known SCVal layout to key on.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowanceKey {
    pub owner: Address,
    pub spender: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Bridge,
    Name,
    Symbol,
    Decimals,
    TotalSupply,
    /// Holds the `expiration_ledger` for an `(owner, spender)` allowance.
    /// The amount itself still lives in the 2-tuple `(owner, spender)` key
    /// to keep the hot path (`transfer_from` reading the allowance value)
    /// identical to the SEP-41 reference contract.
    AllowanceExpiry(AllowanceKey),
}

/// Convenience: balance key is just the address — Soroban uses
/// `Env::storage().persistent().set(&address, ...)` directly.
pub fn balance_key(addr: &Address) -> Address {
    addr.clone()
}

/// Convenience alias to disambiguate the SEP-41 `decimals()` return type.
pub type Decimals = u32;

/// Convenience alias for the metadata blob.
pub type MetadataBytes = Bytes;
