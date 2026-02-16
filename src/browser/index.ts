/**
 * CSTesting Browser — CDP-based automation (no Playwright/Cypress).
 * Uses Chrome DevTools Protocol via chrome-remote-interface + chrome-launcher.
 */

import * as http from 'http';
import CDP from 'chrome-remote-interface';
import { launchChrome, type LaunchOptions, type LaunchedChrome } from './launch';
import { createPage, type PageApi } from './cdp-page';
import type { CDPClient, DialogHandler } from './cdp-page';
import {
  setupDialogHandler,
  buildFrameEvalExpression,
  buildFrameElementCenterExpression,
  buildFrameContentExpression,
  buildFrameTextContentExpression,
  buildFrameGetAttributeExpression,
  buildFrameWaitForSelectorExpression,
  buildFrameSelectOptionExpression,
  buildFrameCheckUncheckExpression,
  buildFrameIsVisibleExpression,
  buildFrameIsDisabledExpression,
  buildFrameIsEditableExpression,
  buildFrameIsSelectedExpression,
  throwLocatorError,
} from './cdp-page';
import type { LocatorIndex, SelectOption, SelectOptionOrOptions } from './cdp-page';

/** Info for one browser tab (page target). */
export interface TabInfo {
  id: string;
  url: string;
  title: string;
}

/**
 * Playwright-style handle for an iframe. Use without switching the main page.
 * Same-origin iframes only (uses contentDocument). Same API as page: evaluate, content, click, type, locator, etc.
 * Use .frame(selector) for nested frames (iframe inside another iframe).
 */
export interface FrameHandle {
  /** Get a nested frame (iframe inside this frame). */
  frame(iframeSelector: string): FrameHandle;
  /** Wait until the frame is ready and selector matches inside it (for late-loading inner frames). Throws after timeout ms. */
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  content(): Promise<string>;
  click(selector: string, index?: LocatorIndex): Promise<void>;
  doubleClick(selector: string, index?: LocatorIndex): Promise<void>;
  rightClick(selector: string, index?: LocatorIndex): Promise<void>;
  hover(selector: string, index?: LocatorIndex): Promise<void>;
  dragAndDrop(sourceSelector: string, targetSelector: string, sourceIndex?: LocatorIndex, targetIndex?: LocatorIndex): Promise<void>;
  type(selector: string, text: string, index?: LocatorIndex): Promise<void>;
  /** Select option(s) in a <select>. Single option or array for multi-select (replaces current selection). */
  select(selector: string, option: SelectOptionOrOptions, index?: LocatorIndex): Promise<void>;
  /** Check a checkbox or radio button. */
  check(selector: string, index?: LocatorIndex): Promise<void>;
  /** Uncheck a checkbox. */
  uncheck(selector: string, index?: LocatorIndex): Promise<void>;
  locator(selector: string): LocatorApi;
  getByAttribute(attribute: string, attributeValue: string): LocatorApi;
  getTextContent(selector: string, index?: LocatorIndex): Promise<string>;
  /** Get attribute value of element in frame (e.g. getAttribute('input', 'value')). Returns '' if missing. */
  getAttribute(selector: string, attributeName: string, index?: LocatorIndex): Promise<string>;
  isVisible(selector: string, index?: LocatorIndex): Promise<boolean>;
  isDisabled(selector: string, index?: LocatorIndex): Promise<boolean>;
  isEditable(selector: string, index?: LocatorIndex): Promise<boolean>;
  isSelected(selector: string, index?: LocatorIndex): Promise<boolean>;
}

/**
 * Playwright-style handle for a specific tab. Use it without switching the main browser.
 * Same API as browser (goto, click, type, locator, evaluate, etc.); .close() only closes this tab's connection.
 */
export interface TabHandle {
  id: string;
  url: string;
  title: string;
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  rightClick(selector: string): Promise<void>;
  hover(selector: string): Promise<void>;
  dragAndDrop(sourceSelector: string, targetSelector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  /** Select option(s) in a <select>. Single option or array for multi-select. */
  select(selector: string, option: SelectOptionOrOptions): Promise<void>;
  check(selector: string): Promise<void>;
  uncheck(selector: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  locator(selector: string): LocatorApi;
  getByAttribute(attribute: string, attributeValue: string): LocatorApi;
  waitForLoad(): Promise<void>;
  /** Fixed delay (hard wait) for the given milliseconds. */
  sleep(msOrOptions: number | { timeout: number }): Promise<void>;
  content(): Promise<string>;
  evaluate<T>(expression: string): Promise<T>;
  isVisible(selector: string): Promise<boolean>;
  isDisabled(selector: string): Promise<boolean>;
  isEditable(selector: string): Promise<boolean>;
  isSelected(selector: string): Promise<boolean>;
  /** Close only this tab's connection (does not close the browser). */
  close(): Promise<void>;
}

function fetchTabsList(port: number, host: string): Promise<TabInfo[]> {
  return new Promise((resolve, reject) => {
    const path = '/json/list';
    const req = http.get(
      { host, port, path, timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const list = JSON.parse(data) as Array<{ id: string; type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string }>;
            const tabs = list
              .filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
              .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '' }));
            resolve(tabs);
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout fetching tabs list'));
    });
  });
}

/** Locator: chain actions. Use .first(), .last(), .nth(n) when selector matches multiple elements. */
export interface LocatorApi {
  click(): Promise<void>;
  doubleClick(): Promise<void>;
  rightClick(): Promise<void>;
  hover(): Promise<void>;
  /** Drag this element to the element matching targetSelector. */
  dragTo(targetSelector: string): Promise<void>;
  type(text: string): Promise<void>;
  /** Select option(s) in this <select>. Single option or array for multi-select. */
  select(option: SelectOptionOrOptions): Promise<void>;
  /** Check this checkbox or radio button. */
  check(): Promise<void>;
  /** Uncheck this checkbox. */
  uncheck(): Promise<void>;
  pressKey(key: string): Promise<void>;
  /** Get the text content of the matched element (same strict/index rules as click/type). */
  textContent(): Promise<string>;
  /** Get the value of an attribute (e.g. getAttribute('value')). Returns '' if attribute is missing. */
  getAttribute(attributeName: string): Promise<string>;
  /** Whether the element is visible (not hidden by CSS). */
  isVisible(): Promise<boolean>;
  /** Whether the element is disabled. */
  isDisabled(): Promise<boolean>;
  /** Whether the element is editable (input/textarea not disabled and not readonly). */
  isEditable(): Promise<boolean>;
  /** Whether checkbox/radio is checked, option is selected, or select has a selection. */
  isSelected(): Promise<boolean>;
  /** Use the first matching element (when multiple match). */
  first(): LocatorApi;
  /** Use the last matching element. */
  last(): LocatorApi;
  /** Use the nth matching element (0-based index). */
  nth(index: number): LocatorApi;
}

export interface BrowserApi {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  rightClick(selector: string): Promise<void>;
  hover(selector: string): Promise<void>;
  dragAndDrop(sourceSelector: string, targetSelector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  /** Select option(s) in a <select>. Single option or array for multi-select (replaces current selection). */
  select(selector: string, option: SelectOptionOrOptions): Promise<void>;
  /** Check a checkbox or radio button. */
  check(selector: string): Promise<void>;
  /** Uncheck a checkbox. */
  uncheck(selector: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  /** Get a locator for a selector — then use .click(), .type(text), .pressKey(key) on it. */
  locator(selector: string): LocatorApi;
  /** Get a locator by attribute and value — same strict mode (fails if 0 or 2+ elements). */
  getByAttribute(attribute: string, attributeValue: string): LocatorApi;
  /** Get a frame/iframe handle (same-origin). Use frame.evaluate(), frame.click(), etc. without switching. */
  frame(iframeSelector: string): FrameHandle;
  waitForLoad(): Promise<void>;
  /** Wait until selector matches an element (CSS, XPath, id=, name=). Throws after timeout ms (default 30000). */
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  /** Fixed delay (hard wait) for the given milliseconds. Use sparingly; prefer waitForSelector when possible. */
  sleep(msOrOptions: number | { timeout: number }): Promise<void>;
  /** Whether the matched element is visible. */
  isVisible(selector: string): Promise<boolean>;
  /** Whether the matched element is disabled. */
  isDisabled(selector: string): Promise<boolean>;
  /** Whether the matched element is editable. */
  isEditable(selector: string): Promise<boolean>;
  /** Whether checkbox/radio is checked, option selected, or select has a selection. */
  isSelected(selector: string): Promise<boolean>;
  content(): Promise<string>;
  evaluate<T>(expression: string): Promise<T>;
  /**
   * Set how to handle JavaScript dialogs (alert, confirm, prompt) without switching.
   * Handler receives { type, message } and returns { accept, promptText? }.
   * By default all dialogs are accepted (prompt gets '').
   */
  setDialogHandler(handler: DialogHandler | null): void;
  /** List all open tabs (page targets). */
  getTabs(): Promise<TabInfo[]>;
  /** Switch to tab by 0-based index or by tab id. All subsequent actions run in that tab. */
  switchToTab(indexOrId: number | string): Promise<void>;
  /**
   * Wait for a new tab to appear (e.g. after click on target="_blank").
   * Returns a TabHandle so you can use parent (browser) and new tab in parallel without switching.
   * Use with Promise.all like Playwright: const [newTab] = await Promise.all([browser.waitForNewTab(), browser.click(...)]).
   */
  waitForNewTab(options?: { timeout?: number }): Promise<TabHandle>;
  close(): Promise<void>;
}

export interface WaitForNewTabOptions {
  /** Max ms to wait (default 10000). */
  timeout?: number;
}

/** Callback invoked for each browser action so tests can record steps for the report (e.g. onStep: (msg) => step(msg)). */
export type StepReporter = (message: string) => void;

export interface CreateBrowserOptions extends LaunchOptions {
  /** Connect to existing Chrome on port instead of launching. */
  port?: number;
  /** Called for each action (goto, click, frame, waitForSelector, etc.) so you can pass step() to record in the report. */
  onStep?: StepReporter;
}

/**
 * Launch a new Chrome (or connect to existing port) and return a browser API.
 * Example:
 *   const browser = await createBrowser({ headless: true });
 *   await browser.goto('https://example.com');
 *   await browser.click('a');
 *   await browser.close();
 */
export async function createBrowser(options: CreateBrowserOptions = {}): Promise<BrowserApi> {
  let launched: LaunchedChrome | null = null;
  let port = options.port;

  if (port == null || port === 0) {
    launched = await launchChrome({
      headless: options.headless,
      port: options.port,
      args: options.args,
      userDataDir: options.userDataDir,
    });
    port = launched.port;
  }
  const debugPort: number = port as number;

  const host = 'localhost';
  let client = (await CDP({ port: debugPort, host })) as unknown as CDPClient;
  await client.Page.enable();
  let dialogHandler: DialogHandler | null = null;
  setupDialogHandler(client, () => dialogHandler);
  let page = createPage(client);
  const onStep = options.onStep;

  function createLocator(selector: string, index?: LocatorIndex): LocatorApi {
    return {
      click: async () => {
        onStep?.(`Click ${selector}`);
        return page.click(selector, index);
      },
      doubleClick: async () => {
        onStep?.(`Double click ${selector}`);
        return page.doubleClick(selector, index);
      },
      rightClick: async () => {
        onStep?.(`Right click ${selector}`);
        return page.rightClick(selector, index);
      },
      hover: async () => {
        onStep?.(`Hover ${selector}`);
        return page.hover(selector, index);
      },
      dragTo: async (targetSelector: string) => {
        onStep?.(`Drag ${selector} to ${targetSelector}`);
        return page.dragAndDrop(selector, targetSelector, index);
      },
      type: async (text: string) => {
        onStep?.(`Type in ${selector}`);
        return page.type(selector, text, index);
      },
      select: async (option: SelectOptionOrOptions) => {
        onStep?.(`Select in ${selector}`);
        return page.select(selector, option, index);
      },
      check: async () => {
        onStep?.(`Check ${selector}`);
        return page.check(selector, index);
      },
      uncheck: async () => {
        onStep?.(`Uncheck ${selector}`);
        return page.uncheck(selector, index);
      },
      pressKey: (key: string) => page.pressKey(key),
      textContent: async () => {
        onStep?.(`Get textContent ${selector}`);
        return page.getTextContent(selector, index);
      },
      getAttribute: async (attributeName: string) => {
        onStep?.(`Get attribute ${attributeName} of ${selector}`);
        return page.getAttribute(selector, attributeName, index);
      },
      isVisible: () => page.isVisible(selector, index),
      isDisabled: () => page.isDisabled(selector, index),
      isEditable: () => page.isEditable(selector, index),
      isSelected: () => page.isSelected(selector, index),
      first: () => createLocator(selector, 'first'),
      last: () => createLocator(selector, 'last'),
      nth: (n: number) => createLocator(selector, n),
    };
  }

  function getByAttribute(attribute: string, attributeValue: string): LocatorApi {
    const escaped = attributeValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const selector = `[${attribute}="${escaped}"]`;
    return createLocator(selector);
  }

  async function createTabHandle(tabInfo: TabInfo): Promise<TabHandle> {
    const tabClient = (await CDP({ port: debugPort, host, target: tabInfo.id } as Record<string, unknown>)) as unknown as CDPClient;
    await tabClient.Page.enable();
    setupDialogHandler(tabClient, () => dialogHandler);
    const tabPage = createPage(tabClient);
    function tabCreateLocator(selector: string, index?: LocatorIndex): LocatorApi {
      return {
        click: () => tabPage.click(selector, index),
        doubleClick: () => tabPage.doubleClick(selector, index),
        rightClick: () => tabPage.rightClick(selector, index),
        hover: () => tabPage.hover(selector, index),
        dragTo: (targetSelector: string) => tabPage.dragAndDrop(selector, targetSelector, index),
        type: (text: string) => tabPage.type(selector, text, index),
        select: (option: SelectOptionOrOptions) => tabPage.select(selector, option, index),
        check: () => tabPage.check(selector, index),
        uncheck: () => tabPage.uncheck(selector, index),
        pressKey: (key: string) => tabPage.pressKey(key),
        textContent: () => tabPage.getTextContent(selector, index),
        getAttribute: (attributeName: string) => tabPage.getAttribute(selector, attributeName, index),
        isVisible: () => tabPage.isVisible(selector, index),
        isDisabled: () => tabPage.isDisabled(selector, index),
        isEditable: () => tabPage.isEditable(selector, index),
        isSelected: () => tabPage.isSelected(selector, index),
        first: () => tabCreateLocator(selector, 'first'),
        last: () => tabCreateLocator(selector, 'last'),
        nth: (n: number) => tabCreateLocator(selector, n),
      };
    }
    function tabGetByAttribute(attribute: string, attributeValue: string): LocatorApi {
      const escaped = attributeValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return tabCreateLocator(`[${attribute}="${escaped}"]`);
    }
    return {
      id: tabInfo.id,
      url: tabInfo.url,
      title: tabInfo.title,
      goto: (url: string) => tabPage.goto(url),
      click: (selector: string) => tabPage.click(selector),
      doubleClick: (selector: string) => tabPage.doubleClick(selector),
      rightClick: (selector: string) => tabPage.rightClick(selector),
      hover: (selector: string) => tabPage.hover(selector),
      dragAndDrop: (source: string, target: string) => tabPage.dragAndDrop(source, target),
      type: (selector: string, text: string) => tabPage.type(selector, text),
      select: (selector: string, option: SelectOptionOrOptions) => tabPage.select(selector, option),
      check: (selector: string) => tabPage.check(selector),
      uncheck: (selector: string) => tabPage.uncheck(selector),
      pressKey: (key: string) => tabPage.pressKey(key),
      locator: (selector: string) => tabCreateLocator(selector),
      getByAttribute: tabGetByAttribute,
      waitForLoad: () => tabPage.waitForLoad(),
      sleep: async (msOrOptions: number | { timeout: number }) => {
        const ms = typeof msOrOptions === 'number' ? msOrOptions : msOrOptions.timeout;
        return new Promise((r) => setTimeout(r, ms));
      },
      content: () => tabPage.content(),
      evaluate: <T>(expression: string) => tabPage.evaluate<T>(expression),
      isVisible: (sel: string) => tabPage.isVisible(sel),
      isDisabled: (sel: string) => tabPage.isDisabled(sel),
      isEditable: (sel: string) => tabPage.isEditable(sel),
      isSelected: (sel: string) => tabPage.isSelected(sel),
      close: () => tabClient.close(),
    };
  }

  async function waitForNewTab(options: { timeout?: number } = {}): Promise<TabHandle> {
    const timeoutMs = options.timeout ?? 10000;
    const pollMs = 200;
    const initialTabs = await fetchTabsList(debugPort, host);
    const initialIds = new Set(initialTabs.map((t) => t.id));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tabs = await fetchTabsList(debugPort, host);
      const newTabInfo = tabs.find((t) => !initialIds.has(t.id));
      if (newTabInfo) return createTabHandle(newTabInfo);
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`waitForNewTab: no new tab appeared within ${timeoutMs}ms`);
  }

  function createFrameHandle(iframeSelectorOrChain: string | string[]): FrameHandle {
    const chain: string[] = Array.isArray(iframeSelectorOrChain) ? [...iframeSelectorOrChain] : [iframeSelectorOrChain];
    const frameStep = (msg: string) => onStep?.(msg + ' (in frame)');
    async function frameEvaluate<T>(expression: string): Promise<T> {
      const expr = buildFrameEvalExpression(chain, expression);
      return page.evaluate<T>(expr);
    }
    async function frameContent(): Promise<string> {
      const expr = buildFrameContentExpression(chain);
      return page.evaluate<string>(expr);
    }
    async function getFrameElementCenter(selector: string, index?: LocatorIndex): Promise<{ x: number; y: number }> {
      const expr = buildFrameElementCenterExpression(chain, selector, index);
      const value = await page.evaluate<{ x?: number; y?: number; error?: string; count?: number; index?: number }>(expr);
      if (!value || typeof value !== 'object') throw new Error(`Frame locator failed for \`${selector}\``);
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      return { x: value.x ?? 0, y: value.y ?? 0 };
    }
    async function frameClick(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Click ${selector}`);
      const { x, y } = await getFrameElementCenter(selector, index);
      await new Promise((r) => setTimeout(r, 100));
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    async function frameDoubleClick(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Double click ${selector}`);
      const { x, y } = await getFrameElementCenter(selector, index);
      await new Promise((r) => setTimeout(r, 100));
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 2 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 2 });
    }
    async function frameRightClick(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Right click ${selector}`);
      const { x, y } = await getFrameElementCenter(selector, index);
      await new Promise((r) => setTimeout(r, 100));
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
    }
    async function frameHover(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Hover ${selector}`);
      const { x, y } = await getFrameElementCenter(selector, index);
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    }
    async function frameDragAndDrop(
      sourceSelector: string,
      targetSelector: string,
      sourceIndex?: LocatorIndex,
      targetIndex?: LocatorIndex
    ): Promise<void> {
      frameStep(`Drag ${sourceSelector} to ${targetSelector}`);
      const from = await getFrameElementCenter(sourceSelector, sourceIndex);
      const to = await getFrameElementCenter(targetSelector, targetIndex);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: to.x, y: to.y });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    }
    async function frameType(selector: string, text: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Type in ${selector}`);
      await frameClick(selector, index);
      for (const char of text) {
        await client.Input.dispatchKeyEvent({ type: 'keyDown', text: char });
        await client.Input.dispatchKeyEvent({ type: 'keyUp', text: char });
      }
    }
    async function frameGetTextContent(selector: string, index?: LocatorIndex): Promise<string> {
      frameStep(`Get textContent ${selector}`);
      const expr = buildFrameTextContentExpression(chain, selector, index);
      const value = await page.evaluate<{ textContent?: string; error?: string; count?: number; index?: number }>(expr);
      if (!value || typeof value !== 'object') return '';
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      return value.textContent != null ? String(value.textContent) : '';
    }
    async function frameGetAttribute(selector: string, attributeName: string, index?: LocatorIndex): Promise<string> {
      frameStep(`Get attribute ${attributeName} of ${selector}`);
      const expr = buildFrameGetAttributeExpression(chain, selector, attributeName, index);
      const value = await page.evaluate<{ attributeValue?: string; error?: string; count?: number; index?: number }>(expr);
      if (!value || typeof value !== 'object') return '';
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      return value.attributeValue != null ? String(value.attributeValue) : '';
    }
    async function frameSelect(selector: string, option: SelectOptionOrOptions, index?: LocatorIndex): Promise<void> {
      frameStep(`Select ${selector}`);
      const expr = buildFrameSelectOptionExpression(chain, selector, option, index);
      const value = await page.evaluate<{ ok?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') throw new Error(`Select failed: could not resolve \`${selector}\``);
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error === 'not-select') throw new Error(`Select failed: element is not a <select>: \`${selector}\``);
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
    }
    async function frameCheck(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Check ${selector}`);
      const expr = buildFrameCheckUncheckExpression(chain, selector, true, index);
      const value = await page.evaluate<{ ok?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') throw new Error(`Check failed: could not resolve \`${selector}\``);
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error === 'not-checkable') throw new Error(`Check failed: element is not a checkbox or radio: \`${selector}\``);
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
    }
    async function frameUncheck(selector: string, index?: LocatorIndex): Promise<void> {
      frameStep(`Uncheck ${selector}`);
      const expr = buildFrameCheckUncheckExpression(chain, selector, false, index);
      const value = await page.evaluate<{ ok?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') throw new Error(`Uncheck failed: could not resolve \`${selector}\``);
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error === 'not-checkable') throw new Error(`Uncheck failed: element is not a checkbox or radio: \`${selector}\``);
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
    }
    async function frameIsVisible(selector: string, index?: LocatorIndex): Promise<boolean> {
      const expr = buildFrameIsVisibleExpression(chain, selector, index);
      const value = await page.evaluate<{ value?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') return false;
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
      return value.value === true;
    }
    async function frameIsDisabled(selector: string, index?: LocatorIndex): Promise<boolean> {
      const expr = buildFrameIsDisabledExpression(chain, selector, index);
      const value = await page.evaluate<{ value?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') return false;
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
      return value.value === true;
    }
    async function frameIsEditable(selector: string, index?: LocatorIndex): Promise<boolean> {
      const expr = buildFrameIsEditableExpression(chain, selector, index);
      const value = await page.evaluate<{ value?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') return false;
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
      return value.value === true;
    }
    async function frameIsSelected(selector: string, index?: LocatorIndex): Promise<boolean> {
      const expr = buildFrameIsSelectedExpression(chain, selector, index);
      const value = await page.evaluate<{ value?: boolean; error?: string; count?: number; selector?: string; index?: number }>(expr);
      if (!value || typeof value !== 'object') return false;
      if (value.error === 'frame-not-found') throw new Error('Frame not found or cross-origin');
      if (value.error) throwLocatorError({ error: value.error, count: value.count ?? 0, selector: value.selector ?? selector, index: value.index }, selector);
      return value.value === true;
    }
    function frameCreateLocator(selector: string, index?: LocatorIndex): LocatorApi {
      return {
        click: () => frameClick(selector, index),
        doubleClick: () => frameDoubleClick(selector, index),
        rightClick: () => frameRightClick(selector, index),
        hover: () => frameHover(selector, index),
        dragTo: (targetSelector: string) => frameDragAndDrop(selector, targetSelector, index),
        type: (text: string) => frameType(selector, text, index),
        select: (option: SelectOptionOrOptions) => frameSelect(selector, option, index),
        check: () => frameCheck(selector, index),
        uncheck: () => frameUncheck(selector, index),
        pressKey: (key: string) => page.pressKey(key),
        textContent: () => frameGetTextContent(selector, index),
        getAttribute: (attributeName: string) => frameGetAttribute(selector, attributeName, index),
        isVisible: () => frameIsVisible(selector, index),
        isDisabled: () => frameIsDisabled(selector, index),
        isEditable: () => frameIsEditable(selector, index),
        isSelected: () => frameIsSelected(selector, index),
        first: () => frameCreateLocator(selector, 'first'),
        last: () => frameCreateLocator(selector, 'last'),
        nth: (n: number) => frameCreateLocator(selector, n),
      };
    }
    function frameGetByAttribute(attribute: string, attributeValue: string): LocatorApi {
      const escaped = attributeValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return frameCreateLocator(`[${attribute}="${escaped}"]`);
    }
    async function frameWaitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
      frameStep(`Wait for selector ${selector}`);
      const timeoutMs = options.timeout ?? 30000;
      const pollMs = 200;
      const expr = buildFrameWaitForSelectorExpression(chain, selector);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await page.evaluate<{ found?: boolean }>(expr);
        if (value && value.found) return;
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new Error(
        `waitForSelector: in frame, selector \`${selector}\` did not match within ${timeoutMs}ms (frame may still be loading)`
      );
    }

    return {
      frame: (nestedSelector: string) => {
        onStep?.(`Switch to frame ${nestedSelector}`);
        return createFrameHandle([...chain, nestedSelector]);
      },
      waitForSelector: frameWaitForSelector,
      evaluate: frameEvaluate,
      content: frameContent,
      click: frameClick,
      doubleClick: frameDoubleClick,
      rightClick: frameRightClick,
      hover: frameHover,
      dragAndDrop: frameDragAndDrop,
      type: frameType,
      select: frameSelect,
      check: frameCheck,
      uncheck: frameUncheck,
      locator: (selector: string) => frameCreateLocator(selector),
      getByAttribute: frameGetByAttribute,
      getTextContent: frameGetTextContent,
      getAttribute: frameGetAttribute,
      isVisible: frameIsVisible,
      isDisabled: frameIsDisabled,
      isEditable: frameIsEditable,
      isSelected: frameIsSelected,
    };
  }

  async function switchToTab(indexOrId: number | string): Promise<void> {
    const tabs = await fetchTabsList(debugPort, host);
    if (tabs.length === 0) throw new Error('No tabs found');
    const tab =
      typeof indexOrId === 'number'
        ? tabs[indexOrId]
        : tabs.find((t) => t.id === indexOrId);
    if (!tab) throw new Error(typeof indexOrId === 'number' ? `Tab index ${indexOrId} out of range (0..${tabs.length - 1})` : `Tab id "${indexOrId}" not found`);
    await client.close().catch(() => {});
    // CRI runtime accepts target as string (tab id); types only declare function
    client = (await CDP({ port: debugPort, host, target: tab.id } as Record<string, unknown>)) as unknown as CDPClient;
    await client.Page.enable();
    setupDialogHandler(client, () => dialogHandler);
    page = createPage(client);
    // Brief delay so the new tab context is active before next command
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    goto: async (url: string) => {
      onStep?.(`Goto ${url}`);
      return page.goto(url);
    },
    click: async (selector: string) => {
      onStep?.(`Click ${selector}`);
      return page.click(selector);
    },
    doubleClick: async (selector: string) => {
      onStep?.(`Double click ${selector}`);
      return page.doubleClick(selector);
    },
    rightClick: async (selector: string) => {
      onStep?.(`Right click ${selector}`);
      return page.rightClick(selector);
    },
    hover: async (selector: string) => {
      onStep?.(`Hover ${selector}`);
      return page.hover(selector);
    },
    dragAndDrop: async (source: string, target: string) => {
      onStep?.(`Drag ${source} to ${target}`);
      return page.dragAndDrop(source, target);
    },
    type: async (selector: string, text: string) => {
      onStep?.(`Type in ${selector}`);
      return page.type(selector, text);
    },
    select: async (selector: string, option: SelectOptionOrOptions) => {
      onStep?.(`Select ${selector}`);
      return page.select(selector, option);
    },
    check: async (selector: string) => {
      onStep?.(`Check ${selector}`);
      return page.check(selector);
    },
    uncheck: async (selector: string) => {
      onStep?.(`Uncheck ${selector}`);
      return page.uncheck(selector);
    },
    isVisible: (selector: string) => page.isVisible(selector),
    isDisabled: (selector: string) => page.isDisabled(selector),
    isEditable: (selector: string) => page.isEditable(selector),
    isSelected: (selector: string) => page.isSelected(selector),
    pressKey: (key: string) => page.pressKey(key),
    locator: (selector: string) => createLocator(selector),
    getByAttribute: (attribute: string, attributeValue: string) => getByAttribute(attribute, attributeValue),
    frame: (iframeSelector: string) => {
      onStep?.(`Switch to frame ${iframeSelector}`);
      return createFrameHandle(iframeSelector);
    },
    waitForLoad: () => page.waitForLoad(),
    waitForSelector: async (selector: string, options?: { timeout?: number }) => {
      onStep?.(`Wait for selector ${selector}`);
      return page.waitForSelector(selector, options);
    },
    sleep: async (msOrOptions: number | { timeout: number }) => {
      const ms = typeof msOrOptions === 'number' ? msOrOptions : msOrOptions.timeout;
      onStep?.(`Sleep ${ms}ms`);
      return new Promise((r) => setTimeout(r, ms));
    },
    content: () => page.content(),
    evaluate: <T>(expression: string) => page.evaluate<T>(expression),
    setDialogHandler: (handler: DialogHandler | null) => {
      dialogHandler = handler;
    },
    getTabs: () => fetchTabsList(debugPort, host),
    switchToTab,
    waitForNewTab,
    async close() {
      await client.close();
      if (launched) {
        const k = launched.kill();
        if (k && typeof (k as Promise<unknown>).then === 'function') await (k as Promise<void>);
      }
    },
  };
}

export { launchChrome } from './launch';
export { resolveSelector } from './cdp-page';
export type { PageApi, DialogHandler, DialogHandlerResult, DialogOpeningParams, SelectOption, SelectOptionOrOptions } from './cdp-page';
export type { LaunchOptions, LaunchedChrome } from './launch';
