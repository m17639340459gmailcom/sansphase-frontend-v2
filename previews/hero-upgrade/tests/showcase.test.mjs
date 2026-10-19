import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let compiled;
async function load() {
  compiled ||= build({
    stdin: { contents: 'export {mountShowcase} from "./src/showcase.ts"; export {posts} from "./src/content.ts"; export {setLang} from "./src/i18n.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'showcase-gsap-fixture', setup(builder) {
      builder.onResolve({ filter: /^gsap(?:\/SplitText)?$/ }, args => ({ path: args.path, namespace: 'showcase-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'showcase-test' }, args => ({ contents: args.path.endsWith('SplitText')
        ? `export const SplitText={create(el){const text=el.textContent;el.innerHTML='';const chars=Array.from(text).map(char=>{const span=document.createElement('span');span.textContent=char;el.append(span);return span});return {chars,revert(){el.textContent=text}}}};`
        : `const h=()=>globalThis.__showcaseHarness;export default {registerPlugin(){},quickTo(target,key){return h().quick(target,key)},to(target,vars){return h().to(target,vars)},fromTo(target,from,to){return h().to(target,to)},set(){},killTweensOf(){}};` }));
    } }],
  });
  const built = await compiled;
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, fine = true } = {}) {
  const names = ['window', 'document', 'Element', 'Node', 'HTMLElement', 'HTMLAnchorElement', 'HTMLImageElement', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'getComputedStyle', 'localStorage', '__showcaseHarness'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><div id="work-showcase"></div><button id="outside">outside</button>', { url: 'http://127.0.0.1:4285/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  let hidden = false, sequence = 0;
  const pending = new Map(), observers = [], tweens = [], media = new Map();
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }; };
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 780 });
  const captures = new Set();
  window.HTMLElement.prototype.setPointerCapture = id => captures.add(id);
  window.HTMLElement.prototype.hasPointerCapture = id => captures.has(id);
  window.HTMLElement.prototype.releasePointerCapture = id => captures.delete(id);
  const preference = query => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  const tween = () => { const item = { killed: false, kill() { this.killed = true; } }; tweens.push(item); return item; };
  const harness = {
    quick(target, key) { const fn = value => target.style.setProperty(key, String(value)); fn.tween = tween(); return fn; },
    to(target, vars) { const item = tween(); item.target = target; item.vars = vars; item.complete = vars.onComplete; return item; },
  };
  const globals = {
    window, document, Element: window.Element, Node: window.Node, HTMLElement: window.HTMLElement, HTMLAnchorElement: window.HTMLAnchorElement, HTMLImageElement: window.HTMLImageElement,
    localStorage: window.localStorage, getComputedStyle: window.getComputedStyle.bind(window), matchMedia: preference,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame(callback) { const id = ++sequence; pending.set(id, callback); return id; }, cancelAnimationFrame(id) { pending.delete(id); }, __showcaseHarness: harness,
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const root = document.getElementById('work-showcase');
  const pointer = (target, type, x = 600, y = 200, extra = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({ clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, ...extra }).map(([key, value]) => [key, { value }])));
    target.dispatchEvent(event); return event;
  };
  return {
    root, window, document, pending, observers, tweens, pointer,
    enter(value = true) { observers.forEach(observer => observer.callback([{ isIntersecting: value, intersectionRatio: value ? 0.6 : 0, target: root }])); },
    flush() { const queue = [...pending.values()]; pending.clear(); queue.forEach(callback => callback(10)); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    click(target, options = {}) { const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; },
    key(target, key, options = {}) { const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; },
    animation(target, name = 'showcase-cycle') { const event = new window.Event('animationend', { bubbles: true }); Object.defineProperty(event, 'animationName', { value: name }); target.dispatchEvent(event); },
    restore() { dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}
const selected = env => Number(env.root.dataset.active);
const clock = env => env.root.querySelector('.showcase-tab-fill');
const action = (env, name) => env.root.querySelector(`[data-action="${name}"]`);

test('showcase uses only four real records, native front links, side selectors and distant inert cards', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase, posts, setLang } = await load(); setLang('zh');
    controller = mountShowcase(env.root, { reduced: false, readPost() {} });
    assert.deepEqual([...env.root.querySelectorAll('.showcase-shot img')].map(img => img.getAttribute('src')), posts.map(post => post.cover));
    assert.deepEqual([...env.root.querySelectorAll('.showcase-tab-title .roll-a')].map(el => el.textContent), posts.map(post => post.title.zh));
    assert.equal(env.root.querySelector('[role="tablist"]'), null);
    const front = env.root.querySelector('.showcase-card[data-active="true"] a');
    assert.equal(front.getAttribute('href'), `/blog/${posts[0].slug}`); assert.equal(front.dataset.post, '0');
    assert.equal(env.root.querySelectorAll('.showcase-card button.showcase-hitArea').length, 3);
    const distant = env.root.querySelector('.showcase-card[data-distant="true"]');
    assert.equal(distant.getAttribute('aria-hidden'), 'true'); assert.ok(distant.hasAttribute('inert'));
    assert.equal(env.root.querySelector('.showcase-title').textContent, posts[0].title.zh);
    assert.equal(env.root.querySelector('.showcase-summary').textContent, posts[0].summary.zh);
  } finally { controller?.dispose(); env.restore(); }
});

test('only plain primary article clicks read; side cards select and reader returns to the visible CTA', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase } = await load(); const reads = [];
    controller = mountShowcase(env.root, { reduced: true, readPost: index => reads.push(index) });
    const front = env.root.querySelector('.showcase-card[data-active="true"] a');
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }]) assert.equal(env.click(front, options).defaultPrevented, false);
    assert.deepEqual(reads, []);
    assert.equal(env.click(front).defaultPrevented, true); assert.deepEqual(reads, [0]);
    assert.equal(env.document.activeElement, env.root.querySelector('.showcase-read'));
    env.click(env.root.querySelector('.showcase-card[data-index="1"] button'));
    assert.equal(selected(env), 1); assert.deepEqual(reads, [0]);
    env.click(env.root.querySelector('.showcase-read')); assert.deepEqual(reads, [0, 1]);
    const invalid = env.root.querySelector('.showcase-read'); invalid.dataset.post = '-1';
    assert.equal(env.click(invalid).defaultPrevented, false); assert.deepEqual(reads, [0, 1]);
  } finally { controller?.dispose(); env.restore(); }
});

test('keyboard navigation stays inside showcase, preserves shortcuts and refocuses the new front card', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase } = await load(); controller = mountShowcase(env.root, { reduced: true, readPost() {} });
    assert.equal(env.key(env.document.getElementById('outside'), 'ArrowRight').defaultPrevented, false); assert.equal(selected(env), 0);
    let front = env.root.querySelector('.showcase-card[data-active="true"] a'); front.focus();
    assert.equal(env.key(front, 'ArrowRight').defaultPrevented, true); assert.equal(selected(env), 1);
    assert.equal(env.document.activeElement, env.root.querySelector('.showcase-card[data-active="true"] a'));
    assert.equal(env.key(action(env, 'next'), 'End').defaultPrevented, true); assert.equal(selected(env), 3);
    env.key(action(env, 'next'), 'ArrowRight'); assert.equal(selected(env), 0);
    env.key(action(env, 'next'), 'End', { ctrlKey: true }); assert.equal(selected(env), 0);
    const input = env.document.createElement('input'); env.root.append(input); env.key(input, 'End'); assert.equal(selected(env), 0);
    env.key(action(env, 'next'), 'End'); env.key(action(env, 'next'), 'Home'); assert.equal(selected(env), 0);
  } finally { controller?.dispose(); env.restore(); }
});

test('a focused side-card selection keeps a real focus target and autoplay resumes after focus leaves', async () => {
  for (const reduced of [false, true]) {
    const env = browser({ reduced }); let controller;
    try {
      const { mountShowcase } = await load(); controller = mountShowcase(env.root, { reduced, readPost() {} }); env.enter();
      const side = env.root.querySelector('.showcase-card[data-index="1"] button');
      side.focus(); assert.equal(env.document.activeElement, side);
      env.click(side);
      assert.equal(selected(env), 1);
      assert.equal(env.document.activeElement, env.root.querySelector('.showcase-card[data-active="true"] a'), 'the replaced side button hands focus to the new front link');
      assert.equal(clock(env).dataset.mode, reduced ? 'full' : 'hold');
      env.root.dispatchEvent(new env.window.Event('pointerleave'));
      env.document.getElementById('outside').focus();
      assert.equal(clock(env).dataset.mode, reduced ? 'full' : 'run', 'removed focus targets cannot leave a stale pause gate');
      const outside = env.document.activeElement;
      env.click(env.root.querySelector('.showcase-card[data-index="2"] button'));
      assert.equal(env.document.activeElement, outside, 'selection without stage focus leaves the external keyboard position alone');
      controller.setActive(false); controller.refresh();
      assert.equal(env.document.activeElement, outside, 'an overlay refresh cannot take external focus');
      controller.setActive(true); env.root.querySelector('.showcase-read').focus();
      controller.setActive(false); controller.refresh();
      assert.equal(env.root.contains(env.document.activeElement), false, 'a suspended section cannot restore focus before the dialog receives it');
      controller.setActive(true); env.root.querySelector('.showcase-read').focus(); env.root.setAttribute('inert', '');
      controller.refresh();
      assert.equal(env.root.contains(env.document.activeElement), false, 'an inert page cannot restore its former control');
      env.root.removeAttribute('inert'); outside.focus();
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('the first visible observer notification cannot restart caption motion while the window is blurred', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase, posts, setLang } = await load(); setLang('zh');
    controller = mountShowcase(env.root, { reduced: false, readPost() {} });
    env.window.dispatchEvent(new env.window.Event('blur')); env.enter();
    assert.equal(env.root.dataset.live, 'false');
    assert.equal(env.tweens.filter(tween => !tween.killed).length, 0, 'the observer must obey the same window-availability gate as sync');
    assert.equal(env.root.querySelector('.showcase-title').textContent, posts[0].title.zh);
    assert.equal(env.root.querySelector('.showcase-title').children.length, 0, 'inactive text remains the complete unsplit original');
    env.window.dispatchEvent(new env.window.Event('focus')); env.enter();
    assert.equal(clock(env).dataset.mode, 'run');
    assert.equal(env.tweens.filter(tween => !tween.killed).length, 0, 'returning focus does not invent a second entrance');
  } finally { controller?.dispose(); env.restore(); }
});

test('one active CSS clock advances only while all visibility, hover, focus and playback gates allow it', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase } = await load(); controller = mountShowcase(env.root, { reduced: false, readPost() {} });
    assert.equal(clock(env).dataset.mode, 'hold'); env.enter(); assert.equal(clock(env).dataset.mode, 'run');
    env.root.dispatchEvent(new env.window.Event('pointerenter')); assert.equal(clock(env).dataset.mode, 'hold');
    env.root.dispatchEvent(new env.window.Event('pointerleave')); assert.equal(clock(env).dataset.mode, 'run');
    action(env, 'next').focus(); assert.equal(clock(env).dataset.mode, 'hold'); env.document.getElementById('outside').focus(); assert.equal(clock(env).dataset.mode, 'run');
    env.click(action(env, 'pause')); assert.equal(clock(env).dataset.mode, 'hold'); env.click(action(env, 'pause')); assert.equal(clock(env).dataset.mode, 'run');
    env.hidden(true); assert.equal(clock(env).dataset.mode, 'hold'); env.hidden(false); assert.equal(clock(env).dataset.mode, 'run');
    env.window.dispatchEvent(new env.window.Event('blur')); assert.equal(clock(env).dataset.mode, 'hold'); env.window.dispatchEvent(new env.window.Event('focus')); assert.equal(clock(env).dataset.mode, 'run');
    controller.setActive(false); assert.equal(clock(env).dataset.mode, 'hold'); controller.setActive(true); assert.equal(clock(env).dataset.mode, 'run');
    env.enter(false); assert.equal(clock(env).dataset.mode, 'hold'); env.enter();
    const old = clock(env); env.animation(old, 'some-other-animation'); assert.equal(selected(env), 0);
    env.animation(env.root.querySelector('.showcase-ring-fill')); assert.equal(selected(env), 0);
    env.animation(old); assert.equal(selected(env), 1); assert.equal(env.root.querySelectorAll('.showcase-tab-fill').length, 1);
    env.animation(old); assert.equal(selected(env), 1, 'removed old clock cannot advance a new slide');
    env.preference('(prefers-reduced-motion: reduce)', true); assert.equal(clock(env).dataset.mode, 'full');
    env.animation(clock(env)); assert.equal(selected(env), 1);
    env.click(action(env, 'next')); assert.equal(selected(env), 2, 'reduced motion keeps manual navigation');
  } finally { controller?.dispose(); env.restore(); }
});

test('horizontal scrubbing tracks card steps, suppresses its click and cancels cleanly on lost activity', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase } = await load(); const reads = []; controller = mountShowcase(env.root, { reduced: false, readPost: index => reads.push(index) }); env.enter();
    const stage = env.root.querySelector('.showcase-stage');
    env.pointer(stage, 'pointerdown', 700, 200); env.pointer(stage, 'pointermove', 700, 300); env.flush();
    assert.equal(stage.hasAttribute('data-scrub'), false); env.pointer(stage, 'pointercancel', 700, 300);
    env.pointer(stage, 'pointerdown', 700, 200); env.pointer(stage, 'pointermove', 500, 200); env.flush();
    assert.ok(stage.hasAttribute('data-scrub')); assert.ok(Number(stage.style.getPropertyValue('--shift')) < 0);
    env.pointer(stage, 'pointerup', 500, 200); assert.equal(selected(env), 1); assert.equal(stage.hasAttribute('data-scrub'), false); assert.equal(stage.style.getPropertyValue('--shift'), '');
    assert.equal(env.click(env.root.querySelector('.showcase-card[data-active="true"] a')).defaultPrevented, true); assert.deepEqual(reads, []);
    env.pointer(stage, 'pointerdown', 700, 200); env.pointer(stage, 'pointermove', 520, 200); controller.setActive(false); env.flush();
    assert.equal(stage.hasAttribute('data-scrub'), false); assert.equal(stage.style.getPropertyValue('--shift'), ''); assert.equal(env.pending.size, 0);
    env.pointer(stage, 'pointerup', 520, 200); assert.equal(selected(env), 1);
  } finally { controller?.dispose(); env.restore(); }
});

test('caption entrance always targets the current text, including rapid selection while a ghost is exiting', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase, posts, setLang } = await load(); setLang('zh'); controller = mountShowcase(env.root, { reduced: false, readPost() {} }); env.enter();
    env.click(action(env, 'next')); env.click(action(env, 'next'));
    const current = env.root.querySelector('.showcase-captionText:not(.showcase-captionGhost)');
    assert.equal(current.querySelector('.showcase-title').textContent, posts[2].title.zh);
    assert.equal(env.root.querySelectorAll('.showcase-captionGhost').length, 1);
    const entrances = env.tweens.filter(tween => Array.isArray(tween.target) && !tween.killed);
    assert.equal(entrances.length, 2);
    for (const tween of entrances) for (const char of tween.target) assert.ok(current.contains(char), 'SplitText entrance belongs to incoming text, never the exiting ghost');
    const ghost = env.root.querySelector('.showcase-captionGhost'); assert.equal(ghost.getAttribute('aria-hidden'), 'true');
    assert.equal(ghost.querySelector('.showcase-title').textContent, posts[1].title.zh, 'outgoing clone is the previous current record');
  } finally { controller?.dispose(); env.restore(); }
});

test('reduced motion still accepts a deliberate swipe without scrub frames and keeps only contained real pixels', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountShowcase } = await load(); controller = mountShowcase(env.root, { reduced: true, readPost() {} }); env.enter();
    const stage = env.root.querySelector('.showcase-stage'); env.pointer(stage, 'pointerdown', 700, 200); env.pointer(stage, 'pointermove', 500, 200); env.pointer(stage, 'pointerup', 500, 200);
    assert.equal(selected(env), 1); assert.equal(stage.hasAttribute('data-scrub'), false); assert.equal(env.pending.size, 0);
    const image = env.root.querySelector('.showcase-shot img'); Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 800 } });
    image.dispatchEvent(new env.window.Event('load'));
    assert.equal(image.parentElement.style.height, '100%'); assert.equal(parseFloat(image.parentElement.style.width), 56.25);
  } finally { controller?.dispose(); env.restore(); }
});

test('language refresh preserves selection and usable focus; disposal stops observer, pointer and keyboard work', async () => {
  const env = browser(); let controller;
  try {
    const { mountShowcase, posts, setLang } = await load(); setLang('zh'); const reads = [];
    controller = mountShowcase(env.root, { reduced: false, readPost: index => reads.push(index) }); env.enter(); env.click(action(env, 'next'));
    env.root.querySelector('.showcase-read').focus(); setLang('en'); controller.refresh();
    assert.equal(selected(env), 1); assert.equal(env.root.querySelector('.showcase-title').textContent, posts[1].title.en); assert.equal(env.document.activeElement, env.root.querySelector('.showcase-read'));
    env.pointer(env.root, 'pointermove', 300, 100); env.flush(); assert.ok(env.root.hasAttribute('data-fx-spot-active'));
    controller.dispose(); controller.dispose(); assert.ok(env.observers.every(observer => observer.disconnected)); assert.equal(env.pending.size, 0); assert.equal(env.root.hasAttribute('data-fx-spot-active'), false);
    env.click(action(env, 'next')); env.key(action(env, 'next'), 'End'); env.click(env.root.querySelector('.showcase-read')); env.animation(clock(env)); controller.refresh();
    assert.equal(selected(env), 1); assert.deepEqual(reads, []); assert.ok(env.tweens.every(tween => tween.killed));
  } finally { controller?.dispose(); env.restore(); }
});
