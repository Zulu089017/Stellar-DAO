use soroban_sdk::{Bytes, BytesN, Env, Map, Vec};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AttestationError {
    /// Fewer valid signatures than required threshold.
    InsufficientSignatures,
    /// Signature recovered an address that is not in the verifier set.
    UnknownSigner,
    /// Recovered the same signer twice (signatures must be unique).
    DuplicateSigner,
}

/// Pluggable verifier trait. The default implementation uses ed25519
/// (Soroban-native `env.crypto().ed25519_verify()`), but the bridge
/// contract can accept a different verifier by swapping the concrete
/// type behind this trait.
pub trait AttestationVerifier {
    fn verify(
        env: &Env,
        public_key: &BytesN<32>,
        digest: &BytesN<32>,
        signature: &BytesN<64>,
    ) -> bool;
}

/// Default verifier implementation — ed25519 via Soroban's native host
/// function `env.crypto().ed25519_verify()`.
///
/// Each operator holds an ed25519 keypair. The relayer signs the
/// `(digest)` payload with its ed25519 secret key, and the bridge
/// verifies against the operator's public key stored on-chain.
///
/// Ed25519 is the standard signature scheme on Stellar and Soroban.
/// It maps cleanly to the existing `BytesN<32>` (public key) and
/// `BytesN<64>` (signature) types — no migration or format change
/// is required.
pub fn verify_attestation(
    env: &Env,
    public_key: &BytesN<32>,
    digest: &BytesN<32>,
    signature: &BytesN<64>,
) -> bool {
    Ed25519Verifier::verify(env, public_key, digest, signature)
}

pub struct Ed25519Verifier;

impl AttestationVerifier for Ed25519Verifier {
    fn verify(
        env: &Env,
        public_key: &BytesN<32>,
        digest: &BytesN<32>,
        signature: &BytesN<64>,
    ) -> bool {
        // ed25519_verify signature:
        //   fn ed25519_verify(
        //       &self,
        //       public_key: &BytesN<32>,
        //       message: &Bytes,
        //       signature: &BytesN<64>,
        //   ) -> Result<(), CryptoError>;
        //
        // The host function returns Ok(()) on success and Err on
        // invalid signature. We convert to a bool for the trait
        // interface — verification failures are handled by the caller
        // (verify_threshold counts only successful verifications).
        //
        // The digest (SHA-256 of the payload) is passed as the
        // message — ed25519 will internally hash again with SHA-512,
        // which is cryptographically sound (both signer and verifier
        // operate on the same 32-byte digest).
        let msg: Bytes = digest.clone().into();
        env.crypto()
            .ed25519_verify(public_key, &msg, signature)
            .is_ok()
    }
}

/// Verify that at least `threshold` attestations from distinct
/// operators in `operators` carry valid signatures over `digest`.
///
/// Each attestation is a `(public_key, signature)` pair. The
/// verifier checks:
///   1. No duplicate signers (each public key used at most once).
///   2. Every signer is a known operator.
///   3. Each signature cryptographically verifies against its
///      public key and the digest.
///
/// Returns `Ok(())` as soon as `threshold` valid signatures are
/// counted, or an error describing the failure.
pub fn verify_threshold(
    env: &Env,
    operators: &Vec<BytesN<32>>,
    threshold: u32,
    digest: &BytesN<32>,
    attestations: &Vec<(BytesN<32>, BytesN<64>)>,
) -> Result<(), AttestationError> {
    let mut seen: Map<BytesN<32>, bool> = Map::new(env);
    let mut valid = 0u32;

    for (pubkey, sig) in attestations.iter() {
        // soroban-sdk 21.x `Map::contains_key(K)` takes the key by value
        // (no `&K` overload until 22.x). `BytesN<32>: Clone`, so we hand
        // the map an owned copy.
        if seen.contains_key(pubkey.clone()) {
            return Err(AttestationError::DuplicateSigner);
        }
        if !operators.contains(&pubkey) {
            return Err(AttestationError::UnknownSigner);
        }
        if Ed25519Verifier::verify(env, &pubkey, digest, &sig) {
            valid += 1;
            seen.set(pubkey, true);
        }
        if valid >= threshold {
            return Ok(());
        }
    }

    Err(AttestationError::InsufficientSignatures)
}
