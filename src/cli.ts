#!/usr/bin/env node
// CSTesting CLI — discover and run test files.
// Usage: npx cstesting [pattern]  or  npx cst init
// Examples: cstesting  |  cstesting "**/*.test.js"  |  cstesting tests/  |  cstesting init

import * as path from 'path';
import * as fs from 'fs';
import { run, resetRunner } from './runner';
import { AssertionError } from './assertions';
import { writeReport } from './report';
import { runConfigFile } from './config-runner';
import type { RunResult } from './types';

const defaultPattern = '**/*.test.js';

/** Get path to templates folder (next to dist when published). */
function getTemplatesDir(): string {
  return path.join(__dirname, '..', 'templates');
}

/**
 * Create pages/ and tests/ folders with Page Object Model sample code.
 * Run: npx cstesting init  or  npx cst init
 */
function init(): void {
  const cwd = process.cwd();
  const templatesDir = getTemplatesDir();

  if (!fs.existsSync(templatesDir)) {
    console.error('Templates not found. Run init from a project that has cstesting installed.');
    process.exit(1);
  }

  const pagesDir = path.join(cwd, 'pages');
  const testsDir = path.join(cwd, 'tests');
  const templatePages = path.join(templatesDir, 'pages');
  const templateTests = path.join(templatesDir, 'tests');

  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
  if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

  const files: [string, string][] = [
    [path.join(templatePages, 'HomePage.js'), path.join(pagesDir, 'HomePage.js')],
    [path.join(templateTests, 'home.test.js'), path.join(testsDir, 'home.test.js')],
  ];

  for (const [src, dest] of files) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('  Created:', path.relative(cwd, dest));
    }
  }

  console.log('\nPage Object Model (POM) structure ready:\n  pages/     – page objects (e.g. HomePage.js)\n  tests/     – test files (*.test.js)\n\nRun tests: npx cstesting tests/\n');
}

function findTestFiles(pattern: string, cwd: string): string[] {
  const base = pattern.split(/[/\\]/)[0];

  if (base === '**' || pattern.includes('*')) {
    const files: string[] = [];
    function walk(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== 'dist') walk(full);
        } else if (e.isFile() && (e.name.endsWith('.test.js') || e.name.endsWith('.spec.js'))) {
          files.push(full);
        }
      }
    }
    walk(cwd);
    return files;
  }

  const full = path.join(cwd, pattern);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return [path.resolve(full)];
  const dir = path.join(cwd, base);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const files: string[] = [];
    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(d, e.name);
        if (e.isDirectory()) walk(fullPath);
        else if (e.name.endsWith('.test.js') || e.name.endsWith('.spec.js')) files.push(fullPath);
      }
    }
    walk(dir);
    return files;
  }
  return [];
}

function loadTestFile(filePath: string): void {
  require(path.resolve(filePath));
}

function formatError(err: Error): string {
  if (err instanceof AssertionError) {
    return `${err.message}${err.actual !== undefined ? `\n  Actual: ${String(err.actual)}` : ''}${err.expected !== undefined ? `\n  Expected: ${String(err.expected)}` : ''}`;
  }
  return err.stack || err.message;
}

/** Resolve config path: try cwd, then parent (so "node dist/cli.js foo.conf" works from dist). */
function resolveConfigPath(configPath: string): string | null {
  const cwd = process.cwd();
  let resolved = path.resolve(cwd, configPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  if (!configPath.includes(path.sep) && !configPath.includes('/')) {
    resolved = path.resolve(cwd, '..', configPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

/** Run a config file (e.g. login.conf) and write report. */
async function runConfig(configPath: string): Promise<void> {
  const cwd = process.cwd();
  const resolved = resolveConfigPath(configPath);
  if (!resolved) {
    console.error(`Config file not found: ${configPath}`);
    console.error(`  (Looked in ${cwd} and parent directory. Run from project root or use: cstesting run path/to/file.conf)`);
    process.exit(1);
  }
  console.log(`Running config: ${path.relative(cwd, resolved) || configPath}\n`);
  const result = await runConfigFile(resolved);
  if (result.errors.length > 0) {
    for (const { suite, test, error } of result.errors) {
      console.log(`  ✗ ${suite} > ${test}`);
      console.log(`    ${error.message}`);
    }
  }
  console.log('\n' + '─'.repeat(50));
  console.log(`  Passed: ${result.passed}  Failed: ${result.failed}  Total: ${result.total}  (${result.duration}ms)`);
  const reportPath = writeReport(result, { cwd, reportDir: 'report', filename: 'report.html' });
  console.log(`  Report: ${reportPath}`);
  if (result.failed > 0) process.exit(1);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === 'init') {
    init();
    process.exit(0);
    return;
  }

  const cwd = process.cwd();

  // cstesting run login.conf  → run config file
  if (arg === 'run') {
    const configPath = process.argv[3];
    if (!configPath) {
      console.error('Usage: cstesting run <config.conf>');
      process.exit(1);
    }
    await runConfig(configPath);
    return;
  }

  // cstesting login.conf  → run config file if extension is .conf or .config
  if (arg) {
    const ext = path.extname(arg).toLowerCase();
    if (ext === '.conf' || ext === '.config') {
      const configResolved = resolveConfigPath(arg);
      if (configResolved) {
        await runConfig(arg);
        return;
      }
    }
  }

  const pattern = arg || defaultPattern;
  const resolved = path.resolve(cwd, pattern);
  let testFiles: string[];
  if (pattern.includes('*') || pattern.endsWith('.js') || pattern.endsWith('.ts')) {
    testFiles = findTestFiles(pattern, cwd);
  } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    testFiles = findTestFiles(pattern, cwd);
  } else if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    testFiles = [resolved];
  } else {
    testFiles = findTestFiles(pattern, cwd);
  }

  if (testFiles.length === 0) {
    console.log('No test files found. Create files matching *.test.js or run: cstesting path/to/test.js');
    process.exit(0);
    return;
  }

  const totalResult: RunResult = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    duration: 0,
    errors: [],
    passedTests: [],
    skippedTests: [],
  };

  for (const file of testFiles) {
    resetRunner();
    try {
      loadTestFile(file);
    } catch (err) {
      console.error(`Failed to load ${file}:`, err);
      process.exit(1);
    }
    const result = await run();
    totalResult.passed += result.passed;
    totalResult.failed += result.failed;
    totalResult.skipped += result.skipped;
    totalResult.total += result.total;
    totalResult.duration += result.duration;
    totalResult.errors.push(...result.errors);
    totalResult.passedTests.push(...result.passedTests);
    totalResult.skippedTests.push(...result.skippedTests);

    const rel = path.relative(cwd, file);
    console.log(`\n ${rel}`);
    if (result.errors.length > 0) {
      for (const { suite, test, error } of result.errors) {
        console.log(`  ✗ ${suite} > ${test}`);
        console.log(formatError(error).split('\n').map((l) => `    ${l}`).join('\n'));
      }
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`  Passed: ${totalResult.passed}  Failed: ${totalResult.failed}  Skipped: ${totalResult.skipped}  Total: ${totalResult.total}  (${totalResult.duration}ms)`);

  const reportPath = writeReport(totalResult, { cwd, reportDir: 'report', filename: 'report.html' });
  console.log(`  Report: ${reportPath}`);

  if (totalResult.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
