/**
 * HTML report generation. Writes to report/ folder (created if missing).
 * Test rows are expandable: click a test to open and see executed steps.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { RunResult } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export interface ReportOptions {
  cwd?: string;
  reportDir?: string;
  filename?: string;
}

type Status = 'pass' | 'fail' | 'skip';

interface TestRow {
  suite: string;
  test: string;
  status: Status;
  duration?: number;
  steps?: string[];
  error?: Error;
}

function buildTestRowHtml(row: TestRow): string {
  const durationStr = formatDuration(row.duration);
  const statusLabel = row.status === 'pass' ? 'Passed' : row.status === 'fail' ? 'Failed' : 'Skipped';

  const hasSteps = row.steps && row.steps.length > 0;
  const stepsHtml = hasSteps
    ? `
    <div class="pw-steps-section">
      <div class="pw-steps-title">Steps</div>
      <div class="pw-steps-list">
        ${row.steps!.map((s, i) => `
        <div class="pw-step-row">
          <span class="pw-step-icon pw-step-icon-passed" aria-hidden="true">✓</span>
          <span class="pw-step-index">${i + 1}</span>
          <span class="pw-step-title">${escapeHtml(s)}</span>
        </div>`).join('')}
      </div>
    </div>`
    : `<div class="pw-steps-section">
      <div class="pw-steps-title">Steps</div>
      <p class="pw-no-steps">No steps recorded. Use <code>step('name')</code> in your test to record steps.</p>
    </div>`;

  const errorBlock =
    row.error !== undefined
      ? `<div class="pw-error-section">
        <div class="pw-steps-title">Error</div>
        <div class="pw-error-content">
          <pre class="pw-error-message">${escapeHtml(row.error.message)}</pre>
          ${row.error.stack ? `<pre class="pw-error-stack">${escapeHtml(row.error.stack)}</pre>` : ''}
        </div>
      </div>`
      : '';

  const detailsHtml = `
    <div class="test-row-details">
      ${stepsHtml}
      ${errorBlock}
    </div>`;

  return `
    <div class="test-row test-row-${row.status}" data-expanded="false">
      <span class="test-dot ${row.status}"></span>
      <div class="test-body">
        <div class="test-row-header" role="button" tabindex="0" aria-expanded="false" aria-label="Click to expand and see executed steps">
          <span class="test-name">${escapeHtml(row.suite)} &gt; ${escapeHtml(row.test)}</span>
          <span class="test-meta">
            <span class="test-duration" title="Duration">${durationStr}</span>
            <span class="test-status status-${row.status}">${statusLabel}</span>
            <span class="test-chevron" aria-hidden="true">▶</span>
          </span>
        </div>
        ${detailsHtml}
      </div>
    </div>`;
}

export function generateHtmlReport(result: RunResult): string {
  const title = 'CSTesting Report';
  const durationSec = (result.duration / 1000).toFixed(2);
  const passed = result.passed;
  const failed = result.failed;
  const skipped = result.skipped;
  const total = result.total;
  const passedTests = result.passedTests ?? [];
  const skippedTests = result.skippedTests ?? [];
  const errors = result.errors ?? [];

  const pct = total > 0 ? { pass: (passed / total) * 100, fail: (failed / total) * 100, skip: (skipped / total) * 100 } : { pass: 0, fail: 0, skip: 0 };

  const allTests: TestRow[] = [
    ...passedTests.map((t) => ({ suite: t.suite, test: t.test, status: 'pass' as Status, duration: t.duration, steps: t.steps })),
    ...errors.map((e) => ({ suite: e.suite, test: e.test, status: 'fail' as Status, duration: e.duration, steps: e.steps, error: e.error })),
    ...skippedTests.map((t) => ({ suite: t.suite, test: t.test, status: 'skip' as Status, duration: t.duration ?? 0, steps: t.steps })),
  ];

  const passedListHtml =
    passedTests.length === 0
      ? '<p class="empty-msg">No passed tests to show.</p>'
      : passedTests.map((t) => buildTestRowHtml({ ...t, status: 'pass' })).join('');

  const failedListHtml =
    errors.length === 0
      ? '<p class="empty-msg">No failed tests.</p>'
      : errors.map((e) => buildTestRowHtml({ suite: e.suite, test: e.test, status: 'fail', duration: e.duration, steps: e.steps, error: e.error })).join('');

  const skippedListHtml =
    skippedTests.length === 0
      ? '<p class="empty-msg">No skipped tests.</p>'
      : skippedTests.map((t) => buildTestRowHtml({ ...t, status: 'skip' })).join('');

  const totalListHtml =
    allTests.length === 0
      ? '<p class="empty-msg">No tests to show.</p>'
      : allTests.map((row) => buildTestRowHtml(row)).join('');

  const defaultTab = failed > 0 ? 'fail' : total > 0 ? 'total' : passed > 0 ? 'pass' : 'skip';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #1a1a2e; color: #eee; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 600; }
    .summary-pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill { padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: opacity 0.2s; border: 2px solid transparent; }
    .pill:hover { opacity: 0.9; }
    .pill.passed { background: #1b3d1b; color: #6f6; }
    .pill.failed { background: #3d1b1b; color: #f66; }
    .pill.skipped { background: #3d351b; color: #dd8; }
    .pill.total { background: #1b2d3d; color: #8af; }
    .pill.active { border-color: currentColor; box-shadow: 0 0 0 1px currentColor; }
    .bar-section { margin-bottom: 20px; }
    .bar-label { font-size: 12px; color: #888; margin-bottom: 6px; }
    .bar-container { display: flex; height: 24px; border-radius: 6px; overflow: hidden; background: #0d0d1a; }
    .bar-seg { transition: width 0.2s; min-width: 2px; }
    .bar-seg.passed { background: #2d5a2d; }
    .bar-seg.failed { background: #5a2d2d; }
    .bar-seg.skipped { background: #5a4d2d; }
    .bar-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; }
    .bar-legend span { display: flex; align-items: center; gap: 6px; }
    .bar-legend .dot { width: 8px; height: 8px; border-radius: 50%; }
    .bar-legend .dot.passed { background: #6f6; }
    .bar-legend .dot.failed { background: #f66; }
    .bar-legend .dot.skipped { background: #aa8; }
    .panel { display: none; margin-top: 16px; }
    .panel.active { display: block; }
    .panel h2 { font-size: 1.1rem; margin: 0 0 12px; }
    .panel.pass-panel h2 { color: #6f6; }
    .panel.fail-panel h2 { color: #f88; }
    .panel.skip-panel h2 { color: #aa8; }
    .panel.total-panel h2 { color: #8af; }
    .test-row { display: flex; align-items: flex-start; gap: 10px; padding: 0; margin-bottom: 8px; border-radius: 6px; background: #16213e; overflow: hidden; }
    .test-row .test-body { flex: 1; min-width: 0; }
    .test-row-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px; cursor: pointer; transition: background 0.15s; }
    .test-row-header:hover { background: #1a2744; }
    .test-row-header:focus { outline: 2px solid #4a6fa5; outline-offset: 2px; }
    .test-row.expanded .test-row-header { border-bottom: 1px solid #2a3555; }
    .test-row.expanded .test-chevron { transform: rotate(90deg); }
    .test-row-details { max-height: 0; overflow: hidden; transition: max-height 0.25s ease-out; }
    .test-row.expanded .test-row-details { max-height: 2000px; transition: max-height 0.35s ease-in; }
    .test-row-details > div { padding: 12px 12px 12px 22px; }
    .test-name { font-weight: 500; word-break: break-word; }
    .test-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; font-size: 13px; }
    .test-duration { color: #888; }
    .test-chevron { font-size: 10px; color: #888; transition: transform 0.2s; }
    .test-status { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .test-status.status-pass { background: #1b3d1b; color: #6f6; }
    .test-status.status-fail { background: #3d1b1b; color: #f66; }
    .test-status.status-skip { background: #3d351b; color: #aa8; }
    .test-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin: 14px 0 0 10px; }
    .test-dot.pass { background: #6f6; }
    .test-dot.fail { background: #f66; }
    .test-dot.skip { background: #aa8; }
    .pw-steps-section { margin: 0 0 16px; }
    .pw-steps-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 8px; }
    .pw-steps-list { border: 1px solid #2a3555; border-radius: 6px; overflow: hidden; background: #0d0d1a; }
    .pw-step-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #1a1a2e; min-height: 40px; }
    .pw-step-row:last-child { border-bottom: none; }
    .pw-step-icon { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
    .pw-step-icon-passed { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .pw-step-icon-failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .pw-step-index { color: #666; font-size: 12px; min-width: 20px; }
    .pw-step-title { color: #e5e5e5; flex: 1; }
    .pw-no-steps { color: #666; font-size: 13px; margin: 0; padding: 12px; }
    .pw-no-steps code { background: #1a1a2e; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .pw-error-section { margin-top: 16px; border-top: 1px solid #2a3555; padding-top: 16px; }
    .pw-error-content { border: 1px solid #3d1b1b; border-radius: 6px; background: rgba(127, 29, 29, 0.15); padding: 12px; }
    .pw-error-message, .pw-error-stack { margin: 0; font-size: 13px; white-space: pre-wrap; word-break: break-word; color: #fca5a5; font-family: ui-monospace, monospace; }
    .pw-error-stack { margin-top: 8px; font-size: 12px; opacity: 0.9; color: #94a3b8; }
    .empty-msg { color: #888; margin: 0; }
    .meta { font-size: 12px; color: #666; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="summary-pills">
      <button type="button" class="pill total ${defaultTab === 'total' ? 'active' : ''}" data-tab="total" aria-pressed="${defaultTab === 'total'}">Total (${total})</button>
      <button type="button" class="pill passed ${defaultTab === 'pass' ? 'active' : ''}" data-tab="pass" aria-pressed="${defaultTab === 'pass'}">Passed (${passed})</button>
      <button type="button" class="pill failed ${defaultTab === 'fail' ? 'active' : ''}" data-tab="fail" aria-pressed="${defaultTab === 'fail'}">Failed (${failed})</button>
      <button type="button" class="pill skipped ${defaultTab === 'skip' ? 'active' : ''}" data-tab="skip" aria-pressed="${defaultTab === 'skip'}">Skipped (${skipped})</button>
    </div>
  </div>

  <div class="bar-section">
    <div class="bar-label">Result distribution</div>
    <div class="bar-container" role="img" aria-label="Bar chart: passed ${pct.pass.toFixed(0)}%, failed ${pct.fail.toFixed(0)}%, skipped ${pct.skip.toFixed(0)}%">
      <div class="bar-seg passed" style="width: ${pct.pass}%"></div>
      <div class="bar-seg failed" style="width: ${pct.fail}%"></div>
      <div class="bar-seg skipped" style="width: ${pct.skip}%"></div>
    </div>
    <div class="bar-legend">
      <span><span class="dot passed"></span> Passed ${total > 0 ? pct.pass.toFixed(1) : 0}%</span>
      <span><span class="dot failed"></span> Failed ${total > 0 ? pct.fail.toFixed(1) : 0}%</span>
      <span><span class="dot skipped"></span> Skipped ${total > 0 ? pct.skip.toFixed(1) : 0}%</span>
    </div>
  </div>

  <p class="meta">Duration: ${durationSec}s &middot; ${escapeHtml(new Date().toISOString())}</p>
  <p class="meta">Click a test case to expand and see executed steps.</p>

  <div id="panel-total" class="panel total-panel ${defaultTab === 'total' ? 'active' : ''}" role="region" aria-label="All tests">
    <h2>All tests (${total})</h2>
    <div class="panel-content">${totalListHtml}</div>
  </div>
  <div id="panel-pass" class="panel pass-panel ${defaultTab === 'pass' ? 'active' : ''}" role="region" aria-label="Passed tests">
    <h2>Passed tests (${passed})</h2>
    <div class="panel-content">${passedListHtml}</div>
  </div>
  <div id="panel-fail" class="panel fail-panel ${defaultTab === 'fail' ? 'active' : ''}" role="region" aria-label="Failed tests">
    <h2>Failed tests (${failed})</h2>
    <div class="panel-content">${failedListHtml}</div>
  </div>
  <div id="panel-skip" class="panel skip-panel ${defaultTab === 'skip' ? 'active' : ''}" role="region" aria-label="Skipped tests">
    <h2>Skipped tests (${skipped})</h2>
    <div class="panel-content">${skippedListHtml}</div>
  </div>

  <script>
    (function() {
      var defaultTab = ${JSON.stringify(defaultTab)};
      var pills = document.querySelectorAll('.pill[data-tab]');
      var panels = document.querySelectorAll('.panel');
      function showTab(tab) {
        pills.forEach(function(p) {
          p.classList.toggle('active', p.getAttribute('data-tab') === tab);
          p.setAttribute('aria-pressed', p.getAttribute('data-tab') === tab ? 'true' : 'false');
        });
        panels.forEach(function(panel) {
          var panelTab = panel.id.replace('panel-', '');
          panel.classList.toggle('active', panelTab === tab);
        });
      }
      pills.forEach(function(p) {
        p.addEventListener('click', function() { showTab(p.getAttribute('data-tab')); });
      });
      showTab(defaultTab);

      document.querySelectorAll('.test-row-header').forEach(function(header) {
        function toggle() {
          var row = header.closest('.test-row');
          var expanded = row.getAttribute('data-expanded') === 'true';
          row.setAttribute('data-expanded', !expanded);
          row.classList.toggle('expanded', !expanded);
          header.setAttribute('aria-expanded', !expanded);
        }
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      });
    })();
  </script>
</body>
</html>`;
}

export function writeReport(result: RunResult, options: ReportOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const reportDirName = options.reportDir ?? 'report';
  const filename = options.filename ?? 'report.html';
  const reportDir = path.resolve(cwd, reportDirName);
  const reportPath = path.join(reportDir, filename);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const html = generateHtmlReport(result);
  fs.writeFileSync(reportPath, html, 'utf8');
  return reportPath;
}
