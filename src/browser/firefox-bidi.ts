/**
 * Firefox via WebDriver BiDi (CSTesting). Use when browser is 'firefox'.
 * Requires optional dependency; see CSTesting docs.
 */

import type { BrowserApi, LocatorApi, FrameHandle, TabInfo, SelectOptionOrOptions } from './index';
import type { Locator, Page, FrameLocator } from 'playwright';

function getSelectOption(value: SelectOptionOrOptions): string | { value?: string; label?: string } {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length > 0 ? (typeof value[0] === 'string' ? value[0] : { value: (value[0] as { value?: string }).value, label: (value[0] as { label?: string }).label }) : '';
  return value as { value?: string; label?: string };
}

function makeLocatorApi(loc: Locator, page: Page): LocatorApi {
  return {
    click: () => loc.click(),
    doubleClick: () => loc.dblclick(),
    rightClick: () => loc.click({ button: 'right' }),
    hover: () => loc.hover(),
    dragTo: (targetSelector: string) => loc.dragTo(page.locator(targetSelector)),
    type: (text: string) => loc.fill(text),
    select: (option: SelectOptionOrOptions) => {
      const o = getSelectOption(option);
      return typeof o === 'string' ? loc.selectOption(o) : loc.selectOption(o);
    },
    check: () => loc.check(),
    uncheck: () => loc.uncheck(),
    pressKey: (key: string) => loc.press(key),
    textContent: () => loc.textContent().then((s: string | null) => s ?? ''),
    getAttribute: (name: string) => loc.getAttribute(name).then((s: string | null) => s ?? ''),
    isVisible: () => loc.isVisible(),
    isDisabled: () => loc.evaluate((el: Element) => (el as HTMLInputElement).disabled),
    isEditable: () =>
      loc.evaluate((el: Element) => {
        const e = el as HTMLInputElement;
        return e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && e.type !== 'hidden' && !e.disabled && !e.readOnly);
      }),
    isSelected: () =>
      loc.evaluate((el: Element) => {
        const e = el as HTMLInputElement & HTMLOptionElement;
        if (e.tagName === 'OPTION') return e.selected;
        return e.checked ?? false;
      }),
    screenshot: (opts) => loc.screenshot({ path: opts?.path, type: opts?.format ?? 'png' }).then((b: Buffer) => b),
    first: () => makeLocatorApi(loc.first(), page),
    last: () => makeLocatorApi(loc.last(), page),
    nth: (index: number) => makeLocatorApi(loc.nth(index), page),
  };
}

function makeFrameHandle(frameLoc: FrameLocator, page: Page): FrameHandle {
  return {
    frame: (iframeSelector: string) => makeFrameHandle(frameLoc.frameLocator(iframeSelector), page),
    waitForSelector: (selector: string, options?) => frameLoc.locator(selector).waitFor({ timeout: options?.timeout ?? 30000 }).then(() => {}),
    evaluate: <T>(expression: string) => page.evaluate(expression) as Promise<T>,
    content: () => page.content(),
    click: (selector: string) => frameLoc.locator(selector).click(),
    doubleClick: (selector: string) => frameLoc.locator(selector).dblclick(),
    rightClick: (selector: string) => frameLoc.locator(selector).click({ button: 'right' }),
    hover: (selector: string) => frameLoc.locator(selector).hover(),
    dragAndDrop: (src, tgt) => frameLoc.locator(src).dragTo(frameLoc.locator(tgt)),
    type: (selector: string, text: string) => frameLoc.locator(selector).fill(text),
    select: (selector: string, option: SelectOptionOrOptions) => {
      const o = getSelectOption(option);
      const loc = frameLoc.locator(selector);
      return typeof o === 'string' ? loc.selectOption(o) : loc.selectOption(o);
    },
    check: (selector: string) => frameLoc.locator(selector).check(),
    uncheck: (selector: string) => frameLoc.locator(selector).uncheck(),
    locator: (selector: string) => makeLocatorApi(frameLoc.locator(selector), page),
    getByAttribute: (attr: string, value: string) => makeLocatorApi(frameLoc.locator(`[${attr}="${value}"]`), page),
    getTextContent: (selector: string) => frameLoc.locator(selector).textContent().then((s: string | null) => s ?? ''),
    getAttribute: (selector: string, attrName: string) => frameLoc.locator(selector).getAttribute(attrName).then((s: string | null) => s ?? ''),
    isVisible: (selector: string) => frameLoc.locator(selector).isVisible(),
    isDisabled: (selector: string) => frameLoc.locator(selector).evaluate((el: Element) => (el as HTMLInputElement).disabled),
    isEditable: (selector: string) =>
      frameLoc.locator(selector).evaluate((el: Element) => {
        const e = el as HTMLInputElement;
        return e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !e.disabled && !e.readOnly);
      }),
    isSelected: (selector: string) => frameLoc.locator(selector).evaluate((el: Element) => (el as HTMLInputElement).checked ?? false),
  };
}

/**
 * Create a browser using Firefox (WebDriver BiDi). Requires optional dependency; see CSTesting docs.
 */
export async function createBrowserWithFirefoxBiDi(options: {
  headless?: boolean;
}): Promise<BrowserApi> {
  let pkg: { firefox: { launch: (opts?: { headless?: boolean }) => Promise<import('playwright').Browser> } };
  try {
    pkg = await import('playwright');
  } catch {
    throw new Error(
      'Firefox (BiDi) requires the optional CSTesting browser engine. See CSTesting docs to install.'
    );
  }
  const browser = await pkg.firefox.launch({ headless: options.headless ?? true });
  const context = await browser.newContext();
  let pages = await context.pages();
  let currentPageIndex = 0;
  if (pages.length === 0) {
    const p = await context.newPage();
    pages = [p];
  }
  let currentPage = pages[currentPageIndex];
  let dialogHandler: ((params: { type: string; message: string }) => { accept: boolean; promptText?: string } | Promise<{ accept: boolean; promptText?: string }>) | null = null;

  currentPage.on('dialog', async (dialog) => {
    const type = dialog.type();
    const message = dialog.message();
    const raw = dialogHandler ? dialogHandler({ type, message }) : { accept: true, promptText: '' };
    const result = raw && typeof (raw as Promise<unknown>).then === 'function' ? await (raw as Promise<{ accept: boolean; promptText?: string }>) : (raw as { accept: boolean; promptText?: string });
    if (result.accept) {
      if (type === 'prompt' && result.promptText !== undefined) await dialog.accept(result.promptText);
      else await dialog.accept();
    } else await dialog.dismiss();
  });

  const api: BrowserApi = {
    goto: (url: string) => currentPage.goto(url).then(() => undefined),
    click: (selector: string) => currentPage.click(selector),
    doubleClick: (selector: string) => currentPage.dblclick(selector),
    rightClick: (selector: string) => currentPage.click(selector, { button: 'right' }),
    hover: (selector: string) => currentPage.hover(selector),
    dragAndDrop: (src, tgt) => currentPage.dragAndDrop(src, tgt),
    type: (selector: string, text: string) => currentPage.fill(selector, text),
    select: (selector: string, option: SelectOptionOrOptions) => {
      const o = getSelectOption(option);
      return typeof o === 'string' ? currentPage.selectOption(selector, o) : currentPage.selectOption(selector, o);
    },
    check: (selector: string) => currentPage.check(selector),
    uncheck: (selector: string) => currentPage.uncheck(selector),
    pressKey: (key: string) => currentPage.keyboard.press(key),
    locator: (selector: string) => makeLocatorApi(currentPage.locator(selector), currentPage),
    getByAttribute: (attr: string, value: string) => makeLocatorApi(currentPage.locator(`[${attr}="${value}"]`), currentPage),
    frame: (iframeSelector: string) => makeFrameHandle(currentPage.frameLocator(iframeSelector), currentPage),
    waitForLoad: () => currentPage.waitForLoadState('load'),
    waitForSelector: (selector: string, opts?) => currentPage.waitForSelector(selector, { timeout: opts?.timeout ?? 30000 }).then(() => {}),
    waitForURL: async (urlOrPattern, opts?) => {
      const timeout = opts?.timeout ?? 10000;
      await currentPage.waitForURL(typeof urlOrPattern === 'string' ? urlOrPattern : new RegExp(String(urlOrPattern)), { timeout });
    },
    url: () => Promise.resolve(currentPage.url()),
    sleep: (ms) => currentPage.waitForTimeout(typeof ms === 'object' ? ms.timeout : ms),
    isVisible: (selector: string) => currentPage.isVisible(selector),
    isDisabled: (selector: string) => currentPage.locator(selector).evaluate((el: Element) => (el as HTMLInputElement).disabled),
    isEditable: (selector: string) =>
      currentPage.locator(selector).evaluate((el: Element) => {
        const e = el as HTMLInputElement;
        return e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !e.disabled && !e.readOnly);
      }),
    isSelected: (selector: string) => currentPage.locator(selector).evaluate((el: Element) => (el as HTMLInputElement).checked ?? false),
    getScreenshot: async (opts) => {
      const buf = await currentPage.screenshot({
        path: opts?.path,
        fullPage: opts?.fullPage,
        type: (opts?.format as 'png' | 'jpeg') ?? 'png',
        quality: opts?.quality,
        ...(opts?.selector ? { selector: opts.selector } : {}),
      });
      return Buffer.from(buf ?? []);
    },
    content: () => currentPage.content(),
    evaluate: <T>(expression: string) => currentPage.evaluate(expression) as Promise<T>,
    setDialogHandler: (handler) => {
      dialogHandler = handler;
    },
    getTabs: async () => {
      pages = context.pages();
      return Promise.all(
        pages.map(async (p: Page, i: number) => ({ id: String(i), url: p.url(), title: await p.title() }))
      );
    },
    switchToTab: async (indexOrId: number | string) => {
      pages = context.pages();
      const idx = typeof indexOrId === 'string' ? parseInt(indexOrId, 10) : indexOrId;
      if (idx >= 0 && idx < pages.length) {
        currentPageIndex = idx;
        currentPage = pages[idx];
      }
    },
    waitForNewTab: async (opts?) => {
      const timeout = opts?.timeout ?? 10000;
      const startCount = context.pages().length;
      const newPage = await Promise.race([
        (async () => {
          while (context.pages().length <= startCount) {
            await currentPage.waitForTimeout(200);
          }
          const pagesNow = context.pages();
          return pagesNow[pagesNow.length - 1];
        })(),
        currentPage.waitForTimeout(timeout).then(() => { throw new Error('Timeout waiting for new tab'); }),
      ]);
      pages = context.pages();
      const i = pages.indexOf(newPage);
      if (i >= 0) currentPageIndex = i;
      currentPage = newPage;
      return {} as import('./index').TabHandle;
    },
    close: async () => { await browser.close(); },
  };
  return api;
}
