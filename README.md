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

Use in code: `const { describe, it, expect, createBrowser, request } = require('cstesting');`

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

### API testing (Rest-Assured style)

Use the same test runner to call HTTP APIs and assert on status, headers, and body (similar to [Rest Assured](https://rest-assured.io/) in Java).

```js
const { describe, it, expect, request } = require('cstesting');

describe('Users API', () => {
  it('GET /users/1 returns 200 and user', async () => {
    await request.get('https://jsonplaceholder.typicode.com/users/1')
      .expectStatus(200)
      .expectHeader('content-type', /json/)
      .expectJson('name', 'Leanne Graham');
  });

  it('POST with body and custom assertions', async () => {
    const res = await request.post('https://jsonplaceholder.typicode.com/posts', { title: 'Foo', body: 'Bar', userId: 1 });
    res.expectStatus(201);
    const apiRes = res.getResponse();
    expect(apiRes.body).toBeDefined();
    expect(apiRes.body.id).toBeGreaterThan(0);
  });

  it('verify only status with one function (all methods)', async () => {
    await request.verifyStatus('GET', 'https://jsonplaceholder.typicode.com/users/1', 200);
    await request.verifyStatus('POST', 'https://jsonplaceholder.typicode.com/posts', 201, { title: 'x', body: 'y', userId: 1 });
    await request.verifyStatus('DELETE', 'https://jsonplaceholder.typicode.com/posts/1', 200);
  });
});
```

- **`request.get(url, options?)`** — GET
- **`request.post(url, body?, options?)`** — POST (body sent as JSON by default)
- **`request.put(url, body?, options?)`** / **`request.patch(url, body?, options?)`** / **`request.delete(url, options?)`**
- **`request.verifyStatus(method, url, expectedStatus, body?, options?)`** — single function for all methods; only verifies status code. Example: `await request.verifyStatus('GET', url, 200);` or `await request.verifyStatus('POST', url, 201, { name: 'x' });`
- **Options:** `{ headers: { 'Authorization': 'Bearer ...' }, timeout: 30000 }`
- **Chain:** `.expectStatus(200)`, `.expectHeader('content-type', /json/)`, `.expectBody({ ... })`, `.expectJson('path', value)` (path: `user.name`, `items[0].id`, or `$.key`)
- **Custom assertions:** `const res = await request.get(url); res.expectStatus(200); const r = res.getResponse(); expect(r.body).toEqual(...);`

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
| `browser.locator(selector)` | Return a locator for actions and state checks. See **Locators** below. |
| `browser.getByAttribute(attribute, attributeValue)` | Return a locator for `[attribute="value"]`. Same strict mode as `locator()`. |
| `browser.frame(iframeSelector)` | Return a **FrameHandle** for an iframe (same-origin). Use `frame.evaluate()`, `frame.click()`, etc. without switching. |
| `browser.pressKey(key)` | Press a key (e.g. `'Enter'`). |
| `browser.waitForLoad()` | Wait for the next page load (e.g. after form submit). |
| `browser.waitForURL(urlOrPattern, options?)` | Wait until the page URL matches (string substring, glob like `'**/login'`, or RegExp). Throws after `timeout` ms (default 30000). |
| `browser.url()` | Current page URL (`window.location.href`). |
| `browser.waitForSelector(selector, options?)` | Wait until selector matches an element (CSS, XPath, `id=`, `name=`). Throws after `timeout` ms (default 30000). |
| `browser.sleep(ms)` or `browser.sleep({ timeout: ms })` | Fixed delay (hard wait) for the given milliseconds. Prefer `waitForSelector` when you can. |
| `browser.isVisible(selector)` | Whether the element is visible (not hidden by display/visibility/opacity, non-zero size). |
| `browser.isDisabled(selector)` | Whether the element is disabled (e.g. `input`, `button`). |
| `browser.isEditable(selector)` | Whether the element is editable (input/textarea not disabled and not readonly). |
| `browser.isSelected(selector)` | For checkbox/radio: whether checked. For `<option>`: whether selected. For `<select>`: whether it has a selected option. |
| `browser.content()` | Return page HTML. |
| `browser.evaluate(expression)` | Run JS in the page and return the value. |
| `browser.setDialogHandler(handler \| null)` | Handle **alert**, **confirm**, **prompt**, and **beforeunload**. See **Dialogs** section. |
| `browser.getTabs()` | List all open tabs: `Promise<{ id, url, title }[]>`. |
| `browser.switchToTab(indexOrId)` | Switch to tab by 0-based index or tab id. All later actions run in that tab. |
| `browser.waitForNewTab(options?)` | Returns a **TabHandle** (page-like) for the new tab. Use `browser` for parent and the handle for the new tab without switching. |
| `browser.close()` | Close the browser. |

---

## Navigations

**Introduction** — CSTesting can navigate to URLs and handle navigations caused by page interactions (e.g. clicking a link or submitting a form).

**Basic navigation** — The simplest form is opening a URL:

```js
await browser.goto('https://example.com');
```

This loads the page and waits for the **load** event. The load event fires when the document and its dependent resources (stylesheets, scripts, iframes, images) have loaded.

**Note** — If the page does a client-side redirect before load, `browser.goto()` waits for the **redirected** page to fire the load event.

**When is the page loaded?** — Modern pages often do more after the load event: they fetch data lazily, hydrate UI, or load extra scripts. There is no single definition of “fully loaded”; it depends on the app. When can you start interacting?

In CSTesting you can interact at any time. Actions **auto-wait** for the target element to become actionable (visible, stable, enabled). You don’t have to add an explicit “wait for page ready” in the general case.

```js
await browser.goto('https://example.com');
await browser.locator('//*[contains(text(),"Example Domain")]').click();  // click auto-waits for the element
```

CSTesting behaves like a fast user: as soon as the element is ready, it acts. You usually don’t need to worry about every resource having loaded.

**Hydration** — Sometimes you’ll see a click or typed text that seems to have no effect (or the text disappears). A common cause is **poor page hydration**: the server sends static HTML, then JavaScript runs and “hydrates” the page. If you interact before hydration finishes, the button may be visible and clickable in the DOM but its listeners aren’t attached yet, so the click does nothing or the input is reset.

A simple check: in Chrome DevTools, enable “Slow 3G” in the Network panel and reload. If clicks are ignored or typed text is cleared, the page likely has a hydration timing issue. The fix is on the app side: disable interactive controls until after hydration, or ensure they are only enabled when the page is fully functional.

**Waiting for navigation** — A click (e.g. submit, link) can trigger a navigation. You can wait for the new page in three ways:

1. **`browser.waitForURL(urlOrPattern, { timeout? })`** — Wait until the page URL matches. Use a substring, a glob like `'**/login'`, or a RegExp.
2. **`browser.waitForLoad()`** — Wait for the next **load** event (full document load after navigation).
3. **`browser.waitForSelector(selector, { timeout })`** — Wait for an element that appears only on the new page (e.g. a login form or a success message).

```js
await browser.locator('//button[text()="Click me"]').click();
await browser.waitForURL('**/login');   // wait until URL contains /login (glob: ** becomes .*)

// Or by substring or RegExp:
await browser.waitForURL('/dashboard');
await browser.waitForURL(/\/login$/);
```

```js
await browser.locator('//button[text()="Submit"]').click();
await browser.waitForLoad();   // wait for the navigated page to load
// or wait for something that only exists on the new page:
await browser.waitForSelector('h1', { timeout: 10000 });
```

**Navigation and loading** — Showing a new document involves **navigation** and **loading**.

- **Navigation** starts when the URL changes or you interact (e.g. click a link). It can fail (e.g. DNS error) or turn into a download. When the response headers are in and session history is updated, the navigation is **committed**; only then does **loading** start.
- **Loading** is receiving the response body, parsing the document, running scripts, and firing events:
  - The page URL is set to the new URL
  - Document content is loaded and parsed
  - `DOMContentLoaded` fires (when the HTML is parsed; scripts may still run)
  - Scripts run and resources (styles, images) load
  - The **load** event fires when the document and its subresources are done

`browser.goto(url)` waits for the **load** event. After a click that navigates, use `browser.waitForURL('**/login')`, `browser.waitForLoad()`, or `waitForSelector` to wait for the new page.

---

## Locators

**Introduction** — Locators are how you find element(s) on the page. Every action (`click`, `type`, `select`, `check`, etc.) and state check (`isVisible`, `isDisabled`, `isSelected`) takes a selector or uses a locator. When you use a locator, the element is resolved at the moment of the action, so if the DOM changes (e.g. re-render), the next action uses the current match.

**Quick guide** — CSTesting supports:

| Use case | How in CSTesting |
|----------|------------------|
| By **role** (e.g. button with text) | XPath: `//button[text()="Sign in"]`, or CSS `button` + `.first()` if needed |
| By **label** (form control) | `name="userName"` (shorthand) or `getByAttribute('name', 'userName')`; for label text use XPath: `//label[contains(.,"Password")]/following-sibling::input` or similar |
| By **placeholder** | `placeholder="name@example.com"` (shorthand) or `getByAttribute('placeholder', '...')` |
| By **text** | XPath: `//*[text()="Welcome"]` or `//*[contains(text(),"Welcome")]` |
| By **alt text** (images) | `getByAttribute('alt', 'logo description')` or `[alt="..."]` |
| By **title** | `getByAttribute('title', '...')` or `[title="..."]` |
| By **test id** | `getByAttribute('data-testid', 'submit-btn')` or `[data-testid="submit-btn"]` |

**Selector shorthand** (for `locator()`, `click()`, `type()`, and all actions):

- `name="userName"` → `[name="userName"]`
- `id="userName"` → `[id="userName"]`
- `class="userName"` → `.userName`
- Any **attribute:** `placeholder="Enter Name"` → `[placeholder="Enter Name"]`
- Anything else → **CSS selector**
- Selector starting with `/` or `(` → **XPath** (e.g. `//button[text()="Sign in"]`, `(//div)[1]`)

**Strict mode** — If the selector matches **0** elements, an error is thrown. If it matches **2 or more**, an error suggests using `.first()`, `.last()`, or `.nth(n)` so the intent is explicit.

**When multiple elements match** — Use a locator and narrow:

- `browser.locator('button').first().click()` — first match
- `browser.locator('button').last().click()` — last match
- `browser.locator('button').nth(1).click()` — second match (0-based)

**Chaining** — You can chain from a frame: `browser.frame('iframe#form').locator('input').type('hello')`. Locators support `.click()`, `.type(text)`, `.select(option)`, `.check()`, `.uncheck()`, `.pressKey(key)`, `.isVisible()`, `.isDisabled()`, `.isEditable()`, `.isSelected()`, `.textContent()`, `.getAttribute(name)`.

**Example** — Locate by label-like attribute, then act:

```js
await browser.getByAttribute('name', 'userName').type('mercury');
await browser.getByAttribute('name', 'password').type('secret');
await browser.locator('//button[text()="Sign in"]').click();
const visible = await browser.locator('//*[contains(text(),"Welcome")]').isVisible();
expect(visible).toBe(true);
```

**Locate by role (button, checkbox, etc.)** — Use XPath or CSS that matches the element and its accessible name:

```js
// Button with exact text
await browser.locator('//button[text()="Sign in"]').click();

// Checkbox with label (match input near label text)
await browser.locator('//label[contains(.,"Subscribe")]//input').check();

// Heading
const heading = await browser.locator('//h3[text()="Sign up"]').textContent();
```

**Locate by placeholder** — Use the shorthand or `getByAttribute`:

```js
await browser.locator('placeholder="name@example.com"').type('user@test.com');
// or
await browser.getByAttribute('placeholder', 'name@example.com').type('user@test.com');
```

**Locate by text** — Use XPath for elements by their text content:

```js
await expect(await browser.locator('//*[contains(text(),"Welcome, John")]').isVisible()).toBe(true);
```

**Locate by test id** — Prefer `data-testid` (or a custom attribute) for stable selectors:

```js
await browser.getByAttribute('data-testid', 'submit-btn').click();
```

---

## Frames

**Introduction** — A page has one main frame; page-level interactions (`click`, `type`, etc.) run in the main frame. A page can have additional frames attached via `<iframe>`. You can get a **frame handle** and interact inside the frame without switching the main page. CSTesting supports **same-origin** iframes only (uses the frame’s `contentDocument`).

**Locate element inside a frame** — Use `browser.frame(iframeSelector).locator(selector)` to get a locator that runs inside the frame, then call `.type()`, `.click()`, etc.:

```js
const frame = browser.frame('.frame-class');   // or iframe[name="frame-login"], iframe#myframe
await frame.locator('[name="userName"]').type('John');
await frame.locator('[name="password"]').type('secret');
await frame.locator('//button[text()="Sign in"]').click();
```

Or use the frame handle’s methods directly with a selector:

```js
await frame.type('[name="userName"]', 'John');
await frame.type('[name="password"]', 'secret');
await frame.click('//button[text()="Sign in"]');
```

**Frame objects** — Get a frame with `browser.frame(selector)`. The selector can target the iframe by **id**, **name**, **class**, or any CSS/XPath:

```js
// By frame’s name attribute
const frame = browser.frame('iframe[name="frame-login"]');
// or XPath: browser.frame('//iframe[@name="frame-login"]')

// By id or class
const frame = browser.frame('iframe#myframe');
const frame = browser.frame('.frame-class');

// Interact inside the frame (same API as page: click, type, locator, evaluate, content, select, check, etc.)
await frame.type('[name="username-input"]', 'John');
await frame.click('button');
```

**Nested frames** — Use `.frame(selector)` on a frame handle to target an iframe inside that frame:

```js
const outer = browser.frame('iframe#outer');
const inner = outer.frame('iframe#inner');
await inner.click('button');
// or in one go: browser.frame('iframe#outer').frame('iframe#inner').click('button');
```

**Late-loading inner frame** — If the inner iframe loads after the page, use `frame.waitForSelector(selector, { timeout })` before interacting:

```js
const inner = browser.frame('iframe#outer').frame('iframe#inner');
await inner.waitForSelector('button', { timeout: 10000 });
await inner.click('button');
```

---

## Dialogs

**Introduction** — CSTesting can interact with JavaScript dialogs: **alert**, **confirm**, **prompt**, and **beforeunload**. Dialogs are handled in the same CDP session (no `switchTo().alert()`). You register a **dialog handler** with `browser.setDialogHandler(handler)` so that when a dialog opens, your handler decides whether to accept or dismiss it (and, for prompt, what text to send).

**alert(), confirm(), prompt()** — By default, all dialogs are **auto-dismissed** (accepted): you don’t have to set a handler. To control the behaviour, register a handler **before** the action that triggers the dialog. The handler receives `{ type, message }` and must return `{ accept: true }` or `{ accept: false }` (and for prompt, optional `promptText`):

```js
browser.setDialogHandler(({ type, message }) => ({ accept: true }));
await browser.locator('//button[text()="Submit"]').click();
```

**Note** — The dialog handler **must** handle the dialog (return accept/dismiss). Dialogs are modal and block page execution until handled. If your handler does not respond (e.g. you only log the message), the action that triggered the dialog will **stall** and never resolve.

**Wrong** — Do not only log and leave the dialog unhandled:

```js
// WRONG: click will hang because the dialog is never accepted/dismissed
browser.setDialogHandler(({ message }) => console.log(message));
await browser.click('button');  // stalls
```

**Correct** — Always return a result:

```js
browser.setDialogHandler(({ type, message }) => ({
  accept: true,
  promptText: type === 'prompt' ? 'my value' : undefined,
}));
```

**Dismiss (Cancel)** — Return `accept: false` to dismiss confirm/prompt:

```js
browser.setDialogHandler(() => ({ accept: false }));
```

**Reset to default** — `browser.setDialogHandler(null)` restores default behaviour (accept all; prompt gets `''`).

**beforeunload** — When the page fires a beforeunload dialog (e.g. on leave), the handler receives `type === 'beforeunload'`. Return `{ accept: true }` to accept or `{ accept: false }` to dismiss:

```js
browser.setDialogHandler(({ type }) => ({
  accept: type !== 'beforeunload',   // dismiss beforeunload, accept others
}));
```

**Print dialogs** — To assert that **window.print()** was triggered (e.g. after clicking “Print”), you can replace `window.print` and then wait for it to be called:

```js
await browser.goto('https://example.com/page-with-print');
// Replace window.print so we can detect when it’s called
await browser.evaluate(`
  window._printCalled = false;
  window.print = () => { window._printCalled = true; };
`);
await browser.locator('//button[text()="Print it!"]').click();
// Poll until print was invoked (or use a short sleep and then check)
const printCalled = await browser.evaluate('window._printCalled');
expect(printCalled).toBe(true);
```

For a more robust wait, poll in a loop with `browser.evaluate('window._printCalled')` and `browser.sleep(100)` until `true` or a timeout.

---

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

**Frames** — Use `browser.frame(iframeSelector)` to get a frame handle; then `frame.click()`, `frame.locator(...).type()`, `frame.evaluate()`, etc. Same-origin iframes only. See the **Frames** section for nested frames and late-loading inner frames.

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

## Multi-language support (Java, Python, C#)

Like Playwright and Selenium, CSTesting can support **multiple programming languages** so teams can write tests in Java, Python, C#, or Node.js with the same concepts and API style.

### How it works (two approaches)

**1. Server + thin clients (recommended first step)**  
- Run the **browser engine** in Node.js (current implementation). Add a small **protocol server** (WebSocket or HTTP) that exposes the same operations: `goto`, `click`, `type`, `select`, `waitForSelector`, `waitForURL`, etc.
- **Java / Python / C#** use thin client libraries that:
  - Start the Node server (or connect to an existing one) and launch Chrome.
  - Send commands (e.g. `{ "method": "goto", "params": { "url": "https://example.com" } }`) and receive results.
- One implementation of CDP and automation logic; all languages share it. Only the **wire protocol** and small client SDKs need to be implemented per language.

**2. API spec + native CDP per language**  
- Publish a **stable API spec** (method names, parameters, behavior) for the browser object.
- Each ecosystem implements the same API using that language’s CDP or WebDriver client:
  - **Java:** e.g. a `cstesting-java` JAR that uses a Java CDP/WebSocket client and implements `browser.goto()`, `browser.click()`, etc.
  - **Python:** a `cstesting-python` package that uses a Python CDP client and the same API.
  - **C#:** a `CSTesting` NuGet package with the same API over CDP in .NET.
- No Node required for those users; each language has a native library. Trade-off: CDP logic and fixes are implemented (and maintained) per language.

### What to build first

- **Phase 1:** Define a **wire protocol** (JSON over WebSocket or HTTP) and add a **server mode** to this repo (e.g. `npx cstesting server --port=9274`). Document the protocol so anyone can implement a client.
- **Phase 2:** Implement thin clients:
  - **Python:** `pip install cstesting` → `from cstesting import create_browser`; under the hood it talks to the Node server.
  - **Java:** Maven/Gradle dependency that starts or connects to the server and exposes the same API.
  - **C#:** NuGet package that does the same for .NET.
- **Phase 3 (optional):** Native CDP implementations in Java/Python/C# for teams that prefer not to run Node at all; keep behavior aligned with the API spec.

See **`docs/multi-language-support.md`** for the protocol and server API. For **publishing the Java client** as a Maven/Gradle dependency (local or Maven Central), see **`docs/publish-java-maven-gradle.md`**. A minimal **Java client** lives in **`CSTesting-Java/`** in this repo, or clone from **[github.com/lokesh771988/CSTesting-Java](https://github.com/lokesh771988/CSTesting-Java)** (build with `mvn compile`; publish with `mvn install` or `mvn deploy`).

---

## Roadmap (improve after publish)

1. **Browser automation** — Done. CDP-based `browser.goto()`, `click()`, `type()` (no Playwright/Cypress).
2. **Multi-language** — Protocol server + thin clients for Java, Python, C# (see **Multi-language support** above).
3. **DOM / jsdom** — Add optional `cstesting-dom` for testing DOM in Node without a browser.
4. **More browser APIs** — Screenshots, more waits; many already added.
5. **Reporters** — JSON, JUnit XML, HTML report for CI and dashboards.
6. **Watch mode** — Re-run tests on file changes.
7. **Coverage** — Optional integration with Istanbul/c8.
8. **More matchers** — `toMatchObject`, `toMatch(regex)`, `resolves`/`rejects` for promises.
9. **Timeouts** — Per-test and global timeouts.
10. **Parallel runs** — Run test files in parallel (with care for shared resources).

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
