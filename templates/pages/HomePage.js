/**
 * Page Object: Home page (example.com).
 * Centralizes selectors and page actions — use in tests for maintainability.
 *
 * Usage in tests:
 *   const HomePage = require('../pages/HomePage');
 *   const page = new HomePage(browser);
 *   await page.goto();
 *   await page.clickMoreInfo();
 */

class HomePage {
  constructor(browser) {
    this.browser = browser;
  }

  /** Page URL */
  get url() {
    return 'https://example.com';
  }

  /** Navigate to the home page */
  async goto() {
    await this.browser.goto(this.url);
    await this.browser.waitForLoad();
  }

  /** Get the main heading text (Example Domain) */
  async getHeadingText() {
    const text = await this.browser.evaluate(
      "document.querySelector('h1') ? document.querySelector('h1').textContent : ''"
    );
    return text;
  }

  /** Click the "More information..." link */
  async clickMoreInfo() {
    const link = this.browser.locator('a');
    await link.click();
    await this.browser.waitForLoad();
  }

  /** Get page title via evaluate */
  async getTitle() {
    return this.browser.evaluate('document.title');
  }
}

module.exports = HomePage;
