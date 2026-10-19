import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const states = env => [...env.root.querySelectorAll('.direction-cell')].map(cell => cell.dataset.fxState);
const done = env => assert.deepEqual(states(env), ['done', 'done', 'done']);

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let loaded;
async function load() {
  loaded ||= build({
    stdin: { contents: 'export {directionsMarkup,mountDirections} from "./src/directions.ts"; export {posts,fields} from "./src/content.ts"; export {setLang,ui} from "./src/i18n.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'bounded-gsap-test-adapter', setup(build) {
      build.onResolve({ filter: /^gsap(?:\/ScrollTrigger)?$/ }, args => ({ path: args.path, namespace: 'gsap-test' }));
      build.onLoad({ filter: /.*/, namespace: 'gsap-test' }, args => ({ loader: 'js', contents: args.path.endsWith('ScrollTrigger')
        ? `export const ScrollTrigger={create(config){return globalThis.__directionsHarness.trigger(config)}};`
        : `const h=()=>globalThis.__directionsHarness; const gsap={registerPlugin(){},set(targets,vars){h().set(targets,vars)},to(targets,vars){return h().to(targets,vars)},quickTo(target,key,vars){return h().quick(target,key,vars)},killTweensOf(targets){h().kill(targets)}}; export default gsap;` }));
    } }],
  });
  const built = await loaded;
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
}

function browser({ fine = true, reduced = false } = {}) {
  const names = ['window', 'document', 'Element', 'HTMLElement', 'HTMLImageElement', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'localStorage', '__directionsHarness'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><div id="bento"></div><button id="outside">Outside</button>', { url: 'http://127.0.0.1:4286/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  let hidden = false, sequence = 0;
  const pending = new Map(), observers = [], tweens = [], triggers = [], quicks = [], media = new Map();
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const preference = query => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('fine') ? fine : reduced, media: query }));
    return media.get(query);
  };
  const list = target => Array.isArray(target) ? target : [target];
  const set = (targets, vars) => list(targets).forEach(target => {
    for (const [key, value] of Object.entries(vars)) {
      if (key === 'clearProps') for (const prop of value.split(',')) target.style.removeProperty(prop.trim());
      else if (key.startsWith('--')) target.style.setProperty(key, String(value));
      else if (key === 'opacity') target.style.opacity = String(value);
      else if (key === 'y') target.style.transform = value ? `translateY(${value}px)` : '';
    }
  });
  const tween = () => { const entry = { killed: false, kill() { this.killed = true; } }; tweens.push(entry); return entry; };
  const harness = {
    set,
    to(targets, vars) { set(targets, vars); const entry = tween(); vars.onComplete?.(); return entry; },
    quick(target, key) { const fn = value => { fn.calls.push(value); target.style.setProperty(key, String(value)); }; fn.calls = []; fn.tween = tween(); quicks.push({ target, key, fn }); return fn; },
    kill() {},
    trigger(config) { const entry = { config, killed: false, kill() { this.killed = true; } }; triggers.push(entry); return entry; },
  };
  const globals = {
    window, document, Element: window.Element, HTMLElement: window.HTMLElement, HTMLImageElement: window.HTMLImageElement, localStorage: window.localStorage,
    IntersectionObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame(callback) { const id = ++sequence; pending.set(id, callback); return id; }, cancelAnimationFrame(id) { pending.delete(id); },
    matchMedia: preference, __directionsHarness: harness,
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return {
    window, document, pending, observers, tweens, triggers, quicks,
    root: document.querySelector('#bento'),
    flush() { const batch = [...pending.values()]; pending.clear(); batch.forEach(callback => callback(10)); },
    pointer(target, x = 100, y = 100, type = 'pointermove', pointerType = 'mouse') { const event = new window.Event(type, { bubbles: true }); Object.defineProperties(event, { pointerType: { value: pointerType }, clientX: { value: x }, clientY: { value: y } }); target.dispatchEvent(event); },
    preference(query, value) { const item = preference(query); item.matches = value; item.dispatchEvent(new window.Event('change')); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    restore() { dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}

test('fields section keeps only its original heading and cards, without added explanation or footer copy keys', async () => {
  const html = await readFile(new URL('../www/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  try {
    const section = dom.window.document.querySelector('#fields'); assert.ok(section);
    assert.equal(section.querySelector('.directions-intro,.directions-foot'), null);
    assert.equal(section.querySelector('[data-i18n="fields.body"],[data-i18n="fields.foot"],[data-i18n="fields.next"]'), null);
    assert.equal(section.children.length, 2); assert.ok(section.querySelector('.section-head')); assert.ok(section.querySelector('#bento'));
    const { ui } = await load();
    for (const key of ['fields.body', 'fields.foot', 'fields.next']) assert.equal(ui[key], undefined);
  } finally { dom.window.close(); }
});

test('three directions keep real labels, two original article targets and only original cover media', async () => {
  const env = browser();
  try {
    const { directionsMarkup, posts, fields, setLang } = await load();
    setLang('zh'); env.root.innerHTML = directionsMarkup();
    const cards = [...env.root.querySelectorAll('article.direction-card')];
    assert.deepEqual(cards.map(card => card.dataset.direction), ['ai', 'video', 'web']);
    assert.equal(env.root.querySelectorAll('.direction-tall').length, 1);
    assert.equal(env.root.querySelectorAll('.direction-wide').length, 2);
    cards.forEach((card, i) => { assert.equal(card.querySelector('h3.direction-title').textContent, fields[i].name.zh); assert.equal(card.querySelector('p.direction-text').textContent, fields[i].line.zh); });
    assert.deepEqual([...env.root.querySelectorAll('.direction-media img')].map(img => img.getAttribute('src')), [posts[0].cover, posts[1].cover]);
    const records = [...env.root.querySelectorAll('a[data-post]')];
    assert.deepEqual(records.map(link => Number(link.dataset.post)), [0, 0, 1, 1]);
    records.forEach(link => { const post = posts[Number(link.dataset.post)]; assert.equal(link.getAttribute('href'), `/blog/${post.slug}`); assert.equal(link.dataset.cursor, 'read'); assert.equal(link.hidden, false); });
    assert.equal(env.root.querySelector('.direction-count,.direction-record-date,.direction-browser'), null);
    const web = cards[2];
    assert.equal(web.querySelector('[data-post]'), null, 'web never creates data-post=-1 or an invalid prefetch target');
    assert.equal(web.querySelector('.direction-cta').getAttribute('href'), '/contact');
    assert.equal(web.querySelector('.direction-cta').childNodes[0].textContent, '聊聊合作');
  } finally { env.restore(); }
});

test('only unmodified left click on a valid article CTA or overlay is intercepted; contact stays native', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); const reads = [];
    controller = mountDirections(env.root, { reduced: true, readPost: index => reads.push(index) });
    const link = env.root.querySelector('.direction-cta');
    const click = options => { const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true, ...options }); link.dispatchEvent(event); return event; };
    assert.equal(click({}).defaultPrevented, true); assert.deepEqual(reads, [0]);
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) assert.equal(click(options).defaultPrevented, false);
    assert.deepEqual(reads, [0]);
    const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true }); env.root.querySelector('.direction-card').dispatchEvent(event); assert.equal(event.defaultPrevented, false); assert.deepEqual(reads, [0]);
    const web = env.root.querySelector('[data-direction="web"] .direction-cta'); const native = new env.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }); web.dispatchEvent(native); assert.equal(native.defaultPrevented, false);
    const overlay = env.root.querySelector('[data-direction="video"] .direction-overlay');
    const open = new env.window.MouseEvent('click', { bubbles: true, cancelable: true }); overlay.dispatchEvent(open); assert.equal(open.defaultPrevented, true); assert.deepEqual(reads, [0, 1]);
    overlay.dataset.post = '-1';
    // A document listener prevents JSDOM navigation after recording our module's
    // behavior; invalid data must not reach Reader or be intercepted by it.
    let preventedByModule;
    env.document.addEventListener('click', event => { preventedByModule = event.defaultPrevented; event.preventDefault(); }, { once: true });
    overlay.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true })); assert.equal(preventedByModule, false); assert.deepEqual(reads, [0, 1]);
  } finally { controller?.dispose(); env.restore(); }
});

test('refresh cancels stale motion and observers, preserves a completed entrance, and changes language without hiding it again', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections, setLang } = await load(); const reads = [];
    setLang('zh'); controller = mountDirections(env.root, { reduced: false, readPost: index => reads.push(index) });
    assert.equal(env.triggers.filter(item => !item.killed).length, 1);
    const first = env.triggers[0];
    controller.refresh(); assert.ok(first.killed); assert.equal(env.triggers.filter(item => !item.killed).length, 1);
    const active = env.triggers.find(item => !item.killed); active.config.onEnter();
    setLang('en'); controller.refresh();
    assert.equal(env.root.querySelector('.direction-title').textContent, 'AI learning');
    assert.ok([...env.root.querySelectorAll('.direction-reveal')].every(node => node.style.opacity !== '0'));
    assert.equal(env.triggers.filter(item => !item.killed).length, 0, 'completed entrance is not recreated on translation');
    for (let i = 0; i < 5; i++) controller.refresh();
    env.root.querySelector('.direction-cta').dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true })); assert.deepEqual(reads, [0], 'refresh must not duplicate delegated listeners');
    controller.dispose(); controller.dispose(); assert.ok(env.observers.every(observer => observer.disconnected));
    env.root.querySelector('.direction-cta').dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); assert.deepEqual(reads, [0]);
  } finally { controller?.dispose(); env.restore(); }
});

test('command language refresh preserves the same direction CTA without taking focus from overlays', async () => {
  for (const reduced of [false, true]) {
    const env = browser({ reduced }); let controller;
    try {
      const { mountDirections, setLang } = await load(); setLang('zh');
      controller = mountDirections(env.root, { reduced, readPost() {} });
      for (const key of ['ai', 'video', 'web']) {
        const before = env.root.querySelector(`[data-direction="${key}"] .direction-cta`);
        before.focus();
        setLang('en'); controller.refresh();
        const after = env.root.querySelector(`[data-direction="${key}"] .direction-cta`);
        assert.notEqual(after, before);
        assert.equal(env.document.activeElement, after, 'Palette.close restores its opener before the command rebuilds this section');
        assert.equal(after.getAttribute('href'), before.getAttribute('href'));
        done(env);
        setLang('zh'); controller.refresh();
        assert.equal(env.document.activeElement, env.root.querySelector(`[data-direction="${key}"] .direction-cta`));
      }
      const outside = env.document.getElementById('outside'); outside.focus();
      controller.setActive(false); setLang('en'); controller.refresh();
      assert.equal(env.document.activeElement, outside, 'a reader/search overlay retains its own focus during translation');
      controller.setActive(true); controller.refresh();
      assert.equal(env.document.activeElement, outside, 'reactivation does not restore a stale card role');
      env.root.querySelector('.direction-cta').focus(); controller.setActive(false); controller.refresh();
      assert.equal(env.root.contains(env.document.activeElement), false, 'a suspended section cannot reclaim focus during the dialog handoff');
      controller.setActive(true); env.root.querySelector('.direction-cta').focus(); env.root.setAttribute('inert', '');
      controller.refresh();
      assert.equal(env.root.contains(env.document.activeElement), false, 'an inert page cannot restore its former CTA');
      env.root.removeAttribute('inert'); outside.focus();
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('one pointer frame batches every rect before spotlight writes and tilts only the active card with bounded coordinates', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    const cards = [...env.root.querySelectorAll('.direction-card')]; const reads = [];
    env.root.getBoundingClientRect = () => { reads.push('root'); return { left: 20, top: 30, width: 920, height: 600 }; };
    cards.forEach((card, i) => { card.getBoundingClientRect = () => { reads.push(i); const [left, top, width, height] = [[0, 0, 300, 600], [320, 0, 600, 290], [320, 310, 600, 290]][i]; return { left, top, width, height, right: left + width, bottom: top + height }; }; });
    env.pointer(cards[1], 400, 100); env.pointer(cards[1], 410, 110); assert.equal(env.pending.size, 1); env.flush();
    assert.deepEqual(reads, ['root', 0, 1, 2]); assert.ok(env.root.hasAttribute('data-fx-spot-active'));
    assert.equal(env.root.style.getPropertyValue('--mx'), '390.0px'); assert.equal(env.root.style.getPropertyValue('--my'), '80.0px');
    assert.equal(cards[0].style.getPropertyValue('--mx'), '410.0px'); assert.equal(cards[1].style.getPropertyValue('--mx'), '90.0px'); assert.equal(cards[2].style.getPropertyValue('--my'), '-200.0px');
    assert.ok(Math.abs(Number(cards[1].style.getPropertyValue('--px')) + 0.7) < .001);
    assert.equal(cards[0].style.getPropertyValue('--px'), '0'); assert.ok(cards.every(card => card.hasAttribute('data-depth')));
    env.pointer(cards[1], 9000, -9000); env.flush(); assert.equal(Number(cards[1].style.getPropertyValue('--px')), 1); assert.equal(Number(cards[1].style.getPropertyValue('--py')), -1);
  } finally { controller?.dispose(); env.restore(); }
});

test('leave, tab blur, hidden page, reduced preference and offscreen transitions stop pending work and reset the cards', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    const card = env.root.querySelector('.direction-card'); card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300 });
    const reset = () => { assert.equal(env.pending.size, 0); assert.equal(env.root.hasAttribute('data-fx-spot-active'), false); assert.equal(env.root.style.getPropertyValue('--mx'), ''); assert.equal(env.root.style.getPropertyValue('--my'), ''); assert.ok([...env.root.querySelectorAll('.direction-card')].every(item => item.style.getPropertyValue('--px') === '0' && item.style.getPropertyValue('--py') === '0')); };
    env.pointer(card); env.root.dispatchEvent(new env.window.Event('pointerleave')); reset();
    env.pointer(card); env.window.dispatchEvent(new env.window.Event('blur')); reset(); env.window.dispatchEvent(new env.window.Event('focus'));
    env.pointer(card); env.hidden(true); reset(); assert.equal(env.root.hasAttribute('data-direction-active'), false); env.hidden(false);
    env.pointer(card); env.preference('(prefers-reduced-motion: reduce)', true); reset(); assert.equal(env.root.querySelector('[data-depth]'), null);
    env.preference('(prefers-reduced-motion: reduce)', false); env.pointer(card); env.flush(); assert.ok(env.root.hasAttribute('data-fx-spot-active'));
    env.observers[0].callback([{ isIntersecting: false }]); reset(); assert.equal(env.root.hasAttribute('data-direction-active'), false); env.pointer(card); assert.equal(env.pending.size, 0);
    env.observers[0].callback([{ isIntersecting: true }]); assert.ok(env.root.hasAttribute('data-direction-active')); env.pointer(card); assert.equal(env.pending.size, 1);
    controller.dispose(); reset(); env.pointer(card); assert.equal(env.pending.size, 0); assert.ok(env.tweens.every(tween => tween.killed));
  } finally { controller?.dispose(); env.restore(); }
});

test('coarse pointers and initial reduced motion never hide links or install motion targets; media failures leave content readable', async () => {
  for (const options of [{ fine: false, reduced: false }, { fine: true, reduced: true }]) {
    const env = browser(options); let controller;
    try {
      const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: options.reduced, readPost() {} });
      const card = env.root.querySelector('.direction-card'); env.pointer(card); assert.equal(env.pending.size, 0); assert.equal(env.root.querySelector('[data-depth]'), null);
      done(env);
      const img = card.querySelector('img'); img.dispatchEvent(new env.window.Event('error')); assert.ok(card.hasAttribute('data-media-unavailable')); assert.equal(card.querySelectorAll('a.direction-cta').length, 1); assert.equal(card.querySelector('.direction-title').textContent.length > 0, true);
      img.dispatchEvent(new env.window.Event('load')); assert.equal(card.hasAttribute('data-media-unavailable'), false);
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('keyboard entry reveals the record immediately and pointer-capability changes cannot leave an unfinished curtain', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    assert.deepEqual(states(env), ['idle', 'idle', 'idle']);
    env.root.querySelector('.direction-cta').focus();
    done(env);
    assert.ok([...env.root.querySelectorAll('.direction-reveal')].every(node => node.style.opacity !== '0'));
    assert.ok(env.triggers.every(trigger => trigger.killed));
    env.preference('(pointer: fine)', false);
    assert.equal(env.root.querySelector('[data-depth]'), null);
    env.preference('(pointer: fine)', true);
    controller.refresh();
    assert.ok([...env.root.querySelectorAll('.direction-reveal')].every(node => node.style.opacity !== '0'));
  } finally { controller?.dispose(); env.restore(); }
});

test('reader and search overlays suspend entrance and pointer work without hiding cards or replaying after refresh', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections, setLang } = await load();
    setLang('zh'); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    const visible = () => { done(env); assert.ok([...env.root.querySelectorAll('.direction-reveal')].every(node => !node.style.opacity && !node.style.transform)); };
    const neutral = () => {
      assert.equal(env.pending.size, 0);
      assert.equal(env.root.hasAttribute('data-fx-spot-active'), false);
      assert.equal(env.root.hasAttribute('data-direction-active'), false);
      assert.equal(env.root.querySelector('[data-depth]'), null);
      assert.ok([...env.root.querySelectorAll('.direction-card')].every(card => card.style.getPropertyValue('--px') === '0' && card.style.getPropertyValue('--py') === '0'));
    };
    assert.deepEqual(states(env), ['idle', 'idle', 'idle']);
    const initial = env.triggers[0];
    controller.setActive(false); controller.setActive(false);
    neutral(); visible(); assert.ok(initial.killed, 'opening the reader cancels an entrance that has not started');
    initial.config.onEnter(); visible();
    assert.equal(env.tweens.length, 0, 'a stale entrance callback cannot animate beneath the reader');
    env.pointer(env.root.querySelector('.direction-card')); assert.equal(env.pending.size, 0);
    setLang('en'); controller.refresh(); neutral(); visible();
    assert.equal(env.root.querySelector('.direction-title').textContent, 'AI learning');
    assert.ok(env.triggers.every(trigger => trigger.killed), 'refresh beneath an overlay must not register a fresh entrance');
    controller.setActive(true); controller.setActive(true); visible(); assert.ok(env.root.hasAttribute('data-direction-active'));
    const card = env.root.querySelector('.direction-card');
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300 });
    env.pointer(card, 180, 160); env.flush();
    assert.ok(env.root.hasAttribute('data-fx-spot-active'), 'closing the reader restores interaction');
    const tiltTweens = [...env.tweens];
    env.pointer(card, 200, 190); assert.equal(env.pending.size, 1);
    controller.setActive(false); neutral(); visible();
    assert.ok(tiltTweens.every(tween => tween.killed), 'opening search stops every active tilt tween and pending pointer frame');
    env.pointer(card); env.flush(); neutral();
    controller.setActive(true); env.pointer(card); assert.equal(env.pending.size, 1);
    controller.dispose(); controller.setActive(true); controller.setActive(false);
    assert.equal(env.pending.size, 0, 'setActive after dispose cannot restart the module');
  } finally { controller?.dispose(); env.restore(); }
});

test('opening a global overlay during a CSS entrance settles it immediately and leaves the CTAs readable', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    env.triggers[0].config.onEnter();
    assert.deepEqual(states(env), ['play', 'play', 'play']); assert.equal(env.tweens.length, 0);
    controller.setActive(false);
    done(env);
    assert.ok([...env.root.querySelectorAll('.direction-reveal')].every(node => !node.style.opacity && !node.style.transform));
    assert.equal(env.root.querySelectorAll('a.direction-cta').length, 3);
    controller.setActive(true);
    assert.equal(env.triggers.length, 1, 'resume keeps the completed entrance visible without a second trigger');
  } finally { controller?.dispose(); env.restore(); }
});

test('upstream card structure uses one visible CTA, hidden native overlay and staggered CSS state without invented content', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections, fields, setLang } = await load(); setLang('zh');
    controller = mountDirections(env.root, { reduced: false, readPost() {} });
    assert.equal(env.root.querySelector('.direction-records,.direction-record,.direction-count,.direction-browser'), null);
    assert.deepEqual(states(env), ['idle', 'idle', 'idle']);
    assert.deepEqual([...env.root.querySelectorAll('.direction-cell')].map(cell => cell.style.getPropertyValue('--delay')), ['0s', '0.1s', '0.05s']);
    [...env.root.querySelectorAll('.direction-card')].forEach((card, index) => {
      const overlay = card.querySelector('a.direction-overlay'), cta = card.querySelector('a.direction-cta');
      assert.ok(overlay); assert.equal(overlay.tabIndex, -1); assert.equal(overlay.getAttribute('aria-hidden'), 'true');
      assert.equal(overlay.getAttribute('href'), cta.getAttribute('href'));
      assert.equal(cta.querySelectorAll('.direction-arrow > span').length, 2);
      assert.equal(card.querySelector('.direction-label').textContent, fields[index].name.zh);
      assert.equal(card.querySelectorAll('a').length, 2); assert.equal(card.querySelectorAll('.direction-meta > span').length, 3);
      assert.equal(card.querySelector('.direction-title').getAttribute('aria-label'), fields[index].name.zh);
    });
    assert.equal(env.root.querySelectorAll('.direction-beam').length, 1);
    assert.deepEqual([...env.root.querySelector('.direction-title').querySelectorAll('.direction-unit')].map(unit => unit.textContent), ['AI', '学', '习']);
    assert.equal(env.root.querySelector('[data-direction="web"] .direction-cta').getAttribute('href'), '/contact');
    assert.equal(env.root.querySelector('[data-direction="web"] [data-post]'), null);
    env.triggers[0].config.onEnter(); assert.deepEqual(states(env), ['play', 'play', 'play']); assert.equal(env.tweens.length, 0);
    for (const zoom of env.root.querySelectorAll('.direction-zoom')) {
      const event = new env.window.Event('animationend', { bubbles: true }); Object.defineProperty(event, 'animationName', { value: 'direction-settle' }); zoom.dispatchEvent(event);
    }
    done(env);
    setLang('en'); controller.refresh(); done(env);
    assert.deepEqual([...env.root.querySelector('.direction-title').querySelectorAll('.direction-unit')].map(unit => unit.textContent), ['AI', 'learning']);
  } finally { controller?.dispose(); env.restore(); }
});

test('refresh, keyboard focus, hidden pages and overlays invalidate canceled CSS triggers and remain readable', async () => {
  for (const interrupt of [env => env.root.querySelector('.direction-cta').focus(), env => env.hidden(true), (env, controller) => controller.setActive(false), env => env.preference('(pointer: fine)', false)]) {
    const env = browser(); let controller;
    try {
      const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
      const obsolete = env.triggers[0]; controller.refresh(); obsolete.config.onEnter();
      assert.deepEqual(states(env), ['idle', 'idle', 'idle']);
      const trigger = env.triggers.at(-1); interrupt(env, controller); done(env); assert.ok(trigger.killed); trigger.config.onEnter(); done(env);
      controller.setActive(true); env.hidden(false); controller.refresh(); done(env);
      assert.equal(env.tweens.length, 0);
    } finally { controller?.dispose(); env.restore(); }
  }
});

test('window blur suspends beam and pointer gates through observer updates and refresh until focus returns', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); controller = mountDirections(env.root, { reduced: false, readPost() {} });
    assert.ok(env.root.hasAttribute('data-direction-active'));
    env.window.dispatchEvent(new env.window.Event('blur'));
    const paused = () => {
      assert.equal(env.root.hasAttribute('data-direction-active'), false);
      assert.equal(env.root.querySelector('[data-depth]'), null);
      env.pointer(env.root.querySelector('.direction-card')); assert.equal(env.pending.size, 0);
      done(env);
    };
    paused();
    env.observers[0].callback([{ isIntersecting: false }]); env.observers[0].callback([{ isIntersecting: true }]); paused();
    controller.refresh(); paused();
    env.hidden(true); env.hidden(false); paused();
    controller.setActive(false); controller.setActive(true); paused();
    env.window.dispatchEvent(new env.window.Event('focus'));
    assert.ok(env.root.hasAttribute('data-direction-active'));
    assert.ok(env.root.querySelector('[data-depth]'));
    env.pointer(env.root.querySelector('.direction-card')); assert.equal(env.pending.size, 1);
    env.window.dispatchEvent(new env.window.Event('blur')); paused();
    controller.setActive(false); env.window.dispatchEvent(new env.window.Event('focus')); paused();
    controller.setActive(true); assert.ok(env.root.hasAttribute('data-direction-active'));
    controller.dispose();
    env.window.dispatchEvent(new env.window.Event('blur')); env.window.dispatchEvent(new env.window.Event('focus'));
    assert.equal(env.root.hasAttribute('data-direction-active'), false);
    assert.equal(env.root.querySelector('[data-depth]'), null);
    assert.equal(env.pending.size, 0);
  } finally { controller?.dispose(); env.restore(); }
});

test('article overlays hand Reader a visible CTA opener so closing never restores focus to the hidden hit area', async () => {
  const env = browser(); let controller;
  try {
    const { mountDirections } = await load(); const openers = [];
    controller = mountDirections(env.root, { reduced: true, readPost(index) {
      const card = env.root.querySelector(`[data-direction="${index === 0 ? 'ai' : 'video'}"]`);
      const cta = card.querySelector('.direction-cta');
      assert.equal(env.document.activeElement, cta, 'Reader must save the visible CTA as its opener');
      assert.notEqual(cta.getAttribute('aria-hidden'), 'true'); assert.equal(cta.tabIndex, 0);
      openers.push(env.document.activeElement);
    } });
    const card = env.root.querySelector('[data-direction="video"]');
    const overlay = card.querySelector('.direction-overlay'), cta = card.querySelector('.direction-cta');
    overlay.focus(); assert.equal(env.document.activeElement, overlay);
    const click = options => { const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true, ...options }); overlay.dispatchEvent(event); return event; };
    assert.equal(click({}).defaultPrevented, true); assert.deepEqual(openers, [cta]);
    env.document.querySelector('#outside').focus(); openers[0].focus();
    assert.equal(env.document.activeElement, cta, 'simulated Reader.close restores the visible control');
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      overlay.focus(); assert.equal(click(options).defaultPrevented, false);
      assert.equal(env.document.activeElement, overlay, 'modified/native navigation does not receive a scripted focus handoff');
    }
    assert.equal(openers.length, 1);
    cta.focus(); cta.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(env.document.activeElement, cta); assert.deepEqual(openers, [cta, cta]);
    const contact = env.root.querySelector('[data-direction="web"] .direction-overlay'); contact.focus();
    contact.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.equal(env.document.activeElement, contact); assert.equal(openers.length, 2);
  } finally { controller?.dispose(); env.restore(); }
});
