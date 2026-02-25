/**
 * Export recorded steps to .conf, .js, or .ts format.
 */

import type { RecordedStep } from './recorded-step';

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
