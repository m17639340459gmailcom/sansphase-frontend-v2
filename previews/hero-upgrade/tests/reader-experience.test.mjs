import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import gsapModule from "gsap";
const realGSAP = gsapModule.gsap ?? gsapModule;
const rootPath = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: { contents: "export { Reader } from './src/article.ts'; export { setLang } from './src/i18n.ts'; export { posts } from './src/content.ts'; export {primeIntegratedArticle,clearIntegratedArticle} from './src/integration-article-source.ts';", resolveDir: rootPath, loader: "ts" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  write: false,
  plugins: [{ name: "reader-motion", setup(builder) {
    builder.onResolve({ filter: /^photoswipe$/ }, () => ({ path: 'photoswipe', namespace: 'reader-images-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'reader-images-test' }, () => ({ contents: 'export default globalThis.__readerPhotoSwipe;' }));
    builder.onResolve({ filter: /^gsap$/ }, () => ({ path: "gsap", namespace: "reader-test" }));
    builder.onLoad({ filter: /.*/, namespace: "reader-test" }, () => ({ contents: `export default globalThis.__readerGSAP ?? {
      set(targets,values){for(const node of typeof targets==='string'?document.querySelectorAll(targets):targets instanceof HTMLElement?[targets]:targets)if(values.clearProps)for(const key of values.clearProps.split(','))node.style.removeProperty(key)},
      fromTo(){const tween={killed:false,kill(){this.killed=true}};globalThis.__readerMotion.push(tween);return tween}
    };` }));
  } }]
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`;
let fixtureId = 0;
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
async function fixture({ reduced = true, actualMotion = false, deferredSmooth = false, integrated = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><article class="reader" id="reader" aria-hidden="true" tabindex="-1">
    <div class="reader-progress"><span id="reader-bar"></span></div><button id="reader-close">Back</button><figure class="reader-hero" id="reader-hero"><img id="reader-img" alt=""></figure>
    <header class="reader-head"><p id="reader-meta"></p><h1 id="reader-title"></h1><p id="reader-subtitle"></p><p id="reader-lead"></p><p id="reader-only"></p><ul id="reader-tags"></ul></header>
    <div class="reader-layout"><div class="reader-body" id="reader-body" lang="zh-CN"></div><aside class="reader-toc"><p>Contents</p><ol id="reader-toc"></ol></aside></div>
    <footer class="reader-foot"><a id="reader-original"></a><button id="reader-next"><strong id="reader-next-title"></strong></button></footer></article></body></html>`, { pretendToBeVisual: true, url: "https://preview.test/blog" });
  const { window } = dom;
  if (integrated) {
    const marker=window.document.createElement('script'); marker.id='site-integration'; marker.type='application/json';
    marker.textContent=JSON.stringify({mode:'local',origin:window.location.origin}); window.document.head.append(marker);
  }
  const keys = ["window", "document", "HTMLElement", "HTMLImageElement", "getComputedStyle", "fetch", "__readerMotion", "__readerGSAP", "__readerPhotoSwipe"];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const requests = [], frames = new Map(), listeners = new Set();
  let nextFrame = 0;
  const media = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  window.matchMedia = () => media;
  window.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const imageViewers = [];
  class ReaderPhotoSwipe {
    constructor(options) { this.options = options; this.listeners = new Map(); this.ui = { registerElement() {} }; imageViewers.push(this); }
    on(name, callback) { const list = this.listeners.get(name) ?? []; list.push(callback); this.listeners.set(name, list); }
    addFilter() {}
    emit(name) { for (const fn of this.listeners.get(name) ?? []) fn(); }
    init() { this.element = window.document.createElement('div'); this.element.tabIndex = -1; window.document.body.append(this.element); this.emit('initialLayout'); this.element.focus(); return true; }
    destroy() { this.emit('close'); this.element.remove(); this.emit('destroy'); }
  }
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    getComputedStyle: window.getComputedStyle.bind(window),
    __readerMotion: [],
    __readerGSAP: actualMotion ? realGSAP : undefined,
    __readerPhotoSwipe: ReaderPhotoSwipe,
    fetch: (url, options) => new Promise((resolve, reject) => {
      const request={url,options,resolve:(html)=>resolve(integrated?Response.json({item:{bodyHTML:html}}):{ok:true,json:async()=>({bodyHTML:html})}),reject};
      requests.push(request);
      options?.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
    })
  });
  window.HTMLElement.prototype.getClientRects = function() {
    return this.closest("[hidden]") ? [] : [{ width: 20, height: 20 }];
  };
  const exports = await import(`${moduleURL}#fixture-${++fixtureId}`);
  exports.setLang("en");
  const nextArticles = [];
  const reader = new exports.Reader(index => {
    nextArticles.push(index);
  }, reduced), get = (id) => window.document.getElementById(id), root = reader.root;
  const metrics = { height: 800, scrollHeight: 3600, bodyTop: 1000, bodyHeight: 2400 };
  Object.defineProperties(root, { clientHeight: { configurable: true, get: () => metrics.height }, scrollHeight: { configurable: true, get: () => metrics.scrollHeight } });
  root.getBoundingClientRect = () => ({ top: 20, height: metrics.height });
  get("reader-body").getBoundingClientRect = () => ({ top: 20 + metrics.bodyTop - root.scrollTop, height: metrics.bodyHeight });
  const scrolls = [];
  let smoothDestination = null;
  root.scrollTo = (options) => {
    scrolls.push(options);
    if (deferredSmooth && options.behavior === 'smooth') {
      smoothDestination = options.top;
      return;
    }
    smoothDestination = null;
    root.scrollTop = options.top;
    root.dispatchEvent(new window.Event("scroll"));
  };
  const flush = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((fn) => fn(0));
  };
  return {
    ...exports,
    reader,
    get,
    window,
    requests,
    metrics,
    frames,
    scrolls,
    imageViewers,
    nextArticles,
    flush,
    finishSmooth() {
      if (smoothDestination === null) return;
      root.scrollTop = smoothDestination;
      smoothDestination = null;
      root.dispatchEvent(new window.Event('scroll'));
      root.dispatchEvent(new window.Event('scrollend'));
    },
    motion: globalThis.__readerMotion,
    async load(html, index = 0) {
      reader.prepare(index);
      reader.reveal();
      requests.at(-1).resolve(html);
      await tick();
      flush();
    },
    setReduced(value) {
      media.matches = value;
      listeners.forEach((fn) => fn({ matches: value }));
    },
    dispose() {
      reader.conceal();
      exports.clearIntegratedArticle();
      if (actualMotion) realGSAP.ticker.sleep();
      dom.window.close();
      Object.assign(globalThis, previous);
    }
  };
}
const article = '<h2 id="author-start">First section</h2><p>Real fixture body</p><h3>Detail</h3><h2 id="author-end">Last section</h2>';

test('the integrated Reader consumes a just-authorized detail once and revalidates the next opening', async () => {
  const f=await fixture({integrated:true});
  try {
    const slug=f.posts[0].slug;
    const pending=f.primeIntegratedArticle(slug);
    f.requests[0].resolve(article); await pending;
    f.reader.prepare(0); f.reader.reveal(); await tick();
    assert.equal(f.requests.length,1,'route metadata and reader body share only this authorized navigation response');
    assert.match(f.get('reader-body').textContent,/Real fixture body/);
    f.reader.conceal(); f.reader.prepare(0); f.reader.reveal(); await tick();
    assert.equal(f.requests.length,2,'a new opening must revalidate access, rather than reuse a private body');
    f.requests[1].reject(new Error('Membership changed')); await tick();
    assert.doesNotMatch(f.get('reader-body').textContent,/Real fixture body/);
    assert.ok(f.get('reader-body').querySelector('.reader-error'));
  } finally {f.dispose();}
});

test('the integrated Reader cancels replaced and concealed reads without consuming another slug handoff', async () => {
  const f=await fixture({integrated:true});
  try {
    const prime=f.primeIntegratedArticle(f.posts[1].slug);
    f.requests[0].resolve('<p>Different authorized article</p>'); await prime;
    f.reader.prepare(0); f.reader.reveal(); await tick();
    assert.equal(f.requests.length,2,'a different slug needs its own authorization request');
    assert.doesNotMatch(f.get('reader-body').textContent,/Different authorized article/);
    const first=f.requests[1];
    f.reader.prepare(1); await tick();
    assert.equal(first.options.signal.aborted,true,'rapid article changes abort the replaced network read');
    assert.equal(f.requests.length,3);
    const second=f.requests[2]; f.reader.conceal(); await tick();
    assert.equal(second.options.signal.aborted,true,'closing the Reader cancels the active detail read');
    assert.equal(f.get('reader-body').textContent,'');
  } finally {f.dispose();}
});

test('identity clearing invalidates an unconsumed authorized article before the Reader can display it', async () => {
  const f=await fixture({integrated:true});
  try {
    const prime=f.primeIntegratedArticle(f.posts[0].slug);
    f.requests[0].resolve('<p>Body from the previous identity</p>'); await prime;
    f.clearIntegratedArticle(); f.reader.prepare(0); f.reader.reveal(); await tick();
    assert.equal(f.requests.length,2);
    assert.doesNotMatch(f.get('reader-body').textContent,/previous identity/);
  } finally {f.dispose();}
});

function readyImage(f, image) {
  Object.defineProperties(image, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 1600 }, naturalHeight: { configurable: true, value: 900 } });
  image.dispatchEvent(new f.window.Event('load'));
}

test('Reader offers next article only when another record exists and rechecks the current collection on activation', async () => {
  const f = await fixture();
  const records = [...f.posts];
  try {
    f.posts.splice(1);
    await f.load(article);
    const next = f.get('reader-next');
    assert.equal(next.hidden, true, 'a single article must not advertise a link back to itself');
    assert.equal(next.disabled, true, 'the unavailable action must leave the keyboard order');
    assert.equal(f.get('reader-next-title').textContent, '');
    next.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(f.nextArticles, [], 'a synthetic or stale click cannot reopen the only article');

    f.posts.push(records[1]);
    f.reader.fill();
    assert.equal(next.hidden, false); assert.equal(next.disabled, false);
    assert.equal(f.get('reader-next-title').textContent, records[1].title.en);
    next.click(); assert.deepEqual(f.nextArticles, [1]);
    await f.load(article, 1);
    next.click(); assert.deepEqual(f.nextArticles, [1, 0], 'multiple articles retain the existing wraparound');

    f.posts.splice(0);
    next.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(f.nextArticles, [1, 0], 'an identity refresh clearing posts cannot emit NaN or an obsolete index');
  } finally { f.posts.splice(0, f.posts.length, ...records); f.dispose(); }
});

test('Reader image ownership ends on language, live reduced motion, article change and conceal', async () => {
  const f = await fixture({ reduced: false });
  try {
    await f.load('<h2>Real section</h2><figure><img src="/media/real" alt="Original diagram"><figcaption>Real author caption</figcaption></figure>');
    const image = f.get('reader-body').querySelector('img'); readyImage(f, image);
    const button = image.closest('button'); assert.ok(button);
    button.focus(); f.reader.root.scrollTop = 1200; button.click();
    assert.equal(f.reader.imageOpen, true); assert.equal(f.reader.root.inert, true);
    f.setLang('zh'); f.reader.fill();
    assert.equal(f.reader.imageOpen, false); assert.equal(f.reader.root.inert, false);
    assert.equal(f.window.document.activeElement, button); assert.equal(f.reader.root.scrollTop, 1200);
    assert.equal(image.closest('button'), button, 'loaded body and its keyboard trigger survive a language update');
    assert.match(button.getAttribute('aria-label'), /放大图片/);
    button.click(); f.setReduced(true);
    assert.equal(f.reader.imageOpen, false); assert.equal(f.reader.root.inert, false);
    button.click(); assert.equal(f.imageViewers.at(-1).options.zoomAnimationDuration, 0);
    f.reader.prepare(1);
    assert.equal(f.reader.imageOpen, false); assert.equal(f.reader.root.inert, false);
    f.requests.at(-1).resolve('<h2>Next</h2><img src="/media/next" alt="Next">'); await tick();
    const next = f.get('reader-body').querySelector('img'); readyImage(f, next); next.closest('button').click();
    assert.equal(f.reader.imageOpen, true); f.reader.conceal();
    assert.equal(f.reader.imageOpen, false); assert.equal(f.reader.root.inert, false);
  } finally { f.dispose(); }
});

test('Reader image failure removes its interactive wrapper before rendering the existing accessible fallback', async () => {
  const f = await fixture();
  try {
    await f.load('<h2>Real section</h2><img src="/media/real" alt="Original diagram">');
    const image = f.get('reader-body').querySelector('img'); readyImage(f, image); image.closest('button').click();
    image.dispatchEvent(new f.window.Event('error'));
    assert.equal(f.reader.imageOpen, false); assert.equal(f.reader.root.inert, false);
    assert.equal(image.closest('button'), null);
    const fallback = f.get('reader-body').querySelector('.reader-image-fallback');
    assert.ok(fallback); assert.equal(fallback.closest('button'), null); assert.ok(fallback.querySelector('a[href]'));
    readyImage(f, f.reader.heroImg); assert.ok(f.reader.heroImg.closest('button'));
    f.reader.heroImg.dispatchEvent(new f.window.Event('error'));
    assert.equal(f.reader.heroImg.closest('button'), null); assert.ok(f.get('reader-hero').querySelector('.reader-cover-fallback'));
  } finally { f.dispose(); }
});

test('a failed author-linked image keeps its original destination without nesting fallback links', async () => {
  const f = await fixture();
  try {
    await f.load('<h2>Section</h2><p><a id="author-image-link" href="https://author.example/source"><img src="/media/linked" alt="Author diagram"></a></p>');
    const image = f.get('reader-body').querySelector('img'); readyImage(f, image);
    image.dispatchEvent(new f.window.Event('error'));
    const author = f.get('author-image-link');
    assert.equal(author.href, 'https://author.example/source');
    assert.equal(author.querySelector('a, button'), null);
    assert.equal(f.get('reader-body').querySelector('.reader-image-fallback').closest('a'), null);
    assert.match(author.textContent, /Author diagram/, 'the author link must retain a visible name after the only image is hidden');
    readyImage(f, image);
    assert.equal(image.hidden, false); assert.equal(author.querySelector('.reader-image-link-label'), null);
    assert.equal(f.get('reader-body').querySelector('.reader-image-fallback'), null);
    assert.ok(author.parentElement.querySelector('button.reader-image-open'), 'a successful later load can enable zoom again');
  } finally { f.dispose(); }
});

test('closing an image resumes reading metrics after another lazy image changed the inert Reader layout', async () => {
  const f = await fixture();
  try {
    await f.load('<h2>Section</h2><img src="/media/one" alt="One"><img src="/media/two" alt="Two">');
    const [first, second] = f.get('reader-body').querySelectorAll('img'); readyImage(f, first);
    first.closest('button').click(); f.flush(); readyImage(f, second);
    assert.equal(f.frames.size, 0, 'the covered Reader should not measure layout while inert');
    f.window.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(f.reader.imageOpen, false); assert.equal(f.frames.size, 1, 'release reuses the existing single metrics frame');
    f.flush(); assert.equal(f.frames.size, 0);
  } finally { f.dispose(); }
});

test("old failures and concealed requests cannot replace the current reader body", async () => {
  const f = await fixture();
  try {
    f.reader.prepare(0);
    const old = f.requests[0];
    f.reader.prepare(1);
    f.reader.reveal();
    f.requests[1].resolve("<h2>Current article</h2>");
    await tick();
    old.reject(new Error("network"));
    await tick();
    assert.match(f.get("reader-body").textContent, /Current article/);
    f.reader.prepare(2);
    f.reader.conceal();
    const before = f.get("reader-body").innerHTML;
    f.requests[2].resolve("<h2>Closed response</h2>");
    await tick();
    assert.equal(f.get("reader-body").innerHTML, before);
  } finally {
    f.dispose();
  }
});
test("retry evicts failed cache; language refresh preserves loaded body and reading position", async () => {
  const f = await fixture();
  try {
    f.reader.prepare(0);
    f.reader.reveal();
    f.requests[0].reject(new Error("offline"));
    await tick();
    const retry = f.get("reader-body").querySelector("button");
    assert.ok(retry, "recoverable failure has a native retry button");
    retry.click();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve(article);
    await tick();
    const heading = f.get("reader-body").querySelector("h2");
    f.reader.root.scrollTop = 1450;
    f.setLang("zh");
    f.reader.fill();
    await tick();
    assert.equal(f.get("reader-body").querySelector("h2"), heading);
    assert.equal(f.reader.root.scrollTop, 1450);
    assert.equal(f.requests.length, 2);
    assert.equal(f.get("reader-body").getAttribute("aria-busy"), "false");
    assert.equal(f.get("reader-body").lang, "zh-CN");
  } finally {
    f.dispose();
  }
});
test("contents preserve author anchors, expose current section, and clamp body-only progress", async () => {
  const f = await fixture();
  try {
    await f.load(article);
    const headings = [...f.get("reader-body").querySelectorAll("h2,h3")];
    assert.equal(headings[0].id, "author-start");
    assert.equal(headings[2].id, "author-end");
    assert.ok(headings[1].id);
    assert.equal(f.get("reader-toc").querySelector("a").lang, "zh-CN", "contents use the language of the real body");
    [1100, 1600, 2300].forEach((top, i) => headings[i].getBoundingClientRect = () => ({ top: 20 + top - f.reader.root.scrollTop }));
    f.reader.root.scrollTop = 1800;
    for (let i = 0; i < 5; i++) f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.equal(f.get("reader-toc").querySelector('[aria-current="location"]').textContent, "Detail");
    const progress = f.reader.root.querySelector('[role="progressbar"]');
    assert.equal(progress?.getAttribute("aria-valuenow"), "50");
    f.reader.root.scrollTop = 9e3;
    f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    f.flush();
    assert.equal(progress.getAttribute("aria-valuenow"), "100");
    assert.equal(f.get("reader-toc").querySelector('[aria-current="location"]').textContent, "Last section");
    f.reader.root.scrollTop = -40;
    f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    f.flush();
    assert.equal(progress.getAttribute("aria-valuenow"), "0");
    f.reader.conceal();
    f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    assert.equal(f.frames.size, 0);
  } finally {
    f.dispose();
  }
});
test("local anchors transfer keyboard focus, close mobile contents, and respect modifiers and live reduced motion", async () => {
  const f = await fixture({ reduced: false });
  try {
    await f.load(article + '<p><a href="#author-end" id="body-anchor">Jump</a></p>');
    const heading = f.get("author-end");
    assert.ok(heading);
    heading.getBoundingClientRect = () => ({ top: 2200 - f.reader.root.scrollTop });
    const link = f.get("reader-toc").querySelector('a[href="#author-end"]'), modified = new f.window.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(modified);
    assert.equal(modified.defaultPrevented, false);
    assert.equal(f.scrolls.length, 0);
    const click = new f.window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
    link.dispatchEvent(click);
    assert.ok(click.defaultPrevented);
    assert.equal(f.scrolls.at(-1).top, 2084);
    assert.equal(f.window.document.activeElement, heading);
    assert.equal(f.scrolls.at(-1).behavior, "smooth");
    f.setReduced(true);
    f.get("body-anchor").click();
    assert.equal(f.scrolls.at(-1).behavior, "auto");
    const mobile = f.reader.root.querySelector(".reader-toc-mobile");
    assert.ok(mobile?.querySelector("summary"));
    mobile.open = true;
    mobile.querySelector("a").click();
    assert.equal(mobile.open, false);
  } finally {
    f.dispose();
  }
});
test("image failure retains author alt/caption and original link; fallback and cover alt follow chrome language", async () => {
  const f = await fixture();
  try {
    await f.load(article + '<figure><img src="/media/test" alt="\u539F\u56FE\uFF1A\u6D41\u7A0B\u793A\u610F"><figcaption>Real caption</figcaption></figure>');
    const image = f.get("reader-body").querySelector("img");
    image.dispatchEvent(new f.window.Event("error"));
    f.flush();
    const fallback = f.get("reader-body").querySelector(".reader-image-fallback");
    assert.ok(fallback);
    assert.match(fallback.textContent, /原图：流程示意/);
    assert.equal(fallback.querySelector("a").href, f.posts[0].url);
    assert.equal(image.hidden, true);
    assert.match(f.get("reader-body").textContent, /Real caption/);
    f.get("reader-img").dispatchEvent(new f.window.Event("error"));
    assert.ok(f.get("reader-hero").classList.contains("is-unavailable"));
    f.setLang("zh");
    f.reader.fill();
    assert.match(fallback.textContent, /图片暂时无法加载/);
    assert.equal(fallback.lang, "zh-CN");
    assert.equal(f.get("reader-img").alt, f.posts[0].title.zh);
  } finally {
    f.dispose();
  }
});
test("tables have labeled keyboard scrolling; empty contents hide; live reduced motion settles entrances", async () => {
  const f = await fixture({ reduced: false });
  try {
    await f.load("<p>Short article.</p><table><caption>Source table</caption><tr><th>Column</th></tr><tr><td>Cell</td></tr></table>");
    const region = f.get("reader-body").querySelector(".reader-table-scroll");
    assert.equal(region?.getAttribute("role"), "region");
    assert.equal(region?.tabIndex, 0);
    assert.equal(region?.getAttribute("aria-label"), "Source table");
    assert.equal(f.reader.root.querySelector(".reader-toc").hidden, true);
    assert.equal(f.reader.root.querySelector(".reader-toc-mobile")?.hidden, true);
    assert.ok(f.motion.some((tween) => !tween.killed));
    f.setReduced(true);
    assert.ok(f.motion.every((tween) => tween.killed));
  } finally {
    f.dispose();
  }
});
test("new article loading resets stale progress and hides the previous open contents disclosure", async () => {
  const f = await fixture();
  try {
    await f.load(article);
    const progress = f.reader.root.querySelector('[role="progressbar"]');
    f.reader.root.scrollTop = 9e3;
    f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    f.flush();
    assert.equal(progress.getAttribute("aria-valuenow"), "100");
    const mobile = f.reader.root.querySelector(".reader-toc-mobile");
    mobile.open = true;
    f.reader.prepare(1);
    assert.equal(progress.getAttribute("aria-valuenow"), "0");
    assert.equal(mobile.open, false);
    assert.equal(mobile.hidden, true);
  } finally {
    f.dispose();
  }
});
test("short articles finish at the reader bottom even when the header prevents the body reaching the top", async () => {
  const f = await fixture();
  try {
    await f.load(article);
    f.metrics.bodyHeight = 200;
    f.metrics.scrollHeight = 1700;
    f.reader.root.scrollTop = 900;
    f.reader.root.dispatchEvent(new f.window.Event("scroll"));
    f.flush();
    assert.equal(f.reader.root.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "100");
  } finally {
    f.dispose();
  }
});
test("actual GSAP reader entrances are killed and their inline styles cleared by reduced motion and conceal", async () => {
  const f = await fixture({ reduced: false, actualMotion: true });
  try {
    await f.load(article);
    const targets = [...f.reader.root.querySelectorAll(".reader-head > *, .reader-layout, #reader-close")];
    assert.ok(realGSAP.getTweensOf(targets).length > 0);
    f.setReduced(true);
    assert.equal(realGSAP.getTweensOf(targets).length, 0);
    assert.ok(targets.every((node) => !node.style.transform && !node.style.opacity));
    f.setReduced(false);
    f.reader.reveal();
    assert.ok(realGSAP.getTweensOf(targets).length > 0);
    f.reader.conceal();
    assert.equal(realGSAP.getTweensOf(targets).length, 0);
  } finally {
    f.dispose();
  }
});

async function shiftedArticle(options = {}) {
  const f = await fixture(options);
  await f.load('<img id="late-image" src="/media/lazy-fixture" alt="Source image"><h2 id="before-target">Earlier section</h2><p>Body</p><h2 id="jump-target">Requested section</h2>');
  f.metrics.scrollHeight = 8000;
  f.metrics.bodyHeight = 6000;
  let shift = 0;
  const first = f.get('before-target'), target = f.get('jump-target'), image = f.get('late-image');
  first.getBoundingClientRect = () => ({ top: 20 + 1200 + shift - f.reader.root.scrollTop });
  target.getBoundingClientRect = () => ({ top: 20 + 3000 + shift - f.reader.root.scrollTop });
  return { ...f, first, target, image,
    jump(id = 'jump-target') { f.get('reader-toc').querySelector(`a[href="#${id}"]`).click(); },
    shiftImage(event = 'load') { shift += 810; image.dispatchEvent(new f.window.Event(event)); },
  };
}

test('a smooth contents jump retargets after an earlier unsized image shifts the heading', async () => {
  const f = await shiftedArticle({ reduced: false, deferredSmooth: true });
  try {
    f.jump();
    f.finishSmooth();
    f.flush();
    assert.equal(f.target.getBoundingClientRect().top, 116);
    f.shiftImage();
    assert.equal(f.target.getBoundingClientRect().top, 926, 'models the real late-image displacement');
    f.flush();
    assert.equal(f.scrolls.at(-1).top, 3714, 'destination follows the target element after its layout moves');
    assert.equal(f.scrolls.at(-1).behavior, 'smooth');
    f.finishSmooth(); f.flush();
    assert.equal(f.target.getBoundingClientRect().top, 116);
    assert.equal(f.get('reader-toc').querySelector('[aria-current="location"]').textContent, 'Requested section');
    assert.equal(f.frames.size, 0, 'settled targeting has no polling frame');
  } finally { f.dispose(); }
});

test('late image failure also corrects a reduced-motion jump immediately without smooth movement', async () => {
  const f = await shiftedArticle();
  try {
    f.jump(); f.flush();
    f.shiftImage('error'); f.flush();
    assert.equal(f.target.getBoundingClientRect().top, 116);
    assert.ok(f.scrolls.every(scroll => scroll.behavior === 'auto'));
  } finally { f.dispose(); }
});

test('manual wheel, touch, pointer and scrolling keys cancel late-image jump corrections', async () => {
  for (const input of ['wheel', 'touchstart', 'pointerdown', 'PageDown']) {
    const f = await shiftedArticle({ reduced: false, deferredSmooth: true });
    try {
      f.jump();
      const event = input === 'PageDown'
        ? new f.window.KeyboardEvent('keydown', { key: input, bubbles: true })
        : new f.window.Event(input, { bubbles: true });
      f.reader.root.dispatchEvent(event);
      const afterInput = f.scrolls.length;
      f.shiftImage(); f.flush(); f.finishSmooth(); f.flush();
      assert.equal(f.scrolls.length, afterInput, input);
    } finally { f.dispose(); }
  }
});

test('a native scroll that ends away from the jump target releases image correction even without a wheel event', async () => {
  const f = await shiftedArticle({ reduced: false, deferredSmooth: true });
  try {
    f.jump();
    f.reader.root.scrollTop = 1700;
    f.reader.root.dispatchEvent(new f.window.Event('scrollend'));
    const afterInterruption = f.scrolls.length;
    f.shiftImage(); f.flush(); f.finishSmooth(); f.flush();
    assert.equal(f.scrolls.length, afterInterruption, 'scrollbar/native interruption cannot later snap back');
    assert.equal(f.reader.root.scrollTop, 1700);
  } finally { f.dispose(); }
});

test('mobile contents collapse before measuring the initial jump and live reduced motion finishes its current target', async () => {
  const f = await shiftedArticle({ reduced: false, deferredSmooth: true });
  try {
    const mobile = f.reader.root.querySelector('.reader-toc-mobile');
    mobile.open = true;
    f.target.getBoundingClientRect = () => ({ top: 20 + 3000 + (mobile.open ? 400 : 0) - f.reader.root.scrollTop });
    mobile.querySelector('a[href="#jump-target"]').click();
    assert.equal(f.scrolls.at(-1).top, 2904, 'expanded mobile contents must not inflate the destination');
    assert.equal(f.reader.root.scrollTop, 0, 'native smooth scroll is still in flight');
    f.setReduced(true); f.flush();
    assert.equal(f.scrolls.at(-1).behavior, 'auto');
    assert.equal(f.target.getBoundingClientRect().top, 116);
  } finally { f.dispose(); }
});

test('the latest target wins layout correction and conceal or a new article invalidates the old jump', async () => {
  const f = await shiftedArticle({ reduced: false, deferredSmooth: true });
  try {
    f.jump(); f.jump('before-target'); f.shiftImage(); f.flush();
    assert.equal(f.scrolls.at(-1).top, 1914);
    f.finishSmooth(); f.flush();
    assert.equal(f.first.getBoundingClientRect().top, 116);
    const afterLatest = f.scrolls.length;
    f.reader.conceal(); f.shiftImage(); f.flush();
    assert.equal(f.scrolls.length, afterLatest);
    f.reader.prepare(0); f.reader.reveal(); f.jump();
    f.reader.prepare(1);
    const afterRoute = f.scrolls.length;
    f.shiftImage(); f.flush();
    assert.equal(f.scrolls.length, afterRoute);
  } finally { f.dispose(); }
});
