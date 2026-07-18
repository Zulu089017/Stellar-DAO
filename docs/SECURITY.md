# Security Audit Checklist & Threat Model

StellarDAO security documentation for auditors and developers.

## Threat Model

### Assets
- **Wrapped tokens**: ERC-20/SPL tokens custodied in source-chain vaults
- **Wrapper tokens**: Minted on Stellar, redeemable 1:1 for source assets
- **Attestation keys**: Relayer operator private keys (secp256k1/ed25519)
- **Bridge admin key**: Controls verifier set, fees, and pause mechanism

### Threat Actors
| Actor | Capability | Motivation |
|-------|-----------|------------|
| Malicious relayer | Submits forged attestations | Mint unbacked tokens |
| Compromised admin | Rotates verifier set, changes fees | Theft of protocol fees |
| Front-running bot | Observes mempool | Extract MEV from wraps |
| Chain reorg attacker | Reorgs source chain | Double-spend locked tokens |

### Attack Vectors

#### 1. Signature Forgery (CRITICAL)
- **Vector**: Attacker forges secp256k1 attestation signatures
- **Mitigation**: `verify_threshold` requires N-of-M operator signatures
- **Current status**: Signature verification is stubbed (`false` return) until 65-byte migration. **DO NOT DEPLOY TO MAINNET** until resolved.
- **Fix**: Migrate to 65-byte `r||s||v` signatures per `contracts/bridge/src/verification.rs`

#### 2. Nonce Replay (HIGH)
- **Vector**: Attacker replays a previously accepted `(nonce, payload)` bundle
- **Mitigation**: Bridge stores consumed nonces in persistent storage, rejects replays
- **Status**: ✅ Implemented — `mint_with_attestation` and `burn_with_attestation` check `env.storage().persistent().has(&payload.nonce)`

#### 3. Admin Key Compromise (HIGH)
- **Vector**: Attacker gains the admin secret key
- **Mitigation**: 
  - Timelock controller delays admin actions
  - Multi-sig verifier set requires N-of-M for operations
  - Pause mechanism provides emergency stop
- **Status**: ⚠️ Partial — admin is single-key at initialize; governance contract + timelock provide delayed execution path

#### 4. Front-running (MEDIUM)
- **Vector**: Attacker observes a pending wrap and front-runs the mint
- **Mitigation**: Nonce-based deduplication; deterministic wrapper-token addresses
- **Status**: ✅ Mitigated — nonce + deterministic deployment prevents front-running

#### 5. Chain Reorg (MEDIUM)
- **Vector**: Source chain reorg reverts a Lock event after attestation
- **Mitigation**: Configurable confirmation depth on source-chain watchers
- **Status**: ⚠️ Partial — TODO in `apps/relayer/src/sources/*.ts`; confirmations not yet enforced

## Audit Checklist

### Smart Contracts
- [ ] Verify `initialize` is one-shot (no re-initialization)
- [ ] Verify `mint`/`burn` only callable by bridge
- [ ] Verify nonce replay protection
- [ ] Verify signature threshold enforcement
- [ ] Verify pause/unpause only callable by admin
- [ ] Verify fee calculation correctness
- [ ] Verify deterministic wrapper-token deployment
- [ ] Fuzz `LockPayload::digest()` and `UnlockPayload::digest()` for collisions
- [ ] Check integer overflow in fee calculation
- [ ] Check cross-contract auth tree correctness

### Relayer
- [ ] Verify attestation signature format matches bridge expectations
- [ ] Verify source-chain event parsing for each chain
- [ ] Verify reconnection/backoff behavior
- [ ] Verify nonce uniqueness across parallel workers
- [ ] Verify signing key storage (ensure keys are never in plaintext logs)

### API
- [ ] Verify HMAC-SHA256 webhook signature verification
- [ ] Verify API key authentication on protected routes
- [ ] Verify rate limiting effectiveness
- [ ] Verify SSE event isolation between channels
- [ ] Check SQL injection vectors in repository queries
- [ ] Check input validation on all `POST` endpoints

### Web
- [ ] Verify wallet integration (Freighter/Albedo) signature handling
- [ ] Verify no secret keys in client-side code
- [ ] Verify CSP headers from Helmet
- [ ] Verify CORS configuration
- [ ] Check XSS vectors in user-provided content rendering

## Deployment Checklist
- [ ] Contract WASM hashes verified on stellar.expert
- [ ] Bridge initialized with production operator set
- [ ] Factory initialized with template hash
- [ ] Timelock delay configured (minimum 24h for mainnet)
- [ ] API keys generated and distributed to integrators
- [ ] HMAC webhook secret configured
- [ ] Rate limits tuned for expected traffic
- [ ] Monitoring alerts configured for pause events
- [ ] Incident response runbook documented

## Responsible Disclosure
Security vulnerabilities should be reported to:
**security@stellardao.dev**

Please allow 48 hours for acknowledgment and 7 days for remediation before public disclosure.
