# Frequently Asked Questions

## General

### What is StellarDAO?

StellarDAO is a cross-chain wrapping middleware for the Stellar ecosystem. It lets developers create wrapped versions of their Ethereum (ERC-20), Solana (SPL), and Polygon tokens on Stellar, leveraging Stellar's ultra-low fees and fast settlement.

### How does the wrapping work?

1. A user locks tokens in a source-chain vault
2. The relayer detects the `Lock` event and produces a signed attestation
3. The attestation is posted to the Soroban bridge contract
4. The bridge verifies the signatures and mints a wrapper token on Stellar

### Is StellarDAO production-ready?

StellarDAO is a scaffold designed for testnet use and hackathons. While the core architecture is sound, several components need hardening before mainnet deployment (see [Security Considerations](docs/SECURITY.md)).

**Do not commit real funds** until a full security audit has been completed.

---

## Smart Contracts

### What contract standards do you use?

- **Wrapper tokens**: SEP-41 (Stellar Asset Contract-level tokens)
- **Governance token**: SEP-41 with Compound-style delegation and checkpointing
- **Factory**: Deterministic contract deployment

### How are operator signatures verified?

The bridge uses ed25519 signature verification via Soroban's `env.crypto()` host function. The verifier set consists of N-of-M operators, where M is the total number of operators and N is the threshold required for attestation acceptance.

### What prevents replay attacks?

Every mint/burn payload includes a unique `nonce`. Once accepted, the nonce is stored in the bridge's persistent storage. Any attempt to reuse the same nonce is rejected.

### Can the bridge be paused?

Yes. The admin can pause all mint/burn operations in an emergency. The pause state is stored on-chain and checked before every operation.

---

## Frontend

### What wallets are supported?

- **Freighter** (browser extension)
- **Albedo** (web wallet)

The connector auto-detects available wallets and prefers Freighter when both are installed. A mock wallet is available for development.

### Do I need a wallet to view the dashboard?

No. The dashboard is readable without a wallet connection. You only need a wallet for writing operations (wrap, unwrap, vote).

### Why is my transaction stuck on "pending"?

Transactions go through multiple stages:
1. `pending` — Lock detected on source chain
2. `attesting` — Operators signing the digest
3. `minting` — Bridge mints on Stellar
4. `completed` — Tokens in your wallet

If a transaction stays in a stage for too long, check the [transactions page](/transactions) for details or contact support.

---

## API

### How do I authenticate?

Protected endpoints require an API key passed as `Authorization: Bearer <api-key>`. Configure keys via the `API_KEYS` environment variable.

### What are the rate limits?

Default: 100 requests per minute per IP. The `Retry-After` header is sent on 429 responses.

### What is the SSE endpoint?

Server-Sent Events are available at `/events`. The stream broadcasts:
- `transaction-update` — Transaction status changes
- `contract-event` — Soroban contract events
- `governance-event` — Governance proposal/vote updates

---

## Development

### How do I set up the project locally?

```bash
make setup
```

Or manually:
```bash
pnpm install
pnpm contracts:build
pnpm bindings:generate
```

### How do I run tests?

```bash
make test          # All tests
make test-api      # API tests only
make test-web      # Web tests only
```

### How do I add a new contract?

1. Create a directory under `contracts/<name>/`
2. Add `Cargo.toml` with `soroban-sdk = "=21.7.7"`
3. Add to workspace members in `contracts/Cargo.toml`
4. Implement `#[contract]` with `#[contractimpl]`
5. Add README documenting the interface
6. Add tests

### Can I contribute?

Yes! See [CONTRIBUTING.md](CONTRIBUTING.md) for our contribution guide. We welcome PRs for features, bug fixes, and documentation improvements.

---

## Security

### Has the code been audited?

The codebase has undergone internal review but has not been audited by an external firm. See [SECURITY.md](SECURITY.md) for the threat model and audit checklist.

### How do I report a vulnerability?

Email **security@stellardao.dev**. Please allow 48 hours for acknowledgment and 7 days for remediation before public disclosure.

### What is the emergency recovery process?

The bridge admin can initiate emergency recovery with a timelock delay. After the delay expires, the emergency admin can execute a withdrawal. This prevents a compromised single key from immediately draining funds.

---

## Troubleshooting

### "bridge not initialized" error

This means the bridge contract hasn't been initialized yet. Run the initialization transaction with the admin account.

### CORS errors from the API

In development, CORS is configured to allow all origins. In production, set `NODE_ENV=production` to restrict origins.

### WebSocket/SSE connection drops

SSE connections automatically retry. If drops persist, check:
- Network connectivity
- Proxy/firewall settings
- API server availability via `/health`

### Contract deployment fails

Ensure:
- The deployer account has sufficient XLM
- The Stellar CLI is installed and in PATH
- Network RPC endpoints are reachable
- Contract WASM files exist in the build output
