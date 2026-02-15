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
| `browser.locator(selector)` | Return a locator; then use `.click()`, `.type(text)`, `.pressKey(key)`. Supports shorthand and **strict mode** (see below). |
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

Example: `browser.locator('input').first().type('hello')`, or `browser.getByAttribute('class', 'btn').nth(2).click()`
| `browser.waitForLoad()` | Wait for the next page load (e.g. after form submit). |
| `browser.waitForSelector(selector, options?)` | Wait until selector matches an element (CSS, XPath, `id=`, `name=`). Throws after `timeout` ms (default 30000). |
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
