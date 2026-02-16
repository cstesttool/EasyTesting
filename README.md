# CSTesting

A simple, extensible **Node.js testing framework**. Start with a test runner and assertions (like a minimal Jest/Mocha), plus CDP-based browser automation (no Playwright/Cypress). **Config-driven tests** (run full flows from a config file as a single test case) are **not available in any other automation tool**—only in CSTesting; we support login-style flows now and will add all types of actions.

## For end users — install and run

```bash
# Install in your project
npm install cstesting

# Scaffold Page Object Model (pages/ + tests/ with sample code)
npx cstesting init
# or
npx cst init

# Run tests (discovers *.test.js / *.spec.js)
npx cstesting
npx cstesting tests/
npx cstesting "**/*.test.js"
npx cst
```

Use in code: `const { describe, it, expect, createBrowser } = require('cstesting');`

## Quick Start

1. **Create a test file** (e.g. `math.test.js`):

```js
const { describe, it, expect } = require('cstesting');

describe('Math', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('compares objects', () => {
    expect({ a: 1 }).toEqual({ a: 1 });
  });
});
```

2. **Run tests**:

```bash
npx cstesting
# or
npx cstesting "**/*.test.js"
npx cstesting tests/
```

### Page Object Model (POM)

After installing, scaffold a **pages** and **tests** structure with sample code:

```bash
npx cstesting init
# or
npx cst init
```

This creates:

- **`pages/`** — page objects (e.g. `HomePage.js`) that wrap selectors and actions
- **`tests/`** — sample test file (`home.test.js`) that uses the page object

Then run: `npx cstesting tests/`

### TypeScript

**TypeScript**

- **Types:** The package ships with TypeScript definitions (`"types": "dist/index.d.ts"`). In a TypeScript project you get full type checking and editor support:
  ```ts
  import { describe, it, expect, createBrowser } from 'cstesting';
  ```
- **Test files:** You can write tests in `.test.ts` or `.spec.ts`. The CLI discovers them the same as `.test.js` / `.spec.js`.
- **Running `.ts` tests:** Install `ts-node` in your project, then run as usual:
  ```bash
  npm install cstesting
  npm install -D ts-node typescript
  npx cstesting tests/
  ```
  If you don’t use `ts-node`, compile TypeScript to JavaScript first (`tsc`) and run the generated `.js` files.

### Config-driven tests (single file → run → report)

Run tests from a **config file** without writing code. One function: pick file, run steps, get report.

**This is not available in any other automation tool** (Selenium, Playwright, Cypress, etc.). Only CSTesting lets you define and run full flows from a simple config file and get a single test case with a report. Right now we support **login-style flows** (goto, type into inputs, click). **We will add all types of actions** (dropdowns, checkboxes, waits, assertions, etc.) so you can cover any scenario from config alone.

**Config format** (one step per line):

- `# Test case name` — starts a **single test case**; all following steps belong to it until the next `#` (report shows one test per section)
- `headless=false` or `headed=true` — open browser in **headed mode** (visible window; default is headless)
- `goto:<url>` — open URL
- `<label>:<locator>=value:<text>` — type text into element (e.g. `username:#email=value:john`)
- `click=<locator>` — click element (e.g. `click=button[type="submit"]`)

**Example** `login.conf`:

```conf
# Login Page (visible browser)
headed=true
goto:https://example.com/login
username:#email=value:user@test.com
password:#password=value:secret
click=button[type="submit"]
```

**Run and get report:**

```bash
npx cstesting run login.conf
# or
npx cstesting login.conf
```

All steps under a `#` section run as **one test case** in order; pass/fail is for the whole case and the HTML report shows one row per test case with expandable steps.

**Programmatic:** `const { runConfigFile } = require('cstesting'); const result = await runConfigFile('login.conf');`

## API

### Test structure

- **`describe(name, fn)`** — define a suite (nested suites supported)
- **`it(name, fn)`** — define a test (async supported)
- **`describe.only` / `it.only`** — run only this suite/test
- **`describe.skip` / `it.skip`** — skip this suite/test

### Hooks

- **`beforeAll(fn)`** — run once before all tests in the suite
- **`afterAll(fn)`** — run once after all tests in the suite
- **`beforeEach(fn)`** — run before each test
- **`afterEach(fn)`** — run after each test

### Assertions (`expect(value)`)

| Matcher | Example |
|--------|--------|
| `toBe(expected)` | strict equality (`Object.is`) |
| `toEqual(expected)` | deep equality (JSON) |
| `toBeTruthy()` / `toBeFalsy()` | boolean check |
| `toBeNull()` / `toBeDefined()` / `toBeUndefined()` | null/undefined |
| `toThrow(message?)` | expect(fn).toThrow() |
| `toBeGreaterThan(n)` / `toBeLessThan(n)` | numbers |
| `toContain(item)` | arrays and strings |
| `toHaveLength(n)` | length |
| `expect(x).not.toBe(y)` | negate any matcher |

## Programmatic usage

```js
const { describe, it, expect, run } = require('cstesting');

describe('My tests', () => {
  it('works', () => {
    expect(1).toBe(1);
  });
});

run().then((result) => {
  console.log(result); // { passed, failed, skipped, total, duration, errors }
});
```

**Requirements:** Chrome or Chromium installed (the same binary Puppeteer uses; `chrome-launcher` finds it).

```js
const { createBrowser, describe, it, expect, beforeAll, afterAll } = require('cstesting');

describe('My site', () => {
  let browser;

  beforeAll(async () => {
    browser = await createBrowser({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it('loads the page', async () => {
    await browser.goto('https://example.com');
    const html = await browser.content();
    expect(html).toContain('Example Domain');
  });

  it('clicks and types', async () => {
    await browser.goto('https://example.com');
    await browser.click('a');           // click first link
    await browser.type('input', 'hi');  // or use a locator (any selector):
    const input = browser.locator('input');
    await input.type('hi');
    await input.pressKey('Enter');
  });
});
```

### Browser API

| Method | Description |
|--------|-------------|
| `createBrowser(options?)` | Launch Chrome (or connect to existing `port`). Returns a browser object. |
| `browser.goto(url)` | Navigate to URL (waits for load). |
| `browser.click(selector)` | Click element matching CSS `selector`. |
| `browser.type(selector, text)` | Focus and type into element. |
| `browser.select(selector, option)` | Select option(s) in a `<select>`. Single: `{ label }` / `{ index }` / `{ value }`. **Multi-select**: pass an array, e.g. `[{ label: 'A' }, { label: 'B' }]` (replaces current selection). |
| `browser.check(selector)` | Check a checkbox or radio button (set `checked = true`). |
| `browser.uncheck(selector)` | Uncheck a checkbox (set `checked = false`). For radio, use `check(selector)` on another option. |
| `browser.locator(selector)` | Return a locator; then use `.click()`, `.type(text)`, `.select(option)`, `.check()`, `.uncheck()`, `.pressKey(key)`. Supports shorthand and **strict mode** (see below). |
| `browser.getByAttribute(attribute, attributeValue)` | Return a locator for `[attribute="attributeValue"]` (same strict mode). |
| `browser.frame(iframeSelector)` | Return a **FrameHandle** for an iframe (same-origin). Use `frame.evaluate()`, `frame.click()`, etc. without switching. |
| `browser.pressKey(key)` | Press a key (e.g. `'Enter'`). |

**Locator shorthand** (same for `locator()`, `click()`, and `type()`):

- `name="userName"` → `[name="userName"]`
- `id="userName"` → `[id="userName"]`
- `class="userName"` → `.userName`
- **Any attribute:** `placeholder="Enter Name"` → `[placeholder="Enter Name"]`
- **getByAttribute(attr, value):** `browser.getByAttribute('placeholder', 'Enter Name')` → same as above, returns a locator (`.click()`, `.type()`, `.pressKey()`)
- Any other string is used as a **CSS selector**
- **XPath** is supported: if the selector starts with `/` or `(`, it is evaluated as XPath (e.g. `//button[text()="New Tab"]`, `(//div)[1]`).

**Strict mode:** 0 elements → error. 2+ elements → error suggesting `.first()`, `.last()`, or `.nth(n)`.

**When multiple elements match**, use:
- **`.first()`** — act on the first match
- **`.last()`** — act on the last match  
- **`.nth(index)`** — act on the nth match (0-based)

Example: `browser.locator('input').first().type('hello')`, or `browser.getByAttribute('class', 'btn').nth(2).click()`. Locators also support **`.isVisible()`**, **`.isDisabled()`**, **`.isEditable()`**, and **`.isSelected()`** (return `Promise<boolean>`).
| `browser.waitForLoad()` | Wait for the next page load (e.g. after form submit). |
| `browser.waitForSelector(selector, options?)` | Wait until selector matches an element (CSS, XPath, `id=`, `name=`). Throws after `timeout` ms (default 30000). |
| `browser.sleep(ms)` or `browser.sleep({ timeout: ms })` | Fixed delay (hard wait) for the given milliseconds. Prefer `waitForSelector` when you can. |
| `browser.isVisible(selector)` | Whether the element is visible (not hidden by display/visibility/opacity, non-zero size). |
| `browser.isDisabled(selector)` | Whether the element is disabled (e.g. `input`, `button`). |
| `browser.isEditable(selector)` | Whether the element is editable (input/textarea not disabled and not readonly). |
| `browser.isSelected(selector)` | For checkbox/radio: whether checked. For `<option>`: whether selected. For `<select>`: whether it has a selected option. |
| `browser.content()` | Return page HTML. |
| `browser.evaluate(expression)` | Run JS in the page and return the value. |
| `browser.setDialogHandler(handler \| null)` | Handle **alert**, **confirm**, and **prompt** without switching. See below. |
| `browser.getTabs()` | List all open tabs: `Promise<{ id, url, title }[]>`. |
| `browser.switchToTab(indexOrId)` | Switch to tab by 0-based index or tab id. All later actions run in that tab. |
| `browser.waitForNewTab(options?)` | Returns a **TabHandle** (page-like) for the new tab. Use `browser` for parent and the handle for the new tab without switching. |
| `browser.close()` | Close the browser. |

**Handling dialogs (alert, confirm, prompt)** — All JS dialogs are handled in the same CDP session (no `switchTo().alert()`). By default they are accepted (prompt gets `''`). Override with `setDialogHandler`:

```js
// Accept all (default). To dismiss confirms/cancel prompts:
browser.setDialogHandler(({ type, message }) => ({ accept: true }));

// Dismiss every dialog (Cancel):
browser.setDialogHandler(() => ({ accept: false }));

// Custom: accept alert/confirm, for prompt send a value:
browser.setDialogHandler(({ type, message }) => ({
  accept: true,
  promptText: type === 'prompt' ? 'my value' : undefined,
}));

// Reset to default (accept all):
browser.setDialogHandler(null);
```

**New tab ** — `waitForNewTab()` returns a **TabHandle** (page-like object). Use **browser** for the parent and **newTab** for the new tab **without switching**:

```js
const [newTab] = await Promise.all([
  browser.waitForNewTab(),
  browser.click('a[target="_blank"]'),
]);

// Parent: use browser (stays on parent)
const parentTitle = await browser.evaluate('document.title');

// New tab: use newTab handle (same API: evaluate, click, content, locator, etc.)
const newTabTitle = await newTab.evaluate('document.title');
await newTab.click('button');
// Optional: close only the new tab's connection
await newTab.close();
```

**Switching tabs** — To move the main browser to another tab: `await browser.switchToTab(1)` or `await browser.switchToTab(tabId)`. List tabs: `const tabs = await browser.getTabs();`

**Frames / iframes** — Use a frame without switching the main page. Same-origin iframes only (uses `contentDocument`).

```js
const frame = browser.frame('iframe#myframe');
// or by XPath: browser.frame('//iframe[@name="content"]')

const title = await frame.evaluate('document.title');
const html = await frame.content();
await frame.click('button');
await frame.locator('input').type('hello');
const text = await frame.getTextContent('h1');
```

**Nested frames** — Use `.frame(selector)` on a frame handle to target an iframe inside that frame (Playwright-style):

```js
const outer = browser.frame('iframe#outer');
const inner = outer.frame('iframe#inner');   // iframe inside the outer frame

await inner.click('button');
const title = await inner.evaluate('document.title');
// or in one go: browser.frame('iframe#outer').frame('iframe#inner').click('button');
```

**Late-loading inner frame** — If the inner iframe loads after the page, use **`frame.waitForSelector(selector, { timeout })`** so the frame (and an element inside it) is ready before you interact:

```js
const inner = browser.frame('iframe#outer').frame('iframe#inner');
// Wait for the inner frame to load and for a button to appear (e.g. 10s timeout)
await inner.waitForSelector('button', { timeout: 10000 });
await inner.click('button');
```

**Options for `createBrowser({ ... })`:**

- `headless` (default: `true`) — run without a visible window
- `port` — use an existing Chrome with `--remote-debugging-port=9222` instead of launching
- `args` — extra Chrome flags (e.g. `['--disable-web-security']`)
- `userDataDir` — custom Chrome profile path (avoids Windows EPERM on default temp folder)

**Windows EPERM / Permission denied:** If you see `EPERM, Permission denied` on a `lighthouse.xxxxx` temp path, the launcher now uses a custom profile dir under your project (`node_modules/.cache/`) or `os.tmpdir()` instead of the default. You can also set `userDataDir` to a path you control, e.g. `createBrowser({ userDataDir: 'C:\\MyChromeProfile' })`.

---

## Text input – ways to handle
**CSTesting supports 5 ways to handle text input** (typing into inputs):

---

### 1. Config file (no code)

In a `.conf` file, one line per field. Format: **`<label>:<locator>=value:<text>`**

```conf
# Login Page
username:[name="userName"]=value:mercury
password:[name="password"]=value:secret
```

Run: `npx cstesting run login.conf`

---

### 2. browser.type(selector, text)

Direct API: pass a CSS selector (or shorthand) and the text.

```js
const { createBrowser } = require('cstesting');
const browser = await createBrowser({ headless: true });
await browser.goto('https://example.com/login');
await browser.type('[name="userName"]', 'mercury');
await browser.type('[name="password"]', 'secret');
await browser.close();
```

**Locator shorthand:** `name="userName"` → `[name="userName"]`, `id="email"` → `[id="email"]`, etc.

---

### 3. browser.locator(selector).type(text)

Use a locator when you need to chain (e.g. type then press key) or target one of multiple elements.

```js
await browser.goto('https://www.google.com');
const searchBox = browser.locator('[name="q"]');
await searchBox.type('CSTesting');
await searchBox.pressKey('Enter');
```

**When multiple elements match:** use `.first()`, `.last()`, or `.nth(index)`:

```js
await browser.locator('input').first().type('hello');
await browser.locator('input').nth(1).type('world');
```

---

### 4. browser.getByAttribute(attr, value).type(text)

Type into an element found by attribute (same locator API).

```js
const input = browser.getByAttribute('name', 'userName');
await input.type('mercury');
```

---

### 5. Page Object (wrap in a class)

Centralize selectors and typing in a page class; use it in tests.

**pages/LoginPage.js:**

```js
class LoginPage {
  constructor(browser) {
    this.browser = browser;
  }
  async typeUsername(value) {
    await this.browser.type('[name="userName"]', value);
  }
  async typePassword(value) {
    await this.browser.type('[name="password"]', value);
  }
  async submit() {
    await this.browser.click('[name="submit"]');
  }
}
module.exports = LoginPage;
```

**Test:**

```js
const { createBrowser, describe, it, beforeAll, afterAll } = require('cstesting');
const LoginPage = require('./pages/LoginPage');

describe('Login', () => {
  let browser, page;
  beforeAll(async () => {
    browser = await createBrowser({ headless: true });
    page = new LoginPage(browser);
  });
  afterAll(async () => await browser.close());

  it('logs in', async () => {
    await browser.goto('https://example.com/login');
    await page.typeUsername('mercury');
    await page.typePassword('secret');
    await page.submit();
  });
});
```

---

**Summary**

| # | Way | Use when |
|---|-----|----------|
| 1 | Config file `label:locator=value:text` | No code; run flows from .conf |
| 2 | `browser.type(selector, text)` | Simple one-off typing |
| 3 | `browser.locator(selector).type(text)` | Chain with pressKey; use .first()/.nth() |
| 4 | `browser.getByAttribute(attr, value).type(text)` | Find by attribute, then type |
| 5 | Page Object method | Reuse and maintain selectors in one place |

---

## Dropdown – ways to handle

CSTesting supports **three ways** to select an option in a `<select>` dropdown:

---

### 1. By visible text (label)

Match the option by the text the user sees. Use when the visible label is stable and you want tests to read clearly.

```js
const { createBrowser } = require('cstesting');
const browser = await createBrowser({ headless: true });
await browser.goto('https://example.com/form');
// Select the option whose visible text is "Europe"
await browser.select('#country', { label: 'Europe' });
await browser.close();
```

**Locator shorthand:** `name="country"` → `[name="country"]`, `id="country"` → `#country`, etc.

---

### 2. By index (0-based)

Select by the position of the option. Use when the order is fixed and you don't care about the exact text or value.

```js
// Select the first option (index 0)
await browser.select('#country', { index: 0 });
// Select the third option (index 2)
await browser.select('#country', { index: 2 });
```

When multiple `<select>` elements match the selector, use a locator with `.first()`, `.last()`, or `.nth(n)`:

```js
await browser.locator('select.region').first().select({ index: 1 });
```

---

### 3. By value

Select by the option’s `value` attribute. Use when the value is stable (e.g. API or backend contract) and may differ from the visible text.

```js
// Select the option with value="uk"
await browser.select('#country', { value: 'uk' });
```

---

### 4. Multi-select dropdown

For `<select multiple>`, pass an **array** of options. The current selection is cleared and replaced with the given set. You can mix label, index, and value in the same call.

```js
// Select multiple options by visible text
await browser.select('#tags', [
  { label: 'JavaScript' },
  { label: 'Testing' },
]);

// Or by value
await browser.select('#tags', [{ value: 'js' }, { value: 'test' }]);

// Or by index (e.g. first and third option)
await browser.select('#tags', [{ index: 0 }, { index: 2 }]);

// Mix: one by label, one by value
await browser.select('#tags', [{ label: 'JavaScript' }, { value: 'e2e' }]);
```

With a locator: `browser.locator('select#tags').select([{ label: 'A' }, { label: 'B' }])`. A single `change` event is dispatched after all options are set.

---

## Checkbox and radio

Use **`check(selector)`** and **`uncheck(selector)`** for `<input type="checkbox">` and `<input type="radio">`. The element must be an `INPUT` with `type` `checkbox` or `radio`; otherwise a clear error is thrown. A `change` and `click` event are dispatched after setting `checked`.

### Checkbox

```js
// Check a checkbox (e.g. "I agree")
await browser.check('#agree');
// or by name
await browser.check('name="terms"');

// Uncheck
await browser.uncheck('#newsletter');

// When multiple match, use a locator
await browser.locator('input[type="checkbox"]').nth(1).check();
```

### Radio button

Select one option in a group by **checking** the radio you want. Other radios with the same `name` are unchecked by the browser.

```js
// Select "Yes"
await browser.check('#choice-yes');
// or by value with a selector that targets that option
await browser.check('input[name="choice"][value="yes"]');

// To switch selection, check another radio (no need to uncheck the previous one)
await browser.check('input[name="choice"][value="no"]');
```

**Note:** `uncheck` on a radio sets that radio to unchecked. Usually you just `check` another radio in the group instead.

### Summary

| Action | Method | Use when |
|--------|--------|----------|
| Check | `browser.check(selector)` | Check a checkbox or select a radio option |
| Uncheck | `browser.uncheck(selector)` | Uncheck a checkbox |
| With locator | `browser.locator(selector).check()` / `.uncheck()` | When multiple elements match (use `.first()`, `.nth(n)`) |

---

## Element state: isVisible, isDisabled, isEditable, isSelected

Use these to assert or branch on element state. All return `Promise<boolean>` and use the same locator rules (strict mode, `.first()`, `.nth(n)`).

### isVisible(selector)

`true` if the element exists and is visible: not `display:none`, not `visibility:hidden`, opacity &gt; 0, and has non-zero width/height.

```js
const visible = await browser.isVisible('#submit');
expect(visible).toBe(true);

// With locator (e.g. when multiple match)
const firstVisible = await browser.locator('.btn').first().isVisible();
```

### isDisabled(selector)

`true` if the element has `disabled === true` (e.g. `<input disabled>`, `<button disabled>`).

```js
const disabled = await browser.isDisabled('#submit');
expect(disabled).toBe(false);
```

### isEditable(selector)

`true` for `<input>` or `<textarea>` that is not disabled and not readonly; also `true` for `contenteditable` elements.

```js
const canEdit = await browser.isEditable('name="email"');
```

### isSelected(selector)

- **Checkbox / radio:** `true` if `checked`.
- **`<option>`:** `true` if that option is selected.
- **`<select>`:** `true` if the select has at least one selected option (`selectedIndex >= 0`).

```js
const checked = await browser.locator('#tuesday').isSelected();
expect(checked).toBe(true);

const hasSelection = await browser.isSelected('#country');
const optionSelected = await browser.locator('#country option[value="uk"]').isSelected();
```

---

**Summary**

| # | Way | Use when |
|---|-----|----------|
| 1 | `browser.select(selector, { label: 'Visible Text' })` | Match by the text shown to the user |
| 2 | `browser.select(selector, { index: 0 })` | Match by 0-based position |
| 3 | `browser.select(selector, { value: 'val' })` | Match by the option’s `value` attribute |
| 4 | `browser.select(selector, [opt1, opt2, ...])` | Multi-select: replace selection with the given options (label/index/value) |

You can also use a locator: `browser.locator('select#country').select({ label: 'Europe' })`. A `change` event is dispatched after selection so any listeners (e.g. dynamic forms) run as in a real browser.

---

## Roadmap (improve after publish)

1. **Browser automation** — Done. CDP-based `browser.goto()`, `click()`, `type()` (no Playwright/Cypress).
2. **DOM / jsdom** — Add optional `cstesting-dom` for testing DOM in Node without a browser.
3. **More browser APIs** — `waitForSelector`, screenshots, multiple tabs.
4. **Reporters** — JSON, JUnit XML, HTML report for CI and dashboards.
5. **Watch mode** — Re-run tests on file changes.
6. **Coverage** — Optional integration with Istanbul/c8.
7. **More matchers** — `toMatchObject`, `toMatch(regex)`, `resolves`/`rejects` for promises.
8. **Timeouts** — Per-test and global timeouts.
9. **Parallel runs** — Run test files in parallel (with care for shared resources).

## Development

From the repo root:

```bash
npm install
npm run build
npm install .          # install this package into node_modules so example can require('cstesting')
npm run test:example   # run example tests
```

## License
Lokesh Gorantla
