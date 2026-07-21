import { test, expect } from './fixtures';

test.describe('Transaction History View', () => {
  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('renders the transactions page with heading and description', async ({ transactions }) => {
      await transactions.goto();
      await transactions.isLoaded();

      await expect(transactions.heading).toBeVisible();
      await expect(
        transactions.page.getByText(/each row is observed/i),
      ).toBeVisible();

      // Chain filter chips should be present
      const chips = transactions.chainFilterChips;
      const chipCount = await chips.count();
      expect(chipCount).toBeGreaterThanOrEqual(1);
    });

    test('chain filter chips navigate to filtered views', async ({ transactions, page }) => {
      await transactions.goto();
      await transactions.isLoaded();

      // Check that chain filter links exist and navigate correctly
      const chips = transactions.chainFilterChips;
      const firstChip = chips.first();
      if (await firstChip.isVisible()) {
        const href = await firstChip.getAttribute('href');
        await firstChip.click();
        await page.waitForLoadState('networkidle');
        if (href) {
          expect(page.url()).toContain(href);
        }
      }
    });

    test('navigates to transaction detail when clicking a transaction', async ({ transactions, page }) => {
      await transactions.goto();
      await transactions.isLoaded();

      // If there are transaction links, verify they navigate to detail pages
      const txLinks = page.locator('a[href*="/transactions/"]');
      const count = await txLinks.count();

      if (count > 0) {
        const href = await txLinks.first().getAttribute('href');
        await txLinks.first().click();
        await page.waitForLoadState('networkidle');
        if (href) {
          expect(page.url()).toContain(href);
        }

        // The detail page should show a back button
        const backLink = page.getByRole('link', { name: /back to transactions/i });
        await expect(backLink).toBeVisible();

        // Click back to return
        await backLink.click();
        await expect(page).toHaveURL('/transactions');
      }
    });

    test('back navigation from transaction detail works', async ({ transactions, page }) => {
      await transactions.goto();
      await transactions.isLoaded();

      // Find any transaction link
      const txLinks = page.locator('a[href*="/transactions/"]');
      const count = await txLinks.count();

      if (count > 0) {
        await txLinks.first().click();
        await page.waitForLoadState('networkidle');

        // Click back
        const backLink = page.getByRole('link', { name: /back to transactions/i });
        await expect(backLink).toBeVisible();
        await backLink.click();
        await expect(page).toHaveURL('/transactions');
      }
    });

    test('transactions page metadata is correct', async ({ page }) => {
      await page.goto('/transactions');
      const title = await page.title();
      expect(title).toContain('Transactions');
      expect(title).toContain('StellarDAO');
    });
  });

  test.describe('Mobile (393px)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('renders transaction list on mobile without overflow', async ({ transactions }) => {
      await transactions.goto();
      await transactions.isLoaded();

      // Content should be visible
      await expect(transactions.heading).toBeVisible();

      // No horizontal overflow
      const scrollWidth = await transactions.page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const viewportWidth = await transactions.page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5);
    });
  });
});
