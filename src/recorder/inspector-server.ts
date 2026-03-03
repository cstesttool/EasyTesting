/**
 * HTTP server for the codegen inspector UI (Playwright-style second window).
 * Serves the inspector page and /steps, /script endpoints for live updates.
 */

import * as http from 'http';
import type { RecordedStep } from './recorded-step';
import { toConf, toJs, toTs, toJava } from './exporters';

const INSPECTOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CSTesting — Recording</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-monospace, monospace; margin: 0; padding: 0; background: #1e1e1e; color: #d4d4d4; font-size: 13px; }
    .recording-banner { background: #0e639c; color: #fff; padding: 8px 14px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .recording-banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ec9b0; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.5; } }
    .recording-banner .instruction { color: rgba(255,255,255,0.9); }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #252526; border-bottom: 1px solid #3c3c3c; }
    .header h1 { margin: 0; font-size: 14px; font-weight: 600; }
    .tabs { display: flex; gap: 4px; }
    .tabs button { padding: 6px 12px; border: 1px solid #3c3c3c; background: #2d2d2d; color: #d4d4d4; cursor: pointer; border-radius: 4px; font-size: 12px; }
    .tabs button:hover { background: #3c3c3c; }
    .tabs button.active { background: #0e639c; border-color: #0e639c; color: #fff; }
    .actions { display: flex; gap: 8px; align-items: center; }
    .actions button { padding: 6px 12px; border: 1px solid #3c3c3c; background: #0e639c; color: #fff; cursor: pointer; border-radius: 4px; font-size: 12px; }
    .actions button.secondary { background: #2d2d2d; color: #d4d4d4; }
    .actions button.record-btn { background: #0d7d0d; }
    .actions button.record-btn:hover { background: #0e8e0e; }
    .actions button.record-btn.started { background: #2d2d2d; cursor: default; }
    .actions button.pause-btn { background: #c17a0a; }
    .actions button.pause-btn:hover { background: #d48a0a; }
    .actions button.pause-btn.paused { background: #0d7d0d; }
    .actions button.pause-btn.paused:hover { background: #0e8e0e; }
    #pauseRecordBtn { display: none; }
    #pauseRecordBtn.visible { display: inline-block; }
    .hint { font-size: 11px; color: #858585; margin-left: 12px; }
    .panel { padding: 12px; height: calc(100vh - 100px); overflow: auto; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    .panel [data-tab] { display: none; }
    .panel [data-tab].active { display: block; }
  </style>
</head>
<body>
  <div class="recording-banner">
    <span class="dot"></span>
    <strong>Recording</strong>
    <span class="instruction" id="bannerInstruction">— Click <strong>Start record</strong> below to begin. Then use the other browser tab to click, type, and navigate. Press Ctrl+C in the terminal to stop and save.</span>
  </div>
  <div class="header">
    <h1>Recorded steps</h1>
    <div class="actions" style="margin-right: 8px;">
      <button type="button" id="startRecordBtn" class="record-btn">Start record</button>
      <button type="button" id="pauseRecordBtn" class="pause-btn">Pause</button>
    </div>
    <div class="tabs">
      <button type="button" data-tab-btn="conf" class="active">Config (.conf)</button>
      <button type="button" data-tab-btn="js">JavaScript</button>
      <button type="button" data-tab-btn="ts">TypeScript</button>
      <button type="button" data-tab-btn="java">Java</button>
    </div>
    <div class="actions">
      <button type="button" id="copyBtn">Copy</button>
      <span class="hint">Stop: Ctrl+C in terminal</span>
    </div>
  </div>
  <div class="panel">
    <pre data-tab="conf" class="active" id="confPre"></pre>
    <pre data-tab="js" id="jsPre"></pre>
    <pre data-tab="ts" id="tsPre"></pre>
    <pre data-tab="java" id="javaPre"></pre>
  </div>
  <script>
    var currentFormat = 'conf';
    function setTab(format) {
      currentFormat = format;
      document.querySelectorAll('[data-tab]').forEach(function(el) { el.classList.remove('active'); });
      document.querySelectorAll('[data-tab-btn]').forEach(function(el) { el.classList.remove('active'); });
      document.querySelector('[data-tab="' + format + '"]').classList.add('active');
      document.querySelector('[data-tab-btn="' + format + '"]').classList.add('active');
    }
    document.querySelectorAll('[data-tab-btn]').forEach(function(btn) {
      btn.addEventListener('click', function() { setTab(btn.getAttribute('data-tab-btn')); });
    });
    function update() {
      fetch('/script?format=conf').then(function(r) { return r.text(); }).then(function(t) { document.getElementById('confPre').textContent = t || '# No steps yet'; });
      fetch('/script?format=js').then(function(r) { return r.text(); }).then(function(t) { document.getElementById('jsPre').textContent = t || '// No steps yet'; });
      fetch('/script?format=ts').then(function(r) { return r.text(); }).then(function(t) { document.getElementById('tsPre').textContent = t || '// No steps yet'; });
      fetch('/script?format=java').then(function(r) { return r.text(); }).then(function(t) { document.getElementById('javaPre').textContent = t || '// No steps yet'; });
    }
    document.getElementById('copyBtn').addEventListener('click', function() {
      fetch('/script?format=' + currentFormat).then(function(r) { return r.text(); }).then(function(t) {
        navigator.clipboard.writeText(t || '').then(function() { alert('Copied to clipboard'); });
      });
    });
    document.getElementById('startRecordBtn').addEventListener('click', function() {
      var btn = this;
      if (btn.classList.contains('started')) return;
      btn.disabled = true;
      fetch('/start-recording', { method: 'POST' }).then(function(r) {
        if (r.ok) {
          btn.textContent = 'Recording…';
          btn.classList.add('started');
          var pauseBtn = document.getElementById('pauseRecordBtn');
          if (pauseBtn) { pauseBtn.classList.add('visible'); pauseBtn.textContent = 'Pause'; pauseBtn.classList.remove('paused'); }
          var inst = document.getElementById('bannerInstruction');
          if (inst) inst.textContent = '— Use the other browser tab to click, type, and navigate. Recorded steps appear below. Press Ctrl+C in the terminal to stop and save.';
        }
        btn.disabled = false;
      });
    });
    document.getElementById('pauseRecordBtn').addEventListener('click', function() {
      var btn = this;
      var isPaused = btn.classList.toggle('paused');
      fetch(isPaused ? '/pause-recording' : '/resume-recording', { method: 'POST' }).then(function(r) {
        if (r.ok) btn.textContent = isPaused ? 'Resume' : 'Pause';
      });
    });
    setInterval(update, 500);
    update();
  </script>
</body>
</html>`;

export function createInspectorServer(
  getSteps: () => RecordedStep[],
  onStartRecording?: () => void | Promise<void>,
  callbacks?: { onPause?: () => void; onResume?: () => void }
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(INSPECTOR_HTML);
      return;
    }
    if (url === '/start-recording' && method === 'POST') {
      if (onStartRecording) {
        Promise.resolve(onStartRecording()).then(
          () => {
            res.writeHead(200);
            res.end();
          },
          (err) => {
            res.writeHead(500);
            res.end(String(err));
          }
        );
      } else {
        res.writeHead(200);
        res.end();
      }
      return;
    }
    if (url === '/pause-recording' && method === 'POST') {
      callbacks?.onPause?.();
      res.writeHead(200);
      res.end();
      return;
    }
    if (url === '/resume-recording' && method === 'POST') {
      callbacks?.onResume?.();
      res.writeHead(200);
      res.end();
      return;
    }
    if (url.startsWith('/script?')) {
      const format = new URL(url, 'http://localhost').searchParams.get('format') || 'conf';
      const steps = getSteps();
      let body: string;
      if (format === 'js') body = toJs(steps);
      else if (format === 'ts') body = toTs(steps);
      else if (format === 'java') body = toJava(steps);
      else body = toConf(steps);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(body);
      return;
    }
    if (url === '/steps') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSteps()));
      return;
    }
    res.writeHead(404);
    res.end();
  });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 9321;
      resolve({ server, port });
    });
  });
}
