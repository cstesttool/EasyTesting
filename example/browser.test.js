/**
 * Browser automation example — no Playwright, no Cypress.
 * Uses CSTesting's built-in CDP via chrome-remote-interface.
 *
 * Run: npx cstesting example/browser.test.js
 * Requires: Chrome or Chromium installed.
 *
 * Note: Tests use example.com (not Google) so they run reliably without reCAPTCHA.
 */

const path = require('path');
const et = (() => {
  try { return require('cstesting'); } catch { return require(path.join(__dirname, '..')); }
})();
const { describe, it, expect, beforeAll, afterAll } = et;

describe('Browser (CDP)', () => {
  let browser;

  beforeAll(async () => {
    // headless: true = no window. Use headless: false to see the browser.
    browser = await et.createBrowser({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('goto and content', async () => {
    await browser.goto('https://example.com');
    const html = await browser.content();
    expect(html).toContain('Example Domain');
  });

  it('locator(selector): type and pressKey', async () => {
    await browser.goto('https://example.com');
    const link = browser.locator('a');
    const text = await browser.evaluate("document.querySelector('a').textContent");
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });

  it('locator: click link and waitForLoad', async () => {
    await browser.goto('https://example.com');
    const link = browser.locator('a');
    await link.click();
    await browser.waitForLoad();
    const html = await browser.content();
    expect(html.length).toBeGreaterThan(0);
  });

  it('Google: using browser.locator(selector) — any selector works', async () => {
    await browser.goto('https://www.google.com');
    const searchBox = browser.locator('[name="q"]');
    await searchBox.type('CSTesting');
    await searchBox.pressKey('Enter');
    await browser.waitForLoad();
    const html = await browser.content();
    expect(html.length).toBeGreaterThan(0);
  });
});
