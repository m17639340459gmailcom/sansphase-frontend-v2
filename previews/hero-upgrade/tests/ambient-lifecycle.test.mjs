import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  stdin: { contents: 'export {mountAmbient,mountCursor} from "./src/ambient.ts";', resolveDir: sourceRoot, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { mountAmbient, mountCursor } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);

function browser({ fine = true, reduced = false } = {}) {
  const names = ['window', 'document', 'Element', 'HTMLElement', 'MutationObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'innerWidth', 'innerHeight'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><html data-lang="zh"><body><section id="hero"><div class="hero-atmosphere" aria-hidden="true"></div><a href="/blog" data-cursor="read">Read</a><input><div id="empty"></div><div data-particle-surface><canvas></canvas></div></section></body></html>', { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const pending = new Map();
  const animations = [];
  const observers = [];
  const cleanups = [];
  const bounds = new WeakMap();
  const reads = { hit: 0, style: 0 };
  let sequence = 0;
  let time = 0;
  let target = document.querySelector('#empty');
  let hidden = false;
  let focused = true;
  const media = new Map();
  const preference = (query) => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.hasFocus = () => focused;
  document.elementFromPoint = () => { reads.hit++; return target; };
  const getComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (...args) => { reads.style++; return getComputedStyle(...args); };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (bounds.has(this)) return bounds.get(this);
    const small = this.tagName === 'A';
    return { x: small ? 200 : 0, y: small ? 200 : 0, left: small ? 200 : 0, top: small ? 200 : 0, width: small ? 120 : 1440, height: small ? 44 : 940, right: small ? 320 : 1440, bottom: small ? 244 : 940, toJSON() {} };
  };
  window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()]; };
  window.HTMLElement.prototype.animate = function () {
    const animation = { canceled: false, cancel() { this.canceled = true; }, onfinish: null };
    animations.push(animation);
    return animation;
  };
  const globals = {
    window, document, Element: window.Element, HTMLElement: window.HTMLElement, MutationObserver: window.MutationObserver,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame(callback) { const id = ++sequence; pending.set(id, callback); return id; },
    cancelAnimationFrame(id) { pending.delete(id); }, matchMedia: preference, innerWidth: 1440, innerHeight: 940,
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  function pointer(element, x = 160, y = 170, type = 'pointermove', physicalTarget = element) {
    target = physicalTarget;
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y } });
    element.dispatchEvent(event);
  }
  return {
    window, document, pending, animations, observers, pointer, reads,
    hit(element) { target = element; },
    rect(element, { left, top, width, height }) { bounds.set(element, { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() {} }); },
    track(controller) { cleanups.push(typeof controller === 'function' ? controller : () => controller.dispose()); return controller; },
    flush() { time += 60; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    focused(value) { focused = value; window.dispatchEvent(new window.Event(value ? 'focus' : 'blur')); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    restore() { for (const cleanup of cleanups.reverse()) cleanup(); dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}

test('restored hero atmosphere tracks grid cells and stops all pointer work when paused or offscreen', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    const atmosphere = env.track(mountAmbient(root));
    const host = root.querySelector('.u-ambient');
    assert.ok(host, 'TDX Aurora/grid adapter must be present');
    assert.equal(root.querySelectorAll('.u-ambient-light').length, 3);
    assert.equal(root.querySelectorAll('.u-ambient-cell').length, 10);
    env.pointer(root.querySelector('#empty'), 145, 170);
    env.flush();
    assert.ok(host.style.getPropertyValue('--u-px'));
    assert.equal(env.animations.length, 1);
    assert.match(root.querySelector('.u-ambient-cell').style.transform, /128px,128px/);
    atmosphere.setPaused(true);
    assert.ok(host.hasAttribute('data-paused'));
    assert.equal(env.pending.size, 0);
    assert.ok(env.animations[0].canceled);
    env.pointer(root.querySelector('#empty'), 300, 300);
    assert.equal(env.pending.size, 0);
    atmosphere.setPaused(false);
    env.observers[0].callback([{ isIntersecting: false }]);
    assert.ok(host.hasAttribute('data-paused'));
    atmosphere.dispose();
    assert.equal(root.querySelector('.u-ambient-grid'), null);
    assert.ok(root.querySelector('.hero-atmosphere'));
    assert.ok(env.observers[0].disconnected);
  } finally { env.restore(); }
});

test('particle stage and controls do not also trigger grid trails; reduced motion stays still', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    const atmosphere = env.track(mountAmbient(root));
    env.pointer(root.querySelector('canvas'));
    env.flush();
    assert.equal(env.animations.length, 0);
    env.preference('(prefers-reduced-motion: reduce)', true);
    env.pointer(root.querySelector('#empty'));
    assert.equal(env.pending.size, 0);
    atmosphere.dispose();
  } finally { env.restore(); }
});

test('custom cursor omits pointer coordinates but keeps target snap, semantic labels and native UI ownership', async () => {
  const env = browser();
  try {
    const dispose = env.track(mountCursor());
    const html = env.document.documentElement;
    const cursor = env.document.querySelector('.u-cursor');
    assert.ok(cursor, 'targeting-frame cursor must be mounted');
    assert.equal(cursor.querySelectorAll('.u-cursor-corner').length, 4);
    env.pointer(env.document.querySelector('#empty'), 160, 170);
    env.flush();
    assert.equal(html.dataset.uCursor, 'on');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '');
    assert.match(cursor.querySelector('.u-cursor-cross').style.transform, /160px,170px/);
    env.pointer(env.document.querySelector('a'), 250, 220);
    for (let index = 0; index < 6; index++) env.flush();
    assert.equal(cursor.dataset.mode, 'label');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '阅读');
    assert.ok(parseFloat(cursor.querySelector('.u-cursor-box').style.width) > 120);
    env.pointer(env.document.querySelector('#empty'), 542, 353);
    env.flush();
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '', 'leaving a labelled target clears its chip without exposing coordinates');
    assert.equal(cursor.dataset.mode, 'idle');
    env.pointer(env.document.querySelector('input'));
    assert.equal(html.dataset.uCursor, 'native');
    env.pointer(env.document.querySelector('#empty'));
    const modal = env.document.createElement('div');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    env.document.body.append(modal);
    await Promise.resolve(); env.flush();
    assert.notEqual(html.dataset.uCursor, 'on');
    modal.hidden = true;
    await Promise.resolve();
    env.pointer(env.document.querySelector('#empty'));
    assert.equal(html.dataset.uCursor, 'on');
    env.hidden(true);
    assert.equal(html.dataset.uCursor, undefined);
    assert.equal(env.pending.size, 0);
    dispose(); dispose();
    assert.equal(env.document.querySelector('.u-cursor'), null);
    env.pointer(env.document.querySelector('#empty'));
    assert.equal(html.dataset.uCursor, undefined);
  } finally { env.restore(); }
});

test('coarse pointers and reduced motion never hide the system cursor', () => {
  for (const options of [{ fine: false }, { reduced: true }]) {
    const env = browser(options);
    try {
      const dispose = env.track(mountCursor());
      env.pointer(env.document.querySelector('#empty'));
      env.flush();
      assert.equal(env.document.documentElement.dataset.uCursor, undefined);
      assert.equal(env.pending.size, 0);
      dispose();
    } finally { env.restore(); }
  }
});

test('upstream spotlight follows every hero target, including particle and control zones, and clears on leave/pause', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    const atmosphere = env.track(mountAmbient(root));
    const spotlight = root.querySelector('.u-ambient-spot');
    assert.ok(spotlight, 'TDX fx-spot-lit/fx-grid-lit layer must be present');
    assert.ok(spotlight.hasAttribute('data-fx-spot'));
    env.pointer(root.querySelector('#empty'), 145, 170);
    env.flush();
    assert.ok(root.hasAttribute('data-fx-spot-active'));
    assert.equal(spotlight.style.getPropertyValue('--mx'), '145.0px');
    assert.equal(spotlight.style.getPropertyValue('--my'), '170.0px');
    const trails = env.animations.length;
    env.pointer(root.querySelector('canvas'), 650, 400);
    env.flush();
    assert.equal(spotlight.style.getPropertyValue('--mx'), '650.0px');
    assert.equal(env.animations.length, trails, 'quiet stage suppresses cells, not the upstream spotlight');
    atmosphere.setPaused(true);
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    assert.equal(env.pending.size, 0);
    atmosphere.setPaused(false);
    env.pointer(root.querySelector('#empty'), 300, 250);
    env.flush();
    assert.ok(root.hasAttribute('data-fx-spot-active'));
    root.dispatchEvent(new env.window.Event('pointerleave'));
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    atmosphere.dispose();
    assert.equal(root.querySelector('.u-ambient-spot'), null);
  } finally { env.restore(); }
});

test('ordinary links keep only the targeting frame, while explicit labels work without an interactive role', () => {
  const env = browser();
  try {
    const dispose = env.track(mountCursor());
    const cursor = env.document.querySelector('.u-cursor');
    const ordinary = env.document.createElement('a');
    ordinary.href = '/works'; ordinary.textContent = 'Works';
    env.document.body.append(ordinary);
    env.pointer(ordinary, 250, 220);
    env.flush();
    assert.equal(cursor.dataset.mode, 'hover');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '');
    const labelled = env.document.createElement('div');
    labelled.dataset.cursorText = '定制标签';
    env.document.body.append(labelled);
    env.pointer(labelled, 400, 300);
    env.flush();
    assert.equal(cursor.dataset.mode, 'label');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '定制标签');
    dispose();
  } finally { env.restore(); }
});

test('a CSS-hidden modal does not globally suppress the live targeting cursor', async () => {
  const env = browser();
  try {
    const modal = env.document.createElement('div');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.style.visibility = 'hidden';
    env.document.body.append(modal);
    const dispose = env.track(mountCursor());
    env.pointer(env.document.querySelector('#empty'));
    env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, 'on');
    modal.style.visibility = 'visible';
    await Promise.resolve();
    env.pointer(env.document.querySelector('#empty'));
    assert.equal(env.document.documentElement.dataset.uCursor, undefined);
    dispose();
  } finally { env.restore(); }
});

test('a stationary cursor releases a moving navigation target after the last scroll event', () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const link = env.document.querySelector('a');
    const cursor = env.document.querySelector('.u-cursor');
    env.pointer(link, 250, 220);
    for (let index = 0; index < 6; index++) env.flush();
    assert.ok(parseFloat(cursor.querySelector('.u-cursor-box').style.width) > 120);
    env.window.dispatchEvent(new env.window.Event('scroll'));
    env.flush();
    // The header's transform can finish after scrolling has stopped. There is
    // no pointermove, DOM attribute mutation or second scroll to refresh it.
    env.rect(link, { left: 200, top: -100, width: 120, height: 44 });
    env.hit(env.document.querySelector('#empty'));
    env.flush();
    assert.equal(cursor.dataset.mode, 'idle', 'the old target must be re-hit-tested during its motion');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '');
    for (let index = 0; index < 6; index++) env.flush();
    assert.ok(parseFloat(cursor.querySelector('.u-cursor-box').style.width) < 32);
    assert.match(cursor.querySelector('.u-cursor-cross').style.transform, /250px,220px/);
  } finally { env.restore(); }
});

test('captured pointer events use the physical hit target instead of latching onto the capture holder', () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const link = env.document.querySelector('a');
    const empty = env.document.querySelector('#empty');
    const cursor = env.document.querySelector('.u-cursor');
    env.pointer(link, 250, 220);
    env.flush();
    env.pointer(link, 250, 220, 'pointerdown');
    // Pointer capture retains event.target while a stage/card moves away.
    link.hasPointerCapture = id => id === 1;
    env.pointer(link, 650, 420, 'pointermove', empty);
    env.flush();
    assert.equal(cursor.dataset.mode, 'idle');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '');
    assert.match(cursor.querySelector('.u-cursor-cross').style.transform, /650px,420px/);
    env.pointer(link, 650, 420, 'pointerup', empty);
    assert.ok(!cursor.hasAttribute('data-pressed'));
    env.pointer(link, 1500, 420, 'pointermove', null);
    env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, undefined, 'capture outside the viewport restores the system cursor');
    assert.ok(!cursor.hasAttribute('data-visible'));
  } finally { env.restore(); }
});

test('steady cursor damping does not repeatedly hit-test the page or scan modal computed styles', async () => {
  const env = browser();
  try {
    const modal = env.document.createElement('div');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.style.visibility = 'hidden';
    env.document.body.append(modal);
    const telemetry = env.document.createElement('span');
    env.document.querySelector('#hero').append(telemetry);
    env.track(mountCursor());
    env.pointer(env.document.querySelector('a'), 250, 220);
    env.flush();
    const before = { ...env.reads };
    for (let index = 0; index < 20; index++) env.flush();
    assert.deepEqual(env.reads, before, 'steady target damping uses its existing rectangle without global DOM queries');
    env.pointer(env.document.querySelector('#empty'), 650, 420);
    env.flush();
    const idle = { ...env.reads };
    for (let index = 0; index < 20; index++) env.flush();
    assert.deepEqual(env.reads, idle, 'idle cursor frames do not query the DOM either');
    for (let index = 0; index < 5; index++) {
      telemetry.textContent = String(index);
      await Promise.resolve();
      env.flush();
    }
    assert.deepEqual(env.reads, idle, 'unrelated text-only HUD updates do not rescan modal styles or re-hit-test an idle pointer');
  } finally { env.restore(); }
});

test('window blur transfers cursor ownership immediately and ignores late captured moves until focus returns', () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const empty = env.document.querySelector('#empty');
    const cursor = env.document.querySelector('.u-cursor');
    env.pointer(empty);
    env.flush();
    env.focused(false);
    assert.equal(env.document.documentElement.dataset.uCursor, undefined);
    assert.ok(!cursor.hasAttribute('data-visible'));
    env.pointer(empty);
    env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, undefined);
    assert.equal(env.pending.size, 0);
    env.focused(true);
    env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, undefined, 'focus alone must not replay a stale target');
    env.pointer(empty);
    env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, 'on');
  } finally { env.restore(); }
});

test('scrolling the hero away from a stationary pointer clears the spotlight, trail and cached pointer', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    env.track(mountAmbient(root));
    const host = root.querySelector('.u-ambient');
    const spot = root.querySelector('.u-ambient-spot');
    const empty = root.querySelector('#empty');
    env.pointer(empty, 145, 170);
    env.flush();
    assert.ok(root.hasAttribute('data-fx-spot-active'));
    env.rect(host, { left: 0, top: -800, width: 1440, height: 940 });
    env.hit(env.document.body);
    env.window.dispatchEvent(new env.window.Event('scroll'));
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    assert.equal(host.style.getPropertyValue('--u-px'), '0');
    assert.equal(host.style.getPropertyValue('--u-py'), '0');
    assert.equal(spot.style.getPropertyValue('--mx'), '');
    assert.ok(env.animations[0].canceled);
    const count = env.animations.length;
    env.rect(host, { left: 0, top: 0, width: 1440, height: 940 });
    env.hit(empty);
    env.window.dispatchEvent(new env.window.Event('scroll'));
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'), 'scrolling back must not replay the old pointer');
    assert.equal(env.animations.length, count);
    env.pointer(empty, 300, 250);
    env.flush();
    assert.ok(root.hasAttribute('data-fx-spot-active'));
  } finally { env.restore(); }
});

test('hero hit testing rejects overlays and out-of-bounds capture without generating new trail cells', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    env.track(mountAmbient(root));
    const empty = root.querySelector('#empty');
    env.pointer(empty, 145, 170);
    env.flush();
    const count = env.animations.length;
    env.pointer(empty, 300, 250, 'pointermove', env.document.body);
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'), 'an overlay owns its pointer even while the hero remains visible');
    assert.equal(env.animations.length, count);
    env.pointer(empty, 1500, 300);
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    assert.equal(env.animations.length, count, 'capture must not emit cells beyond the hero rectangle');
  } finally { env.restore(); }
});

test('hero pause, blur and leave neutralize pointer effects and resume only after fresh input', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    const atmosphere = env.track(mountAmbient(root));
    const host = root.querySelector('.u-ambient');
    const spot = root.querySelector('.u-ambient-spot');
    const empty = root.querySelector('#empty');
    env.pointer(empty, 900, 500);
    env.flush();
    atmosphere.setPaused(true);
    assert.equal(host.style.getPropertyValue('--u-px'), '0');
    assert.equal(host.style.getPropertyValue('--u-py'), '0');
    assert.equal(spot.style.getPropertyValue('--my'), '');
    env.pointer(empty, 1200, 700);
    atmosphere.setPaused(false);
    env.window.dispatchEvent(new env.window.Event('resize'));
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    env.pointer(empty, 500, 300);
    env.flush();
    env.focused(false);
    assert.ok(host.hasAttribute('data-paused'));
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    assert.equal(env.pending.size, 0);
    env.pointer(empty, 700, 400);
    env.focused(true);
    env.window.dispatchEvent(new env.window.Event('scroll'));
    env.flush();
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    env.pointer(empty, 700, 400);
    env.flush();
    const last = env.animations.at(-1);
    root.dispatchEvent(new env.window.Event('pointerleave'));
    assert.ok(last.canceled);
    assert.equal(spot.style.getPropertyValue('--mx'), '');
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
  } finally { env.restore(); }
});

test('opening a modal or making the hero inert pauses its background under a stationary pointer', async () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero');
    env.track(mountAmbient(root));
    const host = root.querySelector('.u-ambient');
    const empty = root.querySelector('#empty');
    env.pointer(empty, 145, 170);
    env.flush();
    const modal = env.document.createElement('dialog');
    modal.setAttribute('open', '');
    env.document.body.append(modal);
    await Promise.resolve();
    env.flush();
    assert.ok(host.hasAttribute('data-paused'));
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    modal.removeAttribute('open');
    await Promise.resolve();
    env.flush();
    assert.ok(!host.hasAttribute('data-paused'));
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
    env.pointer(empty, 145, 170);
    env.flush();
    root.setAttribute('inert', '');
    await Promise.resolve();
    env.flush();
    assert.ok(host.hasAttribute('data-paused'));
    assert.ok(!root.hasAttribute('data-fx-spot-active'));
  } finally { env.restore(); }
});

test('large real links expose an action, while a nested control keeps its own cursor meaning', () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const cursor = env.document.querySelector('.u-cursor');
    const entry = env.document.createElement('a'); entry.href = '/archive'; entry.textContent = 'Archive';
    env.rect(entry, { left: 100, top: 100, width: 735, height: 92 });
    env.document.body.append(entry);
    env.pointer(entry, 250, 140); env.flush();
    assert.equal(cursor.dataset.mode, 'label', 'the source snap limit must not make a wide real entry indistinguishable from empty space');
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, '打开');
    for (let index = 0; index < 6; index++) env.flush();
    assert.ok(parseFloat(cursor.querySelector('.u-cursor-box').style.width) > 45);
    env.document.documentElement.dataset.lang = 'en';
    env.pointer(entry, 250, 140); env.flush();
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, 'OPEN');
    const stage = env.document.createElement('div'); stage.dataset.cursorText = 'DRAG';
    const link = env.document.createElement('a'); link.href = '/blog'; link.dataset.cursor = 'read';
    stage.append(link); env.document.body.append(stage);
    env.pointer(link, 250, 220); env.flush();
    assert.equal(cursor.querySelector('.u-cursor-chip').textContent, 'READ', 'a surrounding surface label must not steal a nested action');
    const info = env.document.createElement('div'); info.textContent = 'A statistic, not a link';
    env.document.body.append(info); env.pointer(info, 300, 400); env.flush();
    assert.equal(cursor.dataset.mode, 'idle');
  } finally { env.restore(); }
});

test('settled cursor stops its animation loop and fresh moves, scroll and target changes restart it', async () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const empty = env.document.querySelector('#empty');
    env.pointer(empty, 650, 420);
    for (let index = 0; index < 90; index++) env.flush();
    assert.equal(env.pending.size, 0, 'an unmoving idle pointer must not keep a permanent rAF loop');
    env.pointer(env.document.querySelector('a'), 250, 220);
    assert.ok(env.pending.size > 0, 'fresh movement resumes damping');
    for (let index = 0; index < 90; index++) env.flush();
    assert.equal(env.pending.size, 0, 'a settled snap also sleeps');
    const box = env.document.querySelector('.u-cursor-box');
    const snappedWidth = parseFloat(box.style.width);
    env.pointer(env.document.querySelector('a'), 250, 220, 'pointerdown');
    for (let index = 0; index < 8; index++) env.flush();
    assert.ok(parseFloat(box.style.width) < snappedWidth - 7, 'pressing a resting target still contracts its frame');
    env.pointer(env.document.querySelector('a'), 250, 220, 'pointerup');
    for (let index = 0; index < 90; index++) env.flush();
    assert.ok(parseFloat(box.style.width) > snappedWidth - 0.1, 'releasing restores the source target frame');
    env.hit(empty); env.window.dispatchEvent(new env.window.Event('scroll'));
    env.flush();
    assert.equal(env.document.querySelector('.u-cursor').dataset.mode, 'idle');
    for (let index = 0; index < 90; index++) env.flush();
    assert.equal(env.pending.size, 0, 'bounded scroll tracking returns to sleep');
    const link = env.document.querySelector('a');
    env.pointer(link, 250, 220);
    for (let index = 0; index < 90; index++) env.flush();
    link.setAttribute('aria-disabled', 'true'); await Promise.resolve(); env.flush();
    assert.equal(env.document.querySelector('.u-cursor').dataset.mode, 'idle');
  } finally { env.restore(); }
});

test('native text entry and selection do not leave a cursor animation loop behind', () => {
  const env = browser();
  try {
    env.track(mountCursor());
    env.pointer(env.document.querySelector('input'), 300, 300); env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, 'native');
    assert.equal(env.pending.size, 0);
    env.pointer(env.document.querySelector('a'), 250, 220); env.flush();
    assert.equal(env.document.querySelector('.u-cursor').dataset.mode, 'label');
    assert.equal(env.document.documentElement.dataset.uCursor, 'on');
    const range = env.document.createRange(); range.selectNodeContents(env.document.querySelector('a'));
    env.window.getSelection().addRange(range);
    env.document.dispatchEvent(new env.window.Event('selectionchange')); env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, 'native');
    assert.equal(env.pending.size, 0);
    env.window.getSelection().removeAllRanges();
    env.document.dispatchEvent(new env.window.Event('selectionchange')); env.flush();
    assert.equal(env.document.documentElement.dataset.uCursor, 'on', 'clearing selection restores the actual pointed action');
  } finally { env.restore(); }
});

test('captured events use the physical quiet zone when producing hero trails', () => {
  const env = browser();
  try {
    const root = env.document.querySelector('#hero'); env.track(mountAmbient(root));
    const empty = root.querySelector('#empty');
    env.pointer(empty, 145, 170); env.flush();
    const trails = env.animations.length;
    env.pointer(empty, 650, 400, 'pointermove', root.querySelector('canvas')); env.flush();
    assert.equal(env.animations.length, trails, 'a physical stage hit must suppress decorative cells even when capture kept the old target');
    assert.ok(root.hasAttribute('data-fx-spot-active'), 'the separate spotlight still follows the stage');
    env.pointer(root.querySelector('canvas'), 400, 600, 'pointermove', empty); env.flush();
    assert.equal(env.animations.length, trails + 1, 'capture leaving a quiet stage must also restore the physical background trail');
  } finally { env.restore(); }
});

test('a target transition wakes a resting cursor and content changes refresh the stationary action', async () => {
  const env = browser();
  try {
    env.track(mountCursor());
    const link = env.document.querySelector('a');
    env.pointer(link, 250, 220);
    for (let index = 0; index < 90; index++) env.flush();
    assert.equal(env.pending.size, 0);
    link.dispatchEvent(new env.window.Event('transitionrun', { bubbles: true }));
    env.rect(link, { left: 200, top: -100, width: 120, height: 44 });
    env.hit(env.document.querySelector('#empty')); env.flush();
    assert.equal(env.document.querySelector('.u-cursor').dataset.mode, 'idle');
    for (let index = 0; index < 90; index++) env.flush();
    const replacement = env.document.createElement('a'); replacement.href = '/works'; replacement.dataset.cursor = 'open';
    env.hit(replacement); env.document.body.append(replacement);
    await Promise.resolve(); env.flush();
    assert.equal(env.document.querySelector('.u-cursor-chip').textContent, '打开');
  } finally { env.restore(); }
});
