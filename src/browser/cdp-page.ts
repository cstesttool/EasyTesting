/**
 * Page API: goto, click, type using Chrome DevTools Protocol only.
 * No Playwright, no Cypress — raw CDP via chrome-remote-interface.
 */

interface EvalResult {
  result?: { type: string; value?: unknown };
}

/** Params for Page.javascriptDialogOpening (alert, confirm, prompt, beforeunload). */
export interface DialogOpeningParams {
  url: string;
  message: string;
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
}

/** Result from a dialog handler: accept (OK) or dismiss (Cancel), and optional prompt text. */
export interface DialogHandlerResult {
  accept: boolean;
  promptText?: string;
}

export type DialogHandler = (
  params: { type: string; message: string }
) => DialogHandlerResult | Promise<DialogHandlerResult>;

export type CDPClient = {
  Page: {
    enable(): Promise<void>;
    navigate(params: { url: string }): Promise<unknown>;
    loadEventFired(): Promise<unknown>;
    on(event: 'javascriptDialogOpening', callback: (params: DialogOpeningParams) => void): void;
    handleJavaScriptDialog(params: { accept: boolean; promptText?: string }): Promise<void>;
  };
  Runtime: { evaluate(params: { expression: string; returnByValue?: boolean }): Promise<EvalResult> };
  Input: { dispatchMouseEvent(params: { type: string; x: number; y: number; button?: string; clickCount?: number }): Promise<void>; dispatchKeyEvent(params: { type: string; text?: string; key?: string }): Promise<void> };
  close(): Promise<void>;
};

export interface PageApi {
  goto(url: string): Promise<void>;
  click(selector: string, index?: LocatorIndex): Promise<void>;
  doubleClick(selector: string, index?: LocatorIndex): Promise<void>;
  rightClick(selector: string, index?: LocatorIndex): Promise<void>;
  hover(selector: string, index?: LocatorIndex): Promise<void>;
  dragAndDrop(sourceSelector: string, targetSelector: string, sourceIndex?: LocatorIndex, targetIndex?: LocatorIndex): Promise<void>;
  type(selector: string, text: string, index?: LocatorIndex): Promise<void>;
  pressKey(key: string): Promise<void>;
  waitForLoad(): Promise<void>;
  /** Wait until selector matches at least one element (CSS, XPath, id=, name=). Throws after timeout ms. */
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  content(): Promise<string>;
  evaluate<T>(expression: string): Promise<T>;
  getTextContent(selector: string, index?: LocatorIndex): Promise<string>;
  /** Get attribute value of the matched element (same strict/index rules as click). Returns '' if attribute is missing. */
  getAttribute(selector: string, attributeName: string, index?: LocatorIndex): Promise<string>;
}

function getCenter(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

/** True if the selector looks like XPath (e.g. //button[text()='New Tab'], /html/body, (//div)[1]). */
export function isXPath(selector: string): boolean {
  if (typeof selector !== 'string') return false;
  const t = selector.trim();
  return t.startsWith('/') || t.startsWith('(') || t.startsWith('./');
}

/** Convert locator shorthand to CSS: name="x" → [name="x"], id="x" → [id="x"], class="x" → .x, any attr="value" → [attr="value"]. XPath is passed through unchanged. */
export function resolveSelector(locator: string): string {
  if (typeof locator !== 'string') {
    throw new Error(
      `Selector must be a string (e.g. '#id', '.class', 'button'). Got ${typeof locator}. ` +
        `For dragTo(), pass a selector string: locator('#source').dragTo('#target'), not a locator object.`
    );
  }
  const trimmed = locator.trim();
  if (isXPath(trimmed)) return trimmed;
  const nameMatch = trimmed.match(/^name\s*=\s*["']([^"']*)["']$/i);
  if (nameMatch) return `[name="${nameMatch[1]}"]`;
  const idMatch = trimmed.match(/^id\s*=\s*["']([^"']*)["']$/i);
  if (idMatch) return `[id="${idMatch[1]}"]`;
  const classMatch = trimmed.match(/^class\s*=\s*["']([^"']*)["']$/i);
  if (classMatch) {
    const classes = classMatch[1].trim().split(/\s+/).filter(Boolean);
    return classes.map((c) => `.${escapeSelectorClass(c)}`).join('');
  }
  // Any attribute: placeholder="Enter Name", data-testid="submit", etc. → [attr="value"]
  const attrMatch = trimmed.match(/^([\w-]+)\s*=\s*["']([^"']*)["']$/i);
  if (attrMatch) return `[${attrMatch[1]}="${attrMatch[2]}"]`;
  return trimmed;
}

function escapeSelectorClass(c: string): string {
  return c.replace(/([\\!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
}

/** Build expression that returns { found: true } if selector matches at least one element, else { found: false }. */
export function buildWaitForSelectorExpression(selector: string): string {
  const resolved = resolveSelector(selector);
  const useXPath = isXPath(selector);
  const sel = JSON.stringify(resolved);
  if (useXPath) {
    return `(function(){
      var result = document.evaluate(${sel}, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return { found: result.snapshotLength > 0 };
    })()`;
  }
  return `(function(){
    var list = document.querySelectorAll(${sel});
    return { found: list.length > 0 };
  })()`;
}

export type LocatorIndex = number | 'first' | 'last' | undefined;

function buildStrictFindExpression(cssSelector: string): string {
  const sel = JSON.stringify(cssSelector);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    if (list.length > 1) return { error: 'strict', count: list.length, selector: selector };
    var el = list[0];
    el.scrollIntoView({ block: 'center', inline: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
}

/** Build expression that picks first, last, or nth element (0-based). */
function buildFindWithIndexExpression(cssSelector: string, index: number | 'first' | 'last'): string {
  const sel = JSON.stringify(cssSelector);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : index};
    if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx, selector: selector };
    var el = list[idx];
    el.scrollIntoView({ block: 'center', inline: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
}

/** XPath: strict (single node) — return rect or error. */
function buildStrictFindExpressionXPath(xpath: string): string {
  const x = JSON.stringify(xpath);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var len = result.snapshotLength;
    if (len === 0) return { error: 'not-found', count: 0, selector: xpath };
    if (len > 1) return { error: 'strict', count: len, selector: xpath };
    var el = result.snapshotItem(0);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
}

/** XPath: first/last/nth element. */
function buildFindWithIndexExpressionXPath(xpath: string, index: number | 'first' | 'last'): string {
  const x = JSON.stringify(xpath);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var len = result.snapshotLength;
    if (len === 0) return { error: 'not-found', count: 0, selector: xpath };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'len - 1' : index};
    if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx, selector: xpath };
    var el = result.snapshotItem(idx);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
}

/** XPath: get rect again (same element by index). */
function buildGetRectAgainXPath(xpath: string, index: number | 'first' | 'last' | undefined): string {
  const x = JSON.stringify(xpath);
  const idxJs = index === 'last' ? 'len - 1' : typeof index === 'number' ? String(index) : '0';
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var len = result.snapshotLength;
    if (len === 0) return null;
    var idx = ${idxJs};
    if (idx < 0 || idx >= len) return null;
    var el = result.snapshotItem(idx);
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
}

/** Build expression that returns textContent for strict (single) element or error. */
function buildStrictTextContentExpression(cssSelector: string): string {
  const sel = JSON.stringify(cssSelector);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    if (list.length > 1) return { error: 'strict', count: list.length, selector: selector };
    return { textContent: list[0].textContent };
  })()`;
}

/** Build expression that returns textContent for first/last/nth element or error. */
function buildTextContentWithIndexExpression(cssSelector: string, index: number | 'first' | 'last'): string {
  const sel = JSON.stringify(cssSelector);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : index};
    if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx, selector: selector };
    return { textContent: list[idx].textContent };
  })()`;
}

/** XPath: textContent strict. */
function buildStrictTextContentExpressionXPath(xpath: string): string {
  const x = JSON.stringify(xpath);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    if (result.snapshotLength === 0) return { error: 'not-found', count: 0, selector: xpath };
    if (result.snapshotLength > 1) return { error: 'strict', count: result.snapshotLength, selector: xpath };
    return { textContent: result.snapshotItem(0).textContent };
  })()`;
}

/** XPath: textContent first/last/nth. */
function buildTextContentWithIndexExpressionXPath(xpath: string, index: number | 'first' | 'last'): string {
  const x = JSON.stringify(xpath);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var len = result.snapshotLength;
    if (len === 0) return { error: 'not-found', count: 0, selector: xpath };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'len - 1' : index};
    if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx, selector: xpath };
    return { textContent: result.snapshotItem(idx).textContent };
  })()`;
}

/** For form controls, "value" attribute should return current .value (what user sees), not the HTML attribute. */
function getAttributeValueSnippet(elVar: string, attrVar: string): string {
  return `var el = ${elVar}; var v = (${attrVar} === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) ? el.value : el.getAttribute(${attrVar}); return { attributeValue: v == null ? '' : String(v) };`;
}

/** Build expression that returns getAttribute(attr) for strict (single) element or error. */
function buildStrictGetAttributeExpression(cssSelector: string, attributeName: string): string {
  const sel = JSON.stringify(cssSelector);
  const attr = JSON.stringify(attributeName);
  const valueSnippet = getAttributeValueSnippet('list[0]', attr);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    if (list.length > 1) return { error: 'strict', count: list.length, selector: selector };
    ${valueSnippet}
  })()`;
}

/** Build expression that returns getAttribute(attr) for first/last/nth element or error. */
function buildGetAttributeWithIndexExpression(cssSelector: string, attributeName: string, index: number | 'first' | 'last'): string {
  const sel = JSON.stringify(cssSelector);
  const attr = JSON.stringify(attributeName);
  const valueSnippet = getAttributeValueSnippet('list[idx]', attr);
  return `(function(){
    var selector = ${sel};
    var list = document.querySelectorAll(selector);
    if (list.length === 0) return { error: 'not-found', count: 0, selector: selector };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : index};
    if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx, selector: selector };
    ${valueSnippet}
  })()`;
}

/** XPath: getAttribute strict. */
function buildStrictGetAttributeExpressionXPath(xpath: string, attributeName: string): string {
  const x = JSON.stringify(xpath);
  const attr = JSON.stringify(attributeName);
  const valueSnippet = getAttributeValueSnippet('result.snapshotItem(0)', attr);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    if (result.snapshotLength === 0) return { error: 'not-found', count: 0, selector: xpath };
    if (result.snapshotLength > 1) return { error: 'strict', count: result.snapshotLength, selector: xpath };
    ${valueSnippet}
  })()`;
}

/** XPath: getAttribute first/last/nth. */
function buildGetAttributeWithIndexExpressionXPath(xpath: string, attributeName: string, index: number | 'first' | 'last'): string {
  const x = JSON.stringify(xpath);
  const attr = JSON.stringify(attributeName);
  const valueSnippet = getAttributeValueSnippet('result.snapshotItem(idx)', attr);
  return `(function(){
    var xpath = ${x};
    var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var len = result.snapshotLength;
    if (len === 0) return { error: 'not-found', count: 0, selector: xpath };
    var idx = ${index === 'first' ? 0 : index === 'last' ? 'len - 1' : index};
    if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx, selector: xpath };
    ${valueSnippet}
  })()`;
}

/** Chain = list of iframe selectors from root to leaf (e.g. ['iframe#outer', 'iframe#inner'] for nested). */
function buildFrameChainGetDocExpression(chain: string[]): string {
  if (chain.length === 0) return 'document';
  let code = 'var doc = document;';
  for (let i = 0; i < chain.length; i++) {
    const sel = chain[i];
    const resolved = resolveSelector(sel);
    const selJson = JSON.stringify(resolved);
    const xp = isXPath(sel);
    const getIframe = xp
      ? `(function(d){ var r = d.evaluate(${selJson}, d, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return r.singleNodeValue; })(doc)`
      : `doc.querySelector(${selJson})`;
    code += ` var iframe = ${getIframe}; if (!iframe || !iframe.contentDocument) throw new Error('Frame not found'); doc = iframe.contentDocument;`;
  }
  return `(function(){ ${code} return doc; })()`;
}

/** Like getDoc but returns null if any iframe in the chain is not ready (contentDocument null). */
function buildFrameChainGetDocOrNullExpression(chain: string[]): string {
  if (chain.length === 0) return 'document';
  let code = 'var doc = document;';
  for (let i = 0; i < chain.length; i++) {
    const sel = chain[i];
    const resolved = resolveSelector(sel);
    const selJson = JSON.stringify(resolved);
    const xp = isXPath(sel);
    const getIframe = xp
      ? `(function(d){ var r = d.evaluate(${selJson}, d, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return r.singleNodeValue; })(doc)`
      : `doc.querySelector(${selJson})`;
    code += ` var iframe = ${getIframe}; if (!iframe || !iframe.contentDocument) return null; doc = iframe.contentDocument;`;
  }
  return `(function(){ ${code} return doc; })()`;
}

/** Build expression that returns { found: true } when frame is ready and selector matches inside it, else { found: false }. */
export function buildFrameWaitForSelectorExpression(chain: string[], selector: string): string {
  const getDoc = buildFrameChainGetDocOrNullExpression(chain);
  const resolved = resolveSelector(selector);
  const useXPath = isXPath(selector);
  const sel = JSON.stringify(resolved);
  const checkInDoc = useXPath
    ? `(function(doc){ if (!doc) return false; var r = doc.evaluate(${sel}, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); return r.snapshotLength > 0; })`
    : `(function(doc){ if (!doc) return false; return doc.querySelectorAll(${sel}).length > 0; })`;
  return `(function(){ var doc = ${getDoc}; return { found: ${checkInDoc}(doc) }; })()`;
}

/** Build expression that runs in main page and evals userExpr in the frame (same-origin). Chain = iframe selectors from root to this frame. */
export function buildFrameEvalExpression(iframeSelectorOrChain: string | string[], userExpr: string): string {
  const chain = Array.isArray(iframeSelectorOrChain) ? iframeSelectorOrChain : [iframeSelectorOrChain];
  const getDoc = buildFrameChainGetDocExpression(chain);
  const expr = JSON.stringify(userExpr);
  return `(function(){ var doc = ${getDoc}; return doc.defaultView.eval(${expr}); })()`;
}

/** Build expression that runs in main page, finds element inside frame (chain), returns viewport center { x, y } or { error }. */
export function buildFrameElementCenterExpression(
  iframeSelectorOrChain: string | string[],
  elementSelector: string,
  index?: LocatorIndex
): string {
  const chain = Array.isArray(iframeSelectorOrChain) ? iframeSelectorOrChain : [iframeSelectorOrChain];
  const getDoc = buildFrameChainGetDocExpression(chain);
  const elResolved = resolveSelector(elementSelector);
  const isElXPath = isXPath(elementSelector);
  const elSel = JSON.stringify(elResolved);
  const findInDoc =
    isElXPath
      ? `(function(doc){
          var result = doc.evaluate(${elSel}, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          var len = result.snapshotLength;
          if (len === 0) return { error: 'not-found', count: 0 };
          if (len > 1 && (${index === undefined || index === null ? 'true' : 'false'})) return { error: 'strict', count: len };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'len - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx };
          var el = result.snapshotItem(idx);
          el.scrollIntoView({ block: 'center', inline: 'center' });
          var r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })`
      : `(function(doc){
          var list = doc.querySelectorAll(${elSel});
          if (list.length === 0) return { error: 'not-found', count: 0 };
          if (list.length > 1 && (${index === undefined || index === null ? 'true' : 'false'})) return { error: 'strict', count: list.length };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx };
          var el = list[idx];
          el.scrollIntoView({ block: 'center', inline: 'center' });
          var r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })`;
  return `(function(){
    var doc = ${getDoc};
    var rect = ${findInDoc}(doc);
    if (rect.error) return rect;
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  })()`;
}

/** Build expression that returns frame's document HTML (same-origin). Chain = iframe selectors from root. */
export function buildFrameContentExpression(iframeSelectorOrChain: string | string[]): string {
  const chain = Array.isArray(iframeSelectorOrChain) ? iframeSelectorOrChain : [iframeSelectorOrChain];
  const getDoc = buildFrameChainGetDocExpression(chain);
  return `(function(){ var doc = ${getDoc}; return doc.documentElement.outerHTML; })()`;
}

/** Build expression that finds element in frame and returns textContent or error. */
export function buildFrameTextContentExpression(
  iframeSelectorOrChain: string | string[],
  elementSelector: string,
  index?: LocatorIndex
): string {
  const chain = Array.isArray(iframeSelectorOrChain) ? iframeSelectorOrChain : [iframeSelectorOrChain];
  const getDoc = buildFrameChainGetDocExpression(chain);
  const elResolved = resolveSelector(elementSelector);
  const isElXPath = isXPath(elementSelector);
  const elSel = JSON.stringify(elResolved);
  const findText =
    isElXPath
      ? `(function(doc){
          var result = doc.evaluate(${elSel}, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          var len = result.snapshotLength;
          if (len === 0) return { error: 'not-found', count: 0 };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'len - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx };
          return { textContent: result.snapshotItem(idx).textContent };
        })`
      : `(function(doc){
          var list = doc.querySelectorAll(${elSel});
          if (list.length === 0) return { error: 'not-found', count: 0 };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx };
          return { textContent: list[idx].textContent };
        })`;
  return `(function(){
    var doc = ${getDoc};
    return ${findText}(doc);
  })()`;
}

/** Build expression that finds element in frame and returns getAttribute(name) or error. */
export function buildFrameGetAttributeExpression(
  iframeSelectorOrChain: string | string[],
  elementSelector: string,
  attributeName: string,
  index?: LocatorIndex
): string {
  const chain = Array.isArray(iframeSelectorOrChain) ? iframeSelectorOrChain : [iframeSelectorOrChain];
  const getDoc = buildFrameChainGetDocExpression(chain);
  const elResolved = resolveSelector(elementSelector);
  const isElXPath = isXPath(elementSelector);
  const elSel = JSON.stringify(elResolved);
  const attr = JSON.stringify(attributeName);
  const valueSnippetXPath = getAttributeValueSnippet('result.snapshotItem(idx)', attr);
  const valueSnippetCss = getAttributeValueSnippet('list[idx]', attr);
  const findAttr =
    isElXPath
      ? `(function(doc){
          var result = doc.evaluate(${elSel}, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          var len = result.snapshotLength;
          if (len === 0) return { error: 'not-found', count: 0 };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'len - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= len) return { error: 'out-of-range', count: len, index: idx };
          ${valueSnippetXPath}
        })`
      : `(function(doc){
          var list = doc.querySelectorAll(${elSel});
          if (list.length === 0) return { error: 'not-found', count: 0 };
          var idx = ${index === undefined || index === null ? 0 : index === 'first' ? 0 : index === 'last' ? 'list.length - 1' : typeof index === 'number' ? index : 0};
          if (idx < 0 || idx >= list.length) return { error: 'out-of-range', count: list.length, index: idx };
          ${valueSnippetCss}
        })`;
  return `(function(){
    var doc = ${getDoc};
    return ${findAttr}(doc);
  })()`;
}

export function throwLocatorError(
  res: { error: string; count: number; selector: string; index?: number },
  locatorInput: string
): never {
  if (res.error === 'not-found') {
    throw new Error(
      `Locator failed: No element found for \`${locatorInput}\` (resolved to selector: ${res.selector})`
    );
  }
  if (res.error === 'strict') {
    throw new Error(
      `Locator failed: Selector \`${locatorInput}\` resolved to ${res.count} elements. Use .first(), .last(), or .nth(n).`
    );
  }
  if (res.error === 'out-of-range') {
    throw new Error(
      `Locator failed: .nth(${res.index}) out of range — selector matched ${res.count} elements (use 0 to ${res.count - 1}).`
    );
  }
  throw new Error(`Locator failed: unexpected error for \`${locatorInput}\``);
}

/** Default: accept all dialogs; for prompt use empty string. */
const defaultDialogHandler: DialogHandler = () => ({ accept: true, promptText: '' });

/**
 * Wire CDP Page.javascriptDialogOpening so alert/confirm/prompt are handled
 * without switching. Uses getHandler() to decide accept/dismiss and prompt text.
 */
export function setupDialogHandler(
  client: CDPClient,
  getHandler: () => DialogHandler | null
): void {
  client.Page.on('javascriptDialogOpening', async (params: DialogOpeningParams) => {
    const handler = getHandler() ?? defaultDialogHandler;
    const result = await Promise.resolve(
      handler({ type: params.type, message: params.message })
    );
    await client.Page.handleJavaScriptDialog({
      accept: result.accept,
      promptText: result.promptText,
    });
  });
}

export function createPage(client: CDPClient): PageApi {
  async function getElementCenter(selector: string, index?: LocatorIndex): Promise<{ x: number; y: number }> {
    const resolved = resolveSelector(selector);
    const useXPath = isXPath(selector);
    const expr =
      index !== undefined && index !== null
        ? useXPath
          ? buildFindWithIndexExpressionXPath(resolved, index === 0 ? 'first' : index)
          : buildFindWithIndexExpression(resolved, index === 0 ? 'first' : index)
        : useXPath
          ? buildStrictFindExpressionXPath(resolved)
          : buildStrictFindExpression(resolved);
    const { result } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    const value = result?.type === 'object' && result && 'value' in result ? result.value : null;
    if (!value || typeof value !== 'object') {
      throw new Error(`Locator failed: could not resolve \`${selector}\``);
    }
    if ('error' in value && typeof (value as { error?: string }).error === 'string') {
      throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
    }
    await new Promise((r) => setTimeout(r, 100));
    const getRectAgain = useXPath
      ? buildGetRectAgainXPath(resolved, index === undefined || index === null ? undefined : index === 0 ? 'first' : index)
      : (() => {
          const useIndex = index !== undefined && index !== null;
          const idxExpr =
            useIndex && index === 'last'
              ? 'list.length - 1'
              : useIndex && index === 'first'
                ? 0
                : useIndex && typeof index === 'number'
                  ? index
                  : null;
          return idxExpr !== null
            ? `(function(){ var sel = ${JSON.stringify(resolved)}; var list = document.querySelectorAll(sel); if (list.length === 0) return null; var idx = ${idxExpr}; if (idx < 0 || idx >= list.length) return null; var r = list[idx].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`
            : `(function(){ var sel = ${JSON.stringify(resolved)}; var list = document.querySelectorAll(sel); if (list.length !== 1) return null; var r = list[0].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`;
        })();
    const res2 = await client.Runtime.evaluate({ expression: getRectAgain, returnByValue: true });
    const rect = res2?.result?.type === 'object' && 'value' in res2.result ? res2.result.value : value;
    return getCenter(rect as { x: number; y: number; width: number; height: number });
  }

  return {
    async goto(url: string): Promise<void> {
      await client.Page.enable();
      await client.Page.navigate({ url });
      await client.Page.loadEventFired();
    },

    async click(selector: string, index?: LocatorIndex): Promise<void> {
      const { x, y } = await getElementCenter(selector, index);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },

    async doubleClick(selector: string, index?: LocatorIndex): Promise<void> {
      const { x, y } = await getElementCenter(selector, index);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 2 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 2 });
    },

    async rightClick(selector: string, index?: LocatorIndex): Promise<void> {
      const { x, y } = await getElementCenter(selector, index);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
    },

    async hover(selector: string, index?: LocatorIndex): Promise<void> {
      const { x, y } = await getElementCenter(selector, index);
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    },

    async dragAndDrop(
      sourceSelector: string,
      targetSelector: string,
      sourceIndex?: LocatorIndex,
      targetIndex?: LocatorIndex
    ): Promise<void> {
      const from = await getElementCenter(sourceSelector, sourceIndex);
      const to = await getElementCenter(targetSelector, targetIndex);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: to.x, y: to.y });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    },

    async type(selector: string, text: string, index?: LocatorIndex): Promise<void> {
      const resolved = resolveSelector(selector);
      const useXPath = isXPath(selector);
      const expr =
        index !== undefined && index !== null
          ? useXPath
            ? buildFindWithIndexExpressionXPath(resolved, index === 0 ? 'first' : index)
            : buildFindWithIndexExpression(resolved, index === 0 ? 'first' : index)
          : useXPath
            ? buildStrictFindExpressionXPath(resolved)
            : buildStrictFindExpression(resolved);
      const { result } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
      const value = result?.type === 'object' && result && 'value' in result ? result.value : null;
      if (!value || typeof value !== 'object') {
        throw new Error(`Locator failed: could not resolve \`${selector}\``);
      }
      if ('error' in value && typeof (value as { error?: string }).error === 'string') {
        throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      }
      const rect = value as { x: number; y: number; width: number; height: number };
      const { x, y } = getCenter(rect);
      await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      for (const char of text) {
        await client.Input.dispatchKeyEvent({ type: 'keyDown', text: char });
        await client.Input.dispatchKeyEvent({ type: 'keyUp', text: char });
      }
    },

    async pressKey(key: string): Promise<void> {
      await client.Input.dispatchKeyEvent({ type: 'keyDown', key });
      await client.Input.dispatchKeyEvent({ type: 'keyUp', key });
    },

    async waitForLoad(): Promise<void> {
      await client.Page.loadEventFired();
    },

    async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
      const timeoutMs = options.timeout ?? 30000;
      const pollMs = 200;
      const expr = buildWaitForSelectorExpression(selector);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const { result } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
        const value = result?.type === 'object' && result && 'value' in result ? result.value : null;
        if (value && typeof value === 'object' && (value as { found?: boolean }).found) return;
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new Error(
        `waitForSelector: selector \`${selector}\` did not match any element within ${timeoutMs}ms`
      );
    },

    async content(): Promise<string> {
      const { result } = await client.Runtime.evaluate({
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      });
      if (result && 'value' in result) return String(result.value);
      return '';
    },

    async evaluate<T>(expression: string): Promise<T> {
      const { result } = await client.Runtime.evaluate({ expression, returnByValue: true });
      if (result && 'value' in result) return result.value as T;
      return undefined as T;
    },

    async getTextContent(selector: string, index?: LocatorIndex): Promise<string> {
      const resolved = resolveSelector(selector);
      const useXPath = isXPath(selector);
      const expr =
        index !== undefined && index !== null
          ? useXPath
            ? buildTextContentWithIndexExpressionXPath(resolved, index === 0 ? 'first' : index)
            : buildTextContentWithIndexExpression(resolved, index === 0 ? 'first' : index)
          : useXPath
            ? buildStrictTextContentExpressionXPath(resolved)
            : buildStrictTextContentExpression(resolved);
      const { result } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
      const value = result?.type === 'object' && result && 'value' in result ? result.value : null;
      if (!value || typeof value !== 'object') {
        throw new Error(`Locator failed: could not resolve \`${selector}\``);
      }
      if ('error' in value && typeof (value as { error?: string }).error === 'string') {
        throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      }
      const text = (value as { textContent?: string }).textContent;
      return text != null ? String(text) : '';
    },

    async getAttribute(selector: string, attributeName: string, index?: LocatorIndex): Promise<string> {
      const resolved = resolveSelector(selector);
      const useXPath = isXPath(selector);
      const expr =
        index !== undefined && index !== null
          ? useXPath
            ? buildGetAttributeWithIndexExpressionXPath(resolved, attributeName, index === 0 ? 'first' : index)
            : buildGetAttributeWithIndexExpression(resolved, attributeName, index === 0 ? 'first' : index)
          : useXPath
            ? buildStrictGetAttributeExpressionXPath(resolved, attributeName)
            : buildStrictGetAttributeExpression(resolved, attributeName);
      const { result } = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
      const value = result?.type === 'object' && result && 'value' in result ? result.value : null;
      if (!value || typeof value !== 'object') {
        throw new Error(`Locator failed: could not resolve \`${selector}\``);
      }
      if ('error' in value && typeof (value as { error?: string }).error === 'string') {
        throwLocatorError(value as { error: string; count: number; selector: string; index?: number }, selector);
      }
      const attr = (value as { attributeValue?: string }).attributeValue;
      return attr != null ? String(attr) : '';
    },
  };
}
