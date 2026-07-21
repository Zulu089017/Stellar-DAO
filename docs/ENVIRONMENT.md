# Environment Setup

## Variables Reference

### Network Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `STELLAR_NETWORK` | Yes | `TESTNET` | Stellar network identifier |
| `STELLAR_NETWORK_PASSPHRASE` | Yes | `Test SDF Network ; September 2015` | Network passphrase for transaction signing |

### RPC Endpoints

| Variable | Required | Description |
|----------|----------|-------------|
| `HORIZON_URL` | Yes | Stellar Horizon API endpoint |
| `SOROBAN_RPC_URL` | Yes | Soroban RPC endpoint for contract interaction |
| `ETHEREUM_RPC_URL` | Yes | Ethereum RPC endpoint (source chain) |
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint (source chain) |
| `POLYGON_RPC_URL` | Yes | Polygon RPC endpoint (source chain) |

### Contract IDs

| Variable | Required | Description |
|----------|----------|-------------|
| `BRIDGE_CONTRACT_ID` | No | Deployed bridge contract address (starts with 'C') |
| `FACTORY_CONTRACT_ID` | No | Deployed factory contract address |
| `GOVERNANCE_CONTRACT_ID` | No | Deployed governance contract address |
| `GOVERNANCE_TOKEN_ID` | No | Deployed governance token address |
| `TIMELOCK_CONTRACT_ID` | No | Deployed timelock controller address |

### Relayer Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `RELAYER_SECRET_KEY` | No | Stellar S-address secret key for signing attestations |
| `RELAYER_PUBLIC_KEY` | No | Public key for verifier registration |
| `RELAYER_THRESHOLD` | No | Number of attestations required (default: 2) |

### API Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `API_PORT` | No | Fastify server port (default: 4000) |
| `API_KEYS` | Yes | Comma-separated API keys for Bearer auth |
| `RELAYER_HMAC_SECRET` | No | HMAC-SHA256 secret for webhook verification |

### Database Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | PostgreSQL connection string. If unset, uses in-memory storage |

### Web (Next.js)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_HORIZON_URL` | No | Horizon URL exposed to browser |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | No | Soroban RPC URL exposed to browser |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | No | Network passphrase exposed to browser |
| `NEXT_PUBLIC_API_BASE_URL` | No | API base URL for browser requests |
| `NEXT_PUBLIC_BRIDGE_CONTRACT_ID` | No | Bridge contract ID for browser interactions |
| `NEXT_PUBLIC_DEMO_MODE` | No | Enable demo mode (no backend required) |

### Logging

| Variable | Required | Description |
|----------|----------|-------------|
| `LOG_LEVEL` | No | Log level (`trace`, `debug`, `info`, `warn`, `error`. Default: `info`) |

## Environment Files

### Development (.env)

```bash
cp .env.example .env
# Edit .env with your values
```

### CI (.env.ci)

Automatically configured in `.github/workflows/ci.yml` with test defaults.

### Production

Use a secrets manager (Vault, Doppler, GitHub Secrets) to inject environment variables at deploy time. Never commit secrets to the repository.

## Validation

The `@stellardao/shared` package includes an env parser that validates required variables at startup:

```typescript
import { parseEnv } from '@stellardao/shared';

const env = parseEnv.api();
console.log(env.SOROBAN_RPC_URL); // typed access
```

If a required variable is missing, the application will log a descriptive error and exit.

## Per-Service Variables

### API (`apps/api`)

Uses: `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL`, `DATABASE_URL`, `API_PORT`, `API_KEYS`, `RELAYER_HMAC_SECRET`

### Web (`apps/web`)

Uses: `NEXT_PUBLIC_*` variables. These are inlined at build time, so restart the Next.js dev server after changing them.

### Relayer (`apps/relayer`)

Uses: `HORIZON_URL`, `ETHEREUM_RPC_URL`, `SOLANA_RPC_URL`, `POLYGON_RPC_URL`, `RELAYER_SECRET_KEY`, `RELAYER_THRESHOLD`

## Troubleshooting

### "Missing required environment variable"

Check that all required variables are set in your `.env` file. See the table above for which variables each service requires.

### "Invalid STELLAR_NETWORK value"

Must be one of: `PUBLIC`, `TESTNET`, `FUTURENET`. Check for typos.

### "API_KEY not configured"

Set `API_KEYS` with comma-separated values. This is required for protected routes.
