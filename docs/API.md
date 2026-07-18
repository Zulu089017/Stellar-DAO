# StellarDAO API Reference

Base URL: `http://localhost:4000`

## Authentication

Protected endpoints (`/bridge/*`, `/webhooks/*`) require an API key passed
as `Authorization: Bearer <api-key>`. Configure keys via the `API_KEYS`
environment variable (comma-separated).

## Rate Limiting

Default: 100 requests per minute per IP. The `Retry-After` header is sent on
429 responses.

## Endpoints

### Health

```
GET /health
```
Returns `{ "status": "ok", "timestamp": "..." }`.

### Assets

```
GET /assets
```
List registered wrapped assets. Query params: `sourceChain`, `limit`, `cursor`.

```
GET /assets/:chain/:address
```
Get a specific asset by source chain and token address.

```
POST /assets
```
Register a new asset wrapper (pre-stage). Body:
```json
{
  "sourceChain": "ethereum",
  "sourceToken": "0x...",
  "name": "Wrapped Token",
  "symbol": "wTKN",
  "decimals": 18
}
```

### Bridge

```
POST /bridge/wrap
```
Initiate a wrap transaction. Body:
```json
{
  "sourceChain": "ethereum",
  "sourceToken": "0x...",
  "wrapperToken": "C...",
  "recipient": "G...",
  "amount": "1000000000000000000"
}
```

```
POST /bridge/mint
POST /bridge/burn
```
Direct mint/burn operations with attestations. **Requires API key.**

### Transactions

```
GET /transactions
```
List recent transactions. Query params: `status`, `type`, `limit`, `cursor`.

```
GET /transactions/:id
```
Get a specific transaction by ID.

### Governance

```
GET /governance/stats
```
Get aggregate governance statistics (proposal count, quorum, threshold).

```
GET /governance/proposals
```
List proposals. Query params: `status`, `limit`, `cursor`.

```
GET /governance/proposals/:id
```
Get proposal details.

```
POST /governance/proposals/:id/vote
```
Cast a vote. Body:
```json
{
  "voter": "G...",
  "voteType": "for"
}
```

```
GET /governance/delegates/:address
```
Get delegation info for an address.

### Analytics

```
GET /analytics
```
Protocol analytics — TVL, volume, transactions by chain.

```
GET /health/deep
```
Deep health check including relayer and contract connectivity status.

### Webhooks

```
POST /webhooks/factory/confirm
```
Confirm a factory deployment. Requires HMAC signature via
`X-Stellar-DAO-Signature` header when `RELAYER_HMAC_SECRET` is configured.

### SSE (Server-Sent Events)

```
GET /events
```
Real-time event stream: transaction updates, asset registrations, bridge events.

```
GET /events/governance
```
Governance event stream: proposal creation, votes, execution.

## Error Response Format

All errors follow this format:
```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

HTTP status codes:
- `400` — Bad request / validation failed
- `401` — Unauthorized (missing/invalid API key or HMAC)
- `404` — Not found
- `413` — Payload too large
- `429` — Rate limited
