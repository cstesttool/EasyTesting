/**
 * Config file parser for config-driven tests.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Format (one step per line):
 *   # Test case name   - starts a new test case; all following steps belong to it until the next #
 *   headless=false   or   headed=true   - open browser in headed mode (visible window)
 *   goto:<url>                    - navigate to URL (optional, use at start)
 *   <label>:<locator>=value:<text> - type text into element (e.g. name:#user=value:john)
 *   click=<locator>               - click element (e.g. click=button[type="submit"])
 *
 * Example (one test case "Login Page - Mercury Tours" with 4 steps):
 *   # Login Page - Mercury Tours
 *   headed=true
 *   goto:https://demo.guru99.com/test/newtours/
 *   name:[name="userName"]=value:mercury
 *   click=[name="submit"]
 */

export type ConfigStep =
  | { action: 'goto'; url: string }
  | { action: 'type'; label: string; locator: string; value: string }
  | { action: 'click'; locator: string };

/** One test case: a name (from # line) and its steps. */
export interface ConfigTestCase {
  testCaseName: string;
  steps: ConfigStep[];
}

export interface ParsedConfig {
  name: string;
  /** If false, browser runs in headed mode (visible window). Default true (headless). */
  headless: boolean;
  /** When using sections (# lines), each item is one test case. Otherwise one item with all steps. */
  testCases: ConfigTestCase[];
}

/** Parse a single line into a step or null (comment/empty). Option lines (headless/headed) return null; caller handles options separately. */
function parseLine(line: string): ConfigStep | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // headless=false | headless=true | headed=true | headed=false (option, not a step)
  if (/^headless=(true|false)$/i.test(trimmed) || /^headed=(true|false)$/i.test(trimmed)) {
    return null;
  }

  // click=<locator>
  const clickMatch = trimmed.match(/^click=(.+)$/);
  if (clickMatch) {
    return { action: 'click', locator: clickMatch[1].trim() };
  }

  // goto:<url>
  const gotoMatch = trimmed.match(/^goto:(.+)$/);
  if (gotoMatch) {
    return { action: 'goto', url: gotoMatch[1].trim() };
  }

  // <label>:<locator>=value:<text>   (textbox - type value into locator)
  // Split on "=value:" so locators containing "=" (e.g. [name="userName"]) parse correctly
  const valueMarker = '=value:';
  const valueIdx = trimmed.indexOf(valueMarker);
  if (valueIdx !== -1) {
    const before = trimmed.slice(0, valueIdx);
    const value = trimmed.slice(valueIdx + valueMarker.length);
    const colonIdx = before.indexOf(':');
    if (colonIdx !== -1) {
      const label = before.slice(0, colonIdx).trim();
      const locator = before.slice(colonIdx + 1).trim();
      return { action: 'type', label, locator, value };
    }
  }

  return null;
}

/** Parse headless/headed from a line. Returns undefined if line is not an option. */
function parseHeadlessOption(line: string): boolean | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  const headlessMatch = trimmed.match(/^headless=(true|false)$/i);
  if (headlessMatch) return headlessMatch[1].toLowerCase() === 'true';
  const headedMatch = trimmed.match(/^headed=(true|false)$/i);
  if (headedMatch) return headedMatch[1].toLowerCase() !== 'true'; // headed=true → headless=false
  return undefined;
}

/**
 * Read config file and return parsed test cases and options.
 * Lines starting with # start a new test case (name = rest of line). All following steps belong to it until the next #.
 * @param filePath - Path to config file (e.g. login.conf)
 */
export function parseConfigFile(filePath: string): ParsedConfig {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);
  const testCases: ConfigTestCase[] = [];
  let headless = true;
  let currentName = name;
  let currentSteps: ConfigStep[] = [];
  const lines = content.split(/\r?\n/);

  function pushCurrent(): void {
    if (currentSteps.length > 0) {
      testCases.push({ testCaseName: currentName, steps: currentSteps });
      currentSteps = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      pushCurrent();
      currentName = trimmed.slice(1).trim() || 'Unnamed';
      continue;
    }
    const headlessOpt = parseHeadlessOption(line);
    if (headlessOpt !== undefined) {
      headless = headlessOpt;
      continue;
    }
    const step = parseLine(line);
    if (step) currentSteps.push(step);
  }
  pushCurrent();

  return { name, headless, testCases };
}
