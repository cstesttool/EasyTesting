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
  | { action: 'click'; locator: string }
  | { action: 'wait'; ms: number }
  | { action: 'screenshot'; path: string; fullPage?: boolean; element?: string }
  | { action: 'doubleClick'; locator: string }
  | { action: 'rightClick'; locator: string }
  | { action: 'hover'; locator: string }
  | { action: 'switchTab'; index: number }
  | { action: 'frame'; selector: string }  // 'main' = back to main; 'sel1,sel2' = nested frames
  | { action: 'check'; locator: string }
  | { action: 'uncheck'; locator: string }
  | { action: 'select'; locator: string; option: { value?: string; label?: string } }
  | { action: 'dialog'; behavior: 'accept' | 'dismiss'; promptText?: string }  // promptText for dialog=prompt:value
  | { action: 'close' }  // close browser (next test case will get a new browser if needed)
  | { action: 'verifyText'; expected: string; selector?: string; index?: number }  // assertText: verify page or element
  | { action: 'assertTextEqualsAttribute'; textSelector: string; attrSelector: string; attributeName: string }  // assert text equals attr value
  | { action: 'assertAttribute'; selector: string; attributeName: string; expected: string };  // assert element attribute value equals expected

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

  // doubleClick=, rightClick=, hover=
  const doubleClickMatch = trimmed.match(/^doubleClick=(.+)$/);
  if (doubleClickMatch) return { action: 'doubleClick', locator: doubleClickMatch[1].trim() };
  const rightClickMatch = trimmed.match(/^rightClick=(.+)$/);
  if (rightClickMatch) return { action: 'rightClick', locator: rightClickMatch[1].trim() };
  const hoverMatch = trimmed.match(/^hover=(.+)$/);
  if (hoverMatch) return { action: 'hover', locator: hoverMatch[1].trim() };

  // check=, uncheck=
  const checkMatch = trimmed.match(/^check=(.+)$/);
  if (checkMatch) return { action: 'check', locator: checkMatch[1].trim() };
  const uncheckMatch = trimmed.match(/^uncheck=(.+)$/);
  if (uncheckMatch) return { action: 'uncheck', locator: uncheckMatch[1].trim() };

  // wait:2000 (ms) or wait:2 (seconds if < 100)
  const waitMatch = trimmed.match(/^wait:(\d+)$/);
  if (waitMatch) {
    let ms = parseInt(waitMatch[1], 10);
    if (ms > 0 && ms < 100) ms *= 1000; // treat as seconds
    return { action: 'wait', ms };
  }

  // screenshot=path [fullPage] [element=locator] — getScreenshot= is an alias
  const screenshotMatch = trimmed.match(/^(?:screenshot|getScreenshot)=(.+)$/i);
  if (screenshotMatch) {
    const rest = screenshotMatch[1].trim();
    const parts = rest.split(/\s+/);
    const path = parts[0] || 'screenshot.png';
    let fullPage = false;
    let element: string | undefined;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].toLowerCase() === 'fullpage') fullPage = true;
      else if (parts[i].toLowerCase().startsWith('element=')) {
        element = parts[i].slice(8).trim();
      }
    }
    return { action: 'screenshot', path, fullPage: fullPage || undefined, element };
  }

  // switchTab=0 (0-based index)
  const switchTabMatch = trimmed.match(/^switchTab=(\d+)$/);
  if (switchTabMatch) {
    return { action: 'switchTab', index: parseInt(switchTabMatch[1], 10) };
  }

  // dialog=accept | dialog=dismiss | dialog=prompt:value — how to handle next alert/confirm/prompt
  const dialogMatch = trimmed.match(/^dialog=(accept|dismiss|prompt:(.*))$/i);
  if (dialogMatch) {
    const kind = dialogMatch[1].toLowerCase();
    if (kind === 'accept') return { action: 'dialog', behavior: 'accept' };
    if (kind === 'dismiss') return { action: 'dialog', behavior: 'dismiss' };
    if (kind.startsWith('prompt:')) {
      const promptText = dialogMatch[2] != null ? dialogMatch[2].trim() : '';
      return { action: 'dialog', behavior: 'accept', promptText };
    }
  }

  // close or closeBrowser — close the browser (next test case gets a new one)
  if (/^closeBrowser?$/i.test(trimmed)) return { action: 'close' };

  // assertTextEqualsAttribute=textSelector=attrSelector=attr:attributeName — assert text of textSelector equals attribute value of attrSelector
  const assertTextEqualsAttrMatch = trimmed.match(/^assertTextEqualsAttribute=(.+)$/i);
  if (assertTextEqualsAttrMatch) {
    const rest = assertTextEqualsAttrMatch[1].trim();
    const attrIdx = rest.indexOf('=attr:');
    if (attrIdx !== -1) {
      const attributeName = rest.slice(attrIdx + 6).trim();
      const beforePart = rest.slice(0, attrIdx).trim();
      const lastEq = beforePart.lastIndexOf('=');
      if (lastEq !== -1 && attributeName) {
        const textSelector = beforePart.slice(0, lastEq).trim();
        const attrSelector = beforePart.slice(lastEq + 1).trim();
        return { action: 'assertTextEqualsAttribute', textSelector, attrSelector, attributeName };
      }
    }
  }

  // assertAttribute=selector=attr:attributeName=expected — assert element's attribute value equals expected
  const assertAttrMatch = trimmed.match(/^assertAttribute=(.+)$/i);
  if (assertAttrMatch) {
    const rest = assertAttrMatch[1].trim();
    const attrIdx = rest.indexOf('=attr:');
    if (attrIdx !== -1) {
      const afterAttr = rest.slice(attrIdx + 6).trim();
      const eqPos = afterAttr.indexOf('=');
      if (eqPos !== -1) {
        const attributeName = afterAttr.slice(0, eqPos).trim();
        const expected = afterAttr.slice(eqPos + 1).trim();
        const selector = rest.slice(0, attrIdx).trim();
        if (selector && attributeName) return { action: 'assertAttribute', selector, attributeName, expected };
      }
    }
  }

  // assertText=expected | assertText=selector=expected | assertText=selector=0=expected
  // XPath index form: assertText=(//*[@type="checkbox"])[1]=monday (index inside XPath, no separate index)
  const assertTextMatch = trimmed.match(/^assertText=(.+)$/i);
  if (assertTextMatch) {
    const rest = assertTextMatch[1].trim();
    const eq = rest.indexOf('=');
    if (eq === -1) {
      return { action: 'verifyText', expected: rest };
    }
    // XPath index form: (//...)[n]=expected → selector is (//...)[n], no separate index
    const xpathIndexMatch = rest.match(/^(.+)\)(\[\d+\])=(.*)$/);
    if (xpathIndexMatch) {
      const selector = (xpathIndexMatch[1].trim() + ')' + xpathIndexMatch[2]).trim();
      const expected = xpathIndexMatch[3].trim();
      return { action: 'verifyText', expected, selector };
    }
    // selector=index=expected (e.g. [type="checkbox"]=2=monday)
    const indexPattern = rest.match(/^(.+)=(\d+)=(.*)$/);
    if (indexPattern) {
      const selector = indexPattern[1].trim();
      const index = parseInt(indexPattern[2], 10);
      const expected = indexPattern[3].trim();
      return { action: 'verifyText', expected, selector, index };
    }
    // no index: selector=expected — if selector contains ]= (XPath predicate), split at last ]= so @for="monday" stays intact
    const bracketEq = rest.lastIndexOf(']=');
    if (bracketEq !== -1) {
      const selector = rest.slice(0, bracketEq + 1).trim();
      const expected = rest.slice(bracketEq + 2).trim();
      return { action: 'verifyText', expected, selector };
    }
    const selector = rest.slice(0, eq).trim();
    const expected = rest.slice(eq + 1).trim();
    return { action: 'verifyText', expected, selector };
  }

  // frame=main | frame=selector | frame=sel1,sel2 (nested)
  const frameMatch = trimmed.match(/^frame=(.+)$/);
  if (frameMatch) {
    return { action: 'frame', selector: frameMatch[1].trim() };
  }

  // select=<locator>=value:x or select=<locator>=label:Text
  const selectMatch = trimmed.match(/^select=(.+)$/);
  if (selectMatch) {
    const rest = selectMatch[1].trim();
    const valueIdx = rest.indexOf('=value:');
    const labelIdx = rest.indexOf('=label:');
    if (valueIdx !== -1) {
      const locator = rest.slice(0, valueIdx).trim();
      const value = rest.slice(valueIdx + 7).trim();
      return { action: 'select', locator, option: { value } };
    }
    if (labelIdx !== -1) {
      const locator = rest.slice(0, labelIdx).trim();
      const label = rest.slice(labelIdx + 7).trim();
      return { action: 'select', locator, option: { label } };
    }
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
