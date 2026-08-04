import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * JWT payload shape.
 *
 * `sub` — subject (Stellar public key or account id).
 * `roles` — RBAC roles from the Role Manager contract.
 * `iat` — issued-at timestamp (seconds).
 * `exp` — expiration timestamp (seconds).
 */
export interface JwtPayload {
  sub: string;
  roles: string[];
  iat: number;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
const TOKEN_PREFIX = 'Bearer ';

// ── Low-level JWT helpers (HS256, no external deps) ────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/** Sign a payload into a JWT string. Used for test token generation. */
export function signJwt(payload: Omit<JwtPayload, 'iat'> & { iat?: number; exp?: number }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims: JwtPayload = {
    sub: payload.sub,
    roles: payload.roles,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + 3600, // 1 hour default
  };

  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64url(createHmac('sha256', JWT_SECRET).update(signingInput).digest());

  return `${signingInput}.${signature}`;
}

/** Verify a JWT string and return the decoded payload, or null. */
function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = base64url(createHmac('sha256', JWT_SECRET).update(signingInput).digest());

    const sigBuf = base64urlDecode(encodedSignature!);
    const expectedBuf = base64urlDecode(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload = JSON.parse(base64urlDecode(encodedPayload!).toString('utf8')) as JwtPayload;

    // Check expiration.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── Decoration types ───────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user principal (set by JWT middleware). */
    user?: JwtPayload;
  }
}

// ── Fastify plugin ─────────────────────────────────────────────

export async function jwtAuthPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith(TOKEN_PREFIX)) {
      return; // Not a JWT request — let it through to the route handler.
    }

    const token = authHeader.slice(TOKEN_PREFIX.length);
    const payload = verifyJwt(token);

    if (!payload) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid or expired JWT token.',
      });
    }

    req.user = payload;
  });
}
