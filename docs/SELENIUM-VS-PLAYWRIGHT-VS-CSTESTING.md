# Selenium vs Playwright vs CSTesting — Comparison for LinkedIn & YouTube

Use this document for your video and LinkedIn post: same scenario in all three tools, comparison table, and ready-to-use text.

---

## 1. Quick comparison table

| Feature | Selenium | Playwright | **CSTesting** |
|--------|----------|------------|----------------|
| **Browser** | Chrome, Firefox, Safari, Edge | Chromium, Firefox, WebKit | Chrome (CDP, no Playwright) |
| **Install size** | Large (browser drivers, JARs) | Medium (bundled browsers) | **Small** (Node only + Chrome) |
| **Config-driven tests** | No (code only) | No (code only) | **Yes — .conf files** |
| **Record & export** | IDE / 3rd party | Built-in codegen | **Built-in** → .conf, .js, .ts |
| **Syntax** | Verbose (WebDriver API) | Modern async/await | **Config or JS/TS** |
| **Assertions** | Assert lib of choice | expect() built-in | **expect()** + config asserts |
| **Frames** | switchTo().frame() | frameLocator() | **frame=selector** or API |
| **Dialogs** | Alert API | page.on('dialog') | **dialog=accept/dismiss/prompt** |
| **Tabs** | getWindowHandles, switchTo | page.context().pages | **switchTab=N** |
| **Report** | Depends on runner | HTML / trace | **HTML report** (per step) |
| **Learning curve** | Steep (concepts + API) | Medium | **Low** (config) or medium (JS) |

---

## 2. Same scenario: “Login form + assert text”

**Scenario:** Open a page, fill username and password, click Submit, then assert that a message appears.

---

### 2.1 Selenium (Java example)

```java
// Selenium + JUnit — Java
// Requires: WebDriver, ChromeDriver, JUnit on classpath

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.junit.Test;
import org.junit.Assert;
import java.time.Duration;

public class LoginTest {
    WebDriver driver;

    @Before
    public void setUp() {
        System.setProperty("webdriver.chrome.driver", "/path/to/chromedriver");
        driver = new ChromeDriver();
    }

    @Test
    public void loginAndAssertMessage() {
        driver.get("https://example.com/login");
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));

        driver.findElement(By.id("username")).sendKeys("user@test.com");
        driver.findElement(By.id("password")).sendKeys("secret");
        driver.findElement(By.cssSelector("button[type='submit']")).click();

        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        String message = wait.until(ExpectedConditions
            .visibilityOfElementLocated(By.id("message"))).getText();
        Assert.assertEquals("Welcome back!", message);
    }

    @After
    public void tearDown() {
        driver.quit();
    }
}
```

**Selenium (Node.js):**

```javascript
// Selenium WebDriver — Node.js
// npm install selenium-webdriver

const { Builder, By, until } = require('selenium-webdriver');

(async function () {
  const driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.get('https://example.com/login');
    await driver.findElement(By.id('username')).sendKeys('user@test.com');
    await driver.findElement(By.id('password')).sendKeys('secret');
    await driver.findElement(By.cssSelector('button[type="submit"]')).click();
    const el = await driver.wait(until.elementLocated(By.id('message')), 10000);
    const message = await el.getText();
    if (message !== 'Welcome back!') throw new Error(`Expected "Welcome back!", got "${message}"`);
  } finally {
    await driver.quit();
  }
})();
```

---

### 2.2 Playwright (Node.js)

```javascript
// Playwright — Node.js
// npm install @playwright/test

const { test, expect } = require('@playwright/test');

test('login and assert message', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.locator('#username').fill('user@test.com');
  await page.locator('#password').fill('secret');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('#message')).toHaveText('Welcome back!');
});
```

---

### 2.3 CSTesting — Option A: Config file (no code)

```conf
# login.conf — config-driven, no JavaScript
# Run: npx cstesting login.conf

headless=false
goto:https://example.com/login
name:#username=value:user@test.com
name:#password=value:secret
click=button[type="submit"]
assertText=#message=Welcome back!
```

**Run:** `npx cstesting login.conf`  
**Report:** HTML report with one test case and step-by-step pass/fail.

---

### 2.4 CSTesting — Option B: JavaScript (like Playwright)

```javascript
// login.test.js — same style as Playwright
// Run: npx cstesting login.test.js

const { describe, it, expect, beforeAll, afterAll } = require('cstesting');

describe('Login', () => {
  let browser;

  beforeAll(async () => {
    browser = await require('cstesting').createBrowser({ headless: false });
  });
  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('fills form and asserts message', async () => {
    await browser.goto('https://example.com/login');
    await browser.locator('#username').type('user@test.com');
    await browser.locator('#password').type('secret');
    await browser.locator('button[type="submit"]').click();
    const text = await browser.locator('#message').textContent();
    expect(text).toContain('Welcome back!');
  });
});
```

---

## 3. Recording (codegen) comparison

| Tool | Command | Output |
|------|--------|--------|
| **Selenium** | Selenium IDE (browser extension) or 3rd party | Often IDE format or export to code (varies) |
| **Playwright** | `npx playwright codegen https://example.com` | JS/TS only |
| **CSTesting** | `npx cstesting record https://example.com` | **.conf, .js, or .ts** (config + code) |

**CSTesting record example:**

```bash
npx cstesting record https://example.com/login --output login.conf
# Interact in browser; press Ctrl+C to stop. Opens two windows: browser + live script.
```

Recorded config can be run as-is: `npx cstesting login.conf`.

---

## 4. Pros and cons (short)

**Selenium**  
- Pros: Multi-browser, multi-language, huge ecosystem, industry standard.  
- Cons: Verbose API, no native config-driven tests, driver/version management, no built-in codegen in Node.

**Playwright**  
- Pros: Fast, auto-waiting, trace, multi-browser, good docs.  
- Cons: Heavier install, code-only (no config files), no “edit a text file” flow for non-devs.

**CSTesting**  
- Pros: **Config-driven tests** (.conf), **record to .conf / .js / .ts**, small footprint (Chrome + Node), same describe/it/expect as Jest, HTML report.  
- Cons: Chrome-only today, smaller ecosystem than Selenium/Playwright.

---

## 5. When to use which (one-liners for video)

- **Selenium:** When you need multiple browsers (including Safari/Edge) or a specific language (Java, Python, C#) and are fine writing and maintaining code.
- **Playwright:** When you want a modern, fast, code-first framework with great DX and built-in codegen (JS/TS).
- **CSTesting:** When you want **config-driven tests** (edit a .conf and run), **record once and get both config and code**, or a **lightweight** Node + Chrome setup without Playwright’s install size.

---

## 6. Text for your YouTube video description

```text
Selenium vs Playwright vs CSTesting — Which one to choose?

In this video we compare three ways to automate the browser:
• Selenium — the classic, multi-browser, multi-language standard
• Playwright — modern, fast, great developer experience
• CSTesting — config-driven tests + record to .conf/.js/.ts, lightweight

Same login + assert scenario in all three, with real code. You’ll see:
- How much code (or how little) each tool needs
- Config-driven tests only in CSTesting (no code for simple flows)
- Recording (codegen): Selenium IDE vs Playwright codegen vs CSTesting record

CSTesting: https://www.npmjs.com/package/cstesting
Install: npm install cstesting
Record: npx cstesting record https://example.com
Run config: npx cstesting login.conf
```

---

## 7. Text for your LinkedIn post (short)

```text
Selenium vs Playwright vs CSTesting — quick comparison 🧪

Same scenario (login form + assert): 
• Selenium: classic API, more boilerplate, multi-browser
• Playwright: modern, fast, great DX, codegen
• CSTesting: config-driven tests (.conf) + record to .conf/.js/.ts — no code needed for simple flows

Why I built CSTesting: to run full flows from a simple config file and record actions into that same format. One command to record, one to run — no driver management, minimal setup.

Try it: npm install cstesting && npx cstesting record https://example.com

#TestAutomation #Selenium #Playwright #JavaScript #QA
```

---

## 8. Text for LinkedIn post (longer, with example)

```text
Selenium vs Playwright vs CSTesting — same test, three ways

I compared three tools with the same scenario: open a login page, fill username and password, click Submit, assert a message.

1️⃣ Selenium (Java/Node)
   • Mature, multi-browser, multi-language
   • More code: explicit waits, findElement, getText
   • You manage drivers and dependencies

2️⃣ Playwright (Node)
   • Modern API, auto-waiting, built-in codegen
   • Less code, great for developers
   • Code-only; no “config file” mode

3️⃣ CSTesting (Node)
   • Config-driven: the same flow can be a short .conf file (no JavaScript)
   • Record in the browser → export to .conf, .js, or .ts
   • Lightweight: Chrome + Node, no Playwright runtime

Example — the whole test as a config file (CSTesting):

  headless=false
  goto:https://example.com/login
  name:#username=value:user@test.com
  name:#password=value:secret
  click=button[type="submit"]
  assertText=#message=Welcome back!

Run: npx cstesting login.conf

If you want config-driven tests or a minimal setup for Chrome automation, CSTesting is worth a look: https://www.npmjs.com/package/cstesting

#TestAutomation #Selenium #Playwright #QA #JavaScript
```

---

## 9. One more example: alerts and checkboxes (CSTesting config)

```conf
# Alerts and checkboxes — CSTesting
# Run: npx cstesting run this.conf

headless=false
goto:https://testautomationpractice.blogspot.com/
check=#monday
dialog=accept
click=#confirmBtn
assertText=#demo=You pressed OK!
```

This shows: **checkbox**, **dialog=accept** (for confirm), **assertText** — all in a few lines of config.

---

You can copy the code blocks and the LinkedIn/YouTube text directly into your video and posts. If you want, we can add a second scenario (e.g. frames or tabs) in the same style.
