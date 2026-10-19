import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
let loading;
async function load() {
  loading ||= build({ stdin: { contents: 'export {renderJournalPage} from "./src/journal-page"; export {mountJournalExperience} from "./src/journal-experience"; export {posts,profile,fields,services} from "./src/content"; export {practices} from "./src/practice-content"; export {setLang} from "./src/i18n";', resolveDir: sourceRoot }, bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'journal-motion-adapter', setup(build) {
      build.onResolve({ filter: /^\.\/ambient$/ }, args => ({ path: args.path, namespace: 'journal-ambient' }));
      build.onLoad({ filter: /.*/, namespace: 'journal-ambient' }, () => ({ contents: 'export function mountAmbient(host){return globalThis.__journalHarness.ambient(host)}' }));
      build.onResolve({ filter: /^gsap(?:\/ScrollTrigger)?$/ }, args => ({ path: args.path, namespace: 'journal-test' }));
      build.onLoad({ filter: /.*/, namespace: 'journal-test' }, args => ({ contents: args.path.endsWith('ScrollTrigger')
        ? 'export const ScrollTrigger={create(config){return globalThis.__journalHarness.trigger(config)}};'
        : 'export default {registerPlugin(){},fromTo(target,from,to){return globalThis.__journalHarness.tween(target,from,to)}};' }));
    } }],
  });
  const result = await loading;
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

async function browser({ reduced = false, fine = true, progress = .35 } = {}) {
  const api = await load();
  const dom = new JSDOM('<!doctype html><main id="main"><div id="view-page"></div></main><button id="outside">outside</button>', { url: 'http://localhost/journal', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const names = ['window','document','Node','Element','HTMLElement','HTMLAnchorElement','localStorage','matchMedia','IntersectionObserver','ResizeObserver','MutationObserver','requestAnimationFrame','cancelAnimationFrame','__journalHarness'];
  const saved = new Map(names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const media = new Map(), observers = [], resize = [], pending = new Map(), triggers = [], tweens = [], ambients = [];
  let sequence = 0, hidden = false;
  document.hasFocus = () => true;
  Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
  const preference = query => {
    if (!media.has(query)) media.set(query,Object.assign(new window.EventTarget(),{matches:query.includes('fine')?fine:reduced}));
    return media.get(query);
  };
  const globals = {
    window,document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,HTMLAnchorElement:window.HTMLAnchorElement,localStorage:window.localStorage,
    matchMedia:preference,MutationObserver:window.MutationObserver,
    IntersectionObserver:class { constructor(callback,options) { this.callback=callback;this.options=options;this.targets=new Set();observers.push(this); } observe(target){this.targets.add(target)} disconnect(){this.targets.clear()} },
    ResizeObserver:class { constructor(callback){this.callback=callback;resize.push(this)} observe(){} disconnect(){} },
    requestAnimationFrame(callback){const id=++sequence;pending.set(id,callback);return id},cancelAnimationFrame(id){pending.delete(id)},
    __journalHarness:{
      ambient(host){const entry={host,paused:undefined,pauses:[],disposed:0};ambients.push(entry);return {setPaused(value){entry.paused=value;entry.pauses.push(value)},dispose(){entry.disposed++}}},
      trigger(config){const entry={config,progress,killed:false,kill(){this.killed=true},refresh(){config.onRefresh?.(this)}};triggers.push(entry);config.onRefresh?.(entry);return entry},
      tween(target,from,to){for(const [key,value] of Object.entries(from))if(key==='opacity'||key==='transform'||key==='clipPath')target.style[key]=String(value);const tween={target,from,to,killed:false,kill(){this.killed=true},finish(){if(!this.killed)to.onComplete?.()}};tweens.push(tween);return tween},
    },
  };
  for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  api.setLang('zh');
  const root = document.getElementById('view-page');
  const render = () => {root.innerHTML=api.renderJournalPage(i=>`/blog/${api.posts[i].slug}`,`<div data-blog-catalog-fixture><input type="search" aria-label="搜索文章"><div data-blog-results></div></div>`)};
  render();
  window.HTMLElement.prototype.getBoundingClientRect = function() {
    if(this.hasAttribute('data-journal-milestone')) {const index=[...root.querySelectorAll('[data-journal-milestone]')].indexOf(this);return {left:0,top:100+index*250,width:500,height:200};}
    if(this.hasAttribute('data-journal-timeline'))return {left:0,top:100,width:1000,height:1000};
    return {left:100,top:100,width:400,height:360};
  };
  return {api,root,window,document,observers,pending,triggers,tweens,ambients,render,
    active:()=>triggers.filter(entry=>!entry.killed),
    enter(target,visible=true,ratio=.95){observers.forEach(observer=>{if(observer.targets.has(target))observer.callback([{target,isIntersecting:visible,intersectionRatio:visible?ratio:0}])})},
    enterAll(){observers.forEach(observer=>observer.callback([...observer.targets].map(target=>({target,isIntersecting:true,intersectionRatio:.95}))))},
    update(entry,value){entry.progress=value;entry.config.onUpdate?.(entry)},
    flush(){const queue=[...pending.values()];pending.clear();queue.forEach(callback=>callback(0))},
    pointer(x=500,y=100,type='mouse'){const feature=root.querySelector('[data-journal-feature]');const event=new window.Event('pointermove',{bubbles:true});Object.defineProperties(event,{clientX:{value:x},clientY:{value:y},pointerType:{value:type}});feature.dispatchEvent(event)},
    hidden(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'))},
    preference(query,value){const item=preference(query);item.matches=value;item.dispatchEvent(new window.Event('change'))},
    async mutations(){await Promise.resolve();await Promise.resolve()},
    restore(){dom.window.close();for(const [name,value] of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]},
  };
}

test('journal adapts the five reference sections to public articles and preserves the existing catalog slot',async()=>{
  const env=await browser({reduced:true});
  try {
    const {root,api}=env;
    assert.equal(root.querySelectorAll('h1').length,1);assert.match(root.querySelector('h1').textContent,/博客/);
    assert.equal(root.querySelectorAll('[data-journal-section]').length,5);
    assert.equal(root.querySelectorAll('[data-page-card],[data-page-reveal],canvas,iframe,progress').length,0);
    assert.equal(root.querySelectorAll('img').length,1);assert.equal(root.querySelector('img').getAttribute('src'),api.posts[0].cover);
    assert.match(root.querySelector('[data-journal-feature]').textContent,new RegExp(api.posts[0].title.zh));
    assert.equal(root.querySelector('[data-journal-count]').textContent,'04');
    assert.doesNotMatch(root.textContent,/关于我|洛杉矶|南加州|加州大学|陶鼎新|Dingxin|硕士|论文|ResearchGate|工作年限|AI Native 开发者|知识是无价的|项目承接/);
    assert.equal(root.querySelector('[data-journal-story-lead] [aria-hidden="true"]').textContent,'记录 AI 学习、创作过程，以及無相网站的建设。');
    assert.deepEqual([...root.querySelectorAll('[data-journal-paragraph]')].slice(1).map(node=>node.textContent),api.practices.map(practice=>practice.summary.zh));
    assert.equal(root.querySelectorAll('[data-journal-track]').length,api.practices.length);
    assert.ok(root.querySelector('#journal-catalog [data-blog-catalog-fixture] input[type="search"]'));
    assert.equal(root.querySelectorAll('[data-journal-story] h3').length,0,'the three real reading paragraphs stay compact instead of repeating topic headings');
  }finally{env.restore()}
});

test('journal hero keeps a compact title, full-width atmosphere host and a single bounded article card',async()=>{
  const env=await browser({reduced:true});
  try {
    const hero=env.root.querySelector('header.journal-hero-full[data-journal-ambient][data-journal-section]');
    assert.ok(hero,'the atmosphere belongs to the complete hero, outside the content containers');
    assert.ok(hero.querySelector('.journal-crumb.container'));assert.ok(hero.querySelector('.journal-hero-grid.container'));
    assert.equal(hero.querySelectorAll('h1 br,.journal-hero-meta,.journal-text-link').length,0,'no forced headline line break or oversized statistics/CTA block');
    const feature=hero.querySelector('[data-journal-feature]'),chip=feature?.querySelector('.journal-feature-chip');
    assert.ok(chip);assert.equal(chip.querySelector('[data-journal-count]')?.textContent,'04');
    assert.match(chip.textContent,/04\s*篇公开文章/);assert.equal(feature.querySelectorAll('a,button').length,0,'one real article link owns the whole card');
    const css=await readFile(new URL('../src/journal-page.css',import.meta.url),'utf8');
    const style=env.document.createElement('style');style.textContent=css;env.document.head.append(style);
    assert.equal(env.window.getComputedStyle(feature).maxWidth,'352px');
    assert.match(env.window.getComputedStyle(feature.querySelector('.journal-feature-media')).aspectRatio,/^10\s*\/\s*9$/);
    assert.equal(env.window.getComputedStyle(feature.querySelector('.journal-feature-hud')).inset,'-16px','holographic HUD frames the card externally');
  }finally{env.restore()}
});

test('featured cover and four chronological milestones open the canonical reader and own distinct focus identities',async()=>{
  const env=await browser();
  try {
    const {root,api}=env;
    assert.deepEqual([...root.querySelectorAll('[data-journal-milestone]')].map(node=>node.dataset.post),['3','2','1','0']);
    assert.equal(root.querySelectorAll('[data-journal-milestone]').length,4);
    for(const link of root.querySelectorAll('[data-post]'))assert.equal(link.getAttribute('href'),`/blog/${api.posts[Number(link.dataset.post)].slug}`);
    const roles=[...root.querySelectorAll('[data-journal-focus]')].map(node=>node.dataset.journalFocus);assert.equal(new Set(roles).size,roles.length);
    assert.equal(root.querySelectorAll('[download],a[href^="https:"],a[href^="http:"]').length,0);
    api.setLang('en');env.render();assert.match(root.querySelector('h1').textContent,/journal/i);assert.doesNotMatch(root.textContent,/Dingxin|Los Angeles|Master of Science/);
  }finally{env.restore()}
});

test('journal tracks use the real local materials directory and retain preview anchors outside trusted integration',async()=>{
  const env=await browser({reduced:true});
  try {
    const hrefs=()=>[...env.root.querySelectorAll('[data-journal-track]')].map(link=>link.getAttribute('href'));
    const original=env.api.practices.map(practice=>`/learning#track-${practice.id}`);
    assert.deepEqual(hrefs(),original);
    const marker=env.document.createElement('script');marker.id='site-integration';marker.type='application/json';
    marker.textContent=JSON.stringify({mode:'local',origin:'https://other.example'});env.document.head.append(marker);
    env.render();assert.deepEqual(hrefs(),original,'a foreign origin must not enable the local path adapter');
    marker.textContent=JSON.stringify({mode:'local',origin:env.window.location.origin});
    env.render();assert.deepEqual(hrefs(),env.api.practices.map(()=>'/learning'));
    assert.equal(env.root.querySelectorAll('a[href^="/learning#track-"]').length,0,'the actual catalog has no fabricated track anchors');
    marker.remove();env.render();assert.deepEqual(hrefs(),original,'the public visual preview keeps its existing topic destinations');
  }finally{env.restore()}
});

test('source reading offsets, paragraph rail and timeline progress are local and reject obsolete scroll callbacks',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();
    const lead=env.root.querySelector('[data-journal-story-lead]');const timeline=env.root.querySelector('[data-journal-timeline]');
    const reading=env.active().find(entry=>entry.config.trigger===lead);assert.ok(reading);assert.equal(reading.config.start,'top 85%');assert.equal(reading.config.end,'bottom 55%');assert.equal(reading.config.scrub,true);
    env.update(reading,.625);assert.equal(lead.style.getPropertyValue('--journal-reading'),'0.6250');
    const track=env.active().find(entry=>entry.config.trigger===timeline);assert.ok(track);assert.equal(track.config.start,'top 70%');assert.equal(track.config.end,'bottom 60%');
    env.update(track,.8);assert.equal(timeline.style.getPropertyValue('--journal-progress'),'0.8000');
    const rail=env.observers.find(observer=>observer.options.rootMargin);assert.ok(rail);
    const paragraph=env.root.querySelectorAll('[data-journal-paragraph]')[2];rail.callback([{target:paragraph,isIntersecting:true,intersectionRatio:1}]);
    assert.equal(env.root.querySelector('[data-journal-current]').style.getPropertyValue('--journal-index'),'2');
    controller.setActive(false);const value=lead.style.getPropertyValue('--journal-reading');env.update(reading,.1);assert.equal(lead.style.getPropertyValue('--journal-reading'),value);
  }finally{controller?.dispose();env.restore()}
});

test('paragraph rail caches paused updates and rebuilds its viewport-height band without accepting stale callbacks',async()=>{
  const env=await browser();let controller;
  try {
    Object.defineProperty(env.window,'innerHeight',{value:1000,writable:true,configurable:true});
    Object.defineProperty(env.window,'innerWidth',{value:1440,writable:true,configurable:true});
    const latestRail=()=>env.observers.findLast(observer=>observer.options.rootMargin);
    const deliver=(observer,target)=>observer.callback([{target,isIntersecting:true,intersectionRatio:1}]);
    const index=()=>env.root.querySelector('[data-journal-current]').style.getPropertyValue('--journal-index');
    controller=env.api.mountJournalExperience(env.root,{reduced:false});
    const initial=latestRail(),oldParagraphs=[...env.root.querySelectorAll('[data-journal-paragraph]')];
    deliver(initial,oldParagraphs[1]);assert.equal(index(),'1');
    controller.setActive(false);deliver(initial,oldParagraphs[2]);
    assert.equal(index(),'1','paused updates cache the paragraph without painting the counter');
    controller.setActive(true);assert.equal(index(),'2','resuming applies the latest paragraph without another IO event');
    assert.equal(initial.options.rootMargin,'-450px 0px -500px 0px','vertical margins use viewport height, independent of its 1440px width');

    controller.setActive(false);env.api.setLang('en');env.render();controller.refresh();
    const refreshed=latestRail(),paragraphs=[...env.root.querySelectorAll('[data-journal-paragraph]')];
    assert.notEqual(refreshed,initial);assert.equal(initial.targets.size,0);
    deliver(refreshed,paragraphs[1]);deliver(initial,oldParagraphs[2]);
    assert.equal(index(),'','refresh does not paint while disabled');
    controller.setActive(true);assert.equal(index(),'1','old content cannot replace the refreshed paragraph cache');

    controller.setActive(false);env.window.innerHeight=800;env.window.dispatchEvent(new env.window.Event('resize'));
    const resized=latestRail();assert.notEqual(resized,refreshed);assert.equal(refreshed.targets.size,0);
    assert.equal(resized.options.rootMargin,'-360px 0px -400px 0px');
    deliver(resized,paragraphs[2]);deliver(refreshed,paragraphs[0]);
    controller.setActive(true);assert.equal(index(),'2','a callback from the previous resize cannot overwrite the current band');
    controller.dispose();assert.equal(resized.targets.size,0);deliver(resized,paragraphs[0]);
    assert.equal(index(),'','disposed callbacks leave authored counter styles restored');
  }finally{controller?.dispose();env.restore()}
});

test('feature coalesces input, clamps source tilt at ten degrees and never starts an idle loop',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();const feature=env.root.querySelector('[data-journal-feature]');
    env.pointer();env.pointer();assert.equal(env.pending.size,1);env.flush();
    assert.equal(feature.style.getPropertyValue('--journal-rx'),'10.000deg');assert.equal(feature.style.getPropertyValue('--journal-ry'),'10.000deg');assert.ok(feature.hasAttribute('data-journal-pointer'));
    assert.equal(env.pending.size,0);env.pointer(900,-500);env.flush();assert.equal(feature.hasAttribute('data-journal-pointer'),false,'stale/out-of-bounds coordinates never tilt the cover');
    env.pointer(100,460);env.flush();assert.equal(feature.style.getPropertyValue('--journal-rx'),'-10.000deg');assert.equal(feature.style.getPropertyValue('--journal-ry'),'-10.000deg');
    env.window.dispatchEvent(new env.window.Event('scroll'));assert.equal(feature.style.getPropertyValue('--journal-rx'),'');
  }finally{controller?.dispose();env.restore()}
});

test('leaving the cover for a sibling within the page clears foil state and pending input',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();
    const feature=env.root.querySelector('[data-journal-feature]'),sibling=env.root.querySelector('h1');
    env.pointer(450,200);env.flush();assert.ok(feature.hasAttribute('data-journal-pointer'));
    const leave=new env.window.Event('pointerout',{bubbles:true});
    Object.defineProperty(leave,'relatedTarget',{value:sibling});feature.dispatchEvent(leave);
    assert.equal(feature.hasAttribute('data-journal-pointer'),false);assert.equal(feature.style.getPropertyValue('--journal-rx'),'');
    env.pointer(450,200);feature.dispatchEvent(leave);assert.equal(env.pending.size,0);
  }finally{controller?.dispose();env.restore()}
});

test('viewport exit, blur, hidden document, reduced motion, coarse pointer and overlays pause owned work',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();const feature=env.root.querySelector('[data-journal-feature]');
    const pause=()=>{assert.equal(env.pending.size,0);assert.equal(feature.hasAttribute('data-journal-pointer'),false);assert.equal(env.active().length,0);assert.equal(env.root.querySelector('[data-journal-page]').hasAttribute('data-journal-live'),false)};
    for(const [stop,resume] of [
      [()=>controller.setActive(false),()=>controller.setActive(true)],
      [()=>env.window.dispatchEvent(new env.window.Event('blur')),()=>env.window.dispatchEvent(new env.window.Event('focus'))],
      [()=>env.hidden(true),()=>env.hidden(false)],
      [()=>controller.setReduced(true),()=>controller.setReduced(false)],
      [()=>env.preference('(pointer: fine)',false),()=>env.preference('(pointer: fine)',true)],
    ]) {env.pointer(450,200);stop();pause();resume();assert.equal(env.pending.size,0,'resume needs fresh pointer input')}
    env.pointer(450,200);env.document.getElementById('main').setAttribute('inert','');await env.mutations();pause();
    env.document.getElementById('main').removeAttribute('inert');await env.mutations();
    env.enterAll();env.pointer(450,200);env.enter(feature,false);assert.equal(env.pending.size,0);assert.equal(feature.hasAttribute('data-journal-pointer'),false);
    env.observers.filter(observer=>!observer.options.rootMargin).forEach(observer=>observer.callback([...observer.targets].map(target=>({target,isIntersecting:false,intersectionRatio:0}))));assert.equal(env.active().length,0);
  }finally{controller?.dispose();env.restore()}
});

test('native focus reveals its pending milestone without moving focus or manufacturing a hover effect',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});const link=env.root.querySelector('[data-journal-milestone]');link.focus();
    assert.equal(env.document.activeElement,link);assert.ok(link.hasAttribute('data-journal-reached'));assert.equal(env.root.querySelector('[data-journal-pointer]'),null);
    const outside=env.document.getElementById('outside');outside.focus();controller.refresh();assert.equal(env.document.activeElement,outside);
  }finally{controller?.dispose();env.restore()}
});

test('journal atmosphere mounts once for an unchanged hero and releases replaced or removed hosts exactly once',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();
    assert.equal(env.ambients.length,1);const first=env.ambients[0];
    assert.equal(first.host,env.root.querySelector('[data-journal-ambient]'));assert.equal(first.disposed,0);
    controller.refresh();env.root.dispatchEvent(new env.window.CustomEvent('page:content',{bubbles:true}));
    assert.equal(env.ambients.length,1,'query/result refresh keeps the existing atmosphere instance');assert.equal(first.disposed,0);
    env.api.setLang('en');env.render();controller.refresh();env.enterAll();
    assert.equal(first.disposed,1);assert.equal(env.ambients.length,2);
    const second=env.ambients[1];assert.notEqual(second.host,first.host);assert.equal(second.host,env.root.querySelector('[data-journal-ambient]'));
    env.root.innerHTML='<section data-page="contact">Contact</section>';controller.refresh();
    assert.equal(second.disposed,1,'route replacement drops the old background before returning without a journal');
    assert.equal(env.ambients.length,2);controller.dispose();controller.dispose();
    assert.deepEqual(env.ambients.map(entry=>entry.disposed),[1,1],'disposing the page never disposes an already released atmosphere twice');
  }finally{controller?.dispose();env.restore()}
});

test('journal atmosphere follows shared activity, native visibility and live motion preference gates',async()=>{
  const env=await browser();let controller;
  try {
    controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();
    assert.equal(env.ambients.length,1);const ambient=env.ambients[0];
    assert.equal(ambient.paused,false);
    for(const [stop,resume] of [
      [()=>controller.setActive(false),()=>controller.setActive(true)],
      [()=>env.window.dispatchEvent(new env.window.Event('blur')),()=>env.window.dispatchEvent(new env.window.Event('focus'))],
      [()=>env.hidden(true),()=>env.hidden(false)],
      [()=>controller.setReduced(true),()=>controller.setReduced(false)],
      [()=>env.preference('(prefers-reduced-motion: reduce)',true),()=>env.preference('(prefers-reduced-motion: reduce)',false)],
      [()=>env.preference('(pointer: fine)',false),()=>env.preference('(pointer: fine)',true)],
    ]) {stop();assert.equal(ambient.paused,true);resume();assert.equal(ambient.paused,false)}
    const main=env.document.getElementById('main');main.setAttribute('inert','');await env.mutations();assert.equal(ambient.paused,true);
    main.removeAttribute('inert');await env.mutations();assert.equal(ambient.paused,false);
    env.root.hidden=true;await env.mutations();assert.equal(ambient.paused,true);
    env.root.hidden=false;await env.mutations();assert.equal(ambient.paused,false);
    assert.equal(env.ambients.length,1,'gate changes pause the existing atmosphere without rebuilding it');
    controller.dispose();assert.equal(ambient.disposed,1);
  }finally{controller?.dispose();env.restore()}
});

test('refresh and disposal release old nodes, observers, CSS state and queued callbacks without touching authored content',async()=>{
  const env=await browser();let controller;
  try {
    const original=env.root.innerHTML;controller=env.api.mountJournalExperience(env.root,{reduced:false});env.enterAll();env.pointer(450,200);const queued=[...env.pending.values()];const oldTriggers=env.active();
    env.api.setLang('en');env.render();const next=env.root.innerHTML;controller.refresh();assert.ok(oldTriggers.every(entry=>entry.killed));queued.forEach(callback=>callback(0));assert.equal(env.pending.size,0);
    assert.equal(env.root.querySelector('[data-journal-pointer]'),null);controller.dispose();controller.dispose();assert.equal(env.root.innerHTML,next);
    env.enterAll();controller.refresh();controller.setActive(true);assert.equal(env.active().length,0);assert.notEqual(original,next);
  }finally{controller?.dispose();env.restore()}
});

test('the pending cover remains geometrically observable before its clip reveal starts',async()=>{
  const css=await readFile(new URL('../src/journal-page.css',import.meta.url),'utf8');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([,selector])=>selector.includes('.journal-feature[data-journal-enter-state="pending"]'));
  assert.ok(rules.length>0);
  for(const [,selector,body] of rules) assert.doesNotMatch(body,/clip-path:\s*inset\([^;]*(?:100%|100vh)/, `${selector.trim()} must not clip the element to zero area before IntersectionObserver can start the reveal`);
});

test('journal styles are scoped, use existing tokens and preserve focus/reduced-motion readability without global media leakage',async()=>{
  const css=await readFile(new URL('../src/journal-page.css',import.meta.url),'utf8');
  assert.match(css,/\.journal-page/);assert.match(css,/var\(--accent\)/);assert.match(css,/var\(--display\)/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css,/(?:^|\})\s*(?:img|a|button|h1|\.feature-media)\s*\{/m);
  assert.doesNotMatch(css,/!important/);assert.doesNotMatch(css,/animation:[^;}]*infinite(?![^}]*paused)/);
});
