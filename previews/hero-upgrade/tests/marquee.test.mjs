import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let built;
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const tickerStart = main.indexOf('gsap.ticker.add((_time, deltaMs)');
// Stop after the real hero gate: unrelated page controllers can be added to
// the shared ticker without introducing substitutes into this narrow fixture.
const heroGate = main.indexOf('heroExperience.setActive(', tickerStart);
const tickerEnd = main.indexOf(';', heroGate) + 1;
assert.ok(tickerStart >= 0 && tickerEnd > tickerStart, 'the fixture executes the actual shared frame gate');
async function load() {
  built ||= build({
    stdin: { contents: `export {Marquee} from "./src/marquee.ts";
      export function mountFrame(marquees) {
        const state={view:'home',reduced:false,reader:false,palette:false,menu:false,dialog:false,hidden:false,focused:true,pending:false};
        let callback, reduced=false, viewShown='home', windowFocused=true, menuOpen=false;
        const document={get hidden(){return state.hidden},querySelector(selector){return selector==='dialog[open]'&&state.dialog?{}:null}}, lenis={velocity:0}, readerActive=()=>state.reader,
          palette={get open(){return state.palette}}, pageTransition={get pending(){return state.pending}};
        const heroExperience={setActive(active){state.heroActive=active}},heroVisible=true;
        const gsap={ticker:{add(fn){callback=fn}}};
        ${main.slice(tickerStart, tickerEnd)} });
        return {state,tick(patch={},deltaMs=16){Object.assign(state,patch);reduced=state.reduced;viewShown=state.view;windowFocused=state.focused;menuOpen=state.menu;callback(0,deltaMs)}};
      }`, resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const result = await built;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function browser() {
  const dom = new JSDOM('<!doctype html><section id="window"><div id="track"></div></section>', { pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const container = document.querySelector('#window'), track = document.querySelector('#track');
  const observers = []; let width = 900, reads = 0;
  Object.defineProperty(track, 'scrollWidth', { get: () => { reads++; return width; } });
  track.getBoundingClientRect = container.getBoundingClientRect = () => { throw new Error('update must not read viewport layout'); };
  window.IntersectionObserver = class {
    targets = []; disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  };
  const mutations = [];
  const mutationObserver = new window.MutationObserver(records => mutations.push(...records));
  mutationObserver.observe(track, { attributes: true, attributeFilter: ['style'] });
  return {
    window, track, container, observers, mutations,
    get reads() { return reads; },
    width(value) { width = value; },
    visible(value) { observers.forEach(observer => observer.callback([{ target: container, isIntersecting: value, intersectionRatio: value ? 1 : 0 }])); },
    hover(value) { track.dispatchEvent(new window.Event(value ? 'pointerenter' : 'pointerleave')); },
    restore() { mutationObserver.disconnect(); dom.window.close(); },
  };
}

test('the stationary parent is observed and unknown/offscreen updates make no layout reads or style mutations', async () => {
  const env = browser(); let marquee;
  try {
    const { Marquee } = await load(); marquee = new Marquee(env.track, -1, 42);
    assert.deepEqual(env.observers[0].targets, [env.container]);
    marquee.measure(); const reads = env.reads;
    for (let index = 0; index < 50; index++) marquee.update(0.016, 10);
    env.visible(false); marquee.update(0.016, 10); await Promise.resolve();
    assert.equal(env.reads, reads); assert.equal(env.track.style.transform, ''); assert.equal(env.mutations.length, 0);
  } finally { marquee?.dispose(); env.restore(); }
});

test('visible motion keeps the original velocity/skew formula, pauses offscreen and resumes without catch-up', async () => {
  const env = browser(); let marquee;
  try {
    const { Marquee } = await load(); marquee = new Marquee(env.track, -1, 42); marquee.measure();
    env.visible(true); marquee.update(0.05, 4);
    assert.equal(env.track.style.transform, 'translate3d(-2.90px,0,0) skewX(-0.30deg)');
    await Promise.resolve(); const writes = env.mutations.length, reads = env.reads;
    env.visible(false); for (let index = 0; index < 50; index++) marquee.update(0.05, 4); await Promise.resolve();
    assert.equal(env.track.style.transform, 'translate3d(-2.90px,0,0) skewX(-0.30deg)');
    assert.equal(env.mutations.length, writes); assert.equal(env.reads, reads);
    env.visible(true); marquee.update(0.05, 4);
    assert.equal(env.track.style.transform, 'translate3d(-5.80px,0,0) skewX(-0.51deg)');
  } finally { marquee?.dispose(); env.restore(); }
});

test('hover retains the existing 0.15 speed ratio and leaving the viewport clears slow hover before returning', async () => {
  const env = browser(); let marquee;
  try {
    const { Marquee } = await load(); marquee = new Marquee(env.track, -1, 42); marquee.measure(); env.visible(true);
    env.hover(true); marquee.update(1, 0); assert.equal(env.track.style.transform, 'translate3d(-6.30px,0,0) skewX(0.00deg)');
    env.visible(false); env.hover(true); env.visible(true); marquee.update(1, 0);
    assert.equal(env.track.style.transform, 'translate3d(-48.30px,0,0) skewX(0.00deg)');
    env.hover(true); env.hover(false); marquee.update(1, 0);
    assert.equal(env.track.style.transform, 'translate3d(-90.30px,0,0) skewX(0.00deg)');
  } finally { marquee?.dispose(); env.restore(); }
});

test('measure caches actual content width without replacing a valid cycle with hidden zero width', async () => {
  const env = browser(); let marquee;
  try {
    const { Marquee } = await load(); marquee = new Marquee(env.track, 1, 30); marquee.measure();
    assert.equal(env.reads, 1); env.visible(true); marquee.update(1, 0);
    assert.equal(env.track.style.transform, 'translate3d(-270.00px,0,0) skewX(0.00deg)');
    env.width(1500); marquee.measure(); assert.equal(env.reads, 2); assert.equal(marquee.third, 500);
    marquee.update(1, 0); assert.equal(env.reads, 2);
    env.width(0); marquee.measure(); assert.equal(marquee.third, 500);
  } finally { marquee?.dispose(); env.restore(); }
});

test('the real main frame gate resumes both rows after an inner-page hidden measure without waiting for another intersection callback', async () => {
  for (const [direction, speed] of [[-1, 42], [1, 30]]) {
    const env = browser(); let marquee;
    try {
      const { Marquee, mountFrame } = await load(); marquee = new Marquee(env.track, direction, speed); marquee.measure(); env.visible(true);
      const frame = mountFrame([marquee]); frame.tick();
      frame.tick({ view: 'work' });
      env.width(0); marquee.measure(); // layout/fonts.ready or language rebuild while home has hidden=true.
      env.width(1500); frame.tick({ view: 'home' });
      assert.equal(frame.state.heroActive, true, 'this reproduces a moving hero beside the stalled marquee');
      const before = marquee.x, reads = env.reads;
      for (let index = 0; index < 60; index++) frame.tick();
      assert.ok(Math.abs(marquee.x - before) > 20, `row ${direction} must move more than a one-pixel hidden cycle`);
      assert.equal(marquee.third, 500, 'returning home measures the current translated/font content');
      assert.equal(env.reads, reads, 'steady frames keep layout reads out of update');
    } finally { marquee?.dispose(); env.restore(); }
  }
});

test('main keeps every pause gate and resumes once with fresh width and no catch-up after overlays or reduced motion', async () => {
  const env = browser(); let marquee;
  try {
    const { Marquee, mountFrame } = await load(); marquee = new Marquee(env.track, -1, 42); marquee.measure(); env.visible(true);
    const frame = mountFrame([marquee]); frame.tick();
    for (const key of ['reader', 'palette', 'menu', 'dialog', 'hidden', 'pending', 'reduced', 'focused']) {
      const paused = key !== 'focused'; frame.tick({ [key]: paused });
      const before = marquee.x, transform = env.track.style.transform, reads = env.reads;
      for (let index = 0; index < 4; index++) frame.tick();
      assert.equal(marquee.x, before, key); assert.equal(env.track.style.transform, transform, key);
      assert.equal(env.reads, reads, `${key} cannot poll layout while paused`);
      env.width(1800); frame.tick({ [key]: !paused }, 1000);
      assert.equal(marquee.third, 600, `${key} resume needs one current measurement`);
      assert.ok(Math.abs(marquee.x - before) <= 2.100001, `${key} must respect main's 50ms delta cap`);
      const resumedReads = env.reads; frame.tick(); frame.tick(); assert.equal(env.reads, resumedReads);
    }
  } finally { marquee?.dispose(); env.restore(); }
});

test('explicit activation also repairs hidden measurement without an IntersectionObserver and clears stale hover slowing', async () => {
  const env = browser(); let marquee;
  try {
    delete env.window.IntersectionObserver;
    const { Marquee } = await load(); marquee = new Marquee(env.track, -1, 42); marquee.measure();
    marquee.setActive(true); env.hover(true); marquee.update(1, 0);
    assert.equal(marquee.slow, 0.15);
    marquee.setActive(false); env.width(0); marquee.measure();
    const before = marquee.x; marquee.update(1, 0); assert.equal(marquee.x, before);
    env.width(1500); marquee.setActive(true); marquee.update(1, 0);
    assert.equal(marquee.third, 500); assert.equal(marquee.slow, 1); assert.equal(marquee.x - before, -42);
  } finally { marquee?.dispose(); env.restore(); }
});

test('dispose disconnects observation, restores the original transform and ignores late intersection/hover updates', async () => {
  const env = browser(); let marquee;
  try {
    env.track.style.transform = 'rotate(2deg)';
    const { Marquee } = await load(); marquee = new Marquee(env.track, -1, 42); marquee.measure(); env.visible(true); marquee.update(1, 0);
    marquee.dispose(); marquee.dispose(); assert.equal(env.observers[0].disconnected, true);
    assert.equal(env.track.style.transform, 'rotate(2deg)'); await Promise.resolve();
    const writes = env.mutations.length, reads = env.reads;
    env.visible(true); env.hover(true); marquee.measure(); marquee.update(1, 20); await Promise.resolve();
    assert.equal(env.track.style.transform, 'rotate(2deg)'); assert.equal(env.mutations.length, writes); assert.equal(env.reads, reads);
  } finally { marquee?.dispose(); env.restore(); }
});
