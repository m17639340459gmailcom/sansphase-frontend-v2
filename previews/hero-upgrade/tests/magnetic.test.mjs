import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let loaded;
async function load() {
  loaded ||= build({
    stdin: { contents: 'export {mountMagnetic} from "./src/magnetic.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const result = await loaded;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, fine = true } = {}) {
  const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'matchMedia'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><div id="scope"><a id="first" href="/blog" data-magnetic><span>Read</span></a><button id="second" data-magnetic>Next</button><p id="plain">Original text</p></div><button id="outside">Outside</button>', { pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const root = document.querySelector('#scope'), first = document.querySelector('#first'), second = document.querySelector('#second');
  let hidden = false, focused = true, physical = first;
  const boxes = new WeakMap(), reads = new WeakMap(), media = new Map();
  const rect = (element, left = 100, top = 100, width = 200, height = 50) => boxes.set(element, { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
  rect(first); rect(second, 400, 100, 140, 42);
  window.HTMLElement.prototype.getBoundingClientRect = function () { reads.set(this, (reads.get(this) ?? 0) + 1); return boxes.get(this) ?? { left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON() {} }; };
  document.hasFocus = () => focused;
  document.elementFromPoint = () => physical;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const preference = query => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  for (const [name, value] of Object.entries({ window, document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, MutationObserver: window.MutationObserver, matchMedia: preference })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  function pointer(target, x = 230, y = 130, type = 'pointermove', relatedTarget = null, physicalTarget = target) {
    physical = physicalTarget;
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y }, relatedTarget: { value: relatedTarget } });
    target.dispatchEvent(event);
  }
  return {
    window, document, root, first, second, rect, reads, pointer,
    hit(target) { physical = target; },
    focused(value) { focused = value; window.dispatchEvent(new window.Event(value ? 'focus' : 'blur')); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    restore() { dom.window.close(); for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; },
  };
}

const neutral = element => { assert.equal(element.style.translate, ''); assert.equal(element.style.getPropertyValue('--bx'), ''); assert.equal(element.style.getPropertyValue('--by'), ''); };

test('existing magnetic buttons and newly rendered buttons share one delegated input path', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first.querySelector('span'));
    assert.equal(env.first.style.translate, '6.6px 1.5px');
    assert.equal(env.first.style.getPropertyValue('--bx'), '130px'); assert.equal(env.first.style.getPropertyValue('--by'), '30px');
    env.pointer(env.first.querySelector('span'), 240, 132);
    assert.equal(env.reads.get(env.first), 1, 'pointer feedback never remeasures its own moved rectangle');
    const added = env.document.createElement('button'); added.setAttribute('data-magnetic', ''); added.textContent = 'Existing destination'; env.root.append(added); env.rect(added, 400, 100, 140, 42);
    env.pointer(added, 490, 125);
    neutral(env.first); assert.equal(added.style.translate, '4.4px 1.2px');
    assert.equal(env.document.querySelector('#plain').textContent, 'Original text'); assert.equal(env.document.querySelector('#plain').style.length, 0);
  } finally { controller?.dispose(); env.restore(); }
});

test('magnetic translation stays bounded and uses a stable unmoved rectangle instead of feeding back', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first, 295, 149); const firstValue = env.first.style.translate;
    const [x, y] = firstValue.split(' ').map(Number.parseFloat); assert.ok(Math.abs(x) <= 14 && Math.abs(y) <= 8);
    env.rect(env.first, 114, 108, 200, 50); env.pointer(env.first, 295, 149);
    assert.equal(env.first.style.translate, firstValue); assert.equal(env.reads.get(env.first), 1);
    env.pointer(env.first, 1100, 900); neutral(env.first);
    env.first.style.translate = '2px 3px'; env.first.style.setProperty('--bx', '11px'); env.rect(env.first, 102, 103, 200, 50); env.pointer(env.first, 230, 130);
    assert.equal(env.first.style.translate, '6.6px 1.5px', 're-entry subtracts existing visual translation from its measurement');
    controller.setActive(false); assert.equal(env.first.style.translate, '2px 3px'); assert.equal(env.first.style.getPropertyValue('--bx'), '11px');
  } finally { controller?.dispose(); env.restore(); }
});

test('leaving, canceled input, overlays, focus and visibility clear movement and wait for fresh input', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first); env.pointer(env.first, 230, 130, 'pointerout', env.first.querySelector('span'));
    assert.notEqual(env.first.style.translate, '', 'moving between descendants is not a leave');
    env.pointer(env.first, 230, 130, 'pointerout', env.second); neutral(env.first);
    env.pointer(env.first); env.pointer(env.first, 230, 130, 'pointercancel'); neutral(env.first);
    env.pointer(env.first); controller.setActive(false); neutral(env.first); env.pointer(env.first); neutral(env.first);
    controller.setActive(true); neutral(env.first); env.pointer(env.first); assert.notEqual(env.first.style.translate, '');
    env.focused(false); neutral(env.first); env.focused(true); neutral(env.first);
    env.pointer(env.first); env.hidden(true); neutral(env.first); env.hidden(false); neutral(env.first); env.pointer(env.first); assert.notEqual(env.first.style.translate, '');
  } finally { controller?.dispose(); env.restore(); }
});

test('scrolling away, resize and keyboard interaction release the old button without moving another target', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first); env.hit(env.document.querySelector('#outside')); env.window.dispatchEvent(new env.window.Event('scroll')); neutral(env.first); neutral(env.second);
    env.pointer(env.first); env.window.dispatchEvent(new env.window.Event('resize')); neutral(env.first);
    env.pointer(env.first); env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); neutral(env.first);
    env.pointer(env.document.querySelector('#outside')); neutral(env.first);
  } finally { controller?.dispose(); env.restore(); }
});

test('live reduced-motion and pointer changes stop interaction and can resume after a new mouse move', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: true }); env.pointer(env.first); neutral(env.first);
    env.preference('(prefers-reduced-motion: reduce)', false); neutral(env.first); env.pointer(env.first); assert.notEqual(env.first.style.translate, '');
    env.preference('(pointer: fine)', false); neutral(env.first); env.pointer(env.first); neutral(env.first);
    env.preference('(pointer: fine)', true); neutral(env.first); env.pointer(env.first); assert.notEqual(env.first.style.translate, '');
    env.preference('(prefers-reduced-motion: reduce)', true); neutral(env.first);
  } finally { controller?.dispose(); env.restore(); }
});

test('refresh, removed content, disabled or inert targets and repeated disposal leave no stale input', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first); controller.refresh(); neutral(env.first); env.pointer(env.first); env.first.remove(); await Promise.resolve(); neutral(env.first);
    env.second.disabled = true; env.pointer(env.second, 490, 125); neutral(env.second); env.second.disabled = false;
    env.root.setAttribute('inert', ''); env.pointer(env.second, 490, 125); neutral(env.second); env.root.removeAttribute('inert');
    env.pointer(env.second, 490, 125); assert.notEqual(env.second.style.translate, ''); controller.dispose(); controller.dispose(); neutral(env.second);
    controller.refresh(); controller.setActive(true); env.preference('(pointer: fine)', false); env.preference('(pointer: fine)', true); env.pointer(env.second, 490, 125); neutral(env.second);
  } finally { controller?.dispose(); env.restore(); }
});

test('captured pointer input uses the physical target and active buttons release when made unavailable', async () => {
  const env = browser(); let controller;
  try {
    const { mountMagnetic } = await load(); controller = mountMagnetic(env.root, { reduced: false });
    env.pointer(env.first); assert.notEqual(env.first.style.translate, '');
    env.first.hasPointerCapture = () => true;
    env.pointer(env.first, 230, 130, 'pointermove', null, env.document.querySelector('#outside')); neutral(env.first);
    env.first.hasPointerCapture = () => false;
    env.pointer(env.second, 490, 125); env.second.disabled = true; await Promise.resolve(); neutral(env.second);
    env.second.disabled = false; env.pointer(env.second, 490, 125); env.root.setAttribute('inert', ''); await Promise.resolve(); neutral(env.second);
    env.root.removeAttribute('inert'); neutral(env.second);
  } finally { controller?.dispose(); env.restore(); }
});
