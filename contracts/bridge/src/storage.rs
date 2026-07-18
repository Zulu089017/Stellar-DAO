use soroban_sdk::{contracttype, Bytes, BytesN, Env, String};

/// Top-level keys stored under `env.storage().instance()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Initialized,
    Admin,
    Operators,
    Threshold,
    Paused,
    FeeBps,
    FeeCollector,
    EmergencyAdmin,
    EmergencyTimelock,
}

/// Inbound payload: a user locked `amount` of `source_token` on
/// `source_chain` and the relayer is asking the bridge to mint
/// `amount` of wrapper-token to `recipient`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LockPayload {
    // `soroban_sdk::String` rather than `Symbol` for the same reason as
    // `SourceTokenKey::source_chain` in the factory — `Symbol::to_string()`
    // is stripped from the WASM build of soroban-sdk 21.7.7 and the digest
    // function needs to extract raw bytes on both host and WASM targets.
    pub source_chain: String,
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
        // `source_chain` is `soroban_sdk::String` (see the field type change
        // above). `copy_into_slice` is the only way in 21.7.7 to get raw bytes
        // from a host-managed `String` on both host AND WASM targets —
        // `iter()` / `get(i)` are not exposed, and `to_string()` here would
        // hit the `Display`-not-implemented cliff. The resulting bytes are
        // identical to what the off-chain
        // `apps/sdk/src/contracts/bridge.ts` digest encoder produces from
        // `chain.toString()`.
        let mut chain_bytes = [0u8; 128];
        let chain_len = self.source_chain.len() as usize;
        if chain_len > chain_bytes.len() {
            panic!("source_chain exceeds 128-byte digest buffer");
        }
        self.source_chain
            .copy_into_slice(&mut chain_bytes[..chain_len]);
        buf.extend_from_slice(&chain_bytes[..chain_len]);
        // `soroban_sdk::Bytes::append(&Bytes)` exists in 21.x and copies the
        // host-managed bytes into our buffer without an intermediate `&[u8]`
        // round-trip. The previous `as_slice()` method was removed when the
        // type moved to a fully host-allocated representation.
        buf.append(&self.source_token);
        // `BytesN<N>::to_array()` returns `[u8; N]`, which deref-coerces to
        // `&[u8]` for the `extend_from_slice` host call. `as_slice()` is no
        // longer exposed on `BytesN` in 21.x.
        buf.extend_from_slice(&self.wrapper_token.to_array());
        // `Address::to_string()` is the inherent method on
        // `soroban_sdk::Address` and returns a `soroban_sdk::String` (a
        // host-managed byte string). `soroban_sdk::Address: !Display` in
        // 21.x, so the `ToString` trait method isn't available — we can't
        // call `.to_string().as_bytes()` on it. `soroban_sdk::String` also
        // has no `.iter()` or `.get(i)` accessor in 21.x; the only way to
        // extract raw bytes is `copy_into_slice(&mut [u8])`. We allocate a
        // `Vec<u8>` of the right length, copy the host bytes into it, and
        // feed it to `extend_from_slice` which deref-coerces `&[u8]`. The
        // resulting on-chain bytes are identical to the inherent
        // `to_string()`'s payload, so the off-chain
        // `apps/sdk/src/contracts/bridge.ts` digest encoder can keep
        // using `address.toString()` from the JS Stellar SDK.
        let recipient = self.recipient.to_string();
        let mut recipient_bytes = [0u8; 128];
        let recipient_len = recipient.len() as usize;
        if recipient_len > recipient_bytes.len() {
            panic!("recipient address string exceeds 128-byte digest buffer");
        }
        recipient.copy_into_slice(&mut recipient_bytes[..recipient_len]);
        buf.extend_from_slice(&recipient_bytes[..recipient_len]);
        buf.extend_from_slice(&self.amount.to_be_bytes());
        buf.extend_from_slice(&self.nonce.to_array());
        env.crypto().sha256(&buf).into()
    }
}

/// Outbound payload: a user burned `amount` of wrapper-token and the relayer
/// is asking the bridge to release `amount` of `source_token` to
/// `source_address` on `source_chain`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnlockPayload {
    // `soroban_sdk::String` for the same WASM-compat reason as
    // `LockPayload::source_chain` — see that field's doc comment.
    pub source_chain: String,
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
        let mut chain_bytes = [0u8; 128];
        let chain_len = self.source_chain.len() as usize;
        if chain_len > chain_bytes.len() {
            panic!("source_chain exceeds 128-byte digest buffer");
        }
        self.source_chain
            .copy_into_slice(&mut chain_bytes[..chain_len]);
        buf.extend_from_slice(&chain_bytes[..chain_len]);
        buf.extend_from_slice(&self.wrapper_token.to_array());
        buf.append(&self.source_address);
        buf.extend_from_slice(&self.amount.to_be_bytes());
        buf.extend_from_slice(&self.nonce.to_array());
        env.crypto().sha256(&buf).into()
    }
}
