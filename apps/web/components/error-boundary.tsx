'use client';

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-xl border border-stellar-flare/30 bg-stellar-flare/5 p-8 text-center">
          <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
          <p className="mt-2 text-sm text-stellar-haze">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-stellar-haze hover:border-white/20 hover:text-white transition"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
