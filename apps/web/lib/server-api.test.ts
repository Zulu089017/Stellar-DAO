import { describe, expect, it } from 'vitest';
import { chainLabel } from '@stellar-payment-gateway/shared';

/**
 * Smoke test for the web app's vitest suite.
 *
 * The suite was previously empty, which caused `vitest run` to exit
 * non-zero. This file:
 *   1. Verifies the workspace-package transpile config works end-to-end
 *      (a real import from `@stellar-payment-gateway/shared` resolves + executes).
 *   2. Pins the `chainLabel` lookup table — the dashboard renders
 *      `chainLabel(chain).name` in many components, so a regression
 *      in the helper would break the UI everywhere at once.
 */
describe('chainLabel', () => {
  it('returns the correct label for each supported source chain', () => {
    expect(chainLabel('ethereum').name).toBe('Ethereum');
    expect(chainLabel('solana').name).toBe('Solana');
    expect(chainLabel('polygon').name).toBe('Polygon');
  });
});
