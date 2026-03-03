/**
 * Launch Chrome, Edge, Opera, or Firefox with remote-debugging-port for CDP.
 * Chrome uses chrome-launcher; Edge/Opera/Firefox are spawned with --remote-debugging-port.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { spawn, type ChildProcess } from 'child_process';
import { launch as launchChromeBinary } from 'chrome-launcher';

export type BrowserType = 'chrome' | 'edge' | 'opera' | 'firefox';

export interface LaunchOptions {
  headless?: boolean;
  port?: number;
  args?: string[];
  /** Custom profile directory. If not set, a temp dir is used. */
  userDataDir?: string;
  /** Which browser to launch. Default: 'chrome'. */
  browser?: BrowserType;
}

export interface LaunchedChrome {
  port: number;
  kill: () => void | Promise<void>;
  /** When set (e.g. Firefox), use this as CDP target instead of port+host. */
  webSocketUrl?: string;
}

function makeUserDataDir(prefix: string): string {
  const base = process.cwd();
  const dirName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const candidate = path.join(base, 'node_modules', '.cache', dirName);
  try {
    fs.mkdirSync(candidate, { recursive: true });
    return path.resolve(candidate);
  } catch {
    const fallback = path.join(os.tmpdir(), dirName);
    fs.mkdirSync(fallback, { recursive: true });
    return path.resolve(fallback);
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(() => {});
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/** Resolve browser executable path. Override with env: CSTESTING_EDGE_PATH, CSTESTING_OPERA_PATH, CSTESTING_FIREFOX_PATH. */
function getBrowserPath(browser: BrowserType): string | null {
  const envKeys: Record<BrowserType, string> = {
    chrome: '',
    edge: 'CSTESTING_EDGE_PATH',
    opera: 'CSTESTING_OPERA_PATH',
    firefox: 'CSTESTING_FIREFOX_PATH',
  };
  const envPath = envKeys[browser] && process.env[envKeys[browser]];
  if (envPath && fs.existsSync(envPath)) return envPath;

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (browser === 'edge') {
    if (isWin) {
      const candidates = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
      ];
      for (const p of candidates) if (fs.existsSync(p)) return p;
    }
    if (isMac) {
      const p = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
      if (fs.existsSync(p)) return p;
    }
    // Linux
    const linux = '/usr/bin/microsoft-edge';
    if (!isWin && fs.existsSync(linux)) return linux;
  }

  if (browser === 'opera') {
    if (isWin) {
      const local = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'launcher.exe');
      if (fs.existsSync(local)) return local;
      const pf = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Opera', 'launcher.exe');
      if (fs.existsSync(pf)) return pf;
    }
    if (isMac) {
      const p = '/Applications/Opera.app/Contents/MacOS/Opera';
      if (fs.existsSync(p)) return p;
    }
    const linux = '/usr/bin/opera';
    if (!isWin && fs.existsSync(linux)) return linux;
  }

  if (browser === 'firefox') {
    if (isWin) {
      const pf = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox', 'firefox.exe');
      if (fs.existsSync(pf)) return pf;
      const pf64 = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Mozilla Firefox', 'firefox.exe');
      if (fs.existsSync(pf64)) return pf64;
    }
    if (isMac) {
      const p = '/Applications/Firefox.app/Contents/MacOS/firefox';
      if (fs.existsSync(p)) return p;
    }
    const linux = '/usr/bin/firefox';
    if (!isWin && fs.existsSync(linux)) return linux;
  }

  return null;
}

/** Launch Firefox with port 0 and capture WebSocket URL from stderr (Firefox prints "DevTools listening on ws://..."). */
function launchFirefoxWithStderr(options: {
  headless: boolean;
  args: string[];
  userDataDir: string;
}): Promise<{ port: number; kill: () => void; webSocketUrl: string }> {
  const exe = getBrowserPath('firefox');
  if (!exe) {
    throw new Error('Firefox not found. Install Firefox or set CSTESTING_FIREFOX_PATH to the executable path.');
  }
  const { headless, args, userDataDir } = options;
  const spawnArgs = [
    '--remote-debugging-port=0',
    '-profile',
    userDataDir,
    ...(headless ? ['-headless'] : []),
    ...args,
  ];

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(exe, spawnArgs, {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const kill = () => {
      try {
        if (child.pid) process.kill(child.pid, 'SIGTERM');
      } catch {
        try {
          if (child.pid) process.kill(child.pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
      try {
        if (fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        }
      } catch {
        // ignore
      }
    };
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        kill();
        reject(
          new Error(
            'Firefox did not print the debug WebSocket URL within 25s. Ensure Firefox 86+ is installed and no other instance is using the profile.'
          )
        );
      }
    }, 25000);
    // Firefox prints e.g. "DevTools listening on ws://127.0.0.1:9222/devtools/browser/<id>"
    const wsRegex = /(wss?:\/\/[^\s'")\]]+?)(?=[\s)'\]"]|$)/i;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      const m = stderr.match(wsRegex);
      if (m && m[1]) {
        let url = m[1].trim().replace(/[)\]\s.,;]+$/, '');
        if (url.startsWith('ws://') || url.startsWith('wss://')) {
          url = url.replace(/^wss?:\/\/localhost/i, (url.startsWith('wss:') ? 'wss://127.0.0.1' : 'ws://127.0.0.1'));
          const portMatch = url.match(/:(\d+)\//);
          const port = portMatch ? parseInt(portMatch[1], 10) : 0;
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ port, kill, webSocketUrl: url });
          }
        }
      }
    });
    child.stderr?.on('end', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        kill();
        reject(
          new Error(
            'Firefox exited without printing the debug URL. Try closing other Firefox windows or use Chrome/Edge for recording.'
          )
        );
      }
    });
    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
    child.unref();
  });
}

function launchWithSpawn(
  browser: BrowserType,
  options: { port: number; headless: boolean; args: string[]; userDataDir: string }
): Promise<{ port: number; kill: () => void; webSocketUrl?: string }> {
  const exe = getBrowserPath(browser);
  if (!exe) {
    const envHint = browser === 'edge' ? 'CSTESTING_EDGE_PATH' : browser === 'opera' ? 'CSTESTING_OPERA_PATH' : 'CSTESTING_FIREFOX_PATH';
    throw new Error(
      `${browser} not found. Install ${browser} or set ${envHint} to the executable path.`
    );
  }

  const { port, headless, args, userDataDir } = options;
  const debugFlag = '--remote-debugging-port';
  const spawnArgs = [
    `${debugFlag}=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-default-apps',
    '--no-default-browser-check',
    ...(headless ? ['--headless=new', '--disable-gpu', '--no-sandbox'] : []),
    ...args,
  ];

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(exe, spawnArgs, {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    let resolved = false;
    const kill = () => {
      try {
        if (child.pid) process.kill(child.pid, 'SIGTERM');
      } catch {
        try {
          if (child.pid) process.kill(child.pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
      try {
        if (!options.userDataDir && fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        }
      } catch {
        // ignore
      }
    };
    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    child.unref();
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ port, kill });
      }
    }, 1500);
    const checkPort = () => {
      const sock = net.createConnection(port, '127.0.0.1', () => {
        sock.destroy();
        if (!resolved) {
          clearTimeout(t);
          resolved = true;
          resolve({ port, kill });
        }
      });
      sock.on('error', () => {});
      sock.setTimeout(200, () => sock.destroy());
    };
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      checkPort();
      if (attempts > 25) {
        clearInterval(id);
        clearTimeout(t);
        if (!resolved) {
          resolved = true;
          resolve({ port, kill });
        }
      }
    }, 100);
  });
}

export async function launchChrome(options: LaunchOptions = {}): Promise<LaunchedChrome> {
  const { headless = true, port = 0, args = [], userDataDir: customUserDataDir } = options;
  const chromeFlags = [...args];
  if (headless) {
    chromeFlags.push('--headless=new', '--disable-gpu', '--no-sandbox');
  }
  const userDataDir = customUserDataDir ?? makeUserDataDir('cstesting-chrome');
  const chrome = await launchChromeBinary({
    port: port || undefined,
    chromeFlags,
    userDataDir,
  });
  return {
    port: chrome.port,
    kill: () => {
      chrome.kill();
      try {
        if (!customUserDataDir && fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        }
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Launch Chrome, Edge, Opera, or Firefox with CDP remote debugging.
 * Use options.browser to choose; default is 'chrome'.
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<LaunchedChrome> {
  const browser = options.browser || 'chrome';
  const headless = options.headless ?? true;
  const args = options.args ?? [];
  const customUserDataDir = options.userDataDir;

  if (browser === 'chrome') {
    return launchChrome(options);
  }

  if (browser === 'firefox') {
    const userDataDir = customUserDataDir ?? makeUserDataDir('cstesting-firefox');
    const { port, kill, webSocketUrl } = await launchFirefoxWithStderr({
      headless,
      args,
      userDataDir,
    });
    return { port, kill, webSocketUrl };
  }

  const port = options.port || (await findFreePort());
  const userDataDir = customUserDataDir ?? makeUserDataDir(`cstesting-${browser}`);
  const { port: actualPort, kill } = await launchWithSpawn(browser, {
    port,
    headless,
    args,
    userDataDir,
  });
  return {
    port: actualPort,
    kill,
  };
}
