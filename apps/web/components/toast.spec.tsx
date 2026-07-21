import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from './toast';

// Access the toast function directly via the custom event
function dispatchToast(message: string, type: 'success' | 'error' | 'info' = 'info', txHash?: string) {
  window.dispatchEvent(
    new CustomEvent('stellardao-toast', {
      detail: { id: crypto.randomUUID(), message, type, txHash },
    }),
  );
}

describe('ToastContainer', () => {
  it('renders null when no toasts are present', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstElementChild).toBeNull();
  });

  it('renders a toast after dispatching toast event', () => {
    render(<ToastContainer />);
    act(() => {
      dispatchToast('Transaction submitted', 'success');
    });
    expect(screen.getByText('Transaction submitted')).toBeInTheDocument();
  });

  it('renders txHash when provided', () => {
    render(<ToastContainer />);
    act(() => {
      dispatchToast('Mint confirmed', 'success', 'a'.repeat(64));
    });
    expect(screen.getByText(/tx:/)).toBeInTheDocument();
  });

  it('removes toast on dismiss button click', () => {
    render(<ToastContainer />);
    act(() => {
      dispatchToast('Test message', 'info');
    });
    expect(screen.getByText('Test message')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Test message')).not.toBeInTheDocument();
  });
});
