/**
 * Run a config file: parse steps, execute in browser, return RunResult for report.
 */

import type { RunResult } from './types';
import type { ParsedConfig, ConfigStep } from './config-parser';
import { parseConfigFile } from './config-parser';
import { createBrowser, resolveSelector } from './browser';
import type { BrowserApi, FrameHandle } from './browser';

function stepLabel(step: ConfigStep): string {
  switch (step.action) {
    case 'goto':
      return `goto ${step.url}`;
    case 'type':
      return `type ${step.label}`;
    case 'click':
      return `click ${step.locator}`;
    case 'wait':
      return `wait ${step.ms}ms`;
    case 'screenshot':
      return `getScreenshot ${step.path}${step.fullPage ? ' fullPage' : ''}${step.element ? ' element=' + step.element : ''}`;
    case 'doubleClick':
      return `doubleClick ${step.locator}`;
    case 'rightClick':
      return `rightClick ${step.locator}`;
    case 'hover':
      return `hover ${step.locator}`;
    case 'switchTab':
      return `switchTab ${step.index}`;
    case 'frame':
      return `frame ${step.selector}`;
    case 'check':
      return `check ${step.locator}`;
    case 'uncheck':
      return `uncheck ${step.locator}`;
    case 'select':
      return `select ${step.locator}`;
    case 'dialog':
      return step.behavior === 'dismiss' ? 'dialog dismiss' : step.promptText != null ? `dialog prompt:${step.promptText}` : 'dialog accept';
    case 'close':
      return 'close browser';
    case 'verifyText':
      if (!step.selector) return `assertText page contains "${step.expected}"`;
      return step.index !== undefined
        ? `assertText ${step.selector}[${step.index}] contains "${step.expected}"`
        : `assertText ${step.selector} contains "${step.expected}"`;
    case 'assertTextEqualsAttribute':
      return `assertText ${step.textSelector} equals attr ${step.attributeName} of ${step.attrSelector}`;
    case 'assertAttribute':
      return `assertAttribute ${step.selector} attr ${step.attributeName} = "${step.expected}"`;
    default:
      return String(step);
  }
}

/** Common interface for browser or frame (click, type, etc.). */
type PageLike = Pick<
  BrowserApi,
  'click' | 'type' | 'doubleClick' | 'rightClick' | 'hover' | 'check' | 'uncheck' | 'select' | 'waitForSelector'
>;

/** Escape for use inside a JS expression string. */
function escapeForEval(s: string): string {
  return JSON.stringify(s);
}

/**
 * Fill input via DOM: focus, set value, fire input/change.
 * Uses same resolveSelector as browser. Targets input when selector is [name="x"].
 */
async function fillInputByDom(browser: BrowserApi, selector: string, value: string): Promise<void> {
  const resolved = resolveSelector(selector);
  const inputSelector =
    resolved.startsWith('[name="') && resolved.endsWith('"]')
      ? 'input' + resolved
      : resolved;
  const sel = escapeForEval(inputSelector);
  const val = escapeForEval(value);
  const expr = `(function(){
    var selector = ${sel};
    var value = ${val};
    var el = document.querySelector(selector);
    if (!el) throw new Error('Element not found: ' + selector);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    el.select && el.select();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    return true;
  })()`;
  await browser.evaluate(expr);
}

/** How to handle the next JavaScript dialog (alert/confirm/prompt). */
export type PendingDialog = { accept: boolean; promptText?: string } | null;

/** Context for steps that can run in main page or inside a frame. */
interface RunContext {
  getBrowser: () => BrowserApi | null;
  currentFrame: FrameHandle | null;
  setNextDialog: (d: PendingDialog) => void;
  onClose: () => void;
}

function getTarget(ctx: RunContext): PageLike {
  const browser = ctx.getBrowser();
  return (ctx.currentFrame ?? browser) as PageLike;
}

async function executeStep(ctx: RunContext, step: ConfigStep): Promise<void> {
  const browser = ctx.getBrowser();
  if (!browser && step.action !== 'close') {
    throw new Error('Browser is closed. Start a new test case to continue.');
  }

  if (step.action === 'close') {
    if (!browser) throw new Error('Browser is already closed.');
    await browser.close();
    ctx.onClose();
    return;
  }

  const b = browser!;
  const target = getTarget(ctx);

  switch (step.action) {
    case 'goto': {
      await b.goto(step.url);
      try {
        await Promise.race([
          b.waitForLoad(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Load timeout')), 15000)),
        ]);
      } catch {
        // Page load timed out; continue anyway
      }
      await new Promise((r) => setTimeout(r, 800));
      return;
    }
    case 'wait': {
      await new Promise((r) => setTimeout(r, step.ms));
      return;
    }
    case 'dialog': {
      ctx.setNextDialog({
        accept: step.behavior === 'accept',
        promptText: step.promptText,
      });
      return;
    }
    case 'screenshot': {
      await b.getScreenshot({
        path: step.path,
        fullPage: step.fullPage,
        selector: step.element,
      });
      return;
    }
    case 'switchTab': {
      await b.switchToTab(step.index);
      await new Promise((r) => setTimeout(r, 300));
      return;
    }
    case 'frame': {
      const raw = step.selector.trim().toLowerCase();
      if (raw === 'main' || raw === '') {
        ctx.currentFrame = null;
        return;
      }
      const parts = step.selector.split(',').map((s) => s.trim()).filter(Boolean);
      let frame: FrameHandle = b.frame(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        frame = frame.frame(parts[i]);
      }
      ctx.currentFrame = frame;
      return;
    }
    case 'type': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 300));
      if (ctx.currentFrame) {
        await ctx.currentFrame.type(step.locator, step.value);
      } else {
        await fillInputByDom(b, step.locator, step.value);
      }
      return;
    }
    case 'click': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.click(step.locator);
      // Wait for load only if we might have navigated; use short timeout so we don't hang when click only opens a dialog
      if (!ctx.currentFrame) {
        await Promise.race([
          b.waitForLoad(),
          new Promise<void>((r) => setTimeout(r, 2000)),
        ]).catch(() => {});
      }
      return;
    }
    case 'doubleClick': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.doubleClick(step.locator);
      return;
    }
    case 'rightClick': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.rightClick(step.locator);
      return;
    }
    case 'hover': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.hover(step.locator);
      return;
    }
    case 'check': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.check(step.locator);
      return;
    }
    case 'uncheck': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.uncheck(step.locator);
      return;
    }
    case 'select': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      const opt = step.option.value != null ? { value: step.option.value } : { label: step.option.label! };
      await target.select(step.locator, opt);
      return;
    }
    case 'verifyText': {
      let actual: string;
      if (step.selector) {
        const loc = ctx.currentFrame ? ctx.currentFrame.locator(step.selector) : b.locator(step.selector);
        const locator = step.index !== undefined ? loc.nth(step.index) : loc;
        actual = await locator.textContent();
        // Element: exact match (trimmed, case-insensitive) so checkbox input (empty) or "Wednesday" won't pass for "monday"
        const actualTrimmed = actual.trim();
        const expectedTrimmed = step.expected.trim();
        if (actualTrimmed.toLowerCase() !== expectedTrimmed.toLowerCase()) {
          const gotDisplay = actualTrimmed.length > 0 ? actualTrimmed.slice(0, 200) + (actualTrimmed.length > 200 ? '...' : '') : '(empty)';
          const hint = actualTrimmed.length === 0
            ? ' Input/checkbox elements have no text; use the label or parent that contains the text (e.g. (//label[input[@type="checkbox"]])[2] for the 2nd day label).'
            : '';
          throw new Error(
            `Text verification failed: expected "${expectedTrimmed}", but got: ${gotDisplay}.${hint}`
          );
        }
      } else {
        if (ctx.currentFrame) {
          actual = await ctx.currentFrame.evaluate<string>('document.body.innerText || ""');
        } else {
          actual = await b.evaluate<string>('document.body.innerText || ""');
        }
        // Page: contains (substring)
        if (!actual.includes(step.expected)) {
          throw new Error(
            `Text verification failed: page should contain "${step.expected}", but got: ${actual.slice(0, 200)}${actual.length > 200 ? '...' : ''}`
          );
        }
      }
      return;
    }
    case 'assertTextEqualsAttribute': {
      const attrLoc = ctx.currentFrame ? ctx.currentFrame.locator(step.attrSelector) : b.locator(step.attrSelector);
      const textLoc = ctx.currentFrame ? ctx.currentFrame.locator(step.textSelector) : b.locator(step.textSelector);
      const attrValue = await attrLoc.getAttribute(step.attributeName);
      const textValue = await textLoc.textContent();
      const a = (attrValue ?? '').trim().toLowerCase();
      const t = (textValue ?? '').trim().toLowerCase();
      if (a !== t) {
        throw new Error(
          `assertTextEqualsAttribute failed: text of ${step.textSelector} ("${(textValue ?? '').trim()}") does not equal attr ${step.attributeName} of ${step.attrSelector} ("${(attrValue ?? '').trim()}")`
        );
      }
      return;
    }
    case 'assertAttribute': {
      const loc = ctx.currentFrame ? ctx.currentFrame.locator(step.selector) : b.locator(step.selector);
      const attrValue = await loc.getAttribute(step.attributeName);
      const actual = (attrValue ?? '').trim();
      const expectedTrimmed = step.expected.trim();
      if (actual.toLowerCase() !== expectedTrimmed.toLowerCase()) {
        throw new Error(
          `assertAttribute failed: ${step.selector} attr ${step.attributeName} expected "${expectedTrimmed}", got "${actual}"`
        );
      }
      return;
    }
  }
}

export interface RunConfigResult extends RunResult {
  configName: string;
}

/**
 * Run a config file: open browser, execute each test case (each # section = one test).
 * Each test case is reported as one test with all its steps listed.
 */
export async function runConfigFile(configPath: string, options?: { headless?: boolean }): Promise<RunConfigResult> {
  const parsed = parseConfigFile(configPath);
  const { name: configName, testCases, headless: configHeadless } = parsed;

  const result: RunConfigResult = {
    configName,
    passed: 0,
    failed: 0,
    skipped: 0,
    total: testCases.length,
    duration: 0,
    errors: [],
    passedTests: [],
    skippedTests: [],
  };

  if (testCases.length === 0) {
    return result;
  }

  const headless = options?.headless !== undefined ? options.headless : configHeadless;
  const start = Date.now();
  let browser: BrowserApi | null = null;
  let nextDialog: PendingDialog = null;

  try {
    console.log('  Browser will start when needed.\n');

    for (let tcIndex = 0; tcIndex < testCases.length; tcIndex++) {
      const { testCaseName, steps } = testCases[tcIndex];
      const stepLabels: string[] = [];
      const caseStart = Date.now();
      console.log('  Test case:', testCaseName);

      if (!browser) {
        console.log('  Launching browser (' + (headless ? 'headless' : 'visible window') + ')...');
        browser = await createBrowser({ headless });
        browser.setDialogHandler(() => {
          const p = nextDialog;
          nextDialog = null;
          return p ?? { accept: true, promptText: '' };
        });
      }

      let failed = false;
      let lastError: Error | null = null;
      let failedStepIndex: number | undefined;
      const runCtx: RunContext = {
        getBrowser: () => browser,
        currentFrame: null,
        setNextDialog: (d) => {
          nextDialog = d;
        },
        onClose: () => {
          browser = null;
        },
      };
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const label = stepLabel(step);
        stepLabels.push(label);
        console.log('    Step', i + 1 + ':', label);
        try {
          await executeStep(runCtx, step);
          console.log('      OK');
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          failedStepIndex = i;
          console.error('      FAIL:', lastError.message);
          failed = true;
          // Add remaining step labels so the HTML report shows all steps (including not run)
          for (let j = i + 1; j < steps.length; j++) {
            stepLabels.push(stepLabel(steps[j]));
          }
          break;
        }
      }

      const duration = Date.now() - caseStart;
      if (failed && lastError) {
        result.failed++;
        result.errors.push({
          suite: configName,
          test: testCaseName,
          error: lastError,
          duration,
          steps: stepLabels,
          failedStepIndex,
          file: configName,
        });
      } else {
        result.passed++;
        result.passedTests!.push({
          suite: configName,
          test: testCaseName,
          duration,
          steps: stepLabels,
          file: configName,
        });
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  result.duration = Date.now() - start;
  return result;
}

export { parseConfigFile };
export type { ParsedConfig, ConfigStep } from './config-parser';
