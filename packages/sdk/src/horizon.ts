/**
 * Typed Horizon REST client.
 *
 * Keeps the rest of the codebase off `fetch()` so we can:
 *   1. Centralize the URL/headers/timeout behaviour.
 *   2. Surface typed errors when Horizon is down (real-time feed needs to know).
 *   3. Apply the retry policy from `./retry.js` (3 attempts,
 *      exponential backoff with full jitter, retryable on
 *      5xx/408/429/network).
 *
 * Note: stellar-sdk v12 dropped `Horizon.Server.networkPassphrase` as a
 * public field. We track the network passphrase locally based on the
 * `network` constructor option and derive `network` from it.
 */
import { Horizon, Networks } from '@stellar/stellar-sdk';
import { z } from 'zod';
import type { StellarNetwork } from '@stellardao/shared';
import { withRetry } from './retry.js';

const HorizonErrorSchema = z.object({
  status: z.number(),
  title: z.string(),
  detail: z.string().optional(),
  extras: z.record(z.unknown()).optional(),
});
export type HorizonError = z.infer<typeof HorizonErrorSchema>;

export type HorizonClientOptions = {
  baseUrl: string;
  network: StellarNetwork;
  fetchTimeoutMs?: number;
  /**
   * Optional fetcher injection seam. Defaults to `globalThis.fetch`.
   * Tests pass a vi.fn() to assert retry-on-503 behaviour without
   * stubbing globals.
   */
  fetcher?: typeof fetch;
};

const PASSPHRASES: Record<StellarNetwork, string> = {
  PUBLIC: Networks.PUBLIC,
  TESTNET: Networks.TESTNET,
  FUTURENET: Networks.FUTURENET,
} as const;

export class HorizonClient {
  private readonly server: Horizon.Server;
  private readonly passphrase: string;
  private readonly _network: StellarNetwork;
  private readonly baseUrl: string;
  private readonly fetchTimeoutMs: number;
  private readonly _fetch: typeof fetch;

  constructor(opts: HorizonClientOptions) {
    this.server = new Horizon.Server(opts.baseUrl, {
      allowHttp: false,
    });
    // Under noUncheckedIndexedAccess, indexing `Networks` directly gives
    // `string | undefined`, so use a typed local map.
    this.passphrase = PASSPHRASES[opts.network];
    this._network = opts.network;
    this.baseUrl = opts.baseUrl;
    this.fetchTimeoutMs = opts.fetchTimeoutMs ?? 10_000;
    this._fetch = opts.fetcher ?? globalThis.fetch;
  }

  get network(): StellarNetwork {
    return this._network;
  }

  /** Network passphrase used when signing client-side transactions. */
  get networkPassphrase(): string {
    return this.passphrase;
  }

  /**
   * Liveness probe — used by /api/health and the UI banner. Returns
   * `true` once any retry-and-status combo lands in 2xx, `false` if
   * every retry exhausted (network down, repeated 5xx, timeout, or
   * caller-supplied signal abort). Never throws.
   */
  async ping(): Promise<boolean> {
    try {
      return await withRetry(async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.fetchTimeoutMs);
        try {
          const res = await this._fetch(`${this.baseUrl}/`, { signal: ctrl.signal });
          if (!res.ok) {
            throw Object.assign(new Error(`ping HTTP ${res.status}`), { response: res });
          }
          return true;
        } finally {
          clearTimeout(t);
        }
      });
    } catch {
      return false;
    }
  }

  /** Stream Soroban contract events for a contract id. Returns an AsyncIterator. */
  async *streamContractEvents(contractId: string, cursor: string = 'now') {
    let nextCursor: string | undefined = cursor;
    while (nextCursor !== undefined) {
      const url = new URL(`${this.baseUrl}/contracts/${contractId}/events`);
      url.searchParams.set('cursor', nextCursor);
      url.searchParams.set('limit', '100');
      const body = await withRetry(async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.fetchTimeoutMs);
        try {
          const res = await this._fetch(url, { signal: ctrl.signal });
          if (!res.ok) {
            const errBody = await res.text();
            throw Object.assign(
              new Error(`horizon /events failed: ${res.status} ${errBody}`),
              { response: res },
            );
          }
          return (await res.json()) as {
            _embedded: { records: unknown[] };
            _links: { next: { href: string } | null };
          };
        } finally {
          clearTimeout(t);
        }
      });
      nextCursor = body._links.next?.href ? extractCursor(body._links.next.href) : undefined;
      for (const record of body._embedded.records) {
        yield record;
      }
    }
  }

  /**
   * Direct Horizon call passthrough for ad-hoc types we don't want to
   * model yet. Throws on non-2xx (after retry budget exhausted) and
   * attaches the failed Response to the thrown error so callers can
   * inspect status / headers.
   */
  raw(pathname: string, init: RequestInit = {}): Promise<Response> {
    return withRetry(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.fetchTimeoutMs);
      try {
        const res = await this._fetch(`${this.baseUrl}${pathname}`, {
          ...init,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw Object.assign(new Error(`raw ${pathname} HTTP ${res.status}`), {
            response: res,
          });
        }
        return res;
      } finally {
        clearTimeout(t);
      }
    });
  }

  parseError(json: unknown): HorizonError {
    return HorizonErrorSchema.parse(json);
  }
}

const extractCursor = (href: string): string => {
  const url = new URL(href);
  return url.searchParams.get('cursor') ?? 'now';
};
