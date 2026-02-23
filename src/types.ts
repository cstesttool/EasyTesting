/**
 * Internal types for the test runner.
 */

export type TestFn = () => void | Promise<void>;
export type HookFn = () => void | Promise<void>;

/** Options for describe() or it() when using tags. */
export interface TestTagOptions {
  tags: string[];
}

export interface TestCase {
  name: string;
  fn: TestFn;
  only: boolean;
  skip: boolean;
  /** Tags for this test (e.g. ['smoke', 'regression']). Inherited from suite if not set. */
  tags?: string[];
}

export interface TestSuite {
  name: string;
  suites: TestSuite[];
  tests: TestCase[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  only: boolean;
  skip: boolean;
  /** Tags applied to all tests in this suite (and nested suites) unless overridden. */
  tags?: string[];
}

export interface TestResultEntry {
  suite: string;
  test: string;
  duration?: number;
  steps?: string[];
  /** Source file path (e.g. relative path from CLI). */
  file?: string;
  /** Tags for this test (for report and search). */
  tags?: string[];
}

export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  errors: Array<{
    suite: string;
    test: string;
    error: Error;
    duration?: number;
    steps?: string[];
    file?: string;
    tags?: string[];
  }>;
  passedTests: Array<TestResultEntry>;
  skippedTests: Array<TestResultEntry>;
}
