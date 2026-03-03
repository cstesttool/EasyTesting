/**
 * Recording session for Firefox (WebDriver BiDi). Used by the recorder when --browser firefox is selected.
 */

import type { Page, Browser } from 'playwright';

export interface FirefoxRecordingSession {
  addScriptToEvaluateOnNewDocument(script: string): Promise<void>;
  setStepCallback(callback: (payload: string) => void): void;
  navigate(url: string): Promise<void>;
  setDialogHandler(handler: (type: string, message: string) => Promise<{ accept: boolean; promptText?: string }>): void;
  onDisconnect(callback: () => void): void;
  close(): Promise<void>;
}

export async function createFirefoxRecordingSession(options: {
  headless?: boolean;
}): Promise<FirefoxRecordingSession> {
  const pkg = await import('playwright');
  const browser = (await pkg.firefox.launch({
    headless: options.headless ?? false,
  })) as Browser;
  const context = await browser.newContext();
  const page = (await context.newPage()) as Page;

  let stepCallback: (payload: string) => void = () => {};
  await page.exposeBinding('cstRecordStep', (_source: unknown, payload: string) => {
    stepCallback(payload);
  });

  let dialogHandler: (type: string, message: string) => Promise<{ accept: boolean; promptText?: string }> = async () => ({ accept: true });
  page.on('dialog', async (dialog) => {
    const type = dialog.type();
    const message = dialog.message();
    const answer = await dialogHandler(type, message);
    if (answer.accept) {
      if (type === 'prompt' && answer.promptText !== undefined) await dialog.accept(answer.promptText);
      else await dialog.accept();
    } else await dialog.dismiss();
  });

  let onDisconnectCb: () => void = () => {};
  browser.on('disconnect', () => onDisconnectCb());

  return {
    addScriptToEvaluateOnNewDocument: async (script: string) => {
      await page.addInitScript({ content: script });
    },
    setStepCallback: (cb) => {
      stepCallback = cb;
    },
    navigate: async (url: string) => {
      await page.goto(url);
    },
    setDialogHandler: (handler) => {
      dialogHandler = handler;
    },
    onDisconnect: (cb) => {
      onDisconnectCb = cb;
    },
    close: async () => {
      await browser.close();
    },
  };
}
