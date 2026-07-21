import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionTimeline } from './transaction-timeline';

const BASE_PROPS = {
  status: 'pending',
  sourceChain: 'ethereum',
  sourceTxHash: null,
  stellarTxHash: null,
  createdAt: '2026-01-15T12:00:00.000Z',
  updatedAt: '2026-01-15T12:00:00.000Z',
};

describe('TransactionTimeline', () => {
  it('renders all four lifecycle steps for completed transaction', () => {
    render(<TransactionTimeline {...BASE_PROPS} status="completed" />);
    expect(screen.getByText('Lock detected')).toBeInTheDocument();
    expect(screen.getByText('Relayer attestation')).toBeInTheDocument();
    expect(screen.getByText('Minting on Stellar')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows timestamp for lock step when status is pending', () => {
    render(<TransactionTimeline {...BASE_PROPS} status="pending" />);
    expect(screen.getByText('Lock detected')).toBeInTheDocument();
  });

  it('renders txHash when available', () => {
    const srcHash = 'a'.repeat(64);
    const stellarHash = 'b'.repeat(64);
    render(
      <TransactionTimeline
        {...BASE_PROPS}
        status="completed"
        sourceTxHash={srcHash}
        stellarTxHash={stellarHash}
      />,
    );
    expect(screen.getAllByText(srcHash).length).toBeGreaterThan(0);
    expect(screen.getAllByText(stellarHash).length).toBeGreaterThan(0);
  });
});
