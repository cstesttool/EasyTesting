/**
 * Injected into every page to record user actions. Sent as string to addScriptToEvaluateOnNewDocument.
 * Calls window.cstRecordStep(JSON.stringify(step)) - Node receives via Runtime.bindingCalled.
 */
(function() {
  function escapeCss(s) {
    if (!s) return '';
    return s.replace(/([\\'"])/g, '\\$1');
  }
  function getSelector(el) {
    if (!el || !el.tagName) return '';
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1)
      return '#' + el.id;
    var name = el.getAttribute('name');
    if (name && ['INPUT','SELECT','TEXTAREA','BUTTON'].indexOf(el.tagName) >= 0) {
      var tag = el.tagName.toLowerCase();
      return tag === 'input' && el.type === 'checkbox' || el.type === 'radio'
        ? 'input[name="' + escapeCss(name) + '"]'
        : '[name="' + escapeCss(name) + '"]';
    }
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) {
        var sel = el.tagName.toLowerCase() + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    var path = [];
    var current = el;
    while (current && current !== document.body) {
      var part = current.tagName ? current.tagName.toLowerCase() : '';
      if (current.id) { part = '#' + current.id; path.unshift(part); break; }
      var sibling = current;
      var idx = 0;
      while (sibling) {
        if (sibling.tagName === current.tagName) idx++;
        sibling = sibling.previousElementSibling;
      }
      var parent = current.parentElement, totalSame = 0;
      if (parent) { for (var i = 0; i < parent.children.length; i++) { if (parent.children[i].tagName === current.tagName) totalSame++; } }
      if (totalSame > 1) part += ':nth-of-type(' + idx + ')';
      path.unshift(part);
      current = current.parentElement;
    }
    return path.join(' > ') || el.tagName ? el.tagName.toLowerCase() : '';
  }
  function send(step) {
    if (typeof window.cstRecordStep === 'function') {
      try { window.cstRecordStep(JSON.stringify(step)); } catch (e) {}
    }
  }
  function onClick(e) {
    var el = e.target;
    var selector = getSelector(el);
    if (!selector) return;
    // Skip generic click for controls that we record as check/uncheck/select (avoids duplicate steps)
    var tag = el.tagName.toUpperCase();
    if (tag === 'SELECT') return;
    if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;
    var action = e.detail === 2 ? 'doubleClick' : 'click';
    send({ action: action, selector: selector });
  }
  var typeDebounceTimer, typeDebounceEl, lastTypeSelector, lastTypeValue;
  function flushType() {
    if (!typeDebounceEl) return;
    var sel = getSelector(typeDebounceEl), val = typeDebounceEl.value || '';
    if (sel && (lastTypeSelector !== sel || lastTypeValue !== val)) {
      lastTypeSelector = sel;
      lastTypeValue = val;
      send({ action: 'type', selector: sel, value: val });
    }
    typeDebounceEl = null;
    if (typeDebounceTimer) { clearTimeout(typeDebounceTimer); typeDebounceTimer = 0; }
  }
  function onInput(e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toUpperCase();
    var selector = getSelector(el);
    if (!selector) return;
    // For SELECT and checkbox/radio, only record from 'change' to avoid duplicate (input+change both fire)
    if (e.type === 'input') {
      if (tag === 'SELECT') return;
      if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;
    }
    if (tag === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      send({ action: 'select', selector: selector, value: opt ? opt.value : '', label: opt ? opt.text : '' });
    } else if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      send({ action: el.checked ? 'check' : 'uncheck', selector: selector });
    } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (typeDebounceTimer) clearTimeout(typeDebounceTimer);
      typeDebounceEl = el;
      typeDebounceTimer = setTimeout(function() { flushType(); typeDebounceTimer = 0; }, 500);
    }
  }
  function onBlur(e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
    if (el.type === 'checkbox' || el.type === 'radio') return;
    if (typeDebounceTimer) { clearTimeout(typeDebounceTimer); typeDebounceTimer = 0; }
    if (typeDebounceEl === el) flushType();
    typeDebounceEl = null;
  }
  function onLoad() {
    if (location.href && location.href !== 'about:blank')
      send({ action: 'goto', url: location.href });
  }
  var assertMenuEl, assertTargetEl;
  function hideAssertMenu() {
    if (assertMenuEl) { assertMenuEl.remove(); assertMenuEl = null; }
    assertTargetEl = null;
  }
  function getElementText(el) {
    if (!el) return '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return (el.value || '').trim();
    return (el.innerText || el.textContent || '').trim();
  }
  function getElementAttr(el, attr) {
    if (!el || !attr) return '';
    if ((attr === 'value' || attr.toLowerCase() === 'value') && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return (el.value || '').trim();
    var v = el.getAttribute(attr);
    return v == null ? '' : String(v).trim();
  }
  document.addEventListener('contextmenu', function(e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var selector = getSelector(el);
    if (!selector) return;
    e.preventDefault();
    assertTargetEl = el;
    if (assertMenuEl) hideAssertMenu();
    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;z-index:2147483647;background:#252526;border:1px solid #3c3c3c;border-radius:4px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:sans-serif;font-size:13px;min-width:200px;';
    function addItem(label, cb) {
      var b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = 'padding:6px 12px;cursor:pointer;color:#d4d4d4';
      b.onmouseover = function() { b.style.background = '#3c3c3c'; };
      b.onmouseout = function() { b.style.background = 'transparent'; };
      b.onclick = function(ev) { ev.stopPropagation(); cb(); };
      menu.appendChild(b);
    }
    addItem('Assert text on this element', function() {
      var sel = getSelector(assertTargetEl), exp = getElementText(assertTargetEl);
      if (sel) send({ action: 'assertText', selector: sel, expected: exp });
      hideAssertMenu();
    });
    addItem('Assert attribute...', function() {
      var attr = prompt('Attribute name (e.g. value, href, placeholder):', 'value');
      if (attr != null && attr.trim()) {
        var sel = getSelector(assertTargetEl), exp = getElementAttr(assertTargetEl, attr.trim());
        if (sel) send({ action: 'assertAttribute', selector: sel, attributeName: attr.trim(), expected: exp });
      }
      hideAssertMenu();
    });
    assertMenuEl = menu;
    document.body.appendChild(menu);
    setTimeout(function() { document.addEventListener('click', function close() { document.removeEventListener('click', close); hideAssertMenu(); }, false); }, 0);
  }, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('blur', onBlur, true);
  document.addEventListener('change', onInput, true);  // change: check/uncheck/select (only one of input+change recorded)
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad);
})();
