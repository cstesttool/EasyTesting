/**
 * Test runner: describe, it, beforeAll, afterAll, beforeEach, afterEach.
 * Runs suites and tests, collects results.
 */

import type { TestCase, TestSuite, RunResult, TestFn, HookFn, TestTagOptions } from './types';
import { AssertionError } from './assertions';

let rootSuite: TestSuite = makeSuite('root');
let currentSuite: TestSuite = rootSuite;
let hasOnly = false;

/** Tags filter for this run (e.g. ['smoke','regression']). Empty = run all. Set by run({ tags }). */
let runTagFilter: string[] = [];

/** Steps recorded during the current test (for report). Cleared before each test. */
let currentSteps: string[] = [];

export function step(name: string): void {
  currentSteps.push(name);
}

export function getCurrentSteps(): string[] {
  return currentSteps.slice();
}

function makeSuite(name: string, tags?: string[]): TestSuite {
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
    tags,
  };
}

function resetRunner(): void {
  rootSuite = makeSuite('root');
  currentSuite = rootSuite;
  hasOnly = false;
  runTagFilter = [];
}

export function describe(name: string, fn: () => void): void;
export function describe(name: string, options: TestTagOptions, fn: () => void): void;
export function describe(name: string, optionsOrFn: TestTagOptions | (() => void), fn?: () => void): void {
  const opts = fn !== undefined ? (optionsOrFn as TestTagOptions) : undefined;
  const runFn = typeof fn === 'function' ? fn : (optionsOrFn as () => void);
  const parent = currentSuite;
  const suite = makeSuite(name, opts?.tags);
  parent.suites.push(suite);
  currentSuite = suite;
  runFn();
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

export function it(name: string, fn: TestFn): void;
export function it(name: string, options: TestTagOptions, fn: TestFn): void;
export function it(name: string, optionsOrFn: TestTagOptions | TestFn, fn?: TestFn): void {
  const opts = fn !== undefined ? (optionsOrFn as TestTagOptions) : undefined;
  const runFn = typeof (fn ?? optionsOrFn) === 'function' ? (fn ?? optionsOrFn) as TestFn : (optionsOrFn as TestFn);
  currentSuite.tests.push({ name, fn: runFn, only: false, skip: false, tags: opts?.tags });
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

/** Collect all tags for a test: from suite chain (path) + test's own tags. */
function getEffectiveTags(suitePath: TestSuite[], test: TestCase): string[] {
  const set = new Set<string>();
  for (const s of suitePath) {
    if (s.tags) for (const t of s.tags) set.add(t);
  }
  if (test.tags) for (const t of test.tags) set.add(t);
  return Array.from(set);
}

/** True if test should run when tag filter is active (effective tags intersect filter). */
function testMatchesTagFilter(effectiveTags: string[]): boolean {
  if (runTagFilter.length === 0) return true;
  return effectiveTags.some((t) => runTagFilter.includes(t));
}

async function runSuite(
  suite: TestSuite,
  path: string,
  suitePath: TestSuite[],
  result: RunResult,
  startTime: number
): Promise<void> {
  if (!shouldRunSuite(suite)) return;

  const fullPath = path ? `${path} > ${suite.name}` : suite.name;
  const nextSuitePath = [...suitePath, suite];

  await runHooks(suite.beforeAll);

  for (const test of suite.tests) {
    const effectiveTags = getEffectiveTags(nextSuitePath, test);
    const tagMatch = testMatchesTagFilter(effectiveTags);
    const runTest = !test.skip && (!hasOnly || test.only) && tagMatch;
    currentSteps = [];
    const testStart = Date.now();

    if (!runTest) {
      result.skipped++;
      result.total++;
      result.skippedTests.push({
        suite: fullPath,
        test: test.name,
        duration: 0,
        steps: [],
        file: currentRunFile,
        tags: effectiveTags.length ? effectiveTags : undefined,
      });
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
        file: currentRunFile,
        tags: effectiveTags.length ? effectiveTags : undefined,
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
        file: currentRunFile,
        tags: effectiveTags.length ? effectiveTags : undefined,
      });
    }
  }

  for (const child of suite.suites) {
    await runSuite(child, fullPath, nextSuitePath, result, startTime);
  }

  await runHooks(suite.afterAll);
}

export interface RunOptions {
  /** Run only tests that have at least one of these tags (e.g. ['smoke','regression']). */
  tags?: string[];
  /** Source file path for report grouping (e.g. relative path from CLI). */
  file?: string;
}

let currentRunFile: string | undefined;

export async function run(options?: RunOptions): Promise<RunResult> {
  runTagFilter = options?.tags ?? [];
  currentRunFile = options?.file;
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
  await runSuite(rootSuite, '', [], result, start);
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
