/**
 * Run a config file: parse steps, execute in browser, return RunResult for report.
 */

import type { RunResult } from './types';
import type { ParsedConfig, ConfigStep } from './config-parser';
import { parseConfigFile } from './config-parser';
import { createBrowser, resolveSelector } from './browser';
import type { BrowserApi } from './browser';

function stepLabel(step: ConfigStep): string {
  switch (step.action) {
    case 'goto':
      return `goto ${step.url}`;
    case 'type':
      return `type ${step.label}`;
    case 'click':
      return `click ${step.locator}`;
    default:
      return String(step);
  }
}

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

async function executeStep(browser: BrowserApi, step: ConfigStep): Promise<void> {
  switch (step.action) {
    case 'goto': {
      await browser.goto(step.url);
      try {
        await Promise.race([
          browser.waitForLoad(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Load timeout')), 15000)),
        ]);
      } catch {
        // Page load timed out; continue anyway (page may still be usable)
      }
      await new Promise((r) => setTimeout(r, 800));
      return;
    }
    case 'type': {
      await browser.waitForSelector(step.locator, { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 300));
      await fillInputByDom(browser, step.locator, step.value);
      return;
    }
    case 'click': {
      await browser.waitForSelector(step.locator, { timeout: 15000 });
      await browser.click(step.locator);
      await browser.waitForLoad();
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
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const label = stepLabel(step);
        stepLabels.push(label);
        console.log('    Step', i + 1 + ':', label);
        try {
          await executeStep(browser, step);
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
        });
      } else {
        result.passed++;
        result.passedTests!.push({
          suite: configName,
          test: testCaseName,
          duration,
          steps: stepLabels,
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
