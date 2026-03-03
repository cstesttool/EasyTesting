/** Minimal types for CSTesting Firefox (BiDi) support. Optional dependency; see CSTesting docs. */
declare module 'playwright' {
  export interface Locator {
    click(options?: { button?: 'left' | 'right' }): Promise<void>;
    dblclick(): Promise<void>;
    fill(value: string): Promise<void>;
    hover(): Promise<void>;
    dragTo(target: Locator): Promise<void>;
    selectOption(value: string | { value?: string; label?: string }): Promise<void>;
    check(): Promise<void>;
    uncheck(): Promise<void>;
    press(key: string): Promise<void>;
    textContent(): Promise<string | null>;
    getAttribute(name: string): Promise<string | null>;
    isVisible(): Promise<boolean>;
    evaluate<T>(fn: (el: Element) => T): Promise<T>;
    screenshot(options?: { path?: string; type?: 'png' | 'jpeg' }): Promise<Buffer>;
    first(): Locator;
    last(): Locator;
    nth(index: number): Locator;
    waitFor(options?: { timeout?: number }): Promise<void>;
  }
  export interface FrameLocator {
    locator(selector: string): Locator;
    frameLocator(selector: string): FrameLocator;
  }
  export interface Page {
    addInitScript(params: { content: string }): Promise<void>;
    exposeBinding(name: string, callback: (source: unknown, payload: string) => void | Promise<void>): Promise<void>;
    goto(url: string): Promise<unknown>;
    click(selector: string, options?: { button?: string }): Promise<void>;
    dblclick(selector: string): Promise<void>;
    hover(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    selectOption(selector: string, value: string | { value?: string; label?: string }): Promise<void>;
    check(selector: string): Promise<void>;
    uncheck(selector: string): Promise<void>;
    locator(selector: string): Locator;
    frameLocator(selector: string): FrameLocator;
    waitForLoadState(state?: string): Promise<void>;
    waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
    waitForURL(urlOrRegex: string | RegExp, options?: { timeout?: number }): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    url(): string;
    isVisible(selector: string): Promise<boolean>;
    content(): Promise<string>;
    evaluate<T>(expression: string | ((arg: unknown) => T)): Promise<T>;
    screenshot(options?: { path?: string; fullPage?: boolean; type?: string; quality?: number; selector?: string }): Promise<Buffer>;
    keyboard: { press(key: string): Promise<void> };
    dragAndDrop(source: string, target: string): Promise<void>;
    on(event: 'dialog', handler: (dialog: { type(): string; message(): string; accept(text?: string): Promise<void>; dismiss(): Promise<void> }) => void): void;
    title(): Promise<string>;
  }
  export interface BrowserContext {
    newPage(): Promise<Page>;
    pages(): Page[];
  }
  export interface Browser {
    newContext(): Promise<BrowserContext>;
    close(): Promise<void>;
    on(event: 'disconnect', callback: () => void): void;
  }
  export const firefox: { launch(options?: { headless?: boolean }): Promise<Browser> };
}
