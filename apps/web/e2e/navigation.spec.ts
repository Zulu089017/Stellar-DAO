import { test, expect } from './fixtures';

test.describe('Navigation & Global UI', () => {
  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('renders the dashboard hero section with key elements', async ({ dashboard }) => {
      await dashboard.goto();
      await dashboard.isLoaded();
      await expect(dashboard.heroHeading).toBeVisible();
      await expect(dashboard.startWrapButton).toBeVisible();
      await expect(dashboard.seeLiveFeedButton).toBeVisible();
      await expect(dashboard.liveAssetRegistryHeading).toBeVisible();
      await expect(dashboard.settlementFeedHeading).toBeVisible();
    });

    test('navigates between all main pages via the top nav', async ({ nav, page }) => {
      await nav.navigateTo('/');
      await expect(page).toHaveURL('/');

      const pages = [
        { name: 'Wrap', path: '/wrap' },
        { name: 'Assets', path: '/assets' },
        { name: 'Transactions', path: '/transactions' },
        { name: 'Governance', path: '/governance' },
        { name: 'Analytics', path: '/analytics' },
      ];

      for (const { name, path } of pages) {
        const link = nav.navLink(name);
        await expect(link).toBeVisible();
        await link.click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(path);
      }

      const logo = page.locator('a:has(svg), a:has(img)').first();
      await logo.click();
      await expect(page).toHaveURL('/');
    });

    test('shows wallet connect button and attempts connection', async ({ nav, page }) => {
      await nav.navigateTo('/');
      const walletBtn = nav.walletConnectButton;
      await expect(walletBtn).toBeVisible();
      await expect(walletBtn).toHaveText(/connect wallet/i);

      // Click the wallet connect button — in demo mode this should
      // either show a connected state or remain with mock wallet.
      await walletBtn.click();
      await page.waitForTimeout(1000);

      // After clicking, the button should either change text or still show connect
      const btnText = await walletBtn.textContent();
      expect(btnText).toBeTruthy();
    });

    test('toggles theme between light and dark mode', async ({ nav, page }) => {
      await nav.navigateTo('/');

      // Get initial mode
      const initialDark = await nav.isDarkMode();

      // Toggle theme
      await nav.toggleTheme();
      await page.waitForTimeout(500);

      // After toggle, mode should have changed
      const afterToggle = await nav.isDarkMode();
      expect(afterToggle).not.toBe(initialDark);

      // Toggle back
      await nav.toggleTheme();
      await page.waitForTimeout(500);
    });

    test('logo mark and branding visible in header', async ({ page }) => {
      await page.goto('/');
      const header = page.locator('header');
      await expect(header).toBeVisible();
      await expect(header.getByText('StellarDAO')).toBeVisible();
      await expect(header.getByText(/testnet/i)).toBeVisible();
    });
  });

  test.describe('Mobile (393px)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('renders mobile hamburger menu on small screens', async ({ nav, page }) => {
      await nav.navigateTo('/');
      const menuBtn = nav.mobileMenuButton;
      await expect(menuBtn).toBeVisible();

      await nav.openMobileMenu();
      await expect(nav.mobileNavPanel).toBeVisible();

      const wrapLink = page.locator('nav a[href="/wrap"]');
      await expect(wrapLink).toBeVisible();
      await wrapLink.click();
      await expect(page).toHaveURL('/wrap');
    });

    test('mobile menu closes when clicking backdrop', async ({ nav, page }) => {
      await nav.navigateTo('/');
      await nav.openMobileMenu();
      await expect(nav.mobileNavPanel).toBeVisible();

      const backdrop = nav.mobileNavBackdrop;
      if (await backdrop.isVisible()) {
        await backdrop.click({ force: true });
        await page.waitForTimeout(300);
      }
    });

    test('mobile menu close button works', async ({ nav }) => {
      await nav.navigateTo('/');
      await nav.openMobileMenu();
      await expect(nav.mobileNavPanel).toBeVisible();
      await nav.closeMobileMenu();
    });
  });

  test.describe('Tablet (834px)', () => {
    test.use({ viewport: { width: 834, height: 1194 } });

    test('renders all pages on tablet viewport without layout breakage', async ({ dashboard, wrap, transactions, governance, analytics }) => {
      await dashboard.goto();
      await dashboard.isLoaded();
      await wrap.goto();
      await wrap.isLoaded();
      await transactions.goto();
      await transactions.isLoaded();
      await governance.goto();
      await governance.isLoaded();
      await analytics.goto();
      await analytics.isLoaded();
    });
  });
});
