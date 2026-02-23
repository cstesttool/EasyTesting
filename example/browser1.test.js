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
const { describe, it, expect, beforeEach, afterEach, step } = et;

describe('Browser (CDP)', () => {
  let browser;

  beforeEach(async () => {
    // New browser for each test. onStep records every action (goto, click, frame, etc.) in the report.
    browser = await et.createBrowser({ headless: false, onStep: (msg) => step(msg) });
  });

  afterEach(async () => {
    if (browser) await browser.close();
  });

  it.skip('locator shorthand: name=, id=, class= (strict mode: fails if 0 or 2+ elements)', async () => {
    await browser.goto('https://demo.guru99.com/test/newtours/');
    // Shorthand: name="userName" or CSS [name="userName"] — both work. If 2+ elements match, test fails.
    const searchBox = browser.locator('name="userName"');
    await searchBox.type('CSTesting');
    //await searchBox.pressKey('Enter');
    //await browser.waitForLoad();
    //const html = await browser.content();
    //expect(html.length).toBeGreaterThan(0);
  });

  it.skip('locator shorthand: name=, id=, class= (strict mode: fails if 0 or 2+ elements)', async () => {
    await browser.goto('https://testautomationpractice.blogspot.com/');
    // Shorthand: name="userName" or CSS [name="userName"] — both work. If 2+ elements match, test fails.
    //const searchBox = browser.locator('id="name"');
    //await searchBox.type('CSTesting');
    //const searchBox = browser.locator('[placeholder="Enter Name1"]');
    //const searchBox = browser.getByAttribute('name', 'gender').first();
    //await searchBox.click();
    //await searchBox.pressKey('Enter');
    //await browser.waitForLoad();
    //const html = await browser.content();
    //expect(html.length).toBeGreaterThan(0);
    // Handle alert/confirm/prompt — accept (OK) or dismiss (Cancel):
    // To DISMISS (click Cancel): return { accept: false }
    // To ACCEPT (click OK):      return { accept: true, promptText: '...' }  (promptText only for prompt)
    /*browser.setDialogHandler(({ type, message }) => {
      console.log(`Dialog [${type}]: ${message}`);
      return {
        accept: true,
        promptText: type === 'prompt' ? 'my value' : undefined,
      };
      */
    /*browser.setDialogHandler(({ type, message }) => {
      console.log(`Dialog [${type}]: ${message}`);
      return {
        accept: false
      };
    // Example: dismiss all dialogs → return { accept: false };
    // Example: dismiss only confirms → return { accept: type !== 'confirm' };
  });
  await browser.click('button[id="confirmBtn"]');
  const result = await browser.locator('id="demo"').textContent();
  expect(result).toBe('my value');*/
    // Give "New Tab" button a temporary id so we can use real CDP click (avoids popup blocker)
    /*await browser.evaluate(`
      (function(){
        var btn = Array.from(document.querySelectorAll('button')).find(function(b) { return b.textContent.trim() === 'New Tab'; });
        if (!btn) throw new Error('Button "New Tab" not found');
        btn.id = 'cstesting-newtab-btn';
      })();
    `);
*/
    // Playwright-style: waitForNewTab() returns a TabHandle — use parent and new tab without switching
    const [newTab] = await Promise.all([
      browser.waitForNewTab(),
      browser.click('//button[text()="New Tab"]'),
    ]);

    // Parent stays as browser — no switchToTab needed
    const parentTitle = await browser.evaluate('document.title');
    console.log('Parent page title:', parentTitle);

    // New tab has its own handle — use newTab.evaluate(), newTab.click(), etc.
    await Promise.race([
      newTab.waitForLoad(),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    const newTabTitle = await newTab.evaluate('document.title');
    const newTabUrl = await newTab.evaluate('window.location.href');
    console.log('New tab URL:', newTabUrl);
    console.log('New tab title:', newTabTitle);

    // Optional: close the new tab's connection when done (browser/parent stays open)
    // await newTab.close();
  });

  it.skip('frames or ifrmes', async () => {
    await browser.goto('https://www.dezlearn.com/nested-iframes-example/');
    //const frame = browser.frame('//frame[@src="frame_1.html"]');
    // or XPath: browser.frame('//iframe[@name="main"]')
    //await frame.getByAttribute('name', 'mytext1').type('CSTesting');
    await browser.waitForSelector('iframe#parent_iframe', { timeout: 180000 });
    // Two levels (iframe inside iframe)
    const outer = await browser.frame('iframe#parent_iframe');
    const inner = await outer.frame('iframe#iframe1');
    await inner.locator('#u_5_6').click();
    //await inner.locator('#u_5_6').click();
    // Wait for #processing to appear after click (it loads asynchronously)
    await inner.waitForSelector('#processing', { timeout: 10000 });
    const result = await inner.locator('#processing').textContent();
    console.log('Result:', result);
    // Same in one line
    //await browser.frame('iframe#outer').frame('iframe#inner').click('button');
  })

  it.skip('mouse actions', async () => {
    //await browser.goto('https://testautomationpractice.blogspot.com/');
    //await browser.doubleClick('//button[text()="Copy Text"]');
    //await browser.waitForSelector('#field2', { timeout: 10000 });
    //let text = await browser.locator('#field2').getAttribute('value');
    //console.log('Text:', text);

    // dragTo() expects a selector string, not a locator object
    //await browser.locator('#draggable').dragTo('#droppable');
    //await browser.waitForSelector('#droppable', { timeout: 10000 });
    //let text1 = await browser.locator('#droppable').textContent();
    //console.log('Text:', text1);
    //await browser.goto('https://demo.guru99.com/test/simple_context_menu.html');
    //await browser.rightClick('//*[text()="right click me"]');
    //await browser.waitForSelector('//*[text()="Paste"]', { timeout: 10000 });
    //let text = await browser.locator('//*[text()="Paste"]').textContent();
    //console.log('Text:', text);
    await browser.goto('https://demo.automationtesting.in/Register.html');
    await browser.hover('//*[text()="SwitchTo"]');
    await browser.waitForSelector('//*[text()="Alerts"]', { timeout: 10000 });
    await browser.click('//*[text()="Alerts"]');
  })

  it.skip('single dropdown handling', async () => {

    await browser.goto('https://testautomationpractice.blogspot.com/');
    await browser.select('#country', { label: 'Germany' });
    await browser.sleep(6000);
    await browser.select('#country', { index: 0 });
    await browser.sleep(6000);
    await browser.select('#country', { value: 'india' });

    // By value
    await browser.select('#colors', [{ value: 'green' }, { value: 'red' }]);

    // By index (e.g. first and third)
    //await browser.select('#tags', [{ index: 0 }, { index: 2 }]);

    // Mix label, value, index
    //await browser.select('#tags', [{ label: 'JavaScript' }, { value: 'e2e' }]);
  })

  it('checkbox and radio', async () => {
    await browser.goto('https://testautomationpractice.blogspot.com/');
    await browser.sleep(2000);
    await browser.check('#female');
    const selected1 = await browser.isSelected('#female');
    expect(selected1).toBe(true);
    const disabled = await browser.isDisabled('#female');
    expect(disabled).toBe(false);
    const editable = await browser.isEditable('#female');
    expect(editable).toBe(true);
    const visible = await browser.isVisible('#female');
    expect(visible).toBe(true);
    await browser.check('#tuesday');
    const selected = await browser.isSelected('#tuesday');
    expect(selected).toBe(true);
  });

  it('verifying get screenshot', { tags: ['smoke', 'screenshot'] }, async () => {
    await browser.goto('https://testautomationpractice.blogspot.com/');
    await browser.sleep(2000);
    // Full page
   // const fullPageBuffer = await browser.getScreenshot({ fullPage: true });
    await browser.getScreenshot({ path: 'full.png', fullPage: true });

    // Viewport only
   // const viewportBuffer = await browser.getScreenshot();

    // Specific element
    await browser.getScreenshot({ selector: '#female', path: 'hero.png' });
    await browser.locator('#tuesday').screenshot({ path: 'main.png' });
  });
});
