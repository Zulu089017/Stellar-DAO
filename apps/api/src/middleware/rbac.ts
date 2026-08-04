import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * RBAC middleware — route-level role enforcement.
 *
 * Usage:
 *   app.get('/admin/stats', { preHandler: [requireRole('admin')] }, handler);
 *   app.post('/invoices', { preHandler: [requireRole('merchant', 'admin')] }, handler);
 *
 * Checks the `req.user.roles` array set by the JWT auth middleware.
 * If the user doesn't have at least one of the required roles, returns 403.
 */

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Authentication required. Provide a valid JWT token.',
      });
    }

    const hasRole = roles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      return reply.code(403).send({
        error: 'forbidden',
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your roles: ${req.user!.roles.join(', ') || 'none'}`,
      });
    }
  };
}

/**
 * Require that the caller is authenticated (any valid JWT).
 * Use as a preHandler on routes that need identity but not a specific role.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'Authentication required. Provide a valid JWT token.',
    });
  }
}

/**
 * Fastify plugin that registers the RBAC decorators.
 * The actual enforcement happens via `requireRole()` / `requireAuth()`
 * attached to individual routes.
 */
export async function rbacPlugin(_app: FastifyInstance): Promise<void> {
  // Plugin exists so server.ts registration is consistent.
  // The `requireRole` and `requireAuth` exports are used directly
  // by route handlers as preHandler arrays.
}
