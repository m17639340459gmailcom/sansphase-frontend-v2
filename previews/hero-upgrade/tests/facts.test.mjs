import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let compiled;
async function load() {
  compiled ||= build({
    stdin: { contents: 'export {mountFacts} from "./src/facts.ts"; export {setLang} from "./src/i18n.ts"; export {numbers} from "./src/content.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'facts-gsap-test-adapter', setup(builder) {
      builder.onResolve({ filter: /^gsap$/ }, () => ({ path: 'gsap', namespace: 'facts-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'facts-test' }, () => ({ contents: 'const h=()=>globalThis.__factsHarness;export default {set(target,vars){h().set(target,vars)},timeline(options){return h().timeline(options)}};' }));
    } }],
  });
  const built = await compiled;
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, fine = true, hidden: initiallyHidden = false } = {}) {
  const names = ['window', 'document', 'Element', 'HTMLElement', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'localStorage', '__factsHarness'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><section id="facts"><div id="facts-grid"></div></section>', { url: 'http://127.0.0.1:4285/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  let hidden = initiallyHidden, sequence = 0;
  const pending = new Map(), observers = [], timelines = [], media = new Map(), operations = [];
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    operations.push(['read', this.className || this.id]);
    return this.classList.contains('fact-index') ? { left: 15, top: 20, width: 50, height: 50 } : { left: 0, top: 0, width: 300, height: 200 };
  };
  const targets = target => target instanceof window.Element ? [target] : Array.from(target ?? []);
  const apply = (target, vars) => targets(target).forEach(element => {
    if ('yPercent' in vars) element.style.transform = `translateY(${vars.yPercent}%)`;
    if ('y' in vars) element.style.transform = `translateY(${vars.y}px)`;
    if ('opacity' in vars) element.style.opacity = String(vars.opacity);
    if (vars.clearProps) for (const property of vars.clearProps.split(',')) element.style.removeProperty(property);
  });
  const harness = {
    set: apply,
    timeline(options) {
      const item = { killed: false, options, calls: [], fromTo(target, from, to, at) { this.calls.push({ target: targets(target), from, to, at }); apply(target, from); return this; }, kill() { this.killed = true; }, finish() { for (const call of this.calls) apply(call.target, call.to); this.options.onComplete?.(); } };
      timelines.push(item); return item;
    },
  };
  const preference = query => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  const globals = {
    window, document, Element: window.Element, HTMLElement: window.HTMLElement, localStorage: window.localStorage, matchMedia: preference,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); } observe(target) { this.targets.add(target); } disconnect() { this.disconnected = true; this.targets.clear(); } },
    requestAnimationFrame(callback) { const id = ++sequence; pending.set(id, callback); return id; }, cancelAnimationFrame(id) { pending.delete(id); }, __factsHarness: harness,
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const root = document.getElementById('facts-grid');
  return {
    root, window, document, pending, observers, timelines, operations,
    enter(value = true) { observers.forEach(observer => observer.callback([...observer.targets].map(target => ({ target, isIntersecting: value, intersectionRatio: value ? 0.8 : 0 })))); },
    enterCell(index, ratio = 0.8) { observers.forEach(observer => observer.callback([{ target: root, isIntersecting: true, intersectionRatio: 0.8 }, { target: root.querySelectorAll('.fact')[index], isIntersecting: ratio > 0, intersectionRatio: ratio }])); },
    flush() { const queue = [...pending.values()]; pending.clear(); queue.forEach(callback => callback(10)); },
    pointer(target = root, x = 180, y = 100, pointerType = 'mouse') { const event = new window.Event('pointermove', { bubbles: true }); Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerType: { value: pointerType } }); target.dispatchEvent(event); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    restore() { dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}

const values = env => [...env.root.querySelectorAll('.fact-value > .visually-hidden')].map(element => element.textContent);
const states = env => [...env.root.querySelectorAll('.fact')].map(element => element.dataset.fxState);
function finalValues(env) {
  assert.deepEqual(values(env), ['04', '11', '06', '2026.10.01']);
  for (const column of env.root.querySelectorAll('.odo-column')) assert.equal(column.style.transform, `translateY(${-(10 + Number(column.dataset.digit)) * 5}%)`);
  for (const element of env.root.querySelectorAll('.fact,.fact-label,.fact-index-char')) assert.notEqual(element.style.opacity, '0');
}

test('four facts keep their verified values, readable labels and decorative double-turn numerals without invented controls', async () => {
  const env = browser(); let controller;
  try {
    const { mountFacts, setLang, numbers } = await load(); setLang('zh'); controller = mountFacts(env.root, { reduced: false });
    assert.deepEqual(numbers, { posts: 4, tags: 11, sections: 6, latest: '2026.10.01' });
    finalValues(env);
    assert.deepEqual([...env.root.querySelectorAll('.fact-label')].map(element => element.textContent), ['已发布文章', '主题标签', '网站栏目', '最近更新']);
    assert.equal(env.root.querySelector('button,a,input,[data-post],.fact-viz'), null);
    for (const index of env.root.querySelectorAll('.fact-index')) assert.equal(index.getAttribute('aria-hidden'), 'true');
    for (const counter of env.root.querySelectorAll('.odometer')) assert.equal(counter.getAttribute('aria-hidden'), 'true');
    for (const column of env.root.querySelectorAll('.odo-column')) assert.equal(column.childElementCount, 20);
    assert.deepEqual([...env.root.querySelectorAll('.fact-index-base')].map(element => element.textContent), ['01', '02', '03', '04']);
    assert.equal(env.timelines.length, 0, 'offscreen mounting does not consume the entrance');
  } finally { controller?.dispose(); env.restore(); }
});

test('first real visible entrance keeps cells fixed, staggers internal parts and rolls source columns once', async () => {
  const env = browser(); let controller;
  try {
    const { mountFacts } = await load(); controller = mountFacts(env.root, { reduced: false }); env.enter();
    assert.equal(env.timelines.length, 4); assert.deepEqual(states(env), ['play', 'play', 'play', 'play']);
    const calls = env.timelines.flatMap(timeline => timeline.calls), columns = calls.filter(call => call.target[0]?.classList.contains('odo-column'));
    assert.equal(columns.length, 14); assert.ok(columns.every(call => call.to.duration === 1.4));
    const labels = calls.filter(call => call.target[0]?.classList.contains('fact-label'));
    assert.deepEqual(labels.map(call => Number(call.at.toFixed(2))), [0.35, 0.42, 0.49, 0.56]);
    assert.ok(calls.every(call => call.target.every(target => !target.classList.contains('fact'))), 'opaque cell faces never move or fade');
    const punctuation = calls.filter(call => call.target[0]?.classList.contains('odo-static'));
    assert.equal(punctuation.length, 2); assert.deepEqual(punctuation.map(call => Number(call.at.toFixed(3))), [0.53, 0.765]);
    env.timelines.forEach(timeline => timeline.finish()); finalValues(env); assert.deepEqual(states(env), ['done', 'done', 'done', 'done']);
    env.enter(false); env.enter(); controller.refresh(); assert.equal(env.timelines.length, 4); finalValues(env);
  } finally { controller?.dispose(); env.restore(); }
});

test('an initially covered, blurred or hidden section keeps its entrance pending until truly active', async () => {
  for (const gate of ['cover', 'hidden', 'blur']) {
    const env = browser(); let controller;
    try {
      const { mountFacts } = await load(); controller = mountFacts(env.root, { reduced: false });
      if (gate === 'cover') controller.setActive(false);
      if (gate === 'hidden') env.hidden(true);
      if (gate === 'blur') env.window.dispatchEvent(new env.window.Event('blur'));
      env.enter(); finalValues(env); assert.equal(env.timelines.length, 0);
      controller.refresh(); finalValues(env); assert.equal(env.timelines.length, 0);
      if (gate === 'cover') controller.setActive(true);
      if (gate === 'hidden') env.hidden(false);
      if (gate === 'blur') env.window.dispatchEvent(new env.window.Event('focus'));
      env.enter(); assert.equal(env.timelines.length, 4, `${gate} did not consume the unstarted entrance`);
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('every activity loss cancels a running entrance, settles real final values and invalidates stale completion', async () => {
  for (const gate of ['cover', 'hidden', 'blur', 'offscreen', 'reduced']) {
    const env = browser(); let controller;
    try {
      const { mountFacts } = await load(); controller = mountFacts(env.root, { reduced: false }); env.enter(); const timeline = env.timelines[0];
      if (gate === 'cover') controller.setActive(false);
      if (gate === 'hidden') env.hidden(true);
      if (gate === 'blur') env.window.dispatchEvent(new env.window.Event('blur'));
      if (gate === 'offscreen') env.enter(false);
      if (gate === 'reduced') env.preference('(prefers-reduced-motion: reduce)', true);
      assert.equal(timeline.killed, true); finalValues(env); timeline.options.onComplete?.(); finalValues(env);
      controller.setActive(true); env.hidden(false); env.window.dispatchEvent(new env.window.Event('focus')); env.preference('(prefers-reduced-motion: reduce)', false); env.enter();
      assert.equal(env.timelines.length, 4); assert.deepEqual(states(env), ['done', 'done', 'done', 'done']);
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('shared pointer light batches one frame, uses each index own coordinates and resets on all gates', async () => {
  const env = browser(); let controller;
  try {
    const { mountFacts } = await load(); controller = mountFacts(env.root, { reduced: false }); env.enter(); env.timelines.forEach(timeline => timeline.finish());
    env.pointer(); env.pointer(env.root, 190, 110); assert.equal(env.pending.size, 1); env.flush();
    assert.equal(env.root.dataset.spotActive, 'true'); assert.equal(env.root.style.getPropertyValue('--facts-x'), '190.0px'); assert.equal(env.root.style.getPropertyValue('--facts-y'), '110.0px');
    assert.equal(env.root.querySelector('.fact').style.getPropertyValue('--spot-x'), '190.0px');
    assert.equal(env.root.querySelector('.fact-index-lit').style.getPropertyValue('--spot-x'), '175.0px');
    env.pointer(); controller.setActive(false); assert.equal(env.pending.size, 0); assert.equal(env.root.hasAttribute('data-spot-active'), false); assert.equal(env.root.style.getPropertyValue('--facts-x'), '');
    controller.setActive(true); env.pointer(); env.flush(); assert.equal(env.root.dataset.spotActive, 'true');
    env.root.dispatchEvent(new env.window.Event('pointerleave')); assert.equal(env.root.hasAttribute('data-spot-active'), false);
    env.preference('(pointer: fine)', false); env.pointer(); assert.equal(env.pending.size, 0); assert.equal(env.root.dataset.active, 'false');
    env.preference('(pointer: fine)', true); env.pointer(env.root, 180, 100, 'touch'); assert.equal(env.pending.size, 0);
  } finally { controller?.dispose(); env.restore(); }
});

test('each cell waits for twenty percent visibility and an interruption consumes only cells that actually began', async () => {
  const env = browser(); let controller;
  try {
    const { mountFacts, setLang } = await load(); setLang('zh'); controller = mountFacts(env.root, { reduced: false });
    env.enterCell(0, 0.19); assert.equal(env.timelines.length, 0); assert.deepEqual(states(env), ['idle', 'idle', 'idle', 'idle']);
    env.enterCell(0, 0.2); assert.equal(env.timelines.length, 1); assert.deepEqual(states(env), ['play', 'idle', 'idle', 'idle']);
    env.enterCell(1); assert.equal(env.timelines.length, 2); assert.deepEqual(states(env), ['play', 'play', 'idle', 'idle']);
    controller.setActive(false); assert.deepEqual(states(env), ['done', 'done', 'idle', 'idle']); finalValues(env);
    setLang('en'); controller.refresh(); controller.setActive(true); assert.equal(env.timelines.length, 2);
    env.enterCell(2); assert.equal(env.timelines.length, 3); assert.deepEqual(states(env), ['done', 'done', 'play', 'idle']);
    env.timelines[2].finish(); env.enterCell(3); assert.equal(env.timelines.length, 4);
    env.timelines[3].finish(); finalValues(env); assert.deepEqual(states(env), ['done', 'done', 'done', 'done']);
    assert.deepEqual([...env.root.querySelectorAll('.fact-label')].map(element => element.textContent), ['Published posts', 'Topic tags', 'Site sections', 'Latest update']);
  } finally { controller?.dispose(); env.restore(); }
});

test('language refresh keeps already seen facts settled, reduced motion stays readable, disposal removes all work', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountFacts, setLang } = await load(); setLang('zh'); controller = mountFacts(env.root, { reduced: true }); env.enter();
    finalValues(env); assert.equal(env.timelines.length, 0); env.pointer(); assert.equal(env.pending.size, 0);
    env.preference('(prefers-reduced-motion: reduce)', false); assert.equal(env.timelines.length, 0, 'a section already seen reduced must not replay when the preference changes');
    setLang('en'); controller.refresh(); finalValues(env);
    assert.deepEqual([...env.root.querySelectorAll('.fact-label')].map(element => element.textContent), ['Published posts', 'Topic tags', 'Site sections', 'Latest update']);
    env.pointer(); assert.equal(env.pending.size, 1); controller.dispose(); controller.dispose(); assert.equal(env.pending.size, 0); assert.ok(env.observers.every(observer => observer.disconnected));
    env.enter(); env.pointer(); env.preference('(prefers-reduced-motion: reduce)', true); controller.refresh(); controller.setActive(true); env.flush();
    assert.equal(env.pending.size, 0); assert.equal(env.timelines.length, 0); assert.equal(env.root.dataset.active, 'false'); finalValues(env);
  } finally { controller?.dispose(); env.restore(); }
});
