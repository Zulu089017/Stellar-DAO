# Backend Quality Criteria

This document defines the quality gates for the StellarDAO backend services
(`apps/api`, `apps/relayer`). These criteria align with production readiness
standards and grant platform expectations.

## Service Inventory

| Service | Framework | Port | Purpose |
|---------|-----------|------|---------|
| API | Fastify v5 | 4000 | REST + SSE API over Horizon |
| Relayer | Node.js | — | Cross-chain event watcher + attestation signer |

## Quality Gates

### 1. Type Safety (NON-NEGOTIABLE)
- [ ] Zero TypeScript errors under `strict: true`
- [ ] All API inputs validated with Zod schemas before processing
- [ ] All API responses typed (no `unknown` or `any` in response bodies)
- [ ] Environment variables parsed and validated via `@stellardao/shared/env`

### 2. API Design
- [ ] RESTful endpoint naming: `GET /resource`, `POST /resource`, `GET /resource/:id`
- [ ] Consistent error format: `{ error: string, message: string, details?: unknown }`
- [ ] Proper HTTP status codes (200, 201, 202, 400, 404, 500)
- [ ] Pagination via cursor or offset for list endpoints
- [ ] Rate limiting on all public endpoints (configurable tokens per window)

### 3. Security (NON-NEGOTIABLE)
- [ ] API key authentication on protected routes (`x-api-key` header)
- [ ] HMAC-SHA256 signature verification on webhook endpoints
- [ ] Input sanitization middleware (SQL injection, XSS prevention)
- [ ] Helmet headers (CSP, X-Frame-Options, HSTS, etc.)
- [ ] CORS configured for production origins only
- [ ] Rate limiting with configurable windows and limits
- [ ] No secrets in logs, error messages, or response bodies

### 4. Database
- [ ] Drizzle ORM with PostgreSQL (production) / in-memory (test/CI)
- [ ] Repository pattern for data access (testable with mocks)
- [ ] Migrations tracked in version control
- [ ] Connection pooling configured for expected load
- [ ] Query timeouts on all database operations

### 5. Event Streaming
- [ ] SSE endpoints with proper `text/event-stream` content type
- [ ] Client connection tracking with keepalive pings (30s interval)
- [ ] Automatic reconnection support (EventSource `retry` field)
- [ ] Channel isolation: transaction events never leak into asset channels

### 6. Relayer
- [ ] Source-chain watchers for Ethereum, Solana, Polygon
- [ ] Configurable confirmation depth per chain
- [ ] Exponential backoff with jitter on reconnection
- [ ] Nonce uniqueness guaranteed across parallel workers
- [ ] Signing key stored securely (env var or secrets manager, never in code)

### 7. Testing
- [ ] Unit tests for all repository methods (100% coverage)
- [ ] Integration tests for all API routes (200+ status, 400+ validation, 404)
- [ ] SSE integration tests with mock stream + bus broadcasts
- [ ] Relayer pipeline tests with mock source-chain events
- [ ] HMAC webhook signature verification tests
- [ ] Rate limiting behavior tests

### 8. Observability
- [ ] Structured logging via Pino (JSON format in production)
- [ ] Health check endpoint: `GET /health/` → `{ status, network, horizon, contracts }`
- [ ] Request ID tracing through middleware chain
- [ ] Error tracking with stack traces in development only
- [ ] Performance metrics (request duration, DB query time, SSE client count)

### 9. Deployment
- [ ] Docker container for each service
- [ ] Environment-based configuration (no hardcoded values)
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Readiness probe endpoint

## API Endpoint Coverage

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `/health/` | GET | None | ✅ Live |
| `/assets/` | GET | None | ✅ Live |
| `/assets/` | POST | API Key | ✅ Live |
| `/assets/:chain/:address` | GET | None | ✅ Live |
| `/transactions/` | GET | None | ✅ Live |
| `/transactions/:id` | GET | None | ✅ Live |
| `/bridge/wrap` | POST | None | ✅ Live |
| `/bridge/mint` | POST | API Key | ✅ Live |
| `/bridge/burn` | POST | API Key | ✅ Live |
| `/webhooks/factory/confirm` | POST | HMAC | ✅ Live |
| `/governance/stats` | GET | None | ✅ Live |
| `/governance/proposals` | GET | None | ✅ Live |
| `/governance/proposals/:id` | GET | None | ✅ Live |
| `/governance/proposals/:id/vote` | POST | None | ✅ Live |
| `/governance/delegates/:address` | GET | None | ✅ Live |
| `/analytics/tvl` | GET | None | ✅ Live |
| `/analytics/volume` | GET | None | ✅ Live |
| `/events` | GET (SSE) | None | ✅ Live |
| `/events/governance` | GET (SSE) | None | ✅ Live |

## Grant Platform Readiness

### GrantFox (Stellar/Soroban) Criteria
- [ ] Open-source with MIT license
- [ ] Public Stellar testnet deployment for live review
- [ ] Documented API endpoints with request/response examples
- [ ] Well-scoped GitHub issues for contributor bounties
- [ ] CI/CD pipeline with automated testing (GitHub Actions)

### Drips Wave Criteria
- [ ] Clear repository structure with documented architecture
- [ ] Contribution guidelines for new developers
- [ ] Issue templates with complexity labels
- [ ] PR template with required checks
