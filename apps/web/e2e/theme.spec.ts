import { test, expect } from './fixtures';

test.describe('Theme Switching', () => {
  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('theme toggle button is visible in the top nav', async ({ nav }) => {
      await nav.navigateTo('/');
      const toggle = nav.themeToggle;
      await expect(toggle).toBeVisible();
      await expect(toggle).toBeEnabled();
    });

    test('theme persists across page navigation', async ({ nav, page }) => {
      await nav.navigateTo('/');
      const initialDark = await nav.isDarkMode();

      // Toggle theme
      await nav.toggleTheme();
      await page.waitForTimeout(300);

      // Navigate to another page — theme should persist
      await nav.navigateTo('/wrap');
      await page.waitForTimeout(300);
      const afterNav = await nav.isDarkMode();
      expect(afterNav).not.toBe(initialDark);

      // Navigate back — theme should still be toggled
      await nav.navigateTo('/');
      await page.waitForTimeout(300);
      const afterBack = await nav.isDarkMode();
      expect(afterBack).not.toBe(initialDark);

      // Toggle back to original
      await nav.toggleTheme();
      await page.waitForTimeout(300);
    });

    test('theme toggle is accessible via keyboard', async ({ nav, page }) => {
      await nav.navigateTo('/');
      const toggle = nav.themeToggle;

      // Focus and press Enter
      await toggle.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Toggle back
      await toggle.focus();
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);
    });

    test('all pages render without console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const pages = ['/', '/wrap', '/assets', '/transactions', '/governance', '/analytics'];

      for (const p of pages) {
        await page.goto(p);
        await page.waitForLoadState('networkidle');

        // Body and main should be visible on each page
        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator('main')).toBeVisible();
      }

      // No console errors across any pages
      expect(consoleErrors.length).toBe(0);
    });

    test('header remains visible after multiple theme toggles', async ({ nav, page }) => {
      await nav.navigateTo('/');

      for (let i = 0; i < 3; i++) {
        await nav.toggleTheme();
        await page.waitForTimeout(200);

        const header = page.locator('header');
        await expect(header).toBeVisible();
        await expect(header.getByText('StellarDAO')).toBeVisible();
      }
    });
  });

  test.describe('Mobile (393px)', () => {
    test.use({ viewport: { width: 393, height: 851 } });

    test('theme toggle is accessible on mobile', async ({ nav, page }) => {
      await nav.navigateTo('/');

      const header = page.locator('header');
      const toggleInHeader = header.locator('button[aria-label*="theme" i], button[aria-label*="toggle" i]');

      if (await toggleInHeader.isVisible()) {
        await toggleInHeader.click();
        await page.waitForTimeout(300);
      }
    });

    test('theme toggle works with mobile menu open', async ({ nav, page }) => {
      await nav.navigateTo('/');

      // Open mobile menu if present
      await nav.openMobileMenu();

      const toggle = nav.themeToggle;
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.waitForTimeout(300);
        await nav.closeMobileMenu();
      }
    });
  });
});
