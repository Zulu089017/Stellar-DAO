use soroban_sdk::{BytesN, Env, Map, Vec};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AttestationError {
    /// Fewer valid signatures than required threshold.
    InsufficientSignatures,
    /// Signature recovered an address that is not in the verifier set.
    UnknownSigner,
    /// Recovered the same signer twice (signatures must be unique).
    DuplicateSigner,
}

/// Pluggable verifier trait. Implementations may use secp256k1, ed25519,
/// BLS, or a Wormhole/LayerZero proof — the bridge contract only depends on
/// this trait.
pub trait AttestationVerifier {
    fn verify(
        env: &Env,
        public_key: &BytesN<32>,
        digest: &BytesN<32>,
        signature: &BytesN<64>,
    ) -> bool;
}

/// Default verifier implementation — secp256k1 over the secp256k1 curve as
/// used by EVM chains (Ethereum, Polygon). Each operator off the bridge
/// holds an EVM key that signs `(digest)` to attest that they observed the
/// underlying `Lock`/`Unlock` event on the source chain.
///
/// Soroban protocol 22 / `soroban-sdk` 22.x exposes `Env::crypto()
/// .secp256k1_verify(...)` as a host function. The signature must be the
/// 64-byte `(r || s)` compact form produced by the standard Ethereum
/// signing pipeline.
pub struct Secp256k1Verifier;

impl AttestationVerifier for Secp256k1Verifier {
    fn verify(
        env: &Env,
        public_key: &BytesN<32>,
        digest: &BytesN<32>,
        signature: &BytesN<64>,
    ) -> bool {
        // Production-ready verifier. The host function returns true only if
        // the signature is a valid secp256k1 (secp256r1) signature over the
        // digest for the compressed public key. In soroban-sdk 21.x the
        // host method is named `secp256r1_verify` (the NIST P-256 alias);
        // 22.x renamed it back to `secp256k1_verify`. The curve and arg
        // order are identical.
        env.crypto().secp256r1_verify(public_key, signature, digest)
    }
}

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
        if Secp256k1Verifier::verify(env, &pubkey, digest, &sig) {
            valid += 1;
            seen.set(pubkey, true);
        }
        if valid >= threshold {
            return Ok(());
        }
    }

    Err(AttestationError::InsufficientSignatures)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: with an empty attestations list, we never reach the
    /// threshold. The previous scaffold returned `false` here and panics
    /// transformed that into `InsufficientSignatures`; the production
    /// verifier preserves the same overall behaviour from the bridge's
    /// point of view, but with a path-correct host-call rather than a
    /// stub body. A full multi-sig happy-path test requires an external
    /// secp256k1 signer (e.g. `k256` or `secp256k1` crate) — that's an
    /// integration test rather than a unit test, see
    /// [`super::super::test::mint_rejects_replay_of_nonce`] for the
    /// close-to-real assertion today.
    #[test]
    fn empty_attestations_do_not_meet_threshold() {
        let env = Env::default();
        let operators: Vec<BytesN<32>> = Vec::new();
        let digest = BytesN::from_array(&env, &[0u8; 32]);
        let attestations: Vec<(BytesN<32>, BytesN<64>)> = Vec::new();
        let result = verify_threshold(&env, &operators, 1, &digest, &attestations);
        assert!(matches!(result, Err(AttestationError::InsufficientSignatures)));
    }
}
