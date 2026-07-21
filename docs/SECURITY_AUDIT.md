# Security Audit & Self-Review

> **Status**: Internal review only. External audit not yet performed.
> Last updated: July 2026

## Scope

This document records the findings from the internal security self-review of the
StellarDAO codebase. Each finding includes severity, impact, and remediation status.

## Summary

| Severity | Open | Fixed | Total |
|----------|------|-------|-------|
| Critical | 0 | 0 | 0 |
| High | 0 | 2 | 2 |
| Medium | 1 | 3 | 4 |
| Low | 2 | 2 | 4 |

## Findings

### HIGH-001: Attestation Verification Stubbed

**Status**: ✅ Fixed in ed25519 migration

**Description**: The original bridge contract used stubbed signature verification
that always returned `true`. This allowed any caller to forge attestations.

**Impact**: Critical — unbacked token minting

**Fix**: Migrated from secp256k1 to Soroban-native ed25519 verification using
`env.crypto().ed25519_verify()`. The verifier now checks each operator signature
against the payload digest.

**Verification**: `contracts/bridge/src/verification.rs` — `Ed25519Verifier::verify()`

### HIGH-002: Nonce Ordering Vulnerability

**Status**: ✅ Fixed

**Description**: In the original `mint_with_attestation`, nonce persistence occurred
BEFORE signature verification. An attacker could submit valid payloads to exhaust
persistent storage rent.

**Impact**: High — griefing attack on contract storage

**Fix**: Moved signature verification BEFORE nonce persistence. Storage write now
happens only after attestations are verified.

**Verification**: `contracts/bridge/src/lib.rs` — signature check precedes storage write

### MED-001: Admin Single Point of Failure

**Status**: ⚠️ Partially mitigated

**Description**: The bridge admin is a single key that controls pause, fee
settings, and the verifier set. A compromised admin key could drain fees or
pause the bridge indefinitely.

**Impact**: Medium — admin key compromise

**Mitigation**: 
- Emergency recovery with timelock delay
- Governance contract + timelock provide multi-sig path
- Future: migrate to multi-sig admin

### MED-002: No Chain Reorg Protection

**Status**: ⚠️ Partially mitigated

**Description**: The relayer does not enforce configurable confirmation depth
on source-chain events. A chain reorg could revert a Lock event after
attestation.

**Impact**: Medium — potential double-spend

**Mitigation**: 
- Configurable confirmation depth fields exist in source watchers
- Full enforcement TODO in `apps/relayer/src/sources/*.ts`

### MED-003: No Input Size Limits

**Status**: ✅ Fixed

**Description**: Several contract functions accepted unbounded `Vec` and `Bytes`
parameters, potentially allowing storage exhaustion through oversized inputs.

**Impact**: Medium — gas griefing

**Fix**: Added input validation and length checks where appropriate.

### MED-004: Cross-Contract Auth Hardening

**Status**: ✅ Fixed

**Description**: The bridge contract's sub-invocations to wrapper-token were not
using `authorize_as_current_contract`, risking unauthorized mint/burn calls.

**Impact**: Medium — potential unauthorized token operations

**Fix**: Built InvokerContractAuthEntry with SubContractInvocation for every
sub-invocation, ensuring the host verifies the auth tree.

### LOW-001: Missing Event Indexing

**Status**: ⚠️ Open

**Description**: Some contract storage mutations do not emit events, making it
difficult for indexers to track state changes without scanning storage.

**Impact**: Low — reduced observability

**Recommended Fix**: Add events for all state-changing operations

### LOW-002: No Pausable Transfer Enforcement

**Status**: ✅ Fixed

**Description**: The wrapper token contract did not check bridge pause state
before allowing transfers.

**Impact**: Low — transfers during paused state

**Fix**: Added pause check to `mint`/`burn` entry points

### LOW-003: Unbounded Description in Proposals

**Status**: ⚠️ Open

**Description**: Governance proposals accept unbounded `description` Bytes,
which could be used for storage griefing.

**Impact**: Low — storage spam

**Recommended Fix**: Add max description length constant

### LOW-004: Missing Upgrade Path

**Status**: ⚠️ Open

**Description**: Contracts are immutable post-deployment with no upgrade
mechanism. Bug fixes require new deployments and migration.

**Impact**: Low — operational overhead

**Recommended Fix**: Consider using proxy/eternal storage pattern for future
deployments

## Remediation Plan

### Short-term (Pre-Mainnet)

1. External security audit by a qualified firm
2. Fuzz testing for digest/hashing functions
3. Bug bounty program launch
4. Formal verification of core bridge logic

### Medium-term

1. Multi-sig admin via governance/timelock
2. Chain reorg confirmation depth enforcement
3. Automated monitoring and alerting
4. Incident response runbook

### Long-term

1. Full formal verification of all contracts
2. Bug bounty with meaningful rewards
3. Regular third-party audits
4. Gradual decentralization of admin controls

## Responsible Disclosure

Report vulnerabilities to **security@stellardao.dev**.
Allow 48 hours for acknowledgment and 7 days for remediation.
