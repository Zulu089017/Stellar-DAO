import { test as base, type Page } from '@playwright/test';

// ── Page Object Models ───────────────────────────────────────────

export class DashboardPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  get heroHeading() {
    return this.page.getByRole('heading', { name: /wrap any erc-20/i });
  }

  get startWrapButton() {
    return this.page.getByRole('link', { name: /start a wrap/i });
  }

  get seeLiveFeedButton() {
    return this.page.getByRole('link', { name: /see live feed/i });
  }

  get liveAssetRegistryHeading() {
    return this.page.getByText('Live asset registry');
  }

  get settlementFeedHeading() {
    return this.page.getByText('Real-time settlement feed');
  }

  async isLoaded() {
    await this.heroHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }
}

export class NavigationComponent {
  constructor(public readonly page: Page) {}

  get navLinks() {
    return this.page.locator('nav a');
  }

  navLink(name: string) {
    return this.page.getByRole('link', { name, exact: true });
  }

  get walletConnectButton() {
    return this.page.getByRole('button', { name: /connect wallet/i });
  }

  get walletConnectedLabel() {
    return this.page.locator('.mono').first();
  }

  get themeToggle() {
    return this.page.locator('button[aria-label*="theme" i], button[aria-label*="toggle" i]');
  }

  get mobileMenuButton() {
    return this.page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]');
  }

  get mobileNavPanel() {
    return this.page.locator('nav:has(a[href="/wrap"])').filter({ has: this.page.locator('text=Navigation') });
  }

  get mobileNavBackdrop() {
    return this.page.locator('.fixed.inset-0.z-30');
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async toggleTheme() {
    const btn = this.themeToggle;
    if (await btn.isVisible()) {
      await btn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async isDarkMode(): Promise<boolean> {
    // The app's globals.css applies the `.light` class for light mode.
    // Dark mode is the default (no class). Check for the absence of
    // the `light` class on the root <html> element.
    return this.page.evaluate(() =>
      !document.documentElement.classList.contains('light'),
    );
  }

  async openMobileMenu() {
    const btn = this.mobileMenuButton;
    if (await btn.isVisible()) {
      await btn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async closeMobileMenu() {
    const closeBtn = this.page.locator('nav button:text("✕")');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await this.page.waitForTimeout(200);
    }
  }
}

export class WrapPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/wrap');
  }

  get heading() {
    return this.page.getByRole('heading', { name: /mint a stellar wrapper/i });
  }

  get sourceChainSelect() {
    return this.page.locator('select').first();
  }

  get sourceTokenInput() {
    return this.page.locator('input').first();
  }

  get amountInput() {
    return this.page.getByRole('spinbutton');
  }

  get recipientInput() {
    // The input is inside a label with text "Stellar recipient" and
    // has a pre-filled demo address starting with "G". Use the label
    // text via role selector for a robust query.
    return this.page.getByRole('textbox', { name: /stellar recipient/i });
  }

  get wrapButton() {
    return this.page.getByRole('button', { name: /wrap/i });
  }

  get statusLabel() {
    return this.page.getByText(/Status/);
  }

  get stepBars() {
    return this.page.locator('span[aria-label*="step"]');
  }

  async selectSourceChain(chain: string) {
    await this.sourceChainSelect.selectOption(chain);
  }

  async enterSourceToken(token: string) {
    await this.sourceTokenInput.fill(token);
  }

  async enterAmount(amount: string) {
    await this.amountInput.fill(amount);
  }

  async enterRecipient(address: string) {
    await this.recipientInput.fill(address);
  }

  async submitWrap() {
    await this.wrapButton.click();
    await this.page.waitForTimeout(500);
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async currentStepStatus(): Promise<string> {
    return (await this.statusLabel.textContent()) ?? '';
  }
}

export class TransactionsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/transactions');
  }

  get heading() {
    return this.page.getByRole('heading', { name: /every wrap & unwrap/i });
  }

  get chainFilterChips() {
    return this.page.locator('a[href*="?chain="]');
  }

  get transactionRows() {
    return this.page.locator('li, tr').filter({ has: this.page.locator('[class*="mono"]') });
  }

  async clickTransaction(index: number = 0) {
    const rows = this.transactionRows;
    const count = await rows.count();
    if (count > index) {
      await rows.nth(index).click();
    }
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }
}

export class GovernancePage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/governance');
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Governance', exact: true });
  }

  get proposalCards() {
    return this.page.locator('a[href*="/governance/"]');
  }

  get proposalFilterButtons() {
    return this.page.locator('button').filter({ hasText: /all|active|succeeded|executed|defeated|canceled/i });
  }

  get votePanelHeading() {
    return this.page.getByText('Cast your vote');
  }

  async clickFilter(filter: string) {
    const btn = this.page.getByRole('button', { name: new RegExp(filter, 'i') });
    if (await btn.isVisible()) {
      await btn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async clickProposal(index: number = 0) {
    const cards = this.proposalCards;
    const count = await cards.count();
    if (count > index) {
      await cards.nth(index).click();
    }
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }
}

export class AnalyticsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/analytics');
  }

  get heading() {
    return this.page.getByRole('heading', { name: /analytics/i });
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }
}

// ── Custom test fixture ───────────────────────────────────────────

type Fixtures = {
  dashboard: DashboardPage;
  nav: NavigationComponent;
  wrap: WrapPage;
  transactions: TransactionsPage;
  governance: GovernancePage;
  analytics: AnalyticsPage;
};

export const test = base.extend<Fixtures>({
  dashboard: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  nav: async ({ page }, use) => {
    await use(new NavigationComponent(page));
  },
  wrap: async ({ page }, use) => {
    await use(new WrapPage(page));
  },
  transactions: async ({ page }, use) => {
    await use(new TransactionsPage(page));
  },
  governance: async ({ page }, use) => {
    await use(new GovernancePage(page));
  },
  analytics: async ({ page }, use) => {
    await use(new AnalyticsPage(page));
  },
});

export { expect } from '@playwright/test';
