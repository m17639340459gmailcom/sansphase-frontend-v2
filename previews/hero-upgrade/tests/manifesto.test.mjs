import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let loaded;
async function load() {
  loaded ||= build({
    stdin: { contents: 'export {mountManifesto} from "./src/manifesto.ts"; export {profile} from "./src/content.ts"; export {setLang} from "./src/i18n.ts";', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'manifesto-scroll-adapter', setup(build) {
      build.onResolve({ filter: /^gsap(?:\/ScrollTrigger)?$/ }, args => ({ path: args.path, namespace: 'manifesto-test' }));
      build.onLoad({ filter: /.*/, namespace: 'manifesto-test' }, args => ({ loader: 'js', contents: args.path.endsWith('ScrollTrigger')
        ? 'export const ScrollTrigger={create(config){return globalThis.__manifestoHarness.trigger(config)}};'
        : 'export default {registerPlugin(){}};' }));
    } }],
  });
  const result = await loaded;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

function browser({ reduced = false, progress = 0.37 } = {}) {
  const names = ['window', 'document', 'HTMLElement', 'localStorage', 'matchMedia', '__manifestoHarness'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><section id="manifesto"><p id="manifesto-text" class="manifesto-text"></p><p id="manifesto-alt"></p></section><section><p id="unrelated-alt">Unchanged</p></section>', { url: 'http://127.0.0.1:4286/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const media = Object.assign(new window.EventTarget(), { matches: reduced, media: '(prefers-reduced-motion: reduce)' });
  const triggers = [];
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const harness = {
    trigger(config) {
      const entry = { config, progress, killed: false, kill() { this.killed = true; }, refresh() { config.onRefresh?.(this); } };
      triggers.push(entry); config.onRefresh?.(entry); return entry;
    },
  };
  const globals = { window, document, HTMLElement: window.HTMLElement, localStorage: window.localStorage, matchMedia: () => media, __manifestoHarness: harness };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return {
    window, document, triggers, root: document.querySelector('#manifesto-text'), alt: document.querySelector('#manifesto-alt'),
    active: () => triggers.filter(item => !item.killed),
    update(entry, value) { entry.progress = value; entry.config.onUpdate?.(entry); },
    reduced(value) { media.matches = value; media.dispatchEvent(new window.Event('change')); },
    hidden(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    restore() { dom.window.close(); for (const [name, value] of saved) if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; },
  };
}

const visual = env => env.root.querySelector('.manifesto-visual');
const readable = env => { assert.equal(env.root.hasAttribute('data-live'), false); assert.equal(env.root.style.getPropertyValue('--p'), '1'); };

test('manifesto retains the complete Chinese original, alternate English, source glyph grouping and original emphasis only', async () => {
  const env = browser({ reduced: true }); let controller;
  try {
    const { mountManifesto, profile, setLang } = await load(); setLang('zh'); controller = mountManifesto(env.root, { reduced: true });
    const original = profile.bio.map(line => line.zh).join('');
    assert.equal(env.root.querySelectorAll('.visually-hidden').length, 1);
    assert.equal(env.root.querySelector('.visually-hidden').textContent, original);
    assert.equal(visual(env).getAttribute('aria-hidden'), 'true'); assert.equal(visual(env).textContent, original);
    assert.equal(env.alt.textContent, profile.bio.map(line => line.en).join(' ')); assert.equal(env.alt.lang, 'en'); assert.equal(env.root.lang, 'zh-CN');
    assert.equal([...env.root.querySelectorAll('.manifesto-unit.key')].map(unit => unit.textContent).join(''), '无价免费廉价');
    const units = [...env.root.querySelectorAll('.manifesto-unit')];
    assert.deepEqual(units.map(unit => unit.textContent).filter(text => /[，。]/.test(text)), ['的，', '的，', '的。'], 'closing punctuation stays attached to its source glyph');
    assert.ok(units.every((unit, index) => unit.style.getPropertyValue('--i') === String(index)));
    assert.equal(Number(env.root.style.getPropertyValue('--n')), units.length);
    assert.equal(env.root.querySelector('button,a,canvas,img'), null); assert.equal(env.document.querySelector('#unrelated-alt').textContent, 'Unchanged');
    assert.equal(env.triggers.length, 0); readable(env);
  } finally { controller?.dispose(); env.restore(); }
});

test('English stays grouped by words and language refresh replaces both originals without duplicate accessible copies', async () => {
  const env = browser(); let controller;
  try {
    const { mountManifesto, profile, setLang } = await load(); setLang('zh'); controller = mountManifesto(env.root, { reduced: false });
    const previous = env.active()[0]; setLang('en'); controller.refresh();
    assert.ok(previous.killed); assert.equal(env.active().length, 1);
    const original = profile.bio.map(line => line.en).join(' ');
    assert.equal(env.root.querySelectorAll('.visually-hidden').length, 1); assert.equal(env.root.querySelector('.visually-hidden').textContent, original); assert.equal(visual(env).textContent, original);
    assert.deepEqual([...env.root.querySelectorAll('.manifesto-unit')].map(unit => unit.textContent), original.split(' '));
    assert.deepEqual([...env.root.querySelectorAll('.manifesto-unit.key')].map(unit => unit.textContent), profile.bioKeys.en);
    assert.equal(env.alt.textContent, profile.bio.map(line => line.zh).join('')); assert.equal(env.alt.lang, 'zh-CN'); assert.equal(env.root.lang, 'en');
    assert.equal(env.root.style.getPropertyValue('--p'), '0.3700', 'refresh reads the new trigger immediately instead of resetting a visible paragraph to zero');
    env.update(previous, 0.9); assert.equal(env.root.style.getPropertyValue('--p'), '0.3700', 'a previous language trigger cannot repaint the new paragraph');
  } finally { controller?.dispose(); env.restore(); }
});

test('source reading offsets drive one root progress variable without rewriting unit classes or styles', async () => {
  const env = browser({ progress: 0.24 }); let controller;
  try {
    const { mountManifesto, setLang } = await load(); setLang('zh'); controller = mountManifesto(env.root, { reduced: false });
    const entry = env.active()[0]; assert.equal(entry.config.trigger, env.root); assert.equal(entry.config.start, 'top 90%'); assert.equal(entry.config.end, 'bottom 55%'); assert.equal(entry.config.scrub, true);
    assert.equal(env.root.hasAttribute('data-live'), true); assert.equal(env.root.style.getPropertyValue('--p'), '0.2400');
    const units = [...env.root.querySelectorAll('.manifesto-unit')].map(unit => unit.outerHTML);
    env.update(entry, 0.625); assert.equal(env.root.style.getPropertyValue('--p'), '0.6250'); assert.deepEqual([...env.root.querySelectorAll('.manifesto-unit')].map(unit => unit.outerHTML), units);
    env.update(entry, 3); assert.equal(env.root.style.getPropertyValue('--p'), '1.0000'); env.update(entry, -2); assert.equal(env.root.style.getPropertyValue('--p'), '0.0000');
  } finally { controller?.dispose(); env.restore(); }
});

test('overlays, language changes while suspended, and live reduced-motion preferences leave all text fully readable', async () => {
  const env = browser(); let controller;
  try {
    const { mountManifesto, setLang } = await load(); setLang('zh'); controller = mountManifesto(env.root, { reduced: false });
    const previous = env.active()[0]; controller.setActive(false); controller.setActive(false); assert.ok(previous.killed); readable(env);
    env.update(previous, 0.05); readable(env); setLang('en'); controller.refresh(); readable(env); assert.equal(env.active().length, 0); assert.match(visual(env).textContent, /^Knowledge/);
    controller.setActive(true); controller.setActive(true); assert.equal(env.active().length, 1); assert.equal(env.root.hasAttribute('data-live'), true);
    env.reduced(true); assert.equal(env.active().length, 0); readable(env); controller.refresh(); readable(env);
    env.reduced(false); assert.equal(env.active().length, 1); assert.equal(env.root.style.getPropertyValue('--p'), '0.3700');
    controller.dispose(); controller.dispose(); readable(env); const count = env.triggers.length;
    controller.refresh(); controller.setActive(true); env.reduced(true); env.reduced(false); env.window.dispatchEvent(new env.window.Event('focus')); assert.equal(env.triggers.length, count); assert.equal(env.active().length, 0);
    assert.equal(visual(env).textContent, 'Knowledge is priceless. It can be free. It must never be cheap.');
  } finally { controller?.dispose(); env.restore(); }
});

test('document visibility and window focus stop stale writes and recreate only the owned reading trigger', async () => {
  const env = browser(); let controller;
  try {
    const { mountManifesto } = await load(); controller = mountManifesto(env.root, { reduced: false });
    const entry = env.active()[0]; env.window.dispatchEvent(new env.window.Event('blur')); readable(env); assert.ok(entry.killed);
    env.update(entry, 0); readable(env); env.hidden(true); env.window.dispatchEvent(new env.window.Event('focus')); assert.equal(env.active().length, 0);
    env.hidden(false); assert.equal(env.active().length, 1); env.hidden(true); readable(env); env.hidden(false); assert.equal(env.active().length, 1);
  } finally { controller?.dispose(); env.restore(); }
});
