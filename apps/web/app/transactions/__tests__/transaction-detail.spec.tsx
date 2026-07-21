import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Transaction } from '@stellardao/shared';

// ── Module mocks ─────────────────────────────────────────────────

const mockGetTransaction = vi.fn();
vi.mock('@/lib/server-api', () => ({
  serverApi: {
    getTransaction: mockGetTransaction,
  },
}));

const mockNotFound = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────

const COMPLETE_TX: Transaction = {
  id: 'tx-001-abc-def-ghi',
  type: 'wrap',
  sourceChain: 'ethereum',
  sourceToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  wrapperToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR',
  amount: '1000000000000000000',
  status: 'completed',
  sourceTxHash: '0xabc123def456',
  stellarTxHash: 'stellar-tx-hash-789',
  nonce: '1',
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-20T12:05:00.000Z',
};

const PENDING_TX: Transaction = {
  ...COMPLETE_TX,
  id: 'tx-002',
  status: 'pending',
  stellarTxHash: null,
};

const FAILED_TX: Transaction = {
  ...COMPLETE_TX,
  id: 'tx-003',
  status: 'failed',
  stellarTxHash: null,
};

const TX_WITHOUT_HASHES: Transaction = {
  ...COMPLETE_TX,
  id: 'tx-004',
  status: 'attesting',
  sourceTxHash: null,
  stellarTxHash: null,
};

// ── Helpers ──────────────────────────────────────────────────────

function mockApiSuccess(tx: Transaction) {
  mockGetTransaction.mockResolvedValue(tx);
}

function mockApiNull() {
  mockGetTransaction.mockResolvedValue(null);
}

function mockApiError() {
  mockGetTransaction.mockRejectedValue(new Error('Network failure'));
}

async function renderPage(id: string = 'tx-001') {
  const { default: TransactionDetailPage } = await import('../[id]/page');
  const page = await TransactionDetailPage({
    params: Promise.resolve({ id }),
  });
  return render(page);
}

// ── Tests ────────────────────────────────────────────────────────

describe('TransactionDetailPage', () => {
  beforeEach(() => {
    mockNotFound.mockClear();
    mockGetTransaction.mockReset();
  });

  // ── Successful data loading ────────────────────────────────

  it('renders the back link to transactions list', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');
    const link = screen.getByRole('link', { name: /back to transactions/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/transactions');
  });

  it('renders the transaction heading with truncated ID', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001-abc-def-ghi');
    // Use getAllByText because the full heading "Transaction tx-001-abc-d…ef-ghi"
    // may match multiple elements; grab the first or use a role query.
    const headings = screen.getAllByText(/Transaction/);
    expect(headings.length).toBeGreaterThanOrEqual(1);
    // Verify the truncated ID pattern exists somewhere in the DOM.
    expect(screen.getByText(/tx-001-abc-d…ef-ghi/)).toBeInTheDocument();
  });

  it('renders the status timeline section', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');
    expect(screen.getByText('Status Timeline')).toBeInTheDocument();
    expect(screen.getByText('Lock detected')).toBeInTheDocument();
    expect(screen.getByText('Relayer attestation')).toBeInTheDocument();
    expect(screen.getByText('Minting on Stellar')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders all transaction details', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');

    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('wrap')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText(COMPLETE_TX.amount)).toBeInTheDocument();
    expect(screen.getByText(COMPLETE_TX.recipient)).toBeInTheDocument();
    expect(screen.getByText(COMPLETE_TX.sourceToken)).toBeInTheDocument();
  });

  it('renders timestamps in human-readable format', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');

    // Multiple date-like strings exist in the DOM (timeline timestamps,
    // detail section created/updated). Use getAllByText with regex matchers.
    const yearMatches = screen.getAllByText(/2026/);
    expect(yearMatches.length).toBeGreaterThanOrEqual(2);

    const timeMatches = screen.getAllByText(/12:00/);
    expect(timeMatches.length).toBeGreaterThanOrEqual(1);
  });

  // ── Explorer links ─────────────────────────────────────────

  it('renders source transaction explorer link with correct href', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');

    // sourceTxHash appears both in the explorer section (<a>) and in the
    // timeline (<p>). Find the anchor specifically by filtering.
    const explorers = screen.getAllByRole('link', {
      name: new RegExp(COMPLETE_TX.sourceTxHash!.slice(0, 10)),
    });
    expect(explorers.length).toBeGreaterThanOrEqual(1);
    expect(explorers[0]).toHaveAttribute(
      'href',
      `https://etherscan.io/tx/${COMPLETE_TX.sourceTxHash}`,
    );
    expect(explorers[0]).toHaveAttribute('target', '_blank');
    expect(explorers[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders Stellar transaction explorer link with correct href', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');

    // Find the anchor whose text matches the stellar tx hash.
    const explorers = screen.getAllByRole('link', {
      name: new RegExp(COMPLETE_TX.stellarTxHash!),
    });
    expect(explorers.length).toBeGreaterThanOrEqual(1);
    expect(explorers[0]).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${COMPLETE_TX.stellarTxHash}`,
    );
  });

  it('renders "no hashes" message when both tx hashes are null', async () => {
    mockApiSuccess(TX_WITHOUT_HASHES);
    await renderPage('tx-004');

    expect(
      screen.getByText(
        'Transaction hashes will appear here once confirmed on-chain.',
      ),
    ).toBeInTheDocument();
  });

  it('hides explorer link sections when hashes are null', async () => {
    mockApiSuccess(TX_WITHOUT_HASHES);
    await renderPage('tx-004');

    expect(screen.queryByText('Source Transaction')).not.toBeInTheDocument();
    expect(screen.queryByText('Stellar Transaction')).not.toBeInTheDocument();
  });

  it('renders the Stellar.Expert static link with correct ID', async () => {
    mockApiSuccess(COMPLETE_TX);
    // The page uses params.id for the expert link URL, not tx.id.
    const pageId = 'tx-001';
    await renderPage(pageId);

    const expertLink = screen.getByText('View on Stellar.Expert');
    expect(expertLink).toBeInTheDocument();
    expect(expertLink.closest('a')).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/contract/${pageId}`,
    );
  });

  it('renders the Stellar Lab static link', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');

    const labLink = screen.getByText('Open Stellar Lab');
    expect(labLink).toBeInTheDocument();
    expect(labLink.closest('a')).toHaveAttribute(
      'href',
      'https://laboratory.stellar.org/#explorer?network=testnet',
    );
  });

  // ── Status variations ──────────────────────────────────────

  it('renders pending status dot', async () => {
    mockApiSuccess(PENDING_TX);
    await renderPage('tx-002');
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders failed status correctly', async () => {
    mockApiSuccess(FAILED_TX);
    await renderPage('tx-003');
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('wrap')).toBeInTheDocument();
  });

  it('renders timeline correctly for pending transaction', async () => {
    mockApiSuccess(PENDING_TX);
    await renderPage('tx-002');

    expect(screen.getByText('Lock detected')).toBeInTheDocument();
    expect(screen.getByText('Relayer attestation')).toBeInTheDocument();
    expect(screen.getByText('Minting on Stellar')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  // ── Error / Not Found handling ─────────────────────────────

  it('calls notFound when API returns null', async () => {
    mockApiNull();
    await expect(renderPage('missing-id')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('calls notFound when API throws an error', async () => {
    mockApiError();
    await expect(renderPage('error-id')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  // ── Edge cases ─────────────────────────────────────────────

  it('handles empty transaction ID gracefully', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('');
    expect(
      screen.getByRole('link', { name: /back to transactions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('does not throw when all fields have edge-case values', async () => {
    const edgeTx: Transaction = {
      ...COMPLETE_TX,
      id: '',
      sourceToken: '',
      wrapperToken: '',
      recipient: '',
      amount: '0',
      sourceTxHash: '',
      stellarTxHash: '',
      nonce: '',
      createdAt: '',
      updatedAt: '',
    };
    mockApiSuccess(edgeTx);
    await expect(renderPage('')).resolves.not.toThrow();
  });

  it('builds correct explorer URL for solana chain', async () => {
    const solanaTx: Transaction = {
      ...COMPLETE_TX,
      id: 'tx-solana',
      sourceChain: 'solana',
      sourceTxHash: 'solana-tx-hash',
    };
    mockApiSuccess(solanaTx);
    await renderPage('tx-solana');

    const explorers = screen.getAllByRole('link', { name: /solana-tx-hash/ });
    expect(explorers.length).toBeGreaterThanOrEqual(1);
    expect(explorers[0]).toHaveAttribute('href', 'https://solscan.io/tx/solana-tx-hash');
  });

  it('builds correct explorer URL for polygon chain', async () => {
    const polygonTx: Transaction = {
      ...COMPLETE_TX,
      id: 'tx-polygon',
      sourceChain: 'polygon',
      sourceTxHash: 'polygon-tx-hash',
    };
    mockApiSuccess(polygonTx);
    await renderPage('tx-polygon');

    const explorers = screen.getAllByRole('link', { name: /polygon-tx-hash/ });
    expect(explorers.length).toBeGreaterThanOrEqual(1);
    expect(explorers[0]).toHaveAttribute('href', 'https://polygonscan.com/tx/polygon-tx-hash');
  });

  // ── Chain Badge ────────────────────────────────────────────

  it('renders correct chain badge for ethereum', async () => {
    mockApiSuccess(COMPLETE_TX);
    await renderPage('tx-001');
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });

  it('renders correct chain badge for solana', async () => {
    const solanaTx: Transaction = { ...COMPLETE_TX, id: 'tx-solana', sourceChain: 'solana' };
    mockApiSuccess(solanaTx);
    await renderPage('tx-solana');
    expect(screen.getByText('Solana')).toBeInTheDocument();
  });

  it('renders correct chain badge for polygon', async () => {
    const polygonTx: Transaction = { ...COMPLETE_TX, id: 'tx-polygon', sourceChain: 'polygon' };
    mockApiSuccess(polygonTx);
    await renderPage('tx-polygon');
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });
});
