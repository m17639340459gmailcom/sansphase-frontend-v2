import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import PhotoSwipe from 'photoswipe';

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: "export { mountArticleImages } from './src/article-images'; export { setLang } from './src/i18n';", resolveDir: rootPath, loader: 'ts' },
  bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false,
  plugins: [{ name: 'photoswipe-contract', setup(builder) {
    builder.onResolve({ filter: /^photoswipe$/ }, () => ({ path: 'photoswipe', namespace: 'viewer-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'viewer-test' }, () => ({ contents: 'export default globalThis.__TestPhotoSwipe;' }));
  } }],
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`;
let sequence = 0;

async function fixture({ actualCore = false, preload = true, loader } = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="en"><body><article id="reader" tabindex="-1" aria-hidden="false">
    <figure class="reader-hero"><img id="reader-img" src="/media/cover" alt="Real cover"></figure>
    <div id="reader-body" lang="zh-CN"><figure><img id="body-image" src="/media/body" alt="真实流程图"><figcaption>作者的真实说明</figcaption></figure>
    <p><a id="author-link" href="https://author.example/real-destination"><img id="linked-image" src="/media/linked" alt="Linked author image"></a></p></div>
    </article></body></html>`, { url: 'https://preview.test/blog/example', pretendToBeVisual: true });
  const { window } = dom, document = window.document;
  const keys = ['window', 'document', 'Element', 'NodeList', 'HTMLElement', 'HTMLImageElement', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', '__TestPhotoSwipe'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const instances = [];
  class TestPhotoSwipe {
    constructor(options) { this.options = options; this.listeners = new Map(); this.filters = new Map(); this.isDestroying = false; this.ui = { registerElement: data => { const node = document.createElement(data.tagName ?? 'div'); node.className = data.className ?? ''; this.element.append(node); data.onInit?.(node, this); } }; instances.push(this); }
    on(name, callback) { const list = this.listeners.get(name) ?? []; list.push(callback); this.listeners.set(name, list); }
    addFilter(name, callback) { this.filters.set(name, callback); }
    emit(name, detail = {}) { for (const callback of this.listeners.get(name) ?? []) callback(detail); }
    init() { this.element = document.createElement('div'); this.element.className = `pswp pswp--open ${this.options.mainClass ?? ''}`; this.element.tabIndex = -1; this.element.setAttribute('role', 'dialog'); document.body.append(this.element); this.emit('uiRegister'); this.emit('initialLayout'); this.element.focus(); this.emit('afterInit'); return true; }
    close() { this.destroy(); }
    destroy() { if (this.destroyed) return; this.isDestroying = true; this.emit('close'); this.element?.remove(); this.destroyed = true; this.emit('destroy'); }
  }
  class ActualPhotoSwipe extends PhotoSwipe { constructor(options) { super(options); instances.push(this); } }
  window.matchMedia = () => ({ matches: false });
  const globals = { window, document, Element: window.Element, NodeList: window.NodeList, HTMLElement: window.HTMLElement, HTMLImageElement: window.HTMLImageElement,
    navigator: window.navigator, requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    __TestPhotoSwipe: actualCore ? ActualPhotoSwipe : TestPhotoSwipe };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { mountArticleImages, setLang } = await import(`${moduleURL}#${++sequence}`);
  setLang('en');
  const root = document.getElementById('reader'); let active = true, reduced = false, opens = 0;
  const viewer = mountArticleImages(root, { active: () => active, reduced: () => reduced, onOpen: () => opens++ }, loader);
  if (preload) await viewer.preload();
  const image = id => document.getElementById(id);
  const ready = (id, width = 1600, height = 900) => {
    const node = image(id); Object.defineProperties(node, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } }); node.dispatchEvent(new window.Event('load')); return node;
  };
  viewer.refresh();
  return { window, document, root, viewer, instances, image, ready, setLang, coreClass: TestPhotoSwipe,
    get opens() { return opens; },
    setActive(value) { active = value; }, setReduced(value) { reduced = value; },
    dispose() { viewer.dispose(); window.close(); for (const key of keys) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key]; } },
  };
}

test('late image-core loading cannot reopen an image after Escape, navigation or invalidation', async () => {
  let resolveCore;
  const f = await fixture({ preload: false, loader: () => new Promise(resolve => { resolveCore = resolve; }) });
  try {
    const image = f.ready('body-image'), button = image.parentElement;
    button.click(); assert.equal(button.getAttribute('aria-busy'), 'true');
    f.root.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    resolveCore({ default: f.coreClass }); await f.viewer.preload(); await Promise.resolve();
    assert.equal(f.viewer.open, false); assert.equal(f.instances.length, 0); assert.equal(button.hasAttribute('aria-busy'), false);
    button.click(); assert.equal(f.viewer.open, true, 'the cached optional library still supports the next deliberate click');
  } finally { f.dispose(); }
});

test('failed optional image-core downloads are retryable and never strand Reader focus or inert', async () => {
  let attempts = 0, f;
  f = await fixture({ preload: false, loader: async () => { if (++attempts === 1) throw new Error('offline'); return { default: f.coreClass }; } });
  try {
    const button = f.ready('body-image').parentElement;
    button.focus(); button.click();
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(f.viewer.open, false); assert.equal(Boolean(f.root.inert), false); assert.equal(button.hasAttribute('aria-busy'), false);
    assert.match(button.getAttribute('aria-label'), /retry/); assert.equal(f.document.activeElement, button);
    button.click(); await f.viewer.preload(); await Promise.resolve(); assert.equal(f.viewer.open, true); assert.equal(attempts, 2);
  } finally { f.dispose(); }
});

test('cover/body images become native zoom buttons only after natural dimensions are ready', async () => {
  const f = await fixture();
  try {
    assert.equal(f.root.querySelectorAll('.reader-image-zoom').length, 0);
    f.ready('reader-img'); f.ready('body-image', 2048, 1365);
    assert.equal(f.root.querySelectorAll('button.reader-image-zoom').length, 2);
    const image = f.image('body-image'), button = image.parentElement;
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    assert.match(button.getAttribute('aria-label'), /真实流程图/);
    button.click();
    assert.equal(f.opens, 1); assert.equal(f.viewer.open, true);
    const pswp = f.instances[0], source = pswp.options.dataSource[0];
    assert.equal(source.src, image.src); assert.equal(source.width, 2048); assert.equal(source.height, 1365);
    assert.equal(pswp.options.dataSource.length, 1); assert.equal(pswp.options.arrowPrev, false); assert.equal(pswp.options.counter, false);
    assert.equal(pswp.element.getAttribute('aria-modal'), 'true'); assert.equal(pswp.element.dataset.cursor, 'native');
    assert.match(pswp.element.textContent, /作者的真实说明/);
  } finally { f.dispose(); }
});

test('author image links retain their destination and modifiers; zoom is a separate nonnested button', async () => {
  const f = await fixture();
  try {
    const link = f.image('author-link'); f.ready('linked-image');
    assert.equal(link.getAttribute('href'), 'https://author.example/real-destination');
    assert.equal(link.querySelector('button'), null); assert.equal(link.closest('button'), null);
    const click = new f.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }); link.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false); assert.equal(f.viewer.open, false);
    const zoom = link.parentElement.querySelector('button'); assert.ok(zoom); zoom.click();
    assert.equal(f.viewer.open, true);
  } finally { f.dispose(); }
});

test('Escape closes the image before article handlers, returns focus and preserves Reader scrolling', async () => {
  const f = await fixture();
  try {
    f.ready('body-image'); const button = f.image('body-image').parentElement;
    button.focus(); f.root.scrollTop = 1234; button.click();
    assert.equal(f.root.inert, true);
    let articleEsc = 0; f.window.addEventListener('keydown', event => { if (event.key === 'Escape') articleEsc++; });
    const escape = new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    f.instances[0].element.dispatchEvent(escape);
    assert.equal(articleEsc, 0); assert.equal(escape.defaultPrevented, true);
    assert.equal(f.viewer.open, false); assert.equal(f.root.inert, false);
    assert.equal(f.document.activeElement, button); assert.equal(f.root.scrollTop, 1234);
    f.root.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(articleEsc, 1);
  } finally { f.dispose(); }
});

test('close, replacement, language, reduced motion and late stale library events release only their own viewer', async () => {
  const f = await fixture();
  try {
    f.ready('body-image'); const button = f.image('body-image').parentElement;
    button.click(); const old = f.instances[0];
    f.viewer.close(false); assert.equal(f.root.inert, false);
    f.setLang('zh'); f.viewer.refresh(); assert.match(button.getAttribute('aria-label'), /放大/);
    f.setReduced(true); button.click(); const latest = f.instances[1];
    assert.equal(latest.options.zoomAnimationDuration, 0);
    old.emit('destroy'); assert.equal(f.viewer.open, true); assert.equal(f.root.inert, true);
    f.viewer.close(false); f.setActive(false); button.click(); assert.equal(f.instances.length, 2);
    f.setActive(true); button.click(); f.image('body-image').remove(); f.viewer.refresh();
    assert.equal(f.viewer.open, false); assert.equal(f.root.inert, false);
  } finally { f.dispose(); }
});

test('failed or replaced images lose zoom behavior and an open source failure cannot strand focus/inert', async () => {
  const f = await fixture();
  try {
    const image = f.ready('body-image'); image.parentElement.click();
    f.viewer.invalidate(image);
    assert.equal(f.viewer.open, false); assert.equal(f.root.inert, false);
    assert.equal(f.document.activeElement, f.root, 'a failed open source gives keyboard ownership back to the Reader');
    assert.equal(image.closest('button'), null);
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 0 }); f.viewer.refresh();
    assert.equal(image.closest('button'), null);
    f.ready('body-image'); assert.ok(image.closest('button'));
    f.viewer.dispose(); assert.equal(image.closest('button'), null);
    image.dispatchEvent(new f.window.Event('load')); assert.equal(image.closest('button'), null);
  } finally { f.dispose(); }
});

test('viewer load failures build a text-only safe fallback from the already-sanitized image source', async () => {
  const f = await fixture();
  try {
    f.ready('body-image'); f.image('body-image').parentElement.click();
    const pswp = f.instances[0], fallback = pswp.filters.get('contentErrorElement')();
    assert.match(fallback.textContent, /could not be loaded/);
    const link = fallback.querySelector('a'); assert.equal(link.href, f.image('body-image').src);
    assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener');
    assert.equal(fallback.querySelector('img, script, iframe'), null);
  } finally { f.dispose(); }
});

test('a loaded source replacement closes the old image and keeps a reachable trigger for its new natural dimensions', async () => {
  const f = await fixture();
  try {
    const image = f.ready('body-image'), button = image.parentElement; button.focus(); button.click();
    image.src = '/media/replacement'; f.ready('body-image', 2400, 1800);
    assert.equal(f.viewer.open, false); assert.equal(f.document.activeElement, button);
    button.click(); const source = f.instances[1].options.dataSource[0];
    assert.equal(source.src, image.src); assert.equal(source.width, 2400); assert.equal(source.height, 1800);
  } finally { f.dispose(); }
});

test('the real pinned PhotoSwipe core opens, traps focus, closes immediately and completes delayed cleanup without touching its replacement', async () => {
  const f = await fixture({ actualCore: true });
  try {
    f.ready('body-image'); const button = f.image('body-image').parentElement;
    button.focus(); button.click();
    assert.equal(f.viewer.open, true); assert.equal(f.instances[0].opener.isOpen, true);
    assert.equal(f.document.activeElement, f.instances[0].element);
    const outside = f.document.createElement('button'); f.document.body.append(outside); outside.focus();
    assert.equal(f.document.activeElement, f.instances[0].element, 'official core owns the focus trap');
    f.viewer.close();
    assert.equal(f.viewer.open, false); assert.equal(f.root.inert, false); assert.equal(f.document.activeElement, button);
    assert.equal(f.instances[0].element.style.display, 'none');
    button.click(); const latest = f.instances[1];
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.viewer.open, true); assert.equal(latest.element.isConnected, true); assert.equal(f.root.inert, true);
    latest.element.querySelector('.pswp__button--close').click();
    await Promise.resolve();
    assert.equal(f.viewer.open, false); assert.equal(f.document.activeElement, button);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.document.querySelector('.pswp'), null);
  } finally { f.dispose(); }
});
