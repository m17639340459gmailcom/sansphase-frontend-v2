import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

let compiled;
async function load() {
  compiled ||= build({ entryPoints: [fileURLToPath(new URL('../src/home-sections.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  const result = await compiled;
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}
function browser() {
  const dom = new JSDOM('<main id="home"><div class="community-grid"><article class="club">筹备中</article><div class="boards"><article class="board">学习问答</article></div></div><div id="log"><div id="log-grid" tabindex="0"><div class="log-cols"><span class="log-day" title="2026-10-01 · 发布文章"></span><span class="log-day" title="2026-10-02"></span></div></div></div><div id="posts"><article class="post"><a href="/blog/real-post" data-post="0"><div class="post-media"><img src="/media/real-cover"></div><h3>真实文章</h3></a></article></div><div class="archive"><div id="archive-map"><i></i><i></i></div><ol id="archive-list"><li><a href="/blog" data-i="0">博客</a></li><li><a href="/work" data-i="1">作品 · 整理中</a></li></ol></div><div id="marquee-giant"><span class="giant-word">AI 影像</span></div></main>', { url: 'http://127.0.0.1:4285/', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const names = ['window','document','Element','HTMLElement','HTMLButtonElement','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','matchMedia'];
  const saved = new Map(names.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const word = document.querySelector('.giant-word'); word.innerHTML = '<span class="o">AI 影像</span><span class="f" aria-hidden="true">AI 影像</span>';
  let sequence = 0, hit = document.getElementById('home'), wordLeft = 40, glowOffset = 16;
  const pending = new Map(), observers = [], media = new Map();
  Object.defineProperty(document,'hasFocus',{value:()=>true});
  document.elementFromPoint = () => hit;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('giant-word')) return { left: wordLeft, top: 30, width: 120, height: 60, right: wordLeft+120, bottom: 90 };
    if (this.classList.contains('f')) return { left: wordLeft+glowOffset, top: 30, width: 120, height: 60, right: wordLeft+glowOffset+120, bottom: 90 };
    const left = this.classList.contains('board') ? 300 : 100;
    return { left, top: 100, width: 300, height: 200, right: left+300, bottom: 300 };
  };
  const preference = q => {
    if (!media.has(q)) media.set(q,Object.assign(new window.EventTarget(),{ matches:q.includes('fine'),media:q }));
    return media.get(q);
  };
  const globals = { window, document, Element:window.Element, HTMLElement:window.HTMLElement, HTMLButtonElement:window.HTMLButtonElement, matchMedia:preference,
    requestAnimationFrame(fn){const id=++sequence;pending.set(id,fn);return id},cancelAnimationFrame(id){pending.delete(id)},
    IntersectionObserver:class {constructor(fn){this.fn=fn;this.targets=[];observers.push(this)}observe(el){this.targets.push(el)}disconnect(){this.targets=[]}} };
  for(const [name,value] of Object.entries(globals)) Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  const root=document.getElementById('home');
  return { root,window,document,pending,
    enter(){for(const observer of observers) observer.fn(observer.targets.map(target=>({target,isIntersecting:true,intersectionRatio:.8})))},
    intersection(target,isIntersecting,intersectionRatio=isIntersecting?.8:0){for(const observer of observers) observer.fn([{target,isIntersecting,intersectionRatio}])},
    pointer(el,x=230,y=170){hit=el;const e=new window.Event('pointermove',{bubbles:true});Object.defineProperties(e,{clientX:{value:x},clientY:{value:y},pointerType:{value:'mouse'}});el.dispatchEvent(e)},
    leave(el){el.dispatchEvent(new window.Event('pointerleave'))},
    flush(){const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn(0))},
    preference(q,value){const item=preference(q);item.matches=value;item.dispatchEvent(new window.Event('change'))},
    moveWord(left){wordLeft=left},moveGlowOffset(offset){glowOffset=offset},hit(el){hit=el},
    restore(){dom.window.close();for(const [name,value] of saved) if(value) Object.defineProperty(globalThis,name,value);else delete globalThis[name]}
  };
}
test('tail enhancement preserves real content and URLs, distinguishes informational cards from actions',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});controller.refresh();
    assert.equal(env.root.querySelector('#posts a').getAttribute('href'),'/blog/real-post');
    assert.equal(env.root.querySelector('#posts a').dataset.cursor,'read');
    assert.equal(env.root.querySelector('.board a,.board button,.club a,.club button'),null);
    assert.match(env.root.querySelector('.club').textContent,/筹备中/);
    assert.equal(env.root.querySelectorAll('.home-post-glare').length,1);
    assert.equal(env.root.querySelectorAll('.log-readout').length,1);
    controller.refresh();assert.equal(env.root.querySelectorAll('.home-post-glare').length,1);
  }finally{controller?.dispose();env.restore()}
});
test('post cover parallax and group spotlight use local coordinates and clear on leave or deactivation',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});env.enter();
    const link=env.root.querySelector('#posts a');env.pointer(link,325,250);env.flush();
    assert.equal(Number(link.style.getPropertyValue('--px')),.25);
    assert.equal(Number(link.style.getPropertyValue('--py')),.25);
    assert.ok(link.hasAttribute('data-tilt'));
    assert.equal(link.style.getPropertyValue('--mx'),'225.0px');
    env.leave(env.root.querySelector('#posts'));assert.equal(link.hasAttribute('data-tilt'),false);
    const board=env.root.querySelector('.board');env.pointer(board,325,200);env.flush();
    assert.equal(board.style.getPropertyValue('--mx'),'25.0px');
    controller.setActive(false);assert.equal(env.pending.size,0);assert.equal(board.style.getPropertyValue('--mx'),'');
    controller.setActive(true);env.flush();assert.equal(board.style.getPropertyValue('--mx'),'');
  }finally{controller?.dispose();env.restore()}
});
test('publishing days provide immediate real date feedback and a single roving keyboard stop',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});
    const days=[...env.root.querySelectorAll('.log-day')];assert.ok(days.every(day=>day.tagName==='BUTTON'));
    assert.equal(days.filter(day=>day.tabIndex===0).length,1);
    days[0].focus();assert.equal(env.root.querySelector('.log-readout').textContent,'2026-10-01 · 发布文章');
    days[0].dispatchEvent(new env.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    assert.equal(env.document.activeElement,days[1]);assert.equal(env.root.querySelector('.log-readout').textContent,'2026-10-02');
    env.leave(env.root);assert.equal(env.root.querySelector('.log-readout').hidden,false,'a mouse leaving the page does not remove keyboard date inspection');
    controller.setActive(false);env.leave(env.root);assert.equal(env.root.querySelector('.log-readout').hidden,true,'an inactive background must clear date inspection');
    assert.equal(env.root.querySelector('#log a'),null,'date selection does not invent a content destination');
  }finally{controller?.dispose();env.restore()}
});
test('moving marquee keeps its spotlight under a stationary pointer and lifecycle gates clean every layer',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});env.enter();
    const row=env.root.querySelector('#marquee-giant'),word=row.querySelector('.f');env.pointer(row,130,70);controller.tick();
    assert.equal(word.style.getPropertyValue('--mx'),'74.0px');env.moveWord(20);controller.tick();assert.equal(word.style.getPropertyValue('--mx'),'94.0px');
    env.moveGlowOffset(30);controller.tick();assert.equal(word.style.getPropertyValue('--mx'),'80.0px','the mask must use its actual layer position instead of a fixed 16px correction');
    env.window.dispatchEvent(new env.window.Event('blur'));assert.equal(word.style.getPropertyValue('--mx'),'');
    env.window.dispatchEvent(new env.window.Event('focus'));controller.tick();assert.equal(word.style.getPropertyValue('--mx'),'');
    env.preference('(prefers-reduced-motion: reduce)',true);env.pointer(row);controller.tick();assert.equal(word.style.getPropertyValue('--mx'),'');
    controller.dispose();env.pointer(row);env.flush();assert.equal(env.pending.size,0);
  }finally{controller?.dispose();env.restore()}
});

test('a pointer received before intersection observation paints when the group becomes visible',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});
    const link=env.root.querySelector('#posts a');env.pointer(link,325,250);env.flush();
    assert.equal(link.style.getPropertyValue('--mx'),'');
    env.intersection(env.root.querySelector('#posts'),true);env.flush();
    assert.equal(link.style.getPropertyValue('--mx'),'225.0px','IO entering must repaint a pointer already resting on this group');
    env.intersection(env.root.querySelector('#posts'),false);env.flush();
    assert.equal(link.style.getPropertyValue('--mx'),'');assert.equal(link.hasAttribute('data-tilt'),false);
  }finally{controller?.dispose();env.restore()}
});

test('refresh clamps a shortened publishing log to one keyboard stop and retains focused feedback',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});
    let days=[...env.root.querySelectorAll('.log-day')];days[1].focus();
    controller.refresh();assert.equal(env.root.querySelector('.log-readout').hidden,false,'refreshing retained buttons must preserve their focused date feedback');
    days[1].remove();controller.refresh();days=[...env.root.querySelectorAll('.log-day')];
    assert.equal(days.filter(day=>day.tabIndex===0).length,1,'removing the selected final date must not remove the only Tab entry');
    assert.equal(days[0].tabIndex,0);
    controller.refresh();assert.equal(env.root.querySelectorAll('.log-readout').length,1);
  }finally{controller?.dispose();env.restore()}
});

test('focused archive feedback survives pointer leave and disabled home ignores stale delegated input',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});env.enter();
    const link=env.root.querySelector('#archive-list a');link.focus();
    assert.ok(env.root.querySelector('#archive-map i').classList.contains('is-hot'));
    env.pointer(link,250,170);env.flush();env.leave(env.root.querySelector('.archive'));
    assert.ok(env.root.querySelector('#archive-map i').classList.contains('is-hot'),'leaving with the mouse must not erase a keyboard-focused route');
    controller.setActive(false);
    env.root.querySelector('#archive-list a:last-child').focus();
    assert.equal(env.root.querySelector('#archive-map .is-hot'),null,'disabled backgrounds must not restore keyboard decoration');
    const days=[...env.root.querySelectorAll('.log-day')];days[0].focus();
    days[0].dispatchEvent(new env.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
    assert.equal(env.document.activeElement,days[0]);assert.equal(env.root.querySelector('.log-readout').hidden,true);
  }finally{controller?.dispose();env.restore()}
});

test('reduced motion retains native date inspection, modifier shortcuts, and disposal rejects late work',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:true});env.enter();
    assert.equal(env.root.hasAttribute('data-tail-live'),false,'reduced motion leaves every reveal readable without entrance gating');
    const board=env.root.querySelector('.board');env.pointer(board);env.flush();assert.equal(board.style.getPropertyValue('--mx'),'');
    const days=[...env.root.querySelectorAll('.log-day')];days[0].focus();assert.equal(env.root.querySelector('.log-readout').hidden,false);
    const shortcut=new env.window.KeyboardEvent('keydown',{key:'End',ctrlKey:true,bubbles:true,cancelable:true});days[0].dispatchEvent(shortcut);
    assert.equal(shortcut.defaultPrevented,false);assert.equal(env.document.activeElement,days[0]);
    days[0].dispatchEvent(new env.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(env.document.activeElement,days[1]);
    env.root.querySelector('#archive-list a').focus();controller.dispose();controller.dispose();
    assert.equal(env.root.querySelector('#archive-map .is-hot'),null);assert.equal(env.root.querySelector('.log-readout').hidden,true);
    board.removeAttribute('data-tail-entered');env.intersection(board,true);env.pointer(board);controller.refresh();controller.tick();env.flush();
    assert.equal(board.hasAttribute('data-tail-entered'),false);assert.equal(env.pending.size,0);assert.equal(env.root.hasAttribute('data-tail-live'),false);
  }finally{controller?.dispose();env.restore()}
});

test('reduced motion retains mouse date inspection without scheduling decorative work',async()=>{
  const env=browser();let controller;
  try{const {mountHomeSections}=await load();env.preference('(prefers-reduced-motion: reduce)',true);controller=mountHomeSections(env.root,{reduced:true});env.enter();
    const day=env.root.querySelector('.log-day'),readout=env.root.querySelector('.log-readout');
    env.pointer(day);
    assert.equal(readout.hidden,false,'a mouse user must be able to inspect a date while motion is reduced');
    assert.equal(readout.textContent,day.getAttribute('aria-label'));
    assert.equal(env.pending.size,0,'date inspection does not need an animation frame');
    const link=env.root.querySelector('#posts a'),board=env.root.querySelector('.board');
    env.pointer(link);env.pointer(board);
    assert.equal(link.hasAttribute('data-tilt'),false);
    assert.equal(board.style.getPropertyValue('--mx'),'');
    assert.equal(env.root.querySelector('[data-home-spot-active]'),null);
    assert.equal(env.pending.size,0);
    assert.equal(readout.hidden,true,'leaving the date clears pointer feedback');
  }finally{controller?.dispose();env.restore()}
});

test('community board styling preserves the computed entrance transitions',async()=>{
  const env=browser();let controller;
  try{const style=env.document.createElement('style');style.textContent=await readFile(new URL('../src/home-sections.css',import.meta.url),'utf8');env.document.head.append(style);
    const {mountHomeSections}=await load();controller=mountHomeSections(env.root,{reduced:false});
    const transition=env.window.getComputedStyle(env.root.querySelector('.board')).transition;
    for(const property of ['opacity','transform','clip-path']) assert.match(transition,new RegExp('(?:^|,)\\s*'+property+'\\b'),'board hover styling must preserve '+property+' entrance animation');
  }finally{controller?.dispose();env.restore()}
});
