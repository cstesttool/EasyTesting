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
      return `screenshot ${step.path}${step.fullPage ? ' fullPage' : ''}${step.element ? ' element=' + step.element : ''}`;
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

/** Context for steps that can run in main page or inside a frame. */
interface RunContext {
  browser: BrowserApi;
  currentFrame: FrameHandle | null;
}

function getTarget(ctx: RunContext): PageLike {
  return (ctx.currentFrame ?? ctx.browser) as PageLike;
}

async function executeStep(ctx: RunContext, step: ConfigStep): Promise<void> {
  const { browser } = ctx;
  const target = getTarget(ctx);

  switch (step.action) {
    case 'goto': {
      await browser.goto(step.url);
      try {
        await Promise.race([
          browser.waitForLoad(),
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
    case 'screenshot': {
      await browser.getScreenshot({
        path: step.path,
        fullPage: step.fullPage,
        selector: step.element,
      });
      return;
    }
    case 'switchTab': {
      await browser.switchToTab(step.index);
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
      let frame: FrameHandle = browser.frame(parts[0]);
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
        await fillInputByDom(browser, step.locator, step.value);
      }
      return;
    }
    case 'click': {
      await target.waitForSelector(step.locator, { timeout: 15000 });
      await target.click(step.locator);
      if (!ctx.currentFrame) await browser.waitForLoad();
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

  try {
    console.log('  Launching browser...');
    browser = await createBrowser({ headless });
    console.log('  Browser ready. Running', testCases.length, 'test case(s).\n');

    for (let tcIndex = 0; tcIndex < testCases.length; tcIndex++) {
      const { testCaseName, steps } = testCases[tcIndex];
      const stepLabels: string[] = [];
      const caseStart = Date.now();
      console.log('  Test case:', testCaseName);

      let failed = false;
      let lastError: Error | null = null;
      const runCtx: RunContext = { browser, currentFrame: null };
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
          console.log('      FAIL:', lastError.message);
          failed = true;
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
