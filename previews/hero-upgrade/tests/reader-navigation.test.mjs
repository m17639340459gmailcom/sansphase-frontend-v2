import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const between = (start, end) => {
  const first = main.indexOf(start), last = main.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error(`Navigation fixture cannot find ${start}`);
  return main.slice(first, last);
};
// Execute the production integration functions with a controlled frame clock;
// the actual Reader DOM/focus behavior has a separate reader-focus suite.
const integration = `
  import { mountReaderReveal } from './src/reader-reveal';
  import { samePageRoute } from './src/navigation-state';
  export function mountNavigation(env) {
    const document=env.document, HTMLElement=document.defaultView.HTMLElement, html=document.documentElement;
    let viewShown=env.initialView, viewRoute=env.initialView?{page:env.initialView,id:env.initialRoute.id}:null, route=env.initialRoute, routeEpoch=0, readerOpener=null, menuOpen=false,journalNotesReady=false;
    const integrated=Boolean(env.runtime), localRuntime=env.runtime, account=env.account??null, reduced=true, posts=[{slug:'first'},{slug:'second'}], reader=env.reader, lenis=env.lenis;
    const pageTransition={pending:false,settle(){env.effects.push('settle')}}, palette={close(){}}, closeMenu=()=>{env.effects.push('close-menu')};
    const location={hash:'',reload(){env.effects.push('reload')}}, routeAnchors={prepare(){return async()=>false}};
    const prepareIntegratedRoute=env.prepareRoute??(async()=>{}),setDocTitle=()=>{};
    let disposeIntegrated=()=>{env.effects.push('dispose-content')};
    const viewHome=document.querySelector('#view-home'),viewPage=document.querySelector('#view-page');
    const integrationGate=()=>{viewPage.innerHTML='<section class="integration-gate">Access check</section>'};
    const historyPositions={initialTop:undefined,complete(){}};
    const navigationRestore={get intentVersion(){return env.control.intentVersion},cancel(){},run(action){action();return Promise.resolve(true)},to(top){env.scrolls.push(top);return Promise.resolve(true)}};
    const showcaseExperience={setActive(){}}, factsExperience=showcaseExperience, manifestoExperience=showcaseExperience,
      homeSectionsExperience=showcaseExperience, closingExperience=showcaseExperience, magneticExperience=showcaseExperience;
    const renderAll=()=>{}, reveals=()=>{}, playGroup=()=>{}, layout=()=>{},heroExperience={enter(){}},gsap={fromTo(){}};
    const renderCurrentPage=()=>{env.effects.push('render-journal');journalNotesReady=true;viewPage.innerHTML='<h1>Prepared journal</h1>'};
    const $=selector=>document.querySelector(selector);
    async function swapView(page,_animate,next={page}) { viewShown=page; viewRoute={page,id:next.id}; document.body.dataset.page=page; env.swaps.push(next); return env.swap?await env.swap(next):true; }
    ${between('function refreshReaderOpener(', 'const reader = new Reader')}
    ${between('const readerReveal =', '// Opening a post')}
    ${between('function clearStaticArticle()', 'function setDocTitle(')}
    ${between('async function applyRoute(', 'function navigate(')}
    ${between('function showArticle(', "$('#reader-close').addEventListener")}
    ${between('function showLoadingFailure()', 'function handleIntegratedError(')}
    ${between('async function start()', 'void start().catch(')}
    return {applyRoute,showArticle,hideArticle,showLoadingFailure,start,readerReveal,readerActive,refreshReaderOpener,
      get view(){return viewShown},get route(){return route}};
  }
`;
const motionIntegration = `
  export function mountMotion(env) {
    const document=env.document, viewPage=document.querySelector('#view-page'), viewHome=document.querySelector('#view-home');
    let disposeIntegrated=()=>{},homeContentDirty=false; const disposeLibrary=()=>{},disposeCatalog=()=>{},account=null,renderAll=()=>{}; const gsap=env.gsap, lenis=env.lenis, headerExperience={setReduced(){}}, route={page:'work'};
    let reduced=false, viewShown='home', viewRoute=null, change;
    const motionPreference={addEventListener(type,callback){change=callback}};
    const pageTransition={pending:false,run(update){update();return Promise.resolve(true)}};
    const renderCurrentPage=()=>{}, prepareGroup=()=>{}, playGroup=()=>{}, markCurrent=()=>{}, setDocTitle=()=>{},
      ScrollTrigger={refresh(){}}, groups=()=>[], pieces=()=>[], fadeTargets='';
    const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
    const applyRoute=next=>{env.applied.push(next)};
    ${between('async function swapView(', 'async function applyRoute(')}
    ${between("motionPreference.addEventListener('change'", '// ---------------------------------------------------------------- heading reveals')}
    return {swapView,setReduced(value){change({matches:value})},get reduced(){return reduced}};
  }
`;
const result = await build({
  stdin: { contents: `export {mountReaderReveal} from './src/reader-reveal'; export {default as gsap} from 'gsap'; ${integration} ${motionIntegration}`, resolveDir: sourceRoot, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { mountReaderReveal, mountNavigation, mountMotion, gsap } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

function clock() {
  const saved = new Map(['requestAnimationFrame', 'cancelAnimationFrame'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let sequence = 0;
  const pending = new Map(), all = new Map();
  globalThis.requestAnimationFrame = callback => { const id = ++sequence; pending.set(id, callback); all.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => { pending.delete(id); };
  return {
    pending, all,
    flush() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(100)); },
    restore() { for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; },
  };
}

function fixture({ initialView = 'home', initialRoute = { page: 'home' },runtime,prepareRoute,swap,account } = {}) {
  const frames = clock();
  const dom = new JSDOM('<!doctype html><html><body class="is-loading"><header id="header"></header><main id="main"><button id="opener">Read</button><section id="view-home"><div id="hero-copy"></div></section><section id="view-page"></section></main><footer id="footer"></footer><article id="reader" tabindex="-1" aria-hidden="true"></article></body></html>', { pretendToBeVisual: true });
  const document = dom.window.document;
  Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() } });
  const root = document.querySelector('#reader');
  const reveals = [];
  const reader = {
    open: false, index: -1, root,
    prepare(index) { this.index = index; root.classList.add('is-active'); root.setAttribute('aria-hidden', 'false'); },
    reveal() { this.open = true; reveals.push(this.index); root.classList.add('is-open'); },
    conceal() { this.open = false; root.classList.remove('is-open', 'is-active'); root.setAttribute('aria-hidden', 'true'); },
  };
  const lenis = { running: false, start() { this.running = true; }, stop() { this.running = false; } };
  const swaps=[],scrolls=[],effects=[],control={intentVersion:0};
  const navigation = mountNavigation({ document, reader, lenis, initialView, initialRoute, swaps, scrolls, effects, control,runtime,prepareRoute,swap,account });
  const opener = document.querySelector('#opener'); opener.focus();
  return {
    frames, document, reader, lenis, navigation, reveals, opener, swaps, scrolls, effects, control,
    close() { navigation.readerReveal.dispose(); dom.window.close(); frames.restore(); },
  };
}

function motionFixture() {
  const names = ['window', 'document', 'getComputedStyle', 'HTMLElement'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const dom = new JSDOM('<!doctype html><main><section id="view-home"></section><section id="view-page"><div class="page-body"><p>First section</p><p>Second section</p><p>Third section</p></div></section></main>', { pretendToBeVisual: true });
  const document = dom.window.document;
  for (const [name, value] of Object.entries({ window: dom.window, document, getComputedStyle: dom.window.getComputedStyle, HTMLElement: dom.window.HTMLElement })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const applied = [], lenis = { options: {}, scroll: 0, scrollTo() {} };
  const motion = mountMotion({ document, gsap, lenis, applied });
  return {
    motion, applied, lenis, children: Array.from(document.querySelectorAll('.page-body > *')),
    close() { gsap.killTweensOf(document.querySelectorAll('*')); gsap.ticker.sleep(); dom.window.close(); for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; },
  };
}

test('deferred reveals use the latest request and ignore canceled callbacks delivered late', () => {
  const frames = clock();
  const reveals = [];
  const reveal = mountReaderReveal(() => { reveals.push('latest'); });
  try {
    reveal.schedule(); const stale = [...frames.all.values()][0];
    reveal.schedule();
    assert.equal(reveal.pending, true);
    assert.equal(frames.pending.size, 1);
    stale(50);
    assert.deepEqual(reveals, []);
    assert.equal(reveal.pending, true, 'an old callback cannot clear the latest pending frame');
    frames.flush();
    assert.deepEqual(reveals, ['latest']);
    assert.equal(reveal.pending, false);
    reveal.schedule(); const late = [...frames.all.values()].at(-1);
    reveal.dispose(); reveal.dispose(); late(100); reveal.schedule();
    assert.deepEqual(reveals, ['latest']);
    assert.equal(frames.pending.size, 0);
  } finally { reveal.dispose(); frames.restore(); }
});

for (const painted of [false,true]) test(`loading failure releases ${painted?'visible':'prepared'} reader and settles navigation before the retry`,async()=>{
  const f=fixture();
  try {
    await f.navigation.applyRoute({page:'blog',slug:'first'});
    const late=[...f.frames.all.values()].at(-1);
    if(painted) f.frames.flush();
    assert.equal(f.navigation.readerActive(),true);
    f.effects.length=0;
    f.navigation.showLoadingFailure();
    late(100);f.frames.flush();
    assert.equal(f.navigation.readerActive(),false,'the old reader cannot cover the retry surface');
    assert.equal(f.reader.root.getAttribute('aria-hidden'),'true');
    assert.equal(f.document.documentElement.classList.contains('is-reading'),false);
    for(const id of ['header','main','footer']) assert.equal(f.document.getElementById(id).inert,false);
    assert.equal(f.lenis.running,true);
    assert.deepEqual(f.effects,['close-menu','settle','dispose-content']);
    assert.ok(f.document.querySelector('[data-reload]'));
    f.document.querySelector('[data-reload]').click();
    assert.equal(f.effects.at(-1),'reload');
  } finally {f.close();}
});

test('article → home before the first paint conceals prepared content and releases the underlying page', async () => {
  const f = fixture();
  try {
    await f.navigation.applyRoute({ page: 'blog', slug: 'first' });
    assert.equal(f.navigation.readerActive(), true, 'prepare is already a reader lifecycle state');
    assert.equal(f.reader.open, false);
    const stale = [...f.frames.all.values()][0];
    assert.equal(f.document.querySelector('#main').inert, true);
    await f.navigation.applyRoute({ page: 'home' });
    stale(100); f.frames.flush();
    assert.equal(f.navigation.route.page, 'home');
    assert.equal(f.reader.open, false);
    assert.equal(f.navigation.readerActive(), false);
    assert.equal(f.reader.root.classList.contains('is-active'), false);
    assert.equal(f.reader.root.getAttribute('aria-hidden'), 'true');
    assert.equal(f.document.documentElement.classList.contains('is-reading'), false);
    for (const id of ['header', 'main', 'footer']) assert.equal(f.document.getElementById(id).inert, false);
    assert.equal(f.document.activeElement, f.opener);
    assert.deepEqual(f.reveals, []);
  } finally { f.close(); }
});

test('a newer article invalidates the previous reveal without dropping the newer pending request', async () => {
  const f = fixture();
  try {
    await f.navigation.applyRoute({ page: 'blog', slug: 'first' });
    const stale = [...f.frames.all.values()][0];
    await f.navigation.applyRoute({ page: 'blog', slug: 'second' });
    stale(50);
    assert.equal(f.navigation.readerActive(), true);
    assert.equal(f.reader.open, false);
    f.frames.flush();
    assert.deepEqual(f.reveals, [1]);
    assert.equal(f.reader.index, 1);
    assert.equal(f.reader.open, true);
    assert.equal(f.document.activeElement, f.reader.root);
    assert.equal(f.document.querySelector('#main').inert, true);
  } finally { f.close(); }
});

test('direct article startup leaves scrolling stopped throughout prepare and reveal', async () => {
  const f = fixture({ initialView: null, initialRoute: { page: 'blog', slug: 'first' } });
  try {
    await f.navigation.start();
    assert.equal(f.navigation.readerActive(), true);
    assert.equal(f.reader.open, false);
    assert.equal(f.lenis.running, false, 'start must not restart scrolling while the initial reader awaits its first paint');
    f.frames.flush();
    assert.equal(f.reader.open, true);
    assert.equal(f.lenis.running, false);
    assert.equal(f.document.querySelector('#main').inert, true);
  } finally { f.close(); }
});

for(const destination of ['reader','home','failure'])test(`server-rendered article remains available until ${destination} commits its replacement`,async()=>{
 const f=fixture();
 try{
  const slot=f.document.createElement('article');slot.id='site-article-static';slot.textContent='Server rendered article';f.document.body.append(slot);f.document.body.dataset.staticArticle='';
  if(destination==='reader'){
   await f.navigation.applyRoute({page:'blog',slug:'first'});
   assert.ok(f.document.getElementById('site-article-static'),'preparing the reader must not remove readable server content');
   f.frames.flush();
  }else if(destination==='home')await f.navigation.applyRoute({page:'home'});
  else f.navigation.showLoadingFailure();
  assert.equal(f.document.getElementById('site-article-static'),null);
  assert.equal(f.document.body.hasAttribute('data-static-article'),false);
 }finally{f.close();}
});

test('a newer route during initial base-view setup cannot open the obsolete article', async () => {
  const f = fixture({ initialView: null });
  try {
    const obsolete = f.navigation.applyRoute({ page: 'blog', slug: 'first' });
    const latest = f.navigation.applyRoute({ page: 'home' });
    await Promise.all([obsolete, latest]);
    f.frames.flush();
    assert.equal(f.navigation.view, 'home');
    assert.equal(f.navigation.readerActive(), false);
    assert.equal(f.reader.open, false);
    assert.deepEqual(f.reveals, []);
  } finally { f.close(); }
});

test('closing an open reader clears pending input ownership and returns focus to its connected opener', async () => {
  const f = fixture();
  try {
    await f.navigation.applyRoute({ page: 'blog', slug: 'first' }); f.frames.flush();
    assert.equal(f.document.activeElement, f.reader.root);
    f.navigation.hideArticle();
    assert.equal(f.reader.open, false);
    assert.equal(f.navigation.readerActive(), false);
    assert.equal(f.document.activeElement, f.opener);
    assert.equal(f.lenis.running, true);
    assert.equal(f.reader.root.getAttribute('aria-hidden'), 'true');
  } finally { f.close(); }
});
test('translated chrome updates a detached reader return target without focusing the inert page', async () => {
  const f = fixture();
  try {
    f.opener.dataset.post = '0';
    await f.navigation.applyRoute({ page:'blog',slug:'first' }); f.frames.flush();
    const replacement=f.document.createElement('button'); replacement.dataset.post='0'; replacement.textContent='Translated read';
    f.navigation.refreshReaderOpener(()=>f.opener.replaceWith(replacement));
    assert.equal(f.document.activeElement,f.reader.root);
    f.navigation.hideArticle();
    assert.equal(f.document.activeElement,replacement);
  } finally { f.close(); }
});

test('translated chrome returns to the same repeated article action rather than its first cover', async () => {
  const f = fixture();
  try {
    f.opener.dataset.post='0';
    f.opener.removeAttribute('id');
    const first=f.document.createElement('a'); first.dataset.post='0'; first.href='/blog/first';
    f.opener.before(first); f.opener.focus();
    await f.navigation.applyRoute({page:'blog',slug:'first'}); f.frames.flush();
    const cover=first.cloneNode(true), record=f.opener.cloneNode(true);
    f.navigation.refreshReaderOpener(()=>{first.replaceWith(cover); f.opener.replaceWith(record);});
    assert.equal(f.document.activeElement,f.reader.root);
    f.navigation.hideArticle();
    assert.equal(f.document.activeElement,record);
  } finally { f.close(); }
});

test('page navigation delegates card reveals without adding a competing page-body tween', async () => {
  const f = motionFixture();
  try {
    await f.motion.swapView('work', true);
    assert.equal(gsap.getTweensOf(f.children).length, 0, 'the page controller owns reveals, not a second global stagger');
    f.motion.setReduced(true);
    assert.equal(f.motion.reduced, true);
    assert.deepEqual(f.applied, [], 'the completed main transition must not require a replacement route');
    assert.equal(f.lenis.options.smoothWheel, false);
    assert.equal(f.lenis.options.lerp, 1);
    for (const child of f.children) {
      assert.equal(child.style.transform, '');
      assert.equal(child.style.opacity, '', 'the page must be completely visible, rather than frozen halfway in');
    }
    await f.motion.swapView('blog', true);
    assert.equal(gsap.getTweensOf(f.children).length, 0, 'subsequent page changes also honor the updated preference');
  } finally { f.close(); }
});

test('same-page hashes and repeated destinations preserve the mounted page; detail identifiers use the page transition', async () => {
  const f = fixture({initialView:'software',initialRoute:{page:'software'}});
  try {
    await f.navigation.applyRoute({page:'software'},'#catalog-directory');
    await f.navigation.applyRoute({page:'software'});
    assert.deepEqual(f.swaps,[], 'a native fragment or active navigation item must not destroy the catalog');
    await f.navigation.applyRoute({page:'software',id:'codex'});
    assert.deepEqual(f.swaps,[{page:'software',id:'codex'}]);
    await f.navigation.applyRoute({page:'software',id:'codex'},'#getting-started');
    assert.equal(f.swaps.length,1);
    await f.navigation.applyRoute({page:'software'});
    assert.equal(f.swaps.length,2, 'returning from detail is a new content surface even though its top-level page matches');
  } finally { f.close(); }
});

test('a failed integrated article leaves no committed blog surface and its blog action mounts the real journal',async()=>{
  const f=fixture({runtime:{async ensureIntegratedPost(){throw Object.assign(new Error('Not available'),{status:404});}}});
  try {
    await f.navigation.applyRoute({page:'blog',slug:'first'});
    assert.ok(f.document.querySelector('.integration-gate'));
    await f.navigation.applyRoute({page:'blog'});
    assert.deepEqual(f.swaps,[{page:'blog'}],'the gate cannot masquerade as an already-mounted journal');
  }finally{f.close();}
});

test('closing a cold article refreshes its base journal once the real summary batch is ready',async()=>{
 const f=fixture({initialView:'blog',initialRoute:{page:'blog'},runtime:{homeIntegrationReady:true}});
 try{
  f.document.querySelector('#view-page').innerHTML='<h1>Empty journal before metadata</h1>';
  await f.navigation.applyRoute({page:'blog'});
  assert.equal(f.document.querySelector('#view-page h1').textContent,'Prepared journal');
  assert.deepEqual(f.swaps,[],'the existing base view does not need a second page transition');
  await f.navigation.applyRoute({page:'blog'});
  assert.equal(f.effects.filter(value=>value==='render-journal').length,1);
 }finally{f.close();}
});

test('account lifecycle leaves immediately before optional destination modules or exit animations can wait', async () => {
  const events = [];
  const f = fixture({account:{route(page,id){events.push(['account',page,id]);}},prepareRoute:async next=>{events.push(['prepare',next.page]);}});
  try {
    await f.navigation.applyRoute({page:'work',id:'chosen-project'});
    assert.deepEqual(events,[['account','work','chosen-project'],['prepare','work']]);
  } finally { f.close(); }
});

test('a later route wins when an earlier optional route module finishes downloading late',async()=>{
  let release;
  const f=fixture({prepareRoute:next=>next.page==='work'?new Promise(resolve=>{release=resolve;}):Promise.resolve()});
  try {
    const pending=f.navigation.applyRoute({page:'work'});
    await f.navigation.applyRoute({page:'software'});
    release();await pending;
    assert.deepEqual(f.swaps,[{page:'software'}]);
    assert.equal(f.navigation.view,'software');
  }finally{f.close();}
});

test('a throwing route render displays a usable retry instead of leaving the previous page under the new URL',async()=>{
 const f=fixture({initialView:'software',initialRoute:{page:'software'},swap(){throw Error('Rendering failed')}});
 try{
  f.document.querySelector('#view-page').innerHTML='<h1>Previous software page</h1>';
  await assert.doesNotReject(f.navigation.applyRoute({page:'learning'}));
  assert.ok(f.document.querySelector('[data-reload]'));
  assert.doesNotMatch(f.document.querySelector('#view-page').textContent,/Previous software page/);
  assert.notEqual(f.document.querySelector('#main').inert,true);
 }finally{f.close();}
});

test('an obsolete render rejection cannot replace a later successful route with its retry page',async()=>{
 let rejectOld;const f=fixture({swap:next=>next.page==='learning'?new Promise((_,reject)=>rejectOld=reject):true});
 try{
  const old=f.navigation.applyRoute({page:'learning'});await Promise.resolve();await Promise.resolve();
  await f.navigation.applyRoute({page:'software'});rejectOld(Error('Obsolete render'));
  await assert.doesNotReject(old);
  assert.equal(f.navigation.route.page,'software');assert.equal(f.navigation.view,'software');
  assert.equal(f.document.querySelector('[data-reload]'),null);
 }finally{f.close();}
});

test('history restoration waits until the route has committed and reader close keeps its original base page', async () => {
  const f = fixture();
  try {
    await f.navigation.applyRoute({page:'blog',slug:'first'}); f.frames.flush();
    await f.navigation.applyRoute({page:'home'},'',940);
    assert.deepEqual(f.swaps,[], 'closing the overlay should not rebuild its original homepage');
    assert.deepEqual(f.scrolls,[940]);
    await f.navigation.applyRoute({page:'software'},'',1350);
    assert.deepEqual(f.swaps,[{page:'software'}]);assert.deepEqual(f.scrolls,[940,1350]);
  } finally { f.close(); }
});

test('a user scroll gesture during the entrance prevents a late history restoration', async () => {
  const f = fixture();
  try {
    const pending=f.navigation.applyRoute({page:'software'},'',1500);
    f.control.intentVersion++;
    await pending;
    assert.deepEqual(f.scrolls,[], 'the completed entrance must respect input that happened before its restoration task existed');
  } finally { f.close(); }
});

test('normal motion preference updates smooth scrolling without creating a global body entrance', async () => {
  const f = motionFixture();
  try {
    await f.motion.swapView('work', true);
    f.motion.setReduced(false);
    assert.equal(gsap.getTweensOf(f.children).length, 0);
    assert.equal(f.lenis.options.smoothWheel, true);
    assert.equal(f.lenis.options.lerp, .1);
    assert.deepEqual(f.applied, []);
  } finally { f.close(); }
});
