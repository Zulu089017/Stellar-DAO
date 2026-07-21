/**
 * Structured error codes for the StellarDAO API.
 *
 * Every error response from the API carries one of these codes so
 * integrators can match on a stable identifier rather than parsing
 * human-readable messages. Codes are grouped by HTTP status range.
 *
 * Convention:
 *   - 4xx codes: client error (bad input, not found, unauthorized)
 *   - 5xx codes: server error (internal, downstream failure)
 *   - Codes are kebab-case, namespace-prefixed by domain
 */

export const ErrorCodes = {
  // ── 400 Bad Request ────────────────────────────────────
  VALIDATION_FAILED: 'validation_failed',
  INVALID_PROPOSAL_ID: 'invalid_proposal_id',
  INVALID_VOTE_TYPE: 'invalid_vote_type',
  INVALID_CHAIN_ID: 'invalid_chain_id',
  INVALID_AMOUNT: 'invalid_amount',
  INVALID_ADDRESS: 'invalid_address',
  MISSING_REQUIRED_FIELD: 'missing_required_field',

  // ── 401 Unauthorized ───────────────────────────────────
  UNAUTHORIZED: 'unauthorized',
  INVALID_API_KEY: 'invalid_api_key',
  MISSING_API_KEY: 'missing_api_key',
  INVALID_HMAC_SIGNATURE: 'invalid_hmac_signature',

  // ── 404 Not Found ──────────────────────────────────────
  ASSET_NOT_FOUND: 'asset_not_found',
  TRANSACTION_NOT_FOUND: 'transaction_not_found',
  PROPOSAL_NOT_FOUND: 'proposal_not_found',

  // ── 409 Conflict ───────────────────────────────────────
  ASSET_ALREADY_EXISTS: 'asset_already_exists',
  DUPLICATE_NONCE: 'duplicate_nonce',

  // ── 429 Too Many Requests ──────────────────────────────
  RATE_LIMITED: 'rate_limited',

  // ── 500 Internal Server Error ──────────────────────────
  INTERNAL_ERROR: 'internal_error',
  HORIZON_UNAVAILABLE: 'horizon_unavailable',
  SOROBAN_RPC_ERROR: 'soroban_rpc_error',
  DATABASE_ERROR: 'database_error',
  CONTRACT_ERROR: 'contract_error',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Structured API error response shape.
 */
export interface ApiError {
  error: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}
