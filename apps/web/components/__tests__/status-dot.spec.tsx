import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot } from '@stellardao/ui';

describe('StatusDot', () => {
  it('renders status text by default', () => {
    render(<StatusDot status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders custom label when provided', () => {
    render(<StatusDot status="completed" label="Done" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders for all status values', () => {
    const statuses = ['pending', 'attesting', 'minting', 'completed', 'failed', 'refunded'] as const;
    for (const status of statuses) {
      const { unmount } = render(<StatusDot status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
      unmount();
    }
  });
});
