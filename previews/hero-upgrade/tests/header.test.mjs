import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const markup = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
let built;
async function load() {
  built ||= build({
    stdin: { contents: 'export {mountHeader} from "./src/header.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const result = await built;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, fine = true } = {}) {
  const dom = new JSDOM(markup, { url: 'http://127.0.0.1:4285/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const root = document.querySelector('#header');
  const frames = new Map(); let nextFrame = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const fineQuery = new window.EventTarget(); fineQuery.matches = fine;
  window.matchMedia = () => fineQuery;
  let language = 'zh'; const changes = [];
  document.documentElement.dataset.lang = language;
  const options = {
    reduced,
    getLanguage: () => language,
    setLanguage: next => { changes.push(next); language = next; document.documentElement.dataset.lang = next; },
  };
  return {
    window, document, root, frames, changes, options,
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); },
    pointer(y, type = 'mouse') {
      const event = new window.MouseEvent('pointermove', { clientY: y });
      Object.defineProperty(event, 'pointerType', { value: type }); window.dispatchEvent(event);
    },
    fine(value) { fineQuery.matches = value; fineQuery.dispatchEvent(new window.Event('change')); },
    focus(element, visible = true) {
      const original = element.matches.bind(element);
      element.matches = selector => selector === ':focus-visible' ? visible : original(selector);
      element.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    },
    blur(element, relatedTarget) { element.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget })); },
    language(next) { language = next; document.documentElement.dataset.lang = next; },
    restore() { dom.window.close(); },
  };
}

const hidden = env => env.root.classList.contains('is-hidden');
const docked = env => env.root.classList.contains('is-docked');

test('language groups expose two native choices with one selected language', async () => {
  const env = browser(); let controller;
  try {
    const groups = [...env.document.querySelectorAll('#lang, #menu-lang')];
    assert.equal(groups.length, 2);
    for (const group of groups) {
      assert.equal(group.getAttribute('role'), 'group');
      assert.equal(group.querySelectorAll('button[type="button"][data-l]').length, 2);
      assert.equal(group.querySelector('[data-l="en"]').getAttribute('lang'), 'en');
      assert.equal(group.querySelector('[data-l="zh"]').getAttribute('lang'), 'zh');
    }
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    for (const group of groups) {
      assert.equal(group.querySelector('[data-l="zh"]').getAttribute('aria-pressed'), 'true');
      assert.equal(group.querySelector('[data-l="en"]').getAttribute('aria-pressed'), 'false');
    }
  } finally { controller?.dispose(); env.restore(); }
});

test('selecting the current language never toggles or rebuilds content, and both groups stay synchronized', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    env.document.querySelector('#lang [data-l="zh"]').click();
    assert.deepEqual(env.changes, []);
    env.document.querySelector('#lang [data-l="en"]').click();
    assert.deepEqual(env.changes, ['en']);
    env.document.querySelector('#menu').setAttribute('aria-hidden', 'false'); controller.setMenuOpen(true);
    env.document.querySelector('#menu-lang [data-l="en"]').click();
    assert.deepEqual(env.changes, ['en']);
    env.document.querySelector('#menu-lang [data-l="zh"]').click();
    assert.deepEqual(env.changes, ['en', 'zh']);
    env.language('en'); controller.refreshLanguage();
    for (const group of env.document.querySelectorAll('#lang, #menu-lang')) {
      assert.equal(group.querySelector('[data-l="en"]').getAttribute('aria-pressed'), 'true');
      assert.equal(group.querySelector('[data-l="zh"]').getAttribute('aria-pressed'), 'false');
    }
  } finally { controller?.dispose(); env.restore(); }
});

test('hidden menu controls and unavailable language choices cannot dispatch a language change', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    env.document.querySelector('#menu-lang [data-l="en"]').click();
    assert.deepEqual(env.changes, [], 'the closed menu remains unavailable');
    const button = env.document.querySelector('#lang [data-l="en"]');
    button.disabled = true; button.click(); assert.deepEqual(env.changes, []);
    button.disabled = false; env.root.setAttribute('inert', ''); button.click(); assert.deepEqual(env.changes, []);
    env.root.removeAttribute('inert'); button.click(); assert.deepEqual(env.changes, ['en']);
  } finally { controller?.dispose(); env.restore(); }
});

test('docking and hide/show travel match the source thresholds without reacting to tiny direction changes', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    controller.scroll(24); assert.equal(docked(env), false);
    controller.scroll(25); assert.equal(docked(env), true);
    controller.scroll(600); assert.equal(hidden(env), true);
    controller.scroll(599); controller.scroll(592); assert.equal(hidden(env), true, 'eight upward pixels do not cross the show threshold');
    controller.scroll(591); assert.equal(hidden(env), false);
    controller.scroll(592); controller.scroll(605); assert.equal(hidden(env), false, 'fourteen downward pixels do not cross the hide threshold');
    controller.scroll(606); assert.equal(hidden(env), true);
    controller.scroll(159); assert.equal(hidden(env), false, 'the top region always shows the header');
    controller.scroll(0); assert.equal(docked(env), false);
  } finally { controller?.dispose(); env.restore(); }
});

test('top-edge preview uses 32/132px hysteresis and closes when the pointer leaves without further scrolling', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    controller.scroll(600); assert.equal(hidden(env), true);
    env.pointer(32); env.flush(); assert.equal(hidden(env), true);
    env.pointer(20); assert.equal(hidden(env), true, 'pointer work is coalesced to one frame'); env.flush(); assert.equal(hidden(env), false);
    env.pointer(100); env.flush(); assert.equal(hidden(env), false);
    env.pointer(131); env.flush(); assert.equal(hidden(env), false);
    env.pointer(132); env.flush(); assert.equal(hidden(env), true, 'leaving the preview region restores the tucked state immediately');
    env.pointer(20); env.pointer(300); assert.equal(env.frames.size, 1); env.flush(); assert.equal(hidden(env), true, 'only the latest pointer position is read');
  } finally { controller?.dispose(); env.restore(); }
});

test('keyboard focus and an open menu pin the header while mouse focus does not', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    const first = env.document.querySelector('#theme'), second = env.document.querySelector('#burger');
    controller.scroll(600); env.focus(first, false); assert.equal(hidden(env), true);
    env.focus(first); assert.equal(hidden(env), false);
    controller.scroll(700); assert.equal(hidden(env), false);
    env.blur(first, second); assert.equal(hidden(env), false);
    env.blur(second, env.document.querySelector('#main')); assert.equal(hidden(env), true);
    controller.setMenuOpen(true); assert.equal(hidden(env), false);
    controller.scroll(800); assert.equal(hidden(env), false);
    controller.setMenuOpen(false); assert.equal(hidden(env), true);
  } finally { controller?.dispose(); env.restore(); }
});

test('reduced motion disables automatic hiding and restarts with fresh scroll travel', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    controller.scroll(600); assert.equal(docked(env), true); assert.equal(hidden(env), false);
    controller.setReduced(false); assert.equal(hidden(env), false);
    controller.scroll(614); assert.equal(hidden(env), false);
    controller.scroll(615); assert.equal(hidden(env), true);
    env.pointer(20); controller.setReduced(true); env.flush(); assert.equal(hidden(env), false);
    controller.scroll(900); assert.equal(hidden(env), false);
  } finally { controller?.dispose(); env.restore(); }
});

test('coarse input, lost window focus and canceled input cannot retain a stale preview', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    controller.scroll(600); env.pointer(20, 'touch'); env.flush(); assert.equal(hidden(env), true);
    env.pointer(20); env.flush(); assert.equal(hidden(env), false);
    env.fine(false); assert.equal(hidden(env), true); env.pointer(20); env.flush(); assert.equal(hidden(env), true);
    env.fine(true); assert.equal(hidden(env), true); env.pointer(20); env.flush(); assert.equal(hidden(env), false);
    env.window.dispatchEvent(new env.window.Event('blur')); assert.equal(hidden(env), true);
    env.pointer(20); env.window.dispatchEvent(new env.window.Event('pointercancel')); env.flush(); assert.equal(hidden(env), true);
  } finally { controller?.dispose(); env.restore(); }
});

test('disposal cancels pending work and detaches language, focus and pointer input', async () => {
  const env = browser(); let controller;
  try {
    const { mountHeader } = await load(); controller = mountHeader(env.root, env.options);
    controller.scroll(600); env.pointer(20); assert.equal(env.frames.size, 1);
    controller.dispose(); controller.dispose(); assert.equal(env.frames.size, 0);
    const classes = env.root.className;
    env.flush(); env.pointer(20); env.focus(env.document.querySelector('#theme')); env.document.querySelector('#lang [data-l="en"]').click();
    controller.scroll(700); controller.setMenuOpen(true); controller.setReduced(false); controller.refreshLanguage();
    assert.equal(env.root.className, classes); assert.equal(env.frames.size, 0); assert.deepEqual(env.changes, []);
  } finally { controller?.dispose(); env.restore(); }
});
