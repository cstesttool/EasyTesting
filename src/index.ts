/**
 * CSTesting — Node.js testing framework
 *
 * Usage in test files:
 *   const { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } = require('cstesting');
 */

export { describe, it, beforeAll, afterAll, beforeEach, afterEach, run, resetRunner, step } from './runner';
export type { RunOptions } from './runner';
export { expect, AssertionError } from './assertions';
export { createBrowser } from './browser';
export { requestApi as request, ResponseAssertions } from './api-request';
export { runConfigFile, parseConfigFile } from './config-runner';
export type { RunResult } from './types';
export type { BrowserApi, CreateBrowserOptions, LocatorApi, DialogHandler, TabInfo, TabHandle, FrameHandle, StepReporter, SelectOption, SelectOptionOrOptions } from './browser';
export type { ParsedConfig, ConfigStep, ConfigTestCase } from './config-parser';
export type { RunConfigResult } from './config-runner';
export type { ApiResponse, RequestOptions, HttpMethod } from './api-request';
