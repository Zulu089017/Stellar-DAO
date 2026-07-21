import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AddressDisplay } from './address-display';

const LONG_ADDR = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
const SHORT_ADDR = 'GABC123';

describe('AddressDisplay', () => {
  it('renders the full address when short enough', () => {
    render(<AddressDisplay value={SHORT_ADDR} />);
    expect(screen.getByText(SHORT_ADDR)).toBeInTheDocument();
  });

  it('truncates a long address with default 6 chars', () => {
    render(<AddressDisplay value={LONG_ADDR} />);
    const el = screen.getByText(/GABCDE…KLMNOP/);
    expect(el).toBeInTheDocument();
  });

  it('truncates with custom truncateChars', () => {
    render(<AddressDisplay value={LONG_ADDR} truncateChars={4} />);
    const el = screen.getByText(/GABC…MNOP/);
    expect(el).toBeInTheDocument();
  });

  it('renders without mono class when mono=false', () => {
    render(<AddressDisplay value={SHORT_ADDR} mono={false} />);
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('mono');
  });

  it('renders the title attribute with full value', () => {
    render(<AddressDisplay value={LONG_ADDR} />);
    const btn = screen.getByTitle(LONG_ADDR);
    expect(btn).toBeInTheDocument();
  });
});
