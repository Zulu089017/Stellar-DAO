import 'server-only';

import type {
  AssetRegistryEntry,
  HealthResponse,
  ListTransactionsResponse,
  ListAssetsResponse,
  Transaction,
  SourceChainId,
  TxStatus,
} from '@stellardao/shared';

const DEFAULT_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Short fetch timeout for SSR/build-time requests so the build doesn't
 * hang when the API server isn't running (e.g. during `next build`).
 * Server components that call these methods at build time will fail fast
 * and the `.catch(() => fallback)` in the caller handles the rest.
 */
const FETCH_TIMEOUT_MS = 5_000;

const fetchWithTimeout = (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
};

type Query = Record<string, string | number | undefined>;

const buildQueryString = (q?: Query) => {
  if (!q) return '';
  const url = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined) url.set(k, String(v));
  }
  const s = url.toString();
  return s ? `?${s}` : '';
};

/** Body shape accepted by POST /bridge/wrap. */
export type WrapRequestBody = {
  sourceChain: SourceChainId;
  sourceToken: string;
  wrapperToken: string;
  recipient: string;
  amount: string;
};

/** Response from POST /bridge/wrap (202 Accepted). */
export type WrapRequestResponse = {
  txId: string;
  status: TxStatus;
};

export const serverApi = {
  baseUrl: DEFAULT_BASE,

  async listAssets(): Promise<ListAssetsResponse> {
    try {
      const r = await fetchWithTimeout(`${DEFAULT_BASE}/assets`);
      return r.ok
        ? (r.json() as Promise<ListAssetsResponse>)
        : { assets: [] as AssetRegistryEntry[] };
    } catch {
      return { assets: [] as AssetRegistryEntry[] };
    }
  },

  async listTransactions(opts: { limit?: number; sourceChain?: SourceChainId } = {}): Promise<ListTransactionsResponse> {
    try {
      const r = await fetchWithTimeout(
        `${DEFAULT_BASE}/transactions${buildQueryString({ ...opts })}`,
      );
      return r.ok
        ? (r.json() as Promise<ListTransactionsResponse>)
        : { transactions: [] as Transaction[] };
    } catch {
      return { transactions: [] as Transaction[] };
    }
  },

  async health(): Promise<HealthResponse | null> {
    try {
      const r = await fetchWithTimeout(`${DEFAULT_BASE}/health`);
      if (!r.ok) return null;
      return (await r.json()) as HealthResponse;
    } catch {
      return null;
    }
  },

  /**
   * Fetch a single transaction by ID.
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const r = await fetchWithTimeout(
        `${DEFAULT_BASE}/transactions/${encodeURIComponent(id)}`,
      );
      if (!r.ok) return null;
      return (await r.json()) as Transaction;
    } catch {
      return null;
    }
  },

  /**
   * Submit a wrap request to the API.
   *
   * The API validates the body, creates a Transaction row, then walks
   * its lifecycle (pending → attesting → minting → completed) in the
   * background. Each step fans out over SSE; the wrap page opens an
   * EventSource filtered by the returned txId to advance the UI.
   */
  async submitWrap(body: WrapRequestBody): Promise<WrapRequestResponse> {
    const r = await fetchWithTimeout(`${DEFAULT_BASE}/bridge/wrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errBody = (await r.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message ?? `wrap failed (${r.status})`);
    }
    return (await r.json()) as WrapRequestResponse;
  },
};
