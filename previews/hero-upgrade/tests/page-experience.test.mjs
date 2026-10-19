import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

let compiled;
async function load() {
  compiled ||= build({
    stdin: { contents: 'export {mountPageExperience} from "./src/page-experience.ts";', resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'page-gsap', setup(builder) {
      builder.onResolve({ filter: /^gsap$/ }, () => ({ path: 'gsap', namespace: 'page-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'page-test' }, () => ({ contents: 'export default {timeline(options){return globalThis.__pageHarness.timeline(options)}};' }));
    } }],
  });
  const result = await compiled;
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

function browser({ reduced = false, fine = true } = {}) {
  const dom = new JSDOM('<!doctype html><main id="view-page"><div class="page" data-page="blog"><header data-page-reveal><h1>真实文章</h1></header><section id="posts" data-page-reveal><article class="post"><a id="post" href="/blog/real-post" data-post="0" data-page-card><div class="post-media"><img src="/media/real-cover" alt="原封面"></div><h2>真实标题</h2></a></article><a id="feature" class="feature" href="/blog/featured" data-page-card><div class="feature-media"><img src="/media/feature" alt="精选封面"></div><b>精选文章</b></a></section><section id="info" data-page-reveal><article class="system" data-page-card><h2>筹备中</h2><p>内容说明</p></article><a id="row" class="other" href="/work" data-page-card>作品 · 整理中</a></section><div class="field"><input type="search" aria-label="搜索"></div></div></main>', { url: 'http://127.0.0.1:4285/blog', pretendToBeVisual: true });
  const { window } = dom, { document } = window, root = document.getElementById('view-page');
  const names = ['window','document','Element','HTMLElement','IntersectionObserver','MutationObserver','requestAnimationFrame','cancelAnimationFrame','matchMedia','__pageHarness'];
  const saved = new Map(names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const media = new Map(), observers = [], pending = new Map(), timelines = [], operations = [], boxes = new Map();
  let sequence = 0, hidden = false, hit = root;
  document.hasFocus = () => true;
  Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
  document.elementFromPoint = () => hit;
  root.querySelectorAll('[data-page-card]').forEach((card,index) => boxes.set(card,{left:100+index*320,top:100,width:300,height:200}));
  window.HTMLElement.prototype.getBoundingClientRect = function () { operations.push(['read',this]); return boxes.get(this) ?? {left:0,top:0,width:1000,height:700}; };
  const originalSet = window.CSSStyleDeclaration.prototype.setProperty;
  window.CSSStyleDeclaration.prototype.setProperty = function (key,value,priority) { if(key.startsWith('--page-')) operations.push(['write',key]); return originalSet.call(this,key,value,priority); };
  const preference = query => {
    if(!media.has(query)) media.set(query,Object.assign(new window.EventTarget(),{matches:query.includes('fine')?fine:reduced,media:query}));
    return media.get(query);
  };
  const targets = value => value instanceof window.Element ? [value] : Array.from(value ?? []);
  const apply = (target,vars) => targets(target).forEach(element=>{
    if('y' in vars) element.style.transform=`translateY(${vars.y}px)`;
    if('opacity' in vars) element.style.opacity=String(vars.opacity);
  });
  const globals = {
    window,document,Element:window.Element,HTMLElement:window.HTMLElement,MutationObserver:window.MutationObserver,matchMedia:preference,
    requestAnimationFrame(callback){const id=++sequence;pending.set(id,callback);return id},cancelAnimationFrame(id){pending.delete(id)},
    IntersectionObserver:class {constructor(callback,options){this.callback=callback;this.options=options;this.targets=new Set();observers.push(this)}observe(target){this.targets.add(target)}disconnect(){this.targets.clear()}},
    __pageHarness:{timeline(options){const timeline={options,killed:false,calls:[],fromTo(target,from,to){this.calls.push({target,from,to});apply(target,from);return this},kill(){this.killed=true},finish(){if(!this.killed)this.calls.forEach(call=>apply(call.target,call.to));this.options.onComplete?.()}};timelines.push(timeline);return timeline}},
  };
  for(const [name,value] of Object.entries(globals)) Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  return {root,window,document,pending,timelines,observers,operations,boxes,
    enter(target,visible=true,ratio=.8){observers.forEach(observer=>{if(observer.targets.has(target))observer.callback([{target,isIntersecting:visible,intersectionRatio:visible?ratio:0}])})},
    enterAll(){observers.forEach(observer=>observer.callback([...observer.targets].map(target=>({target,isIntersecting:true,intersectionRatio:.8}))))},
    pointer(target,x=325,y=250,pointerType='mouse'){hit=target;const event=new window.Event('pointermove',{bubbles:true});Object.defineProperties(event,{clientX:{value:x},clientY:{value:y},pointerType:{value:pointerType}});target.dispatchEvent(event)},
    hit(target){hit=target},
    flush(){const queue=[...pending.values()];pending.clear();queue.forEach(callback=>callback(0))},
    preference(query,value){const item=preference(query);item.matches=value;item.dispatchEvent(new window.Event('change'))},
    hidden(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'))},
    restore(){dom.window.close();for(const [name,value] of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]},
  };
}

const clearPointer = env => {
  assert.equal(env.root.querySelector('[data-page-spot-active],[data-page-tilt]'),null);
  env.root.querySelectorAll('[data-page-card]').forEach(card=>{
    for(const key of ['--page-mx','--page-my','--page-px','--page-py']) assert.equal(card.style.getPropertyValue(key),'');
  });
  assert.equal(env.pending.size,0);
};

test('page adapter preserves authored content, native actions and informational cards with idempotent decoration',async()=>{
  const env=browser();let controller;
  try {
    const html=env.root.innerHTML,links=[...env.root.querySelectorAll('a')].map(a=>[a.textContent,a.href,a.tabIndex]);
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});controller.refresh();controller.refresh();
    assert.deepEqual([...env.root.querySelectorAll('a')].map(a=>[a.textContent,a.href,a.tabIndex]),links);
    assert.equal(env.root.querySelectorAll('.page-card-light').length,4);
    assert.ok([...env.root.querySelectorAll('.page-card-light')].every(el=>el.getAttribute('aria-hidden')==='true'));
    assert.equal(env.root.querySelector('.system').querySelector('a,button,[tabindex]'),null);
    assert.equal(env.root.querySelector('canvas'),null);assert.equal(env.root.querySelectorAll('input').length,1);
    controller.dispose();assert.equal(env.root.innerHTML,html,'dispose removes only the adapter-owned additions');
  } finally {controller?.dispose();env.restore()}
});

test('group reveal uses the source threshold and fade-up once, preserving authored styles after completion',async()=>{
  const env=browser();let controller;
  try {
    const group=env.document.querySelector('#posts');group.style.opacity='.95';group.style.transform='translateX(2px)';
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});
    assert.equal(env.observers[0].options.rootMargin,'0px 0px -40px 0px');
    assert.equal(group.dataset.pageState,'pending');env.enter(group,true,.19);assert.equal(env.timelines.length,0);
    env.enter(group,true,.2);assert.equal(env.timelines.length,1);const entry=env.timelines[0],call=entry.calls[0];
    assert.deepEqual(call.from,{opacity:0,y:16});assert.equal(call.to.duration,.5);assert.equal(call.to.ease,'expo.out');
    entry.finish();assert.equal(group.dataset.pageState,'done');assert.equal(group.style.opacity,'0.95');assert.equal(group.style.transform,'translateX(2px)');
    controller.refresh();env.enter(group,false);env.enter(group);assert.equal(env.timelines.length,1);
  } finally {controller?.dispose();env.restore()}
});

test('spotlight batches group geometry before writes and cover parallax is local and bounded',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});env.enterAll();
    const post=env.document.querySelector('#post'),feature=env.document.querySelector('#feature');env.operations.length=0;
    env.pointer(post);env.pointer(post);assert.equal(env.pending.size,1);env.flush();
    assert.equal(post.style.getPropertyValue('--page-mx'),'225.0px');assert.equal(feature.style.getPropertyValue('--page-mx'),'-95.0px');
    assert.equal(Number(post.style.getPropertyValue('--page-px')),.25);assert.equal(Number(post.style.getPropertyValue('--page-py')),.25);
    const firstWrite=env.operations.findIndex(([type])=>type==='write');assert.ok(firstWrite>0);assert.ok(env.operations.slice(firstWrite).every(([type])=>type!=='read'));
    assert.equal(post.hasAttribute('data-page-tilt'),true);assert.equal(feature.hasAttribute('data-page-tilt'),false);
    env.pointer(post,3000,-2000);env.flush();assert.equal(post.style.getPropertyValue('--page-px'),'','coordinates outside the actual card cannot tilt it');
    env.pointer(post,400,300);env.flush();assert.equal(Number(post.style.getPropertyValue('--page-px')),.5);assert.equal(Number(post.style.getPropertyValue('--page-py')),.5);
    assert.equal(env.pending.size,0,'the adapter has no idle animation loop');
  } finally {controller?.dispose();env.restore()}
});

test('keyboard focus reveals a pending group immediately without moving focus or enabling pointer effects',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});
    const link=env.document.querySelector('#post'),group=env.document.querySelector('#posts');link.focus();
    assert.equal(env.document.activeElement,link);assert.equal(group.dataset.pageState,'done');assert.equal(env.timelines.length,0);clearPointer(env);
    controller.refresh();assert.equal(env.document.activeElement,link);assert.equal(group.dataset.pageState,'done');
    env.enter(group);assert.equal(env.timelines.length,0,'keyboard-revealed content never disappears into a later entrance');
  } finally {controller?.dispose();env.restore()}
});

test('leaving the viewport or scrolling clears pointer work and an interrupted reveal settles once',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});env.enterAll();
    const post=env.document.querySelector('#post'),group=env.document.querySelector('#posts'),entry=env.timelines.find(item=>item.calls[0].target===group);
    env.pointer(post);env.flush();env.enter(post,false);clearPointer(env);
    env.enter(group,false);assert.equal(entry.killed,true);assert.equal(group.style.opacity,'');assert.equal(group.style.transform,'');assert.equal(group.dataset.pageState,'done');
    env.enter(post);env.enter(group);env.pointer(post);env.window.dispatchEvent(new env.window.Event('scroll'));clearPointer(env);
    env.flush();clearPointer(env);assert.equal(env.timelines.filter(item=>item.calls[0].target===group).length,1);
  } finally {controller?.dispose();env.restore()}
});

test('overlay, blur, hidden document and pointer preferences settle entrances and require fresh pointer input',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});env.enterAll();const post=env.document.querySelector('#post');
    const gates=[
      [()=>controller.setActive(false),()=>controller.setActive(true)],
      [()=>env.window.dispatchEvent(new env.window.Event('blur')),()=>env.window.dispatchEvent(new env.window.Event('focus'))],
      [()=>env.hidden(true),()=>env.hidden(false)],
      [()=>env.preference('(prefers-reduced-motion: reduce)',true),()=>env.preference('(prefers-reduced-motion: reduce)',false)],
      [()=>env.preference('(pointer: fine)',false),()=>env.preference('(pointer: fine)',true)],
    ];
    for(const [pause,resume] of gates){env.pointer(post);env.flush();assert.equal(post.hasAttribute('data-page-tilt'),true);pause();clearPointer(env);resume();env.flush();clearPointer(env)}
    env.pointer(post,325,250,'touch');env.flush();clearPointer(env);
    assert.ok(env.timelines.every(entry=>entry.killed),'all in-flight reveals settle while backgrounded');
    assert.ok([...env.root.querySelectorAll('[data-page-reveal]')].every(group=>group.dataset.pageState==='done' && group.style.opacity!== '0'));
  } finally {controller?.dispose();env.restore()}
});

test('reduced motion and coarse pointers keep all content readable and perform no decorative scheduling',async()=>{
  for(const options of [{reduced:true},{fine:false}]) {
    const env=browser(options);let controller;
    try {
      const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:!!options.reduced});env.enterAll();env.pointer(env.document.querySelector('#post'));env.flush();
      assert.equal(env.timelines.length,0);clearPointer(env);assert.equal(env.root.hasAttribute('data-page-live'),false);
      assert.ok([...env.root.querySelectorAll('[data-page-reveal]')].every(group=>group.dataset.pageState==='done'));
    } finally {controller?.dispose();env.restore()}
  }
});

test('page content refresh drops removed nodes and queued callbacks, then discovers newly filtered cards',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});env.enterAll();const group=env.document.querySelector('#posts'),old=env.document.querySelector('#post'),oldEntry=env.timelines.find(item=>item.calls[0].target===group);
    env.pointer(old);env.flush();
    group.outerHTML='<section id="filtered" data-page-reveal><a id="new" href="/blog/new" data-page-card><div class="post-media"><img src="/media/new"></div>筛选结果</a></section>';
    env.root.dispatchEvent(new env.window.CustomEvent('page:content',{bubbles:true}));
    assert.equal(old.style.getPropertyValue('--page-mx'),'');assert.equal(old.querySelector('.page-card-light'),null);assert.equal(oldEntry.killed,true);
    oldEntry.options.onComplete?.();assert.equal(group.hasAttribute('data-page-state'),false,'late completion cannot mutate detached content after refresh');
    const next=env.document.querySelector('#new'),nextGroup=env.document.querySelector('#filtered');env.boxes.set(next,{left:100,top:100,width:300,height:200});env.enter(next);env.enter(nextGroup);env.pointer(next);env.flush();
    assert.equal(next.style.getPropertyValue('--page-mx'),'225.0px');assert.equal(next.querySelectorAll('.page-card-light').length,1);
    controller.refresh();assert.equal(nextGroup.dataset.pageState,'done','a running current-node entrance is settled instead of replayed by refresh');
  } finally {controller?.dispose();env.restore()}
});

test('hidden roots and disposal reject pending input, restore owned styles and cannot be revived',async()=>{
  const env=browser();let controller;
  try {
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});env.enterAll();const post=env.document.querySelector('#post');
    env.pointer(post);env.root.setAttribute('inert','');env.flush();clearPointer(env);env.root.removeAttribute('inert');
    controller.refresh();env.enterAll();env.pointer(post);controller.dispose();controller.dispose();clearPointer(env);
    assert.equal(env.root.querySelector('.page-card-light'),null);assert.equal(env.root.querySelector('[data-page-state],[data-page-cover]'),null);assert.equal(env.root.hasAttribute('data-page-live'),false);
    const count=env.timelines.length;controller.refresh();controller.setActive(true);env.enterAll();env.pointer(post);env.hidden(true);env.hidden(false);env.flush();
    clearPointer(env);assert.equal(env.timelines.length,count);
  } finally {controller?.dispose();env.restore()}
});

test('page styles retain native focus feedback and gate source cover motion by the live state',async()=>{
  const css=await readFile(new URL('../src/page-experience.css',import.meta.url),'utf8');
  assert.match(css,/:focus-visible/);assert.match(css,/\[data-page-live\][^{]*\[data-page-tilt\]/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);assert.match(css,/pointer:\s*coarse/);
  assert.doesNotMatch(css,/\b(?:input|textarea)\b[^{}]*\{[^}]*(?:outline|box-shadow)\s*:/,'card styling does not add a second input focus ring');
});

test('offscreen or backgrounded cards settle their cover and light without a trailing CSS transition',async()=>{
  const env=browser();let controller;
  try {
    const style=env.document.createElement('style');style.textContent=await readFile(new URL('../src/page-experience.css',import.meta.url),'utf8');env.document.head.append(style);
    const {mountPageExperience}=await load();controller=mountPageExperience(env.root,{reduced:false});
    const post=env.document.querySelector('#post'),cover=post.querySelector('img'),light=post.querySelector('.page-card-light');
    assert.equal(env.window.getComputedStyle(cover).transition,'none','a card outside the IO viewport cannot run a cover return transition');
    env.enter(post);assert.match(env.window.getComputedStyle(cover).transition,/scale/);assert.match(env.window.getComputedStyle(light).transition,/opacity/);
    env.enter(post,false);assert.equal(env.window.getComputedStyle(cover).transition,'none');assert.equal(env.window.getComputedStyle(light).transition,'none');
    env.enter(post);controller.setActive(false);assert.equal(env.window.getComputedStyle(cover).transition,'none');assert.equal(env.window.getComputedStyle(light).transition,'none');
  } finally {controller?.dispose();env.restore()}
});
