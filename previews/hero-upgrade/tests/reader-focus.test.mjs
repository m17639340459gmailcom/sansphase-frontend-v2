import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Uses the preview's pinned development-only jsdom; no browser runtime dependency.
const rootPath = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  entryPoints: [resolve(rootPath, 'src/article.ts')],
  bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false,
  plugins: [{
    name: 'reader-animation-noop',
    setup(builder) {
      builder.onResolve({ filter: /^gsap$/ }, () => ({ path: 'gsap', namespace: 'reader-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'reader-test' }, () => ({ contents: 'export default { set(){}, fromTo(){} };' }));
    },
  }],
});
const { Reader } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

function fixture(extra = '') {
  const dom = new JSDOM(`<!doctype html><html><body><button id="outside">outside</button><article id="reader" role="dialog" aria-modal="true" aria-hidden="false" tabindex="-1"><button id="first">close</button><a href="/article" id="middle">article link</a>${extra}<img id="reader-img"><button id="reader-next">next</button></article></body></html>`, { pretendToBeVisual: true });
  const { window } = dom;
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'getComputedStyle'].map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, getComputedStyle: window.getComputedStyle.bind(window) });
  // jsdom has no layout: give visible fixture controls a nonempty client rect.
  window.HTMLElement.prototype.getClientRects = function () {
    return this.closest('[hidden], [style*="display: none"]') ? [] : [{ width: 20, height: 20 }];
  };
  const reader = new Reader(() => {}, true);
  reader.reveal();
  const get = (id) => window.document.getElementById(id);
  const tab = (target, options = {}) => {
    target.focus();
    const event = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  };
  return {
    reader, get, tab,
    active: () => window.document.activeElement,
    dispose() { reader.conceal(); dom.window.close(); Object.assign(globalThis, previous); },
  };
}

test('reader root starts the Tab order and Shift+Tab reaches its last control', () => {
  const f = fixture();
  try {
    assert(f.tab(f.reader.root).defaultPrevented);
    assert.equal(f.active(), f.get('first'));
    assert(f.tab(f.reader.root, { shiftKey: true }).defaultPrevented);
    assert.equal(f.active(), f.get('reader-next'));
  } finally { f.dispose(); }
});

test('reader wraps first/last boundaries but leaves ordinary interior Tab alone', () => {
  const f = fixture();
  try {
    assert(f.tab(f.get('reader-next')).defaultPrevented);
    assert.equal(f.active(), f.get('first'));
    assert(f.tab(f.get('first'), { shiftKey: true }).defaultPrevented);
    assert.equal(f.active(), f.get('reader-next'));
    assert.equal(f.tab(f.get('middle')).defaultPrevented, false);
  } finally { f.dispose(); }
});

test('reader includes fetched controls and excludes disabled, hidden and negative tab stops', () => {
  const f = fixture();
  try {
    f.reader.root.insertAdjacentHTML('beforeend', '<button disabled>disabled</button><button hidden>hidden</button><div style="display: none"><button>display hidden</button></div><button style="visibility: hidden">visibility hidden</button><button tabindex="-1">programmatic only</button><a href="/dynamic" id="dynamic">fetched link</a>');
    assert(f.tab(f.get('first'), { shiftKey: true }).defaultPrevented);
    assert.equal(f.active(), f.get('dynamic'));
    assert(f.tab(f.get('dynamic')).defaultPrevented);
    assert.equal(f.active(), f.get('first'));
  } finally { f.dispose(); }
});

test('reader respects browser shortcuts and yields while inert or closed', () => {
  const f = fixture();
  try {
    assert.equal(f.tab(f.get('reader-next'), { ctrlKey: true }).defaultPrevented, false);
    f.reader.root.setAttribute('inert', '');
    assert.equal(f.tab(f.get('reader-next')).defaultPrevented, false);
    f.reader.root.removeAttribute('inert');
    f.reader.conceal();
    assert.equal(f.tab(f.get('reader-next')).defaultPrevented, false);
    // Reader.prepare() restores this before reveal() in the real route flow.
    f.reader.root.setAttribute('aria-hidden', 'false');
    f.reader.reveal();
    assert(f.tab(f.get('reader-next')).defaultPrevented, 'reopening restores the local loop');
    assert.equal(f.active(), f.get('first'));
  } finally { f.dispose(); }
});
