import { test, expect } from './fixtures';

test.describe('Governance Voting', () => {
  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('renders the governance page with heading and stats', async ({ governance }) => {
      await governance.goto();
      await governance.isLoaded();

      await expect(governance.heading).toBeVisible();
      await expect(
        governance.page.getByText(/governed by token holders/i),
      ).toBeVisible();

      await expect(governance.page.getByText('Governance Stats')).toBeVisible();
      await expect(governance.page.getByText('Your Delegation')).toBeVisible();
    });

    test('displays governance statistics card', async ({ governance }) => {
      await governance.goto();
      await governance.isLoaded();

      await expect(governance.page.getByText('Voting Period')).toBeVisible();
      await expect(governance.page.getByText('Quorum')).toBeVisible();
      await expect(governance.page.getByText('Proposal Threshold')).toBeVisible();
      await expect(governance.page.getByText('Timelock Delay')).toBeVisible();

      await expect(governance.page.getByText(/7 days/)).toBeVisible();
      await expect(governance.page.getByText(/4%/)).toBeVisible();
      await expect(governance.page.getByText(/2 days/)).toBeVisible();
    });

    test('delegation panel shows wallet connect prompt', async ({ governance }) => {
      await governance.goto();
      await governance.isLoaded();

      await expect(
        governance.page.getByText(/connect your wallet/i),
      ).toBeVisible();
    });

    test('proposal filter buttons are present and clickable', async ({ governance, page }) => {
      await governance.goto();
      await governance.isLoaded();

      const filters = ['all', 'active', 'succeeded', 'executed'];
      for (const filter of filters) {
        const btn = page.getByRole('button', { name: new RegExp(filter, 'i') });
        await expect(btn).toBeVisible();
        await btn.click();
        await page.waitForTimeout(300);
      }
    });

    test('proposal cards link to detail pages', async ({ governance, page }) => {
      await governance.goto();
      await governance.isLoaded();

      const cards = governance.proposalCards;
      const count = await cards.count();

      if (count > 0) {
        const href = await cards.first().getAttribute('href');
        await cards.first().click();
        await page.waitForLoadState('networkidle');
        if (href) {
          expect(page.url()).toContain(href);
        }
      }
    });

    test('governance page metadata is correct', async ({ page }) => {
      await page.goto('/governance');
      const title = await page.title();
      expect(title).toContain('Governance');
      expect(title).toContain('StellarDAO');
    });
  });

  test.describe('Mobile (393px)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('governance page renders on mobile without overflow', async ({ governance, page }) => {
      await governance.goto();
      await governance.isLoaded();

      await expect(governance.heading).toBeVisible();
      await expect(governance.page.getByText('Governance Stats')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5);
    });

    test('proposal list is scrollable on mobile', async ({ governance, page }) => {
      await governance.goto();
      await governance.isLoaded();

      const cards = governance.proposalCards;
      const count = await cards.count();

      if (count > 0) {
        await expect(cards.first()).toBeVisible();
        await cards.first().click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/governance/');
      }
    });
  });
});
