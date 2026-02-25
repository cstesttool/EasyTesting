/**
 * Record browser actions and export to .conf, .js, or .ts.
 * Playwright-style codegen: two windows (browser + inspector with live script).
 * Usage: cstesting record [url]  or  cstesting record [url] [--output file] [--format conf|js|ts]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as readline from 'readline';
import CDP from 'chrome-remote-interface';
import { launchChrome } from '../browser/launch';
import type { RecordedStep } from './recorded-step';
import { toConf, toJs, toTs } from './exporters';
import { createInspectorServer } from './inspector-server';

function askDialogInTerminal(
  type: string,
  message: string
): Promise<{ accept: boolean; promptText?: string }> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt =
      type === 'prompt'
        ? `  Dialog (prompt): "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}". Value (or 'd' dismiss): `
        : `  Dialog (${type}): "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}". [A]ccept or [D]ismiss (default A): `;
    rl.question(prompt, (answer) => {
      rl.close();
      if (type === 'prompt') {
        const t = answer.trim();
        if (t.toLowerCase() === 'd') resolve({ accept: false });
        else resolve({ accept: true, promptText: t });
      } else {
        if (answer.trim().toLowerCase() === 'd') resolve({ accept: false });
        else resolve({ accept: true });
      }
    });
  });
}

const INJECTED_SCRIPT = `(function(){
function escapeCss(s){if(!s)return '';return s.replace(/([\\\\'"])/g,'\\\\$1');}
function getSelector(el){
  if(!el||!el.tagName)return '';
  if(el.id&&document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+el.id;
  var name=el.getAttribute('name');
  if(name&&['INPUT','SELECT','TEXTAREA','BUTTON'].indexOf(el.tagName)>=0){
    var tag=el.tagName.toLowerCase();
    return tag==='input'&&(el.type==='checkbox'||el.type==='radio')?'input[name="'+escapeCss(name)+'"]':'[name="'+escapeCss(name)+'"]';
  }
  if(el.className&&typeof el.className==='string'){
    var classes=el.className.trim().split(/\\\\s+/).filter(Boolean).slice(0,2);
    if(classes.length){var sel=el.tagName.toLowerCase()+'.'+classes.map(function(c){return CSS.escape(c);}).join('.');if(document.querySelectorAll(sel).length===1)return sel;}
  }
  var path=[],current=el;
  while(current&&current!==document.body){
    var part=current.tagName?current.tagName.toLowerCase():'';
    if(current.id){path.unshift('#'+current.id);break;}
    var sibling=current,idx=0;
    while(sibling){if(sibling.tagName===current.tagName)idx++;sibling=sibling.previousElementSibling;}
    var parent=current.parentElement,totalSame=0;
    if(parent){for(var i=0;i<parent.children.length;i++){if(parent.children[i].tagName===current.tagName)totalSame++;}}
    if(totalSame>1)part+=':nth-of-type('+idx+')';
    path.unshift(part);current=current.parentElement;
  }
  return path.join(' > ')||(el.tagName?el.tagName.toLowerCase():'');
}
function send(step){if(typeof window.cstRecordStep==='function'){try{window.cstRecordStep(JSON.stringify(step));}catch(e){}}}
document.addEventListener('click',function(e){
  var el=e.target,selector=getSelector(el);
  if(!selector)return;
  var tag=el.tagName.toUpperCase();
  if(tag==='SELECT')return;
  if(tag==='INPUT'&&(el.type==='checkbox'||el.type==='radio'))return;
  send({action:e.detail===2?'doubleClick':'click',selector:selector});
},true);
var typeDebounceTimer,typeDebounceEl,lastTypeSelector,lastTypeValue;
function flushType(){
  if(!typeDebounceEl)return;
  var sel=getSelector(typeDebounceEl),val=typeDebounceEl.value||'';
  if(sel&&(lastTypeSelector!==sel||lastTypeValue!==val)){lastTypeSelector=sel;lastTypeValue=val;send({action:'type',selector:sel,value:val});}
  typeDebounceEl=null;
  if(typeDebounceTimer){clearTimeout(typeDebounceTimer);typeDebounceTimer=0;}
}
document.addEventListener('input',function(e){
  var el=e.target;if(!el||!el.tagName)return;
  var tag=el.tagName.toUpperCase(),selector=getSelector(el);if(!selector)return;
  if(tag==='SELECT')return;
  if(tag==='INPUT'&&(el.type==='checkbox'||el.type==='radio'))return;
  if(tag==='INPUT'||tag==='TEXTAREA'){
    if(typeDebounceTimer)clearTimeout(typeDebounceTimer);
    typeDebounceEl=el;
    typeDebounceTimer=setTimeout(function(){flushType();typeDebounceTimer=0;},500);
  }
},true);
document.addEventListener('blur',function(e){
  var el=e.target;if(!el||!el.tagName)return;
  var tag=el.tagName.toUpperCase();if(tag!=='INPUT'&&tag!=='TEXTAREA')return;
  if(el.type==='checkbox'||el.type==='radio')return;
  if(typeDebounceTimer){clearTimeout(typeDebounceTimer);typeDebounceTimer=0;}
  if(typeDebounceEl===el){flushType();}
  typeDebounceEl=null;
},true);
document.addEventListener('change',function(e){
  var el=e.target;if(!el||!el.tagName)return;
  var tag=el.tagName.toUpperCase(),selector=getSelector(el);if(!selector)return;
  if(tag==='SELECT'){var opt=el.options[el.selectedIndex];send({action:'select',selector:selector,value:opt?opt.value:'',label:opt?opt.text:''});}
  else if(tag==='INPUT'&&(el.type==='checkbox'||el.type==='radio'))send({action:el.checked?'check':'uncheck',selector:selector});
},true);
var assertMenuEl,assertTargetEl;
function hideAssertMenu(){if(assertMenuEl){assertMenuEl.remove();assertMenuEl=null;}assertTargetEl=null;}
function getElementText(el){
  if(!el)return '';
  if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT')return (el.value||'').trim();
  return (el.innerText||el.textContent||'').trim();
}
function getElementAttr(el,attr){
  if(!el||!attr)return '';
  if((attr==='value'||attr.toLowerCase()==='value')&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'))return (el.value||'').trim();
  var v=el.getAttribute(attr);return v==null?'':String(v).trim();
}
document.addEventListener('contextmenu',function(e){
  var el=e.target;if(!el||!el.tagName)return;
  var selector=getSelector(el);if(!selector)return;
  e.preventDefault();
  assertTargetEl=el;
  if(assertMenuEl)hideAssertMenu();
  var menu=document.createElement('div');
  menu.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;z-index:2147483647;background:#252526;border:1px solid #3c3c3c;border-radius:4px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:sans-serif;font-size:13px;min-width:200px;';
  function addItem(label,cb){var b=document.createElement('div');b.textContent=label;b.style.cssText='padding:6px 12px;cursor:pointer;color:#d4d4d4';b.onmouseover=function(){b.style.background='#3c3c3c';};b.onmouseout=function(){b.style.background='transparent';};b.onclick=function(e){e.stopPropagation();cb();};menu.appendChild(b);}
  addItem('Assert text on this element',function(){
    var sel=getSelector(assertTargetEl),exp=getElementText(assertTargetEl);
    if(sel)send({action:'assertText',selector:sel,expected:exp});
    hideAssertMenu();
  });
  addItem('Assert attribute...',function(){
    var attr=prompt('Attribute name (e.g. value, href, placeholder):','value');
    if(attr!=null&&attr.trim()){
      var sel=getSelector(assertTargetEl),exp=getElementAttr(assertTargetEl,attr.trim());
      if(sel)send({action:'assertAttribute',selector:sel,attributeName:attr.trim(),expected:exp});
    }
    hideAssertMenu();
  });
  assertMenuEl=menu;
  document.body.appendChild(menu);
  setTimeout(function(){document.addEventListener('click',function close(){document.removeEventListener('click',close);hideAssertMenu();},false);},0);
},true);
if(location.href&&location.href!=='about:blank')send({action:'goto',url:location.href});
else window.addEventListener('load',function(){if(location.href&&location.href!=='about:blank')send({action:'goto',url:location.href});});
})();`;

export interface RecordOptions {
  /** Output file path. Default: recorded.conf (or .js/.ts based on format). */
  output?: string;
  /** Export format: conf | js | ts. Default: conf. */
  format?: 'conf' | 'js' | 'ts';
}

const recordedSteps: RecordedStep[] = [];
let launched: { kill: () => void | Promise<void> } | null = null;
let launchedInspector: { kill: () => void | Promise<void> } | null = null;
let inspectorServer: http.Server | null = null;

function normalizeStep(raw: Record<string, unknown>): RecordedStep | null {
  const action = String(raw.action || '');
  if (action === 'goto' && raw.url) {
    return { action: 'goto', url: String(raw.url) };
  }
  if (action === 'click' && raw.selector) {
    return { action: 'click', selector: String(raw.selector) };
  }
  if (action === 'doubleClick' && raw.selector) {
    return { action: 'doubleClick', selector: String(raw.selector) };
  }
  if (action === 'rightClick' && raw.selector) {
    return { action: 'rightClick', selector: String(raw.selector) };
  }
  if (action === 'type' && raw.selector) {
    return { action: 'type', selector: String(raw.selector), value: raw.value != null ? String(raw.value) : '' };
  }
  if (action === 'select' && raw.selector) {
    const step: RecordedStep & { label?: string } = { action: 'select', selector: String(raw.selector), value: raw.value != null ? String(raw.value) : '' };
    if (raw.label != null) step.label = String(raw.label);
    return step;
  }
  if (action === 'check' && raw.selector) {
    return { action: 'check', selector: String(raw.selector) };
  }
  if (action === 'uncheck' && raw.selector) {
    return { action: 'uncheck', selector: String(raw.selector) };
  }
  if (action === 'hover' && raw.selector) {
    return { action: 'hover', selector: String(raw.selector) };
  }
  if (action === 'assertText' && raw.selector && raw.expected !== undefined) {
    return { action: 'assertText', selector: String(raw.selector), expected: String(raw.expected) };
  }
  if (action === 'assertAttribute' && raw.selector && raw.attributeName && raw.expected !== undefined) {
    return {
      action: 'assertAttribute',
      selector: String(raw.selector),
      attributeName: String(raw.attributeName),
      expected: String(raw.expected),
    };
  }
  return null;
}

export interface StartRecordingOptions {
  /** Called when the recording browser window is closed. Use to stop, export, and exit. */
  onBrowserClose?: () => void;
}

export async function startRecording(initialUrl?: string, options: StartRecordingOptions = {}): Promise<void> {
  const { onBrowserClose } = options;
  recordedSteps.length = 0;
  const { server, port } = await createInspectorServer(() => recordedSteps);
  inspectorServer = server;
  const inspectorUrl = 'http://127.0.0.1:' + port + '/';

  const chrome = await launchChrome({ headless: false });
  launched = chrome;

  const client = (await CDP({ port: chrome.port, host: 'localhost' })) as unknown as {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    Page: {
      enable: () => Promise<void>;
      addScriptToEvaluateOnNewDocument: (params: { source: string }) => Promise<void>;
      navigate: (params: { url: string }) => Promise<void>;
      on: (event: string, handler: (params: { type: string; message: string }) => void) => void;
      handleJavaScriptDialog: (params: { accept: boolean; promptText?: string }) => Promise<void>;
    };
    Runtime: { enable: () => Promise<void>; addBinding: (params: { name: string }) => Promise<void>; on: (event: string, handler: (params: { name: string; payload: string }) => void) => void };
    Target?: {
      enable: () => Promise<void>;
      getTargets: () => Promise<{ targetInfos: Array<{ type: string; targetId: string }> }>;
      on: (event: string, handler: (params: { targetInfo: { type: string; targetId: string } }) => void) => void;
    };
  };

  client.on('disconnect', () => {
    onBrowserClose?.();
  });

  await client.Page.enable();
  await client.Runtime.enable();

  client.Page.on('javascriptDialogOpening', async (params: { type: string; message: string }) => {
    const answer = await askDialogInTerminal(params.type, params.message || '');
    const isPrompt = params.type && params.type.toLowerCase() === 'prompt';
    await client.Page.handleJavaScriptDialog({
      accept: answer.accept,
      ...(isPrompt && { promptText: answer.promptText ?? '' }),
    });
    const dialogStep: RecordedStep = {
      action: 'dialog',
      behavior: answer.accept ? 'accept' : 'dismiss',
      ...(isPrompt && answer.accept && { promptText: answer.promptText ?? '' }),
    };
    if (recordedSteps.length > 0) {
      const last = recordedSteps.pop()!;
      recordedSteps.push(dialogStep);
      recordedSteps.push(last);
    } else {
      recordedSteps.push(dialogStep);
    }
    console.log('  Recorded: dialog', answer.accept ? 'accept' : 'dismiss', answer.promptText != null ? `"${answer.promptText}"` : '');
  });

  if (client.Target && typeof client.Target.enable === 'function' && typeof client.Target.on === 'function') {
    try {
      await client.Target.enable();
      client.Target.on('targetCreated', async (params: { targetInfo: { type: string; targetId: string } }) => {
        if (params.targetInfo.type !== 'page') return;
        try {
          const { targetInfos } = await client.Target!.getTargets();
          const pages = targetInfos.filter((t) => t.type === 'page');
          const idx = pages.findIndex((t) => t.targetId === params.targetInfo.targetId);
          if (idx >= 0) {
            recordedSteps.push({ action: 'switchTab', index: idx });
            console.log('  Recorded: switchTab', idx);
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // Target domain not available in this Chrome/CRI version
    }
  }
  await client.Page.addScriptToEvaluateOnNewDocument({ source: INJECTED_SCRIPT });
  await client.Runtime.addBinding({ name: 'cstRecordStep' });
  client.Runtime.on('bindingCalled', (params: { name: string; payload: string }) => {
    if (params.name !== 'cstRecordStep') return;
    try {
      const raw = JSON.parse(params.payload) as Record<string, unknown>;
      const step = normalizeStep(raw);
      if (step) {
        recordedSteps.push(step);
        const extra = (step.action === 'assertText' || step.action === 'assertAttribute') && step.expected !== undefined ? ' → "' + step.expected + '"' : '';
        console.log('  Recorded:', step.action, step.selector || step.url || '', extra);
      }
    } catch {
      // ignore parse errors
    }
  });
  const startUrl = initialUrl && (initialUrl.startsWith('http') || initialUrl.startsWith('file')) ? initialUrl : 'about:blank';
  await client.Page.navigate({ url: startUrl });

  let inspectorOpened = false;
  try {
    const inspectorChrome = await launchChrome({ headless: false, args: ['--app=' + inspectorUrl] });
    launchedInspector = inspectorChrome;
    inspectorOpened = true;
  } catch {
    console.log('Inspector: open in a new window or tab →', inspectorUrl);
  }

  console.log('\n--- Recording ---');
  console.log('Two windows: 1) Recording browser (interact here)  2) "CSTesting — Recording" (live script).');
  console.log('Alerts/confirm/prompt: answer in this terminal (A/D or value). New tabs: recorded as switchTab.');
  console.log('Closing the recording browser or pressing Ctrl+C will stop and save.\n');
}

export function stopRecording(): void {
  if (inspectorServer) {
    inspectorServer.close();
    inspectorServer = null;
  }
  if (launchedInspector) {
    try {
      launchedInspector.kill();
    } catch {
      // ignore
    }
    launchedInspector = null;
  }
  if (launched) {
    try {
      launched.kill();
    } catch {
      // ignore
    }
    launched = null;
  }
}

export function getRecordedSteps(): RecordedStep[] {
  return [...recordedSteps];
}

export function exportRecorded(options: RecordOptions = {}): string {
  const format = options.format || 'conf';
  const steps = getRecordedSteps();
  let content: string;
  let ext: string;
  if (format === 'conf') {
    content = toConf(steps);
    ext = '.conf';
  } else if (format === 'js') {
    content = toJs(steps);
    ext = '.test.js';
  } else {
    content = toTs(steps);
    ext = '.test.ts';
  }
  const outPath = options.output || path.join(process.cwd(), 'recorded' + ext);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('\nExported', steps.length, 'steps to', outPath);
  return outPath;
}

export { toConf, toJs, toTs } from './exporters';
export type { RecordedStep, RecordedAction } from './recorded-step';
