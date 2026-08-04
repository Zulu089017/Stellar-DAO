# Security Policy

## Reporting a Vulnerability

The Stellar Payment Gateway team takes security seriously. We appreciate responsible disclosure of vulnerabilities.

**Please do not file public issues for security vulnerabilities.**

### Reporting Process

1. **Email**: Send details to `security@stellar-payment-gateway.dev`
2. **Encryption**: Use our [PGP key](#) if sending sensitive details (optional but recommended)
3. **Response**: We aim to acknowledge reports within 48 hours
4. **Triage**: We will confirm the vulnerability, assess severity, and develop a fix
5. **Disclosure**: After a fix is released, we coordinate public disclosure with the reporter

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions/components
- Potential impact
- Suggested fix (if available)

### Scope

| Component                                  | In Scope |
| ------------------------------------------ | :------: |
| Smart contracts (all 12 Soroban contracts) |    ✅    |
| API server (Fastify routes, middleware)    |    ✅    |
| Web application (Next.js)                  |    ✅    |
| SDK packages                               |    ✅    |
| Relayer service                            |    ✅    |
| CI/CD pipelines                            |    ✅    |
| Docker configurations                      |    ✅    |

### Out of Scope

- Issues in dependencies (report upstream)
- Theoretical vulnerabilities without proof of concept
- Social engineering attacks
- DOS attacks

## Supported Versions

See [SUPPORTED_VERSIONS.md](./SUPPORTED_VERSIONS.md).

## Security Model

The Stellar Payment Gateway employs a defense-in-depth approach:

| Layer               | Mechanism                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| **Transport**       | TLS 1.3, HSTS, CSP headers                                                    |
| **Authentication**  | JWT (HS256), API key hashing (SHA-256), RBAC                                  |
| **Authorization**   | Role-based access control (admin, operator, merchant, relayer)                |
| **Validation**      | Zod schemas on all inputs, address format validation                          |
| **Rate Limiting**   | Token-bucket per-IP and per-key                                               |
| **Smart Contracts** | `require_auth()` on all mutating operations, admin-gated config, max fee caps |
| **Secrets**         | Never logged, never in source; env vars only                                  |

## Audit History

| Date | Auditor | Scope | Report              |
| ---- | ------- | ----- | ------------------- |
| —    | —       | —     | Pending first audit |

## Bug Bounty

A formal bug bounty program is under development. In the interim, we offer public acknowledgment in release notes for responsibly disclosed vulnerabilities.
