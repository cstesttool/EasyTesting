/**
 * CSTesting — Node.js testing framework
 *
 * Usage in test files:
 *   const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('cstesting');
 */

export { describe, it, beforeAll, afterAll, beforeEach, afterEach, run, resetRunner, step } from './runner';
export { expect, AssertionError } from './assertions';
export { createBrowser } from './browser';
export type { RunResult } from './types';
export type { BrowserApi, CreateBrowserOptions, LocatorApi, DialogHandler, TabInfo, TabHandle, FrameHandle, StepReporter } from './browser';
