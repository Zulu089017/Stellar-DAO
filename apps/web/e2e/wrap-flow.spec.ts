import { test, expect } from './fixtures';

test.describe('Token Wrapping Flow', () => {
  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('renders the wrap page with all form fields', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Form elements
      await expect(wrap.sourceChainSelect).toBeVisible();
      await expect(wrap.sourceTokenInput).toBeVisible();
      await expect(wrap.amountInput).toBeVisible();
      await expect(wrap.recipientInput).toBeVisible();
      await expect(wrap.wrapButton).toBeVisible();

      // Sidebar content
      await expect(wrap.page.getByText('How a wrap settles')).toBeVisible();
      await expect(wrap.page.getByText('Safety checklist')).toBeVisible();
    });

    test('shows source chain dropdown with all options', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      const options = await wrap.sourceChainSelect.locator('option').allTextContents();
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(options.map((o) => o.toLowerCase())).toContain('ethereum');
      expect(options.map((o) => o.toLowerCase())).toContain('solana');
      expect(options.map((o) => o.toLowerCase())).toContain('polygon');
    });

    test('can select source chain and fill token address', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Select Solana
      await wrap.selectSourceChain('solana');
      await expect(wrap.sourceChainSelect).toHaveValue('solana');

      // Enter a Solana token address
      await wrap.enterSourceToken('So11111111111111111111111111111111111111112');
      await expect(wrap.sourceTokenInput).toHaveValue('So11111111111111111111111111111111111111112');
    });

    test('can enter amount and recipient address', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      await wrap.enterAmount('100');
      await expect(wrap.amountInput).toHaveValue('100');

      // Enter recipient (Stellar address starting with G)
      const stellarAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR';
      await wrap.enterRecipient(stellarAddress);
    });

    test('shows validation error for invalid token address', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Ethereum is selected by default - enter an invalid address
      await wrap.enterSourceToken('invalid-address');

      // Validation error should appear
      const validationError = wrap.page.getByText(/address doesn.*t match/i);
      await expect(validationError).toBeVisible();
    });

    test('wrap button is disabled with invalid inputs', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Initially with invalid inputs, button should be disabled
      await expect(wrap.wrapButton).toBeDisabled();

      // Clear and enter valid values for demo mode
      await wrap.selectSourceChain('ethereum');
      await wrap.enterSourceToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      await wrap.enterAmount('100');
      await wrap.enterRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR');
    });

    test('displays status and step progress during wrap', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Fill in valid demo values
      await wrap.selectSourceChain('ethereum');
      await wrap.enterSourceToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      await wrap.enterAmount('100');
      await wrap.enterRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR');

      // Status label should be visible
      await expect(wrap.statusLabel).toBeVisible();

      // Step progress bars should be visible
      const bars = wrap.stepBars;
      await expect(bars.first()).toBeVisible();
    });
  });

  test.describe('Mobile (393px)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('renders wrap form on mobile without layout issues', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      // Form fields should be visible and not overflow
      await expect(wrap.sourceChainSelect).toBeVisible();
      await expect(wrap.sourceTokenInput).toBeVisible();
      await expect(wrap.amountInput).toBeVisible();
      await expect(wrap.recipientInput).toBeVisible();

      // The sidebar should be below the form on mobile
      const sidebar = wrap.page.getByText('How a wrap settles');
      await expect(sidebar).toBeVisible();

      // Check no horizontal scroll
      const scrollWidth = await wrap.page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = await wrap.page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5);
    });

    test('can fill and submit wrap form on mobile', async ({ wrap }) => {
      await wrap.goto();
      await wrap.isLoaded();

      await wrap.selectSourceChain('polygon');
      await wrap.enterSourceToken('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619');
      await wrap.enterAmount('50');
      await wrap.enterRecipient('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJUR');

      // Button should be enabled
      await expect(wrap.wrapButton).not.toBeDisabled();
    });
  });
});
