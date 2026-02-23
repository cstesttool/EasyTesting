/**
 * HTML report generation. Writes to report/ folder (created if missing).
 * Report features: group by file, search by file/test/tag, summary bar, click test for details (steps, error).
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
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTotalTime(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
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
  file?: string;
  tags?: string[];
}

/** Build searchable text for a test (file + suite + test + tags). */
function testSearchText(row: TestRow): string {
  const parts = [
    row.file ?? '',
    row.suite,
    row.test,
    ...(row.tags ?? []),
  ];
  return parts.join(' ').toLowerCase();
}

/** Build HTML for one test row (list item + expandable details). */
function buildTestRowHtml(row: TestRow, index: number): string {
  const durationStr = formatDuration(row.duration);
  const statusLabel = row.status === 'pass' ? 'Passed' : row.status === 'fail' ? 'Failed' : 'Skipped';
  const searchText = escapeHtml(testSearchText(row));
  const description = `${escapeHtml(row.suite)} ${row.suite && row.test ? '›' : ''} ${escapeHtml(row.test)}`.trim();

  const hasSteps = row.steps && row.steps.length > 0;
  const stepsHtml = hasSteps
    ? `
    <div class="report-section">
      <div class="report-section-title">Steps</div>
      <div class="report-steps-list">
        ${row.steps!.map((s, i) => `
        <div class="report-step-row">
          <span class="report-step-icon report-step-passed">✓</span>
          <span class="report-step-index">${i + 1}</span>
          <span class="report-step-title">${escapeHtml(s)}</span>
        </div>`).join('')}
      </div>
    </div>`
    : `<div class="report-section">
      <div class="report-section-title">Steps</div>
      <p class="report-no-steps">No steps recorded. Use <code>step('name')</code> in your test to record steps.</p>
    </div>`;

  const errorBlock =
    row.error !== undefined
      ? `<div class="report-section report-error-section">
        <div class="report-section-title">Error</div>
        <div class="report-error-content">
          <pre class="report-error-message">${escapeHtml(row.error.message)}</pre>
          ${row.error.stack ? `<pre class="report-error-stack">${escapeHtml(row.error.stack)}</pre>` : ''}
          <button type="button" class="report-copy-btn" data-copy="error">Copy</button>
        </div>
      </div>`
      : '';

  const tagsHtml =
    row.tags && row.tags.length > 0
      ? `<div class="report-tags-row">${row.tags.map((t) => `<span class="report-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

  const fileLine = row.file ? `<div class="report-source">${escapeHtml(row.file)}</div>` : '';

  return `
    <div class="report-test-row report-test-${row.status}" data-expanded="false" data-search="${searchText}" data-index="${index}">
      <span class="report-dot ${row.status}"></span>
      <div class="report-test-body">
        <div class="report-test-header" role="button" tabindex="0" aria-expanded="false">
          <span class="report-test-name">${description}</span>
          <span class="report-test-meta">
            <span class="report-test-duration" title="Duration">${durationStr}</span>
            <span class="report-status-badge status-${row.status}">${statusLabel}</span>
            <span class="report-chevron">▶</span>
          </span>
        </div>
        ${tagsHtml}
        ${fileLine}
        <div class="report-test-details">
          ${stepsHtml}
          ${errorBlock}
        </div>
      </div>
    </div>`;
}

/** Build HTML for a file group (collapsible section with test list). */
function buildFileGroupHtml(fileKey: string, fileLabel: string, tests: TestRow[], startIndex: number): string {
  const count = tests.length;
  const passed = tests.filter((t) => t.status === 'pass').length;
  const failed = tests.filter((t) => t.status === 'fail').length;
  const skipped = tests.filter((t) => t.status === 'skip').length;
  const testsHtml = tests.map((t, i) => buildTestRowHtml(t, startIndex + i)).join('');
  const fileId = 'file-' + escapeHtml(fileKey).replace(/[^a-z0-9-]/gi, '_');

  return `
  <div class="report-file-group" data-file="${escapeHtml(fileKey)}" data-search="${escapeHtml((fileKey + ' ' + tests.map(testSearchText).join(' ')).toLowerCase())}">
    <div class="report-file-header" role="button" tabindex="0" aria-expanded="true" data-target="${fileId}">
      <span class="report-file-chevron">▼</span>
      <span class="report-file-path">${escapeHtml(fileLabel)}</span>
      <span class="report-file-count">${count} test${count !== 1 ? 's' : ''}</span>
      <span class="report-file-badges">
        ${passed > 0 ? `<span class="report-file-badge pass">✓ ${passed}</span>` : ''}
        ${failed > 0 ? `<span class="report-file-badge fail">× ${failed}</span>` : ''}
        ${skipped > 0 ? `<span class="report-file-badge skip">⊘ ${skipped}</span>` : ''}
      </span>
    </div>
    <div id="${fileId}" class="report-file-tests">
      ${testsHtml}
    </div>
  </div>`;
}

export function generateHtmlReport(result: RunResult): string {
  const title = 'CSTesting Report';
  const passed = result.passed;
  const failed = result.failed;
  const skipped = result.skipped;
  const total = result.total;
  const passedTests = result.passedTests ?? [];
  const skippedTests = result.skippedTests ?? [];
  const errors = result.errors ?? [];

  const allTests: TestRow[] = [
    ...passedTests.map((t) => ({
      suite: t.suite,
      test: t.test,
      status: 'pass' as Status,
      duration: t.duration,
      steps: t.steps,
      file: t.file,
      tags: t.tags,
    })),
    ...errors.map((e) => ({
      suite: e.suite,
      test: e.test,
      status: 'fail' as Status,
      duration: e.duration,
      steps: e.steps,
      error: e.error,
      file: e.file,
      tags: e.tags,
    })),
    ...skippedTests.map((t) => ({
      suite: t.suite,
      test: t.test,
      status: 'skip' as Status,
      duration: t.duration ?? 0,
      steps: t.steps,
      file: t.file,
      tags: t.tags,
    })),
  ];

  // Group by file (use "(no file)" for empty)
  const byFile = new Map<string, TestRow[]>();
  for (const row of allTests) {
    const key = row.file ?? '(no file)';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(row);
  }

  let index = 0;
  const fileGroupsHtml = Array.from(byFile.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fileKey, tests]) => {
      const html = buildFileGroupHtml(fileKey, fileKey, tests, index);
      index += tests.length;
      return html;
    })
    .join('');

  const dateStr = new Date().toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const totalTimeStr = formatTotalTime(result.duration);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #0f172a; color: #e2e8f0; line-height: 1.5; }
    .report-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; padding: 16px 24px; background: #1e293b; border-bottom: 1px solid #334155; }
    .report-search-wrap { flex: 1; min-width: 200px; max-width: 400px; }
    .report-search-wrap input { width: 100%; padding: 10px 12px 10px 36px; border: 1px solid #475569; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 14px; }
    .report-search-wrap input::placeholder { color: #64748b; }
    .report-search-wrap input:focus { outline: 2px solid #3b82f6; outline-offset: 0; }
    .report-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b; pointer-events: none; }
    .report-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 14px; }
    .report-summary-item { display: flex; align-items: center; gap: 6px; }
    .report-summary-item.all { font-weight: 600; color: #94a3b8; }
    .report-summary-item.passed { color: #22c55e; }
    .report-summary-item.failed { color: #ef4444; }
    .report-summary-item.skipped { color: #eab308; }
    .report-meta { font-size: 12px; color: #64748b; margin-top: 4px; }
    .report-content { padding: 16px 24px 32px; }
    .report-file-group { margin-bottom: 8px; border-radius: 8px; background: #1e293b; overflow: hidden; border: 1px solid #334155; }
    .report-file-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
    .report-file-header:hover { background: #334155; }
    .report-file-chevron { font-size: 10px; color: #94a3b8; transition: transform 0.2s; }
    .report-file-group.collapsed .report-file-chevron { transform: rotate(-90deg); }
    .report-file-group.collapsed .report-file-tests { display: none; }
    .report-file-path { font-weight: 600; color: #e2e8f0; word-break: break-all; flex: 1; min-width: 0; }
    .report-file-count { font-size: 12px; color: #64748b; }
    .report-file-badges { display: flex; gap: 8px; }
    .report-file-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
    .report-file-badge.pass { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .report-file-badge.fail { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .report-file-badge.skip { background: rgba(234, 179, 8, 0.2); color: #eab308; }
    .report-file-tests { padding: 0 8px 8px; }
    .report-test-row { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; border-radius: 6px; background: #0f172a; border: 1px solid #334155; overflow: hidden; }
    .report-test-row.hidden { display: none !important; }
    .report-file-group.hidden { display: none !important; }
    .report-test-row .report-test-body { flex: 1; min-width: 0; }
    .report-test-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 14px; cursor: pointer; transition: background 0.15s; }
    .report-test-header:hover { background: #1e293b; }
    .report-test-name { font-weight: 500; word-break: break-word; }
    .report-test-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; font-size: 13px; }
    .report-test-duration { color: #64748b; }
    .report-chevron { font-size: 10px; color: #64748b; transition: transform 0.2s; }
    .report-test-row.expanded .report-chevron { transform: rotate(90deg); }
    .report-status-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .report-status-badge.status-pass { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .report-status-badge.status-fail { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .report-status-badge.status-skip { background: rgba(234, 179, 8, 0.2); color: #eab308; }
    .report-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin: 14px 0 0 10px; }
    .report-dot.pass { background: #22c55e; }
    .report-dot.fail { background: #ef4444; }
    .report-dot.skip { background: #eab308; }
    .report-tags-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }
    .report-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #334155; color: #94a3b8; }
    .report-source { font-size: 11px; color: #64748b; padding: 0 14px 8px; font-family: ui-monospace, monospace; }
    .report-test-details { max-height: 0; overflow: hidden; transition: max-height 0.25s ease-out; }
    .report-test-row.expanded .report-test-details { max-height: 3000px; transition: max-height 0.35s ease-in; }
    .report-test-details > div { padding: 12px 14px 12px 24px; border-top: 1px solid #334155; }
    .report-section { margin: 0 0 16px; }
    .report-section:last-child { margin-bottom: 0; }
    .report-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 8px; }
    .report-steps-list { border: 1px solid #334155; border-radius: 6px; overflow: hidden; background: #0f172a; }
    .report-step-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #1e293b; }
    .report-step-row:last-child { border-bottom: none; }
    .report-step-icon { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
    .report-step-passed { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .report-error-section .report-error-content { position: relative; border: 1px solid #7f1d1d; border-radius: 6px; background: rgba(127, 29, 29, 0.15); padding: 12px; }
    .report-error-message, .report-error-stack { margin: 0; font-size: 13px; white-space: pre-wrap; word-break: break-word; color: #fca5a5; font-family: ui-monospace, monospace; }
    .report-error-stack { margin-top: 8px; font-size: 12px; color: #94a3b8; }
    .report-copy-btn { margin-top: 8px; padding: 6px 12px; font-size: 12px; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0; cursor: pointer; }
    .report-copy-btn:hover { background: #334155; }
    .report-no-steps { color: #64748b; font-size: 13px; margin: 0; padding: 12px; }
    .report-no-steps code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .report-empty-msg { color: #64748b; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="report-top">
    <div class="report-search-wrap" style="position:relative">
      <span class="report-search-icon" aria-hidden="true">🔍</span>
      <input type="text" id="report-search" placeholder="Search by file name, test name, or tag..." autocomplete="off" />
    </div>
    <div class="report-summary-block">
      <div class="report-summary">
        <span class="report-summary-item all">All ${total}</span>
        <span class="report-summary-item passed">✓ Passed ${passed}</span>
        <span class="report-summary-item failed">× Failed ${failed}</span>
        <span class="report-summary-item">Flaky 0</span>
        <span class="report-summary-item skipped">Skipped ${skipped}</span>
      </div>
      <div class="report-meta">${escapeHtml(dateStr)} · Total time: ${totalTimeStr}</div>
    </div>
  </div>

  <div class="report-content">
    ${fileGroupsHtml || '<p class="report-empty-msg">No tests to show.</p>'}
  </div>

  <script>
(function() {
  var searchInput = document.getElementById('report-search');
  var fileGroups = document.querySelectorAll('.report-file-group');
  var testRows = document.querySelectorAll('.report-test-row');

  function onSearch() {
    var q = (searchInput.value || '').trim().toLowerCase();
    if (!q) {
      fileGroups.forEach(function(g) { g.classList.remove('hidden'); });
      testRows.forEach(function(r) { r.classList.remove('hidden'); });
      return;
    }
    fileGroups.forEach(function(group) {
      var groupSearch = group.getAttribute('data-search') || '';
      var fileMatch = groupSearch.indexOf(q) !== -1;
      var tests = group.querySelectorAll('.report-test-row');
      var anyVisible = false;
      tests.forEach(function(row) {
        var rowSearch = (row.getAttribute('data-search') || '');
        var match = fileMatch || rowSearch.indexOf(q) !== -1;
        row.classList.toggle('hidden', !match);
        if (match) anyVisible = true;
      });
      group.classList.toggle('hidden', !anyVisible);
    });
  }
  searchInput.addEventListener('input', onSearch);
  searchInput.addEventListener('keydown', function(e) { if (e.key === 'Escape') { searchInput.value = ''; onSearch(); searchInput.blur(); } });

  fileGroups.forEach(function(group) {
    var header = group.querySelector('.report-file-header');
    var targetId = header && header.getAttribute('data-target');
    var target = targetId ? document.getElementById(targetId) : null;
    if (!header || !target) return;
    header.addEventListener('click', function() {
      group.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', group.classList.contains('collapsed') ? 'false' : 'true');
    });
  });

  testRows.forEach(function(row) {
    var header = row.querySelector('.report-test-header');
    if (!header) return;
    function toggle() {
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

  document.querySelectorAll('.report-copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var content = btn.closest('.report-error-content');
      if (!content) return;
      var pre = content.querySelector('.report-error-message');
      var text = pre ? pre.textContent : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy'; }, 1500); });
      }
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
