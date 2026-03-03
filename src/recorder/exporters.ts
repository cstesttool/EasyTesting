/**
 * Export recorded steps to .conf, .js, .ts, or .java format.
 */

import type { RecordedStep } from './recorded-step';

/** Escape string for Java double-quoted literal. */
function javaStr(s: string): string {
  return (
    '"' +
    String(s)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') +
    '"'
  );
}

export function toConf(steps: RecordedStep[]): string {
  const lines: string[] = ['# Recorded script – edit and run with: cstesting <file.conf>', 'headless=false', ''];
  for (const s of steps) {
    if (s.action === 'goto' && s.url) {
      lines.push('goto:' + s.url);
    } else if (s.action === 'click' && s.selector) {
      lines.push('click=' + s.selector);
    } else if (s.action === 'doubleClick' && s.selector) {
      lines.push('doubleClick=' + s.selector);
    } else if (s.action === 'rightClick' && s.selector) {
      lines.push('rightClick=' + s.selector);
    } else if (s.action === 'type' && s.selector && s.value !== undefined) {
      lines.push('name:' + s.selector + '=value:' + s.value);
    } else if (s.action === 'select' && s.selector && s.value !== undefined) {
      lines.push('select=' + s.selector + '=value:' + s.value);
    } else if (s.action === 'select' && s.selector && (s as RecordedStep & { label?: string }).label) {
      lines.push('select=' + s.selector + '=label:' + (s as RecordedStep & { label: string }).label);
    } else if (s.action === 'check' && s.selector) {
      lines.push('check=' + s.selector);
    } else if (s.action === 'uncheck' && s.selector) {
      lines.push('uncheck=' + s.selector);
    } else if (s.action === 'hover' && s.selector) {
      lines.push('hover=' + s.selector);
    } else if (s.action === 'dragAndDrop' && s.sourceSelector && s.selector) {
      lines.push('dragAndDrop=' + s.sourceSelector + '=' + s.selector);
    } else if (s.action === 'wait' && s.ms) {
      lines.push('wait:' + s.ms);
    } else if (s.action === 'assertText' && s.selector && s.expected !== undefined) {
      lines.push('assertText=' + s.selector + '=' + s.expected);
    } else if (s.action === 'assertAttribute' && s.selector && s.attributeName && s.expected !== undefined) {
      lines.push('assertAttribute=' + s.selector + '=attr:' + s.attributeName + '=' + s.expected);
    } else if (s.action === 'dialog') {
      if (s.behavior === 'dismiss') {
        lines.push('dialog=dismiss');
      } else if (s.promptText !== undefined) {
        lines.push('dialog=prompt:' + s.promptText);
      } else {
        lines.push('dialog=accept');
      }
    } else if (s.action === 'switchTab' && s.index !== undefined) {
      lines.push('switchTab=' + s.index);
    }
  }
  return lines.join('\n');
}

export function toJs(steps: RecordedStep[]): string {
  const lines: string[] = [
    "/** Recorded test – run with: npx cstesting thisfile.test.js */",
    "const et = require('cstesting');",
    "const { describe, it, beforeEach, afterEach, expect } = et;",
    "",
    "describe('Recorded', () => {",
    "  let browser;",
    "  beforeEach(async () => { browser = await et.createBrowser({ headless: false }); });",
    "  afterEach(async () => { if (browser) await browser.close(); });",
    "  it('recorded steps', async () => {",
  ];
  for (const s of steps) {
    if (s.action === 'goto' && s.url) {
      lines.push("    await browser.goto('" + s.url.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'click' && s.selector) {
      lines.push("    await browser.click('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'doubleClick' && s.selector) {
      lines.push("    await browser.doubleClick('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'rightClick' && s.selector) {
      lines.push("    await browser.rightClick('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'type' && s.selector && s.value !== undefined) {
      lines.push("    await browser.locator('" + s.selector.replace(/'/g, "\\'") + "').type('" + String(s.value).replace(/'/g, "\\'") + "');");
    } else if (s.action === 'select' && s.selector && s.value !== undefined) {
      lines.push("    await browser.select('" + s.selector.replace(/'/g, "\\'") + "', { value: '" + String(s.value).replace(/'/g, "\\'") + "' });");
    } else if (s.action === 'select' && s.selector && (s as RecordedStep & { label?: string }).label) {
      lines.push("    await browser.select('" + s.selector.replace(/'/g, "\\'") + "', { label: '" + String((s as RecordedStep & { label: string }).label).replace(/'/g, "\\'") + "' });");
    } else if (s.action === 'check' && s.selector) {
      lines.push("    await browser.check('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'uncheck' && s.selector) {
      lines.push("    await browser.uncheck('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'hover' && s.selector) {
      lines.push("    await browser.hover('" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'dragAndDrop' && s.sourceSelector && s.selector) {
      lines.push("    await browser.dragAndDrop('" + s.sourceSelector.replace(/'/g, "\\'") + "', '" + s.selector.replace(/'/g, "\\'") + "');");
    } else if (s.action === 'wait' && s.ms) {
      lines.push("    await browser.sleep(" + s.ms + ");");
    } else if (s.action === 'assertText' && s.selector && s.expected !== undefined) {
      const esc = (x: string) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      lines.push("    expect((await browser.locator('" + esc(s.selector) + "').textContent()) || '').toEqual('" + esc(String(s.expected)) + "');");
    } else if (s.action === 'assertAttribute' && s.selector && s.attributeName && s.expected !== undefined) {
      const esc = (x: string) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      lines.push("    expect((await browser.locator('" + esc(s.selector) + "').getAttribute('" + esc(s.attributeName) + "')) || '').toEqual('" + esc(String(s.expected)) + "');");
    } else if (s.action === 'dialog') {
      if (s.behavior === 'dismiss') {
        lines.push("    await browser.setDialogHandler(() => ({ accept: false }));");
      } else if (s.promptText !== undefined && s.promptText !== '') {
        const esc = (x: string) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        lines.push("    await browser.setDialogHandler(() => ({ accept: true, promptText: '" + esc(String(s.promptText)) + "' }));");
      } else {
        lines.push("    await browser.setDialogHandler(() => ({ accept: true }));");
      }
    } else if (s.action === 'switchTab' && s.index !== undefined) {
      lines.push("    await browser.switchToTab(" + s.index + ");");
    }
  }
  lines.push("  });");
  lines.push("});");
  return lines.join('\n');
}

export function toTs(steps: RecordedStep[]): string {
  const js = toJs(steps);
  return js
    .replace("const et = require('cstesting');", "import * as et from 'cstesting';")
    .replace(/describe\('Recorded'/g, "describe('Recorded'");
}

/**
 * Export recorded steps to Java (CSTesting-Java API).
 * Generates a test class extending CSTestingTestBase with @CSTest method.
 * Run with CSTestingRunner or mvn exec:java -Pannotation-tests.
 */
export function toJava(steps: RecordedStep[]): string {
  const lines: string[] = [
    'package com.cstesting.recorded;',
    '',
    'import com.cstesting.CSTesting;',
    'import com.cstesting.CSTestingOptions;',
    'import com.cstesting.annotations.AfterMethod;',
    'import com.cstesting.annotations.BeforeMethod;',
    'import com.cstesting.annotations.CSTest;',
    'import com.cstesting.runner.CSTestingTestBase;',
    '',
    '/** Recorded test – run with your test runner (e.g. mvn exec:java -Pannotation-tests) */',
    'public class RecordedTest extends CSTestingTestBase {',
    '',
    '    private boolean browserCreatedHere;',
    '',
    '    @BeforeMethod',
    '    public void beforeEach() {',
    '        if (browser == null) {',
    '            browser = CSTesting.createBrowser(CSTestingOptions.builder().headless(false).build());',
    '            browserCreatedHere = true;',
    '        } else {',
    '            browserCreatedHere = false;',
    '        }',
    '    }',
    '',
    '    @AfterMethod',
    '    public void afterEach() {',
    '        if (browserCreatedHere && browser != null) {',
    '            try { browser.close(); } catch (Exception ignored) {}',
    '            browser = null;',
    '        }',
    '    }',
    '',
    '    @CSTest(description = "Recorded steps")',
    '    public void recordedSteps() {',
  ];
  for (const s of steps) {
    if (s.action === 'goto' && s.url) {
      lines.push('        browser.gotoUrl(' + javaStr(s.url) + ');');
    } else if (s.action === 'click' && s.selector) {
      lines.push('        browser.click(' + javaStr(s.selector) + ');');
    } else if (s.action === 'doubleClick' && s.selector) {
      lines.push('        browser.doubleClick(' + javaStr(s.selector) + ');');
    } else if (s.action === 'rightClick' && s.selector) {
      lines.push('        browser.rightClick(' + javaStr(s.selector) + ');');
    } else if (s.action === 'type' && s.selector && s.value !== undefined) {
      lines.push('        browser.type(' + javaStr(s.selector) + ", " + javaStr(s.value) + ');');
    } else if (s.action === 'select' && s.selector && s.value !== undefined) {
      lines.push('        browser.select(' + javaStr(s.selector) + ", " + javaStr(s.value) + ');');
    } else if (s.action === 'select' && s.selector && (s as RecordedStep & { label?: string }).label) {
      const label = (s as RecordedStep & { label: string }).label;
      lines.push('        browser.select(' + javaStr(s.selector) + ", " + javaStr(label) + ');');
    } else if (s.action === 'check' && s.selector) {
      lines.push('        browser.check(' + javaStr(s.selector) + ');');
    } else if (s.action === 'uncheck' && s.selector) {
      lines.push('        browser.uncheck(' + javaStr(s.selector) + ');');
    } else if (s.action === 'hover' && s.selector) {
      lines.push('        browser.hover(' + javaStr(s.selector) + ');');
    } else if (s.action === 'dragAndDrop' && s.sourceSelector && s.selector) {
      lines.push('        browser.dragAndDrop(' + javaStr(s.sourceSelector) + ", " + javaStr(s.selector) + ');');
    } else if (s.action === 'wait' && s.ms) {
      lines.push('        browser.waitForTime(' + s.ms + 'L);');
    } else if (s.action === 'assertText' && s.selector && s.expected !== undefined) {
      lines.push(
        '        browser.assertThat(browser.locator(' + javaStr(s.selector) + ")).hasText(" + javaStr(s.expected) + ');'
      );
    } else if (s.action === 'assertAttribute' && s.selector && s.attributeName && s.expected !== undefined) {
      lines.push(
        '        browser.assertThat(browser.locator(' +
          javaStr(s.selector) +
          ')).hasAttribute(' +
          javaStr(s.attributeName) +
          ", " +
          javaStr(s.expected) +
          ');'
      );
    } else if (s.action === 'dialog') {
      if (s.behavior === 'dismiss') {
        lines.push('        browser.dismissNextAlert();');
      } else if (s.promptText !== undefined && s.promptText !== '') {
        lines.push('        browser.acceptNextAlert(' + javaStr(s.promptText) + ');');
      } else {
        lines.push('        browser.acceptNextAlert();');
      }
    } else if (s.action === 'switchTab' && s.index !== undefined) {
      lines.push('        java.util.List<String> handles = browser.getWindowHandles();');
      lines.push('        if (' + s.index + ' < handles.size()) browser.switchToWindow(handles.get(' + s.index + '));');
    }
  }
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}
