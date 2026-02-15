#!/usr/bin/env node
// CSTesting CLI — discover and run test files.
// Usage: npx cstesting [pattern]  or  npx et [pattern]
// Examples: cstesting  |  cstesting "**/*.test.js"  |  cstesting tests/

import * as path from 'path';
import * as fs from 'fs';
import { run, resetRunner } from './runner';
import { AssertionError } from './assertions';
import { writeReport } from './report';
import type { RunResult } from './types';

const defaultPattern = '**/*.test.js';

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

async function main(): Promise<void> {
  const cwd = process.cwd();
  const pattern = process.argv[2] || defaultPattern;
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
