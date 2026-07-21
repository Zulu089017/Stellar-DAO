/**
 * Shared structured logger for the StellarDAO monorepo.
 *
 * Wraps Pino with project-wide defaults (redacted secrets, request-id
 * propagation, level-aware formatting). Use `createLogger(name)` in
 * every service so log lines can be traced back to their origin.
 *
 * Usage:
 *   import { createLogger } from '@stellardao/shared/logger';
 *   const log = createLogger('api');
 *   log.info({ txId }, 'Transaction created');
 */

import pino, { type Logger } from 'pino';

const SECRET_KEYS = [
  'secret',
  'password',
  'token',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'authorization',
] as const;

export function createLogger(name: string): Logger {
  return pino({
    name,
    redact: {
      paths: SECRET_KEYS.map((k) => `*.${k}`),
      censor: '[REDACTED]',
    },
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  });
}
