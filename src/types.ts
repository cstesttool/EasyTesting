/**
 * Internal types for the test runner.
 */

export type TestFn = () => void | Promise<void>;
export type HookFn = () => void | Promise<void>;

export interface TestCase {
  name: string;
  fn: TestFn;
  only: boolean;
  skip: boolean;
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
}

export interface TestResultEntry {
  suite: string;
  test: string;
  duration?: number;
  steps?: string[];
}

export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  errors: Array<{ suite: string; test: string; error: Error; duration?: number; steps?: string[] }>;
  passedTests: Array<TestResultEntry>;
  skippedTests: Array<TestResultEntry>;
}
