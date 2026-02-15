/**
 * Test runner: describe, it, beforeAll, afterAll, beforeEach, afterEach.
 * Runs suites and tests, collects results.
 */

import type { TestCase, TestSuite, RunResult, TestFn, HookFn } from './types';
import { AssertionError } from './assertions';

let rootSuite: TestSuite = makeSuite('root');
let currentSuite: TestSuite = rootSuite;
let hasOnly = false;

/** Steps recorded during the current test (for report). Cleared before each test. */
let currentSteps: string[] = [];

export function step(name: string): void {
  currentSteps.push(name);
}

export function getCurrentSteps(): string[] {
  return currentSteps.slice();
}

function makeSuite(name: string): TestSuite {
  return {
    name,
    suites: [],
    tests: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
    only: false,
    skip: false,
  };
}

function resetRunner(): void {
  rootSuite = makeSuite('root');
  currentSuite = rootSuite;
  hasOnly = false;
}

export function describe(name: string, fn: () => void): void {
  const parent = currentSuite;
  const suite = makeSuite(name);
  parent.suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = parent;
}

describe.only = function describeOnly(name: string, fn: () => void): void {
  const parent = currentSuite;
  const suite = makeSuite(name);
  suite.only = true;
  hasOnly = true;
  parent.suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = parent;
};

describe.skip = function describeSkip(name: string, fn: () => void): void {
  const parent = currentSuite;
  const suite = makeSuite(name);
  suite.skip = true;
  parent.suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = parent;
};

export function it(name: string, fn: TestFn): void {
  currentSuite.tests.push({ name, fn, only: false, skip: false });
}

it.only = function itOnly(name: string, fn: TestFn): void {
  currentSuite.tests.push({ name, fn, only: true, skip: false });
  hasOnly = true;
};

it.skip = function itSkip(name: string, fn: TestFn): void {
  currentSuite.tests.push({ name, fn, only: false, skip: true });
};

export function beforeAll(fn: HookFn): void {
  currentSuite.beforeAll.push(fn);
}

export function afterAll(fn: HookFn): void {
  currentSuite.afterAll.push(fn);
}

export function beforeEach(fn: HookFn): void {
  currentSuite.beforeEach.push(fn);
}

export function afterEach(fn: HookFn): void {
  currentSuite.afterEach.push(fn);
}

async function runHooks(hooks: HookFn[]): Promise<void> {
  for (const hook of hooks) {
    await Promise.resolve(hook());
  }
}

function shouldRunSuite(suite: TestSuite): boolean {
  if (suite.skip) return false;
  if (hasOnly && !suite.only && !suiteHasOnly(suite)) return false;
  return true;
}

function suiteHasOnly(s: TestSuite): boolean {
  if (s.only) return true;
  if (s.tests.some((t) => t.only)) return true;
  return s.suites.some(suiteHasOnly);
}

async function runSuite(
  suite: TestSuite,
  path: string,
  result: RunResult,
  startTime: number
): Promise<void> {
  if (!shouldRunSuite(suite)) return;

  const fullPath = path ? `${path} > ${suite.name}` : suite.name;

  await runHooks(suite.beforeAll);

  for (const test of suite.tests) {
    const runTest = !test.skip && (!hasOnly || test.only);
    currentSteps = [];
    const testStart = Date.now();

    if (!runTest) {
      result.skipped++;
      result.total++;
      result.skippedTests.push({ suite: fullPath, test: test.name, duration: 0, steps: [] });
      continue;
    }

    result.total++;
    currentSteps.push('Test case started');
    try {
      await runHooks(suite.beforeEach);
      await Promise.resolve(test.fn());
      await runHooks(suite.afterEach);
      result.passed++;
      result.passedTests.push({
        suite: fullPath,
        test: test.name,
        duration: Date.now() - testStart,
        steps: currentSteps.length ? currentSteps.slice() : undefined,
      });
    } catch (err) {
      const duration = Date.now() - testStart;
      await runHooks(suite.afterEach).catch(() => {});
      result.failed++;
      result.errors.push({
        suite: fullPath,
        test: test.name,
        error: err instanceof Error ? err : new Error(String(err)),
        duration,
        steps: currentSteps.length ? currentSteps.slice() : undefined,
      });
    }
  }

  for (const child of suite.suites) {
    await runSuite(child, fullPath, result, startTime);
  }

  await runHooks(suite.afterAll);
}

export async function run(): Promise<RunResult> {
  const result: RunResult = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    duration: 0,
    errors: [],
    passedTests: [],
    skippedTests: [],
  };
  const start = Date.now();
  await runSuite(rootSuite, '', result, start);
  result.duration = Date.now() - start;
  return result;
}

export function getRootSuite(): TestSuite {
  return rootSuite;
}

export function setRootSuite(suite: TestSuite): void {
  rootSuite = suite;
  currentSuite = suite;
}

export { resetRunner };
