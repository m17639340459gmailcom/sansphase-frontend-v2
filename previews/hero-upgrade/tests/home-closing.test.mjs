import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const probeRule = readFileSync(new URL('../src/home-closing.css', import.meta.url), 'utf8').match(/\.closing-wordmark-probe\s*\{[^}]+\}/)[0];
let built;
async function load() {
  built ||= build({
    stdin: { contents: 'export {mountHomeClosing} from "./src/home-closing.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'closing-gsap-adapter', setup(builder) {
      builder.onResolve({ filter: /^gsap$/ }, () => ({ path: 'gsap', namespace: 'closing-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'closing-test' }, () => ({ contents: 'export default {set(target,vars){globalThis.__closingHarness.set(target,vars)},timeline(options){return globalThis.__closingHarness.timeline(options)}};' }));
    } }],
  });
  const result = await built;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, fine = true } = {}) {
  const names = ['window', 'document', 'HTMLElement', 'Element', 'IntersectionObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', '__closingHarness'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><main><div id="home"><section id="banner"><div class="banner-copy"><h2>一起创作</h2><p>既有服务</p><ul class="services"><li>影像实践</li></ul><div id="banner-actions"><a href="https://qq.com" target="_blank" rel="noopener">QQ</a><a href="https://douyin.com" target="_blank" rel="noopener">抖音</a></div></div><div class="banner-art" aria-hidden="true"><span class="banner-word">無相</span></div></section></div><div id="other"></div></main><footer id="footer"><a href="/blog">博客</a><a id="icp" href="https://beian.miit.gov.cn/">备案</a><b id="footer-clock">12:34:56</b><button class="to-top">顶部</button><div class="wordmark" id="wordmark" aria-hidden="true"><span class="wordmark-base">SANSPHASE</span><span class="wordmark-lit">SANSPHASE</span></div></footer>', { url: 'http://127.0.0.1:4285/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const banner = document.querySelector('#banner'), footer = document.querySelector('#footer'), wordmark = document.querySelector('#wordmark');
  const pending = new Map(), observers = [], resizeObservers = [], timelines = [], media = new Map();
  let sequence = 0, hidden = false, hit = banner, glyphScale = 1;
  const boxes = new Map([[banner, { left: 100, top: 100, width: 700, height: 400 }], [footer, { left: 0, top: 500, width: 1000, height: 400 }], [wordmark, { left: 20, top: 700, width: 960, height: 160 }], [wordmark.querySelector('.wordmark-lit'), { left: 40, top: 710, width: 920, height: 150 }], [banner.querySelector('.banner-art'), { left: 600, top: 140, width: 180, height: 300 }]]);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.hasFocus = () => true;
  document.elementFromPoint = () => hit;
  Object.defineProperty(wordmark, 'clientWidth', { configurable: true, value: 960 });
  // Model browser inheritance: a parent's -.05em is inherited as its computed
  // pixel value, not recalculated using the probe's own 100px font size.
  wordmark.style.letterSpacing = '-10px';
  const stylesheet = document.createElement('style'); stylesheet.textContent = probeRule; document.head.append(stylesheet);
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('closing-wordmark-probe')) {
      const spacing = window.getComputedStyle(this).letterSpacing || window.getComputedStyle(wordmark).letterSpacing;
      const pixels = spacing.endsWith('em') ? parseFloat(spacing) * 100 : parseFloat(spacing);
      return { left: 0, top: 0, width: 645 + 9 * pixels, height: 100 };
    }
    if (this.classList.contains('closing-wordmark-char')) {
      const size = parseFloat(wordmark.style.getPropertyValue('--wm-size')) || 200;
      const width = size * 6 * glyphScale / 9;
      const index = [...this.parentElement.children].indexOf(this);
      return { left: 20 + width * index, top: 700, width, height: size };
    }
    return boxes.get(this) || { left: 0, top: 0, width: 40, height: 40 };
  };
  const targets = value => value instanceof window.Element ? [value] : Array.from(value ?? []);
  const apply = (target, vars) => targets(target).forEach(element => {
    if ('yPercent' in vars) element.style.transform = `translateY(${vars.yPercent}%)`;
    if ('y' in vars) element.style.transform = `translateY(${vars.y}px)`;
    if ('opacity' in vars) element.style.opacity = String(vars.opacity);
    if (vars.clearProps) for (const property of vars.clearProps.split(',')) element.style.removeProperty(property);
  });
  const preference = query => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  const globals = {
    window, document, HTMLElement: window.HTMLElement, Element: window.Element, matchMedia: preference,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); } observe(target) { this.targets.add(target); } disconnect() { this.targets.clear(); this.disconnected = true; } },
    ResizeObserver: class { constructor(callback) { this.callback = callback; resizeObservers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame(callback) { const id = ++sequence; pending.set(id, callback); return id; }, cancelAnimationFrame(id) { pending.delete(id); },
    __closingHarness: {
      set: apply,
      timeline(options) { const entry = { killed: false, options, calls: [], fromTo(target, from, to, at) { this.calls.push({ target: targets(target), from, to, at }); apply(target, from); return this; }, kill() { this.killed = true; }, finish() { this.calls.forEach(call => apply(call.target, call.to)); options.onComplete?.(); } }; timelines.push(entry); return entry; },
    },
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return {
    window, document, banner, footer, wordmark, boxes, pending, timelines,
    enter(target, visible = true, ratio = 0.9) { observers.forEach(observer => { if (observer.targets.has(target)) observer.callback([{ target, isIntersecting: visible, intersectionRatio: visible ? ratio : 0 }]); }); },
    hit(target) { hit = target; },
    pointer(target, x, y, pointerType = 'mouse', type = 'pointermove') { hit = target; const event = new window.Event(type, { bubbles: true }); Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerType: { value: pointerType } }); target.dispatchEvent(event); },
    flush() { const queue = [...pending.values()]; pending.clear(); queue.forEach(callback => callback(10)); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    resize() { resizeObservers.forEach(observer => observer.callback([])); },
    glyphScale(value) { glyphScale = value; },
    restore() { dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}

const inactive = env => {
  assert.equal(env.banner.hasAttribute('data-closing-spot-active'), false);
  assert.equal(env.footer.hasAttribute('data-closing-spot-active'), false);
  assert.equal(env.banner.style.getPropertyValue('--mx'), '');
  assert.equal(env.wordmark.querySelector('.wordmark-lit').style.getPropertyValue('--mx'), '');
};

test('closing keeps authored content, real destinations and clock, adding only idempotent source decorations and a fitted wordmark', async () => {
  const env = browser(); let controller;
  try {
    const before = [...env.document.querySelectorAll('a')].map(link => [link.textContent, link.href, link.target, link.rel]);
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); controller.refresh(); controller.refresh();
    assert.deepEqual([...env.document.querySelectorAll('a')].map(link => [link.textContent, link.href, link.target, link.rel]), before);
    assert.equal(env.document.querySelector('.services').textContent, '影像实践'); assert.equal(env.document.querySelector('#footer-clock').textContent, '12:34:56');
    for (const selector of ['.closing-beam', '.closing-glow', '.closing-wordmark-probe', '.closing-wordmark-sweep']) { assert.equal(env.document.querySelectorAll(selector).length, 1); assert.equal(env.document.querySelector(selector).getAttribute('aria-hidden'), 'true'); }
    assert.equal(env.wordmark.querySelector('.wordmark-base').textContent, 'SANSPHASE'); assert.equal(env.wordmark.querySelector('.wordmark-lit').textContent, 'SANSPHASE');
    assert.equal(parseFloat(env.wordmark.style.getPropertyValue('--wm-size')), 160);
    assert.equal(env.banner.querySelector('canvas,img,input'), null); assert.equal(env.document.querySelectorAll('button').length, 1);
  } finally { controller?.dispose(); env.restore(); }
});

test('100px probe spacing is independent of the enlarged parent and the final glyph envelope stays within the available width', async () => {
  const env = browser(); let controller;
  try {
    env.wordmark.style.setProperty('--wm-size', '230.46px'); env.wordmark.style.letterSpacing = '-11.523px';
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false });
    assert.equal(parseFloat(env.wordmark.style.getPropertyValue('--wm-size')), 160);
    env.wordmark.style.letterSpacing = '-8px'; controller.refresh(); assert.equal(parseFloat(env.wordmark.style.getPropertyValue('--wm-size')), 160, 'refitting does not feed the previous parent spacing back into the probe');
    env.glyphScale(1.04); controller.refresh();
    const chars = [...env.wordmark.querySelectorAll('.closing-wordmark-char')], first = chars[0].getBoundingClientRect(), last = chars.at(-1).getBoundingClientRect();
    assert.ok(last.left + last.width - first.left <= 960.5, 'post-fit verification covers a font-metric mismatch between probe and split glyphs');
    const size = env.wordmark.style.getPropertyValue('--wm-size'); env.resize(); assert.equal(env.wordmark.style.getPropertyValue('--wm-size'), size, 'final fit converges rather than growing on every resize notification');
  } finally { controller?.dispose(); env.restore(); }
});

test('banner and full footer feed their own local light coordinates; leave cancels a queued paint', async () => {
  const env = browser(); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); env.enter(env.banner); env.enter(env.footer);
    env.pointer(env.banner, 350, 240); env.flush(); assert.equal(env.banner.style.getPropertyValue('--mx'), '250.0px'); assert.equal(env.banner.style.getPropertyValue('--my'), '140.0px'); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), true);
    env.pointer(env.footer, 640, 760); env.flush(); const fill = env.wordmark.querySelector('.wordmark-lit'); assert.equal(fill.style.getPropertyValue('--mx'), '600.0px'); assert.equal(fill.style.getPropertyValue('--my'), '50.0px'); assert.equal(env.footer.hasAttribute('data-closing-spot-active'), true);
    env.pointer(env.footer, 680, 780); env.footer.dispatchEvent(new env.window.Event('pointerleave')); env.flush(); assert.equal(env.footer.hasAttribute('data-closing-spot-active'), false); assert.equal(fill.style.getPropertyValue('--mx'), '');
    env.banner.dispatchEvent(new env.window.Event('pointerleave')); inactive(env);
  } finally { controller?.dispose(); env.restore(); }
});

test('stationary scrolling updates current geometry and releases a light when its host moves away', async () => {
  const env = browser(); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); env.enter(env.banner);
    env.pointer(env.banner, 350, 240); env.flush(); env.boxes.set(env.banner, { left: 100, top: 50, width: 700, height: 400 }); env.window.dispatchEvent(new env.window.Event('scroll')); env.flush(); assert.equal(env.banner.style.getPropertyValue('--my'), '190.0px');
    env.hit(env.document.querySelector('#other')); env.window.dispatchEvent(new env.window.Event('scroll')); env.flush(); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), false); assert.equal(env.banner.style.getPropertyValue('--mx'), '');
    env.hit(env.banner); env.window.dispatchEvent(new env.window.Event('scroll')); env.flush(); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), false, 'scroll cannot revive a cleared pointer without fresh movement');
  } finally { controller?.dispose(); env.restore(); }
});

test('overlay, blur and hidden gates stop beams, drift and pending pointer writes, then require a fresh movement', async () => {
  for (const gate of ['overlay', 'blur', 'hidden']) {
    const env = browser(); let controller;
    try {
      const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); env.enter(env.banner); env.enter(env.footer); env.pointer(env.banner, 350, 240);
      if (gate === 'overlay') controller.setActive(false); if (gate === 'blur') env.window.dispatchEvent(new env.window.Event('blur')); if (gate === 'hidden') env.hidden(true);
      env.flush(); inactive(env); assert.equal(env.banner.dataset.closingPaused, 'true'); assert.equal(env.banner.querySelector('.banner-art').style.getPropertyValue('--closing-y'), '0px');
      if (gate === 'overlay') controller.setActive(true); if (gate === 'blur') env.window.dispatchEvent(new env.window.Event('focus')); if (gate === 'hidden') env.hidden(false);
      env.flush(); inactive(env); assert.equal(env.banner.dataset.closingPaused, 'false'); env.pointer(env.banner, 350, 240); env.flush(); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), true);
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('the footer clock pulse follows the existing closing visibility and overlay pause gate', async () => {
  const env = browser(); let controller;
  try {
    env.banner.classList.add('banner'); env.footer.classList.add('footer');
    const clock = env.document.createElement('span'); clock.className = 'clock';
    const pulse = env.document.createElement('i'), time = env.footer.querySelector('#footer-clock');
    time.replaceWith(clock); clock.append(pulse, time);
    const style = env.document.createElement('style');
    style.textContent = readFileSync(new URL('../src/home-closing.css', import.meta.url), 'utf8');
    env.document.head.append(style);
    const playState = element => env.window.getComputedStyle(element).animationPlayState || 'running';
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false });
    assert.equal(playState(env.banner.querySelector('.closing-beam')), 'paused', 'the existing banner beam already stops outside the viewport');
    assert.equal(playState(pulse), 'paused', 'an offscreen clock must not keep its decorative CSS animation running');
    env.enter(env.footer); assert.equal(playState(pulse), 'running');
    env.enter(env.footer, false); assert.equal(playState(pulse), 'paused');
    env.enter(env.footer); controller.setActive(false); assert.equal(playState(pulse), 'paused');
    controller.setActive(true); assert.equal(playState(pulse), 'running');
    env.window.dispatchEvent(new env.window.Event('blur')); assert.equal(playState(pulse), 'paused');
    env.window.dispatchEvent(new env.window.Event('focus')); assert.equal(playState(pulse), 'running');
    assert.equal(time.textContent, '12:34:56', 'decorative pausing does not replace the existing clock value');
  } finally { controller?.dispose(); env.restore(); }
});

test('coarse pointers and reduced motion keep the wordmark readable, disable decorative tracking and can switch live', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: true }); env.enter(env.banner); env.enter(env.footer); env.enter(env.wordmark); env.pointer(env.banner, 350, 240); env.flush(); inactive(env); assert.equal(env.timelines.length, 0); assert.equal(env.banner.dataset.closingPaused, 'true');
    env.preference('(prefers-reduced-motion: reduce)', false); env.pointer(env.banner, 350, 240); env.flush(); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), true);
    env.preference('(pointer: fine)', false); inactive(env); env.pointer(env.footer, 640, 760); env.flush(); inactive(env); env.preference('(pointer: fine)', true); env.pointer(env.footer, 640, 760, 'touch'); env.flush(); inactive(env);
  } finally { controller?.dispose(); env.restore(); }
});

test('footer continues independently of a hidden homepage and the source wordmark entrance is consumed once', async () => {
  const env = browser(); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); env.document.querySelector('#home').hidden = true; env.enter(env.footer); env.enter(env.wordmark);
    assert.equal(env.timelines.length, 1); const entry = env.timelines[0]; assert.equal(entry.calls[0].to.duration, 1.1); assert.equal(entry.calls[0].to.stagger, 0.045);
    env.pointer(env.footer, 640, 760); env.flush(); assert.equal(env.footer.hasAttribute('data-closing-spot-active'), true);
    entry.finish(); env.enter(env.wordmark, false); env.enter(env.wordmark); controller.refresh(); assert.equal(env.timelines.length, 1); assert.equal(env.wordmark.querySelector('.wordmark-base').textContent, 'SANSPHASE');
    env.pointer(env.banner, 350, 240); env.flush(); assert.equal(env.banner.hasAttribute('data-closing-spot-active'), false);
  } finally { controller?.dispose(); env.restore(); }
});

test('interrupted entrances and disposal restore final readable text and cannot be revived by queued work', async () => {
  const env = browser(); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); env.enter(env.banner); env.enter(env.footer); env.enter(env.wordmark); const entry = env.timelines[0]; env.pointer(env.footer, 640, 760); controller.dispose(); controller.dispose(); env.flush(); inactive(env); assert.equal(entry.killed, true);
    assert.ok([...env.wordmark.querySelectorAll('.closing-wordmark-char')].every(char => char.style.opacity !== '0' && !char.style.transform));
    const count = env.timelines.length; controller.refresh(); controller.setActive(true); env.enter(env.wordmark); env.pointer(env.footer, 640, 760); env.hidden(true); env.hidden(false); env.flush(); assert.equal(env.timelines.length, count); inactive(env);
  } finally { controller?.dispose(); env.restore(); }
});

test('contact container uses the source fade-up once and settles on interruption without replaying on language refresh', async () => {
  const env = browser(); let controller;
  try {
    const { mountHomeClosing } = await load(); controller = mountHomeClosing(env.banner, env.footer, { reduced: false }); controller.setActive(false); env.enter(env.banner);
    assert.equal(env.timelines.length, 0); controller.setActive(true);
    const entrances = () => env.timelines.filter(timeline => timeline.calls.some(call => call.target.includes(env.banner)));
    assert.equal(entrances().length, 1); const first = entrances()[0], call = first.calls[0]; assert.deepEqual(call.from, { y: 16, opacity: 0 }); assert.equal(call.to.duration, .5); assert.equal(env.banner.dataset.closingEntrance, 'play');
    assert.equal(env.banner.querySelector('h2').style.opacity, '', 'main retains ownership of the heading animation');
    controller.setActive(false); assert.equal(first.killed, true); assert.equal(env.banner.style.opacity, ''); assert.equal(env.banner.style.transform, ''); assert.equal(env.banner.dataset.closingEntrance, 'done');
    first.finish(); controller.setActive(true); controller.refresh(); env.enter(env.banner, false); env.enter(env.banner); assert.equal(entrances().length, 1, 'refresh and scrolling do not replay an already consumed entrance');
  } finally { controller?.dispose(); env.restore(); }
});
