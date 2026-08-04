/**
 * Wallet connector — Freighter + xBull + Albedo integration for the
 * Stellar Payment Gateway dashboard.
 *
 * Supports:
 *   - Freighter browser extension
 *   - xBull browser extension
 *   - Albedo web wallet
 *   - Deterministic mock wallet (dev fallback)
 *
 * Auto-detects available wallets. Priority: Freighter > xBull > Albedo > mock.
 */

const MOCK_DEMO_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR';

interface FreighterApi {
  requestAccess(): Promise<string>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>;
  getNetwork?(): Promise<string>;
}

interface XBullApi {
  connect(): Promise<string>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>;
  closeConnections?(): Promise<void>;
}

interface AlbedoApi {
  publicKey(): Promise<{ pubkey: string }>;
  tx(xdr: string): Promise<{ signed_envelope_xdr: string }>;
}

type WalletProvider = 'freighter' | 'xbull' | 'albedo' | 'mock';

function getFreighter(): FreighterApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { freighterApi?: FreighterApi };
  return w.freighterApi ?? null;
}

function getXBull(): XBullApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { xBullSDK?: XBullApi };
  return w.xBullSDK ?? null;
}

function getAlbedo(): AlbedoApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { albedo?: AlbedoApi };
  return w.albedo ?? null;
}

function detectProvider(): WalletProvider {
  if (getFreighter()) return 'freighter';
  if (getXBull()) return 'xbull';
  if (getAlbedo()) return 'albedo';
  return 'mock';
}

export const WalletConnector = {
  isFreighterAvailable(): boolean {
    return getFreighter() !== null;
  },

  isXBullAvailable(): boolean {
    return getXBull() !== null;
  },

  isAlbedoAvailable(): boolean {
    return getAlbedo() !== null;
  },

  isAvailable(): boolean {
    return this.isFreighterAvailable() || this.isXBullAvailable() || this.isAlbedoAvailable();
  },

  provider(): WalletProvider {
    return detectProvider();
  },

  async connect(): Promise<{ pubKey: string; provider: WalletProvider }> {
    const provider = detectProvider();

    if (provider === 'freighter') {
      const api = getFreighter()!;
      const pubKey = await api.requestAccess();
      return { pubKey, provider };
    }

    if (provider === 'xbull') {
      const api = getXBull()!;
      const pubKey = await api.connect();
      return { pubKey, provider };
    }

    if (provider === 'albedo') {
      const api = getAlbedo()!;
      const result = await api.publicKey();
      return { pubKey: result.pubkey, provider };
    }

    return { pubKey: MOCK_DEMO_PUBLIC_KEY, provider: 'mock' };
  },

  async getPublicKey(): Promise<string | null> {
    const provider = detectProvider();

    try {
      if (provider === 'freighter') {
        return await getFreighter()!.getPublicKey();
      }
      if (provider === 'xbull') {
        return await getXBull()!.getPublicKey();
      }
      if (provider === 'albedo') {
        const result = await getAlbedo()!.publicKey();
        return result.pubkey;
      }
    } catch {
      return null;
    }

    return null;
  },

  async signTransaction(
    xdr: string,
    networkPassphrase: string,
  ): Promise<string> {
    const provider = detectProvider();

    if (provider === 'freighter') {
      const api = getFreighter();
      if (!api) throw new Error('Freighter not available');
      return api.signTransaction(xdr, { networkPassphrase });
    }

    if (provider === 'xbull') {
      const api = getXBull();
      if (!api) throw new Error('xBull not available');
      return api.signTransaction(xdr, { networkPassphrase });
    }

    if (provider === 'albedo') {
      const api = getAlbedo();
      if (!api) throw new Error('Albedo not available');
      const result = await api.tx(xdr);
      return result.signed_envelope_xdr;
    }

    throw new Error('No wallet provider available');
  },

  async disconnect(): Promise<void> {
    const provider = detectProvider();
    if (provider === 'xbull') {
      try {
        await getXBull()?.closeConnections?.();
      } catch { /* ignore */ }
    }
  },
};
