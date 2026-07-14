use soroban_sdk::{contracttype, Bytes, BytesN, Env, Symbol};

/// Top-level keys stored under `env.storage().instance()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    Operators,
    Threshold,
}

/// Inbound payload: a user locked `amount` of `source_token` on
/// `source_chain` and the relayer is asking the bridge to mint
/// `amount` of wrapper-token to `recipient`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LockPayload {
    pub source_chain: Symbol,
    pub source_token: Bytes,
    pub wrapper_token: BytesN<32>, // contract id as raw hash
    pub recipient: soroban_sdk::Address,
    pub amount: i128,
    pub nonce: BytesN<32>,
}

impl LockPayload {
    /// Domain-separated digest that the verifier signs. Tag the digest with
    /// `STELLARDAO_LOCK_V1` so signatures cannot be re-used across message types.
    ///
    /// Field encoding matches `packages/sdk/src/attestation.ts::buildLockDigest`
    /// byte-for-byte: the relayer produces the same bytes by encoding each
    /// field as its raw UTF-8 / hex form. Using `to_string()` here deliberately
    /// avoids SCVal wire-format framing so the on-chain digest equals the
    /// off-chain digest without the relayer needing a Soroban SDK.
    pub fn digest(&self, env: &Env) -> BytesN<32> {
        let tag: &[u8] = b"STELLARDAO_LOCK_V1";
        let mut buf = Bytes::new(env);
        buf.extend_from_slice(tag);
        buf.extend_from_slice(self.source_chain.to_string().as_bytes());
        buf.extend_from_slice(self.source_token.as_slice());
        buf.extend_from_slice(self.wrapper_token.as_slice());
        buf.extend_from_slice(self.recipient.to_string().as_bytes());
        buf.extend_from_slice(&self.amount.to_be_bytes());
        buf.extend_from_slice(self.nonce.as_slice());
        env.crypto().sha256(&buf).into()
    }
}

/// Outbound payload: a user burned `amount` of wrapper-token and the relayer
/// is asking the bridge to release `amount` of `source_token` to
/// `source_address` on `source_chain`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnlockPayload {
    pub source_chain: Symbol,
    pub wrapper_token: BytesN<32>,
    pub source_address: Bytes,
    pub amount: i128,
    pub nonce: BytesN<32>,
}

impl UnlockPayload {
    /// Matches `packages/sdk/src/attestation.ts::buildUnlockDigest` byte-for-byte.
    pub fn digest(&self, env: &Env) -> BytesN<32> {
        let tag: &[u8] = b"STELLARDAO_UNLOCK_V1";
        let mut buf = Bytes::new(env);
        buf.extend_from_slice(tag);
        buf.extend_from_slice(self.source_chain.to_string().as_bytes());
        buf.extend_from_slice(self.wrapper_token.as_slice());
        buf.extend_from_slice(self.source_address.as_slice());
        buf.extend_from_slice(&self.amount.to_be_bytes());
        buf.extend_from_slice(self.nonce.as_slice());
        env.crypto().sha256(&buf).into()
    }
}
