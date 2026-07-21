import React from 'react';
import '@testing-library/jest-dom/vitest';

// Make React available globally for jsx-runtime
(globalThis as Record<string, unknown>).React = React;

// jsdom does not implement window.matchMedia — stub it for ThemeToggle tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
