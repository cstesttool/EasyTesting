/**
 * Launch Chrome with remote-debugging-port for CDP.
 * Uses chrome-launcher (no Playwright/Puppeteer).
 * Uses a custom userDataDir to avoid Windows EPERM on the default lighthouse temp folder.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { launch as launchChromeBinary } from 'chrome-launcher';

export interface LaunchOptions {
  headless?: boolean;
  port?: number;
  args?: string[];
  /** Custom Chrome profile directory. If not set, a dir under project or os.tmpdir() is used to avoid Windows EPERM. */
  userDataDir?: string;
}

export interface LaunchedChrome {
  port: number;
  kill: () => void | Promise<void>;
}

function makeUserDataDir(): string {
  const base = process.cwd();
  const dirName = `cstesting-chrome-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

export async function launchChrome(options: LaunchOptions = {}): Promise<LaunchedChrome> {
  const { headless = true, port = 0, args = [], userDataDir: customUserDataDir } = options;
  const chromeFlags = [...args];
  if (headless) {
    chromeFlags.push('--headless=new', '--disable-gpu', '--no-sandbox');
  }
  const userDataDir = customUserDataDir ?? makeUserDataDir();
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
        // ignore cleanup errors
      }
    },
  };
}
