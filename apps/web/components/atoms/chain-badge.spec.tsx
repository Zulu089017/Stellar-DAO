import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChainBadge } from './chain-badge';

describe('ChainBadge', () => {
  it('renders Ethereum badge with correct label', () => {
    render(<ChainBadge chain="ethereum" />);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });

  it('renders Solana badge with correct label', () => {
    render(<ChainBadge chain="solana" />);
    expect(screen.getByText('Solana')).toBeInTheDocument();
  });

  it('renders Polygon badge with correct label', () => {
    render(<ChainBadge chain="polygon" />);
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });

  it('renders Stellar badge with correct label', () => {
    render(<ChainBadge chain="stellar" />);
    expect(screen.getByText('Stellar')).toBeInTheDocument();
  });
});
