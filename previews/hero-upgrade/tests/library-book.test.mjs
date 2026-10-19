import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`export { mountLibraryBook } from './src/library-book';export { renderLibraryPage } from './src/library-page';export { setLang } from './src/i18n';`,resolveDir:sourceRoot},bundle:true,platform:'node',format:'esm',write:false,external:['./library-book-viewer']});
const {mountLibraryBook,renderLibraryPage,setLang}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
function fixture(load,language='zh') {
  const dom=new JSDOM('<html data-theme="light"><body><main></main></body></html>',{pretendToBeVisual:true});
  const win=dom.window, observers=[],media=[];
  win.IntersectionObserver=class {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  win.ResizeObserver=class {observe(){}disconnect(){}};
  win.matchMedia=()=>{const query={matches:false,addEventListener(_,cb){this.callback=cb;},removeEventListener(){}};media.push(query);return query;};
  const root=win.document.querySelector('main'),calls=[];
  const previousDocument=globalThis.document;
  try{globalThis.document=win.document;setLang(language);root.innerHTML=renderLibraryPage();}finally{globalThis.document=previousDocument;}
  const host=root.querySelector('[data-library-book]'),surface=host.querySelector('[data-library-book-canvas]');
  let now=1000,stateChange=()=>{};Object.defineProperty(win.performance,'now',{value:()=>now});
  const viewer={isOpen:false,canOpen:true,isTurning:false,currentPage:0,pageCount:6,hit:true,hitTest(){return this.hit;},nextPage(){if(this.isTurning||this.currentPage>=this.pageCount)return false;this.currentPage++;calls.push('next');return true;},previousPage(){if(this.isTurning||this.currentPage<=0)return false;this.currentPage--;calls.push('previous');return true;},dispose(){calls.push('dispose');},setActive(active){calls.push(['active',active]);},update(patch){calls.push(['update',patch]);},toggleOpen(){this.isOpen=!this.isOpen;calls.push('toggle');},setOpen(open){this.isOpen=open;if(!open)this.currentPage=0;calls.push(['open',open]);},resetCamera(){calls.push('reset');}};
  let creates=0,createdOptions;
  const controller=mountLibraryBook(root,load??(async()=>({createBookViewer(_surface,options){creates++;createdOptions=options;stateChange=options.onStateChange;return viewer;}})));
  return {dom,win,root,host,surface,calls,viewer,media,observers,controller,get creates(){return creates;},get createdOptions(){return createdOptions;},notify(){stateChange();},advance(ms){now+=ms;},key(key){const event=new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});surface.dispatchEvent(event);return event;},wheel(deltaY,extra={}){const event=new win.WheelEvent('wheel',{deltaY,clientX:100,clientY:100,bubbles:true,cancelable:true,...extra});surface.dispatchEvent(event);return event;},intersect(){observers[0].callback([{isIntersecting:true}]);},async settle(){await new Promise(resolve=>setTimeout(resolve,0));},close(){controller.dispose();dom.window.close();}};
}

test('production hero removes the auxiliary strip and keeps only a screen-reader status without caption space',async()=>{
  for(const language of ['zh','en']){
    const f=fixture(undefined,language);try{
      assert.equal(f.host.querySelector('figcaption,button'),null,'controls must be removed from the production DOM, not hidden by CSS');
      assert.equal(f.host.querySelector('[data-library-book-hint],[data-library-book-toggle],[data-library-book-reset],[data-library-book-pages]'),null);
      const status=f.host.querySelector('[data-library-book-status]');
      assert.equal(status.classList.contains('visually-hidden'),true);assert.equal(status.hidden,false);assert.equal(status.getAttribute('role'),'status');assert.equal(status.getAttribute('aria-live'),'polite');
      f.intersect();await f.settle();assert.equal(f.host.querySelector('figcaption,button'),null,'initialization must not recreate the strip');
    }finally{f.close();}
  }
  const css=await readFile(new URL('../src/library-page.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/library-object-caption|library-book-pages|data-library-book-reset|data-library-book-status/,'deleted strip styles must not reserve caption space');
  const sharedCSS=await readFile(new URL('../www/style.css',import.meta.url),'utf8');
  assert.match(sharedCSS,/\.visually-hidden\s*\{[^}]*position:\s*absolute/,'the status uses the existing out-of-flow accessibility utility');
});
test('3D book is lazy and does not replace the catalog destination',async()=>{
  const f=fixture();try{assert.equal(f.creates,0);f.intersect();await f.settle();assert.equal(f.creates,1);assert.equal(f.host.dataset.bookState,'ready');assert.ok(f.root.querySelector('a[href="#library-catalog"]'));assert.equal(f.root.querySelector('[data-library-book-fallback]').hidden,true);assert.equal(f.createdOptions.openOnClick,true);}finally{f.close();}
});
test('leaving while the module loads never constructs a detached viewer',async()=>{
  let finish,creates=0;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));try{f.intersect();f.controller.dispose();finish({createBookViewer(){creates++;return f.viewer;}});await f.settle();assert.equal(creates,0);assert.equal(f.observers[0].disconnected,true);}finally{f.close();}
});
test('WebGL failure retains a readable fallback and the catalog link',async()=>{
  const f=fixture(async()=>({createBookViewer(){throw new Error('WebGL unavailable');}}));try{f.intersect();await f.settle();assert.equal(f.host.dataset.bookState,'fallback');assert.equal(f.root.querySelector('[data-library-book-fallback]').hidden,false);assert.equal(f.host.querySelector('button'),null);assert.ok(f.root.querySelector('a[href="#library-catalog"]'));}finally{f.close();}
});
test('open, close, keyboard and reset expose the real viewer state',async()=>{
  const f=fixture();try{f.intersect();await f.settle();assert.equal(f.surface.tabIndex,0);assert.equal(f.surface.getAttribute('role'),'button');assert.equal(f.key('Enter').defaultPrevented,true);assert.equal(f.viewer.isOpen,true);assert.equal(f.surface.getAttribute('aria-pressed'),'true');assert.match(f.surface.getAttribute('aria-label'),/回车合上/);f.key(' ');assert.equal(f.viewer.isOpen,false);f.key('Enter');assert.equal(f.key('Home').defaultPrevented,true);assert.ok(f.calls.includes('reset'));assert.equal(f.surface.getAttribute('aria-pressed'),'false');}finally{f.close();}
});
test('canvas taps announce upstream state after raycast and leave drag input alone',async()=>{
  let f;f=fixture(async()=>({createBookViewer(surface){surface.addEventListener('pointerup',()=>f.viewer.toggleOpen());return f.viewer;}}));
  try{f.intersect();await f.settle();for(const expected of [true,false]){f.surface.dispatchEvent(new f.win.Event('pointerup'));await f.settle();assert.equal(f.viewer.isOpen,expected);assert.equal(f.surface.getAttribute('aria-pressed'),String(expected));}for(const type of ['pointerdown','pointermove']){const event=new f.win.Event(type,{cancelable:true});f.surface.dispatchEvent(event);assert.equal(event.defaultPrevented,false,'the lifecycle adapter leaves drag input to upstream');}}finally{f.close();}
});
test('hidden or inert pages suspend the viewer and cannot toggle it',async()=>{
  const f=fixture();try{f.intersect();await f.settle();f.root.setAttribute('inert','');await f.settle();assert.deepEqual(f.calls.at(-1),['active',false]);f.key('Enter');assert.equal(f.viewer.isOpen,false);f.root.removeAttribute('inert');await f.settle();assert.deepEqual(f.calls.at(-1),['active',true]);}finally{f.close();}
});
test('live reduced motion removes idle, pointer and opening motion',async()=>{
  const f=fixture();try{f.intersect();await f.settle();f.media[0].matches=true;f.media[0].callback();const patch=f.calls.findLast(call=>Array.isArray(call)&&call[0]==='update')[1];assert.equal(patch.idleSway,false);assert.equal(patch.pointerParallax,false);assert.equal(patch.openSpeed,Infinity);}finally{f.close();}
});
test('dispose is idempotent and releases the renderer exactly once',async()=>{
  const f=fixture();try{f.intersect();await f.settle();f.controller.dispose();f.controller.dispose();f.key('Enter');assert.equal(f.calls.filter(call=>call==='dispose').length,1);assert.equal(f.viewer.isOpen,false);}finally{f.close();}
});
test('wheel paging belongs only to the open book under the pointer',async()=>{
  const f=fixture();try{f.intersect();await f.settle();assert.equal(f.wheel(120).defaultPrevented,false);f.key('Enter');f.viewer.hit=false;assert.equal(f.wheel(120).defaultPrevented,false);f.viewer.hit=true;assert.equal(f.wheel(120,{ctrlKey:true}).defaultPrevented,false);assert.equal(f.wheel(120,{metaKey:true}).defaultPrevented,false);assert.equal(f.wheel(10,{deltaX:100}).defaultPrevented,false);assert.equal(f.wheel(120).defaultPrevented,true);assert.equal(f.viewer.currentPage,1);f.root.setAttribute('inert','');assert.equal(f.wheel(120).defaultPrevented,false);}finally{f.close();}
});
test('trackpad threshold, animation guard and cooldown do not queue page turns',async()=>{
  const f=fixture();try{f.intersect();await f.settle();f.key('Enter');assert.equal(f.wheel(14).defaultPrevented,true);f.wheel(14);assert.equal(f.viewer.currentPage,0);f.wheel(22);assert.equal(f.viewer.currentPage,1);f.wheel(120);assert.equal(f.viewer.currentPage,1);f.viewer.isTurning=true;f.advance(800);assert.equal(f.wheel(120).defaultPrevented,true);assert.equal(f.viewer.currentPage,1);f.viewer.isTurning=false;f.advance(240);f.wheel(120);assert.equal(f.viewer.currentPage,2);assert.equal(f.calls.filter(call=>call==='next').length,2);}finally{f.close();}
});
test('wheel boundaries release page scrolling and pointer exit clears the gesture',async()=>{
  const f=fixture();try{f.intersect();await f.settle();f.key('Enter');assert.equal(f.wheel(-120).defaultPrevented,false);f.wheel(25);f.root.querySelector('[data-library-book-canvas]').dispatchEvent(new f.win.Event('pointerleave'));f.wheel(25);assert.equal(f.viewer.currentPage,0);f.viewer.currentPage=6;f.notify();assert.equal(f.wheel(120).defaultPrevented,false);f.advance(800);assert.equal(f.wheel(-120).defaultPrevented,true);assert.equal(f.viewer.currentPage,5);}finally{f.close();}
});
test('keyboard and async page turns announce state without auxiliary controls',async()=>{
  for(const language of ['zh','en']){
    const f=fixture(undefined,language);try{f.intersect();await f.settle();const status=f.host.querySelector('[data-library-book-status]');assert.equal(status.classList.contains('visually-hidden'),true);assert.match(status.textContent,language==='zh'?/已合上/:/closed/i);f.key('Enter');assert.equal(f.key('ArrowRight').defaultPrevented,true);assert.equal(f.viewer.currentPage,1);assert.match(status.textContent,/1 \/ 6/);f.key('ArrowLeft');assert.equal(f.viewer.currentPage,0);f.key('ArrowRight');f.viewer.isTurning=true;f.notify();f.key('ArrowRight');assert.equal(f.viewer.currentPage,1);f.viewer.isTurning=false;f.viewer.currentPage=6;f.notify();assert.match(status.textContent,/6 \/ 6/);f.key('ArrowRight');assert.equal(f.viewer.currentPage,6);f.key('Home');assert.equal(f.viewer.currentPage,0);assert.match(status.textContent,language==='zh'?/已合上/:/closed/i);assert.equal(f.host.querySelector('button,figcaption'),null);}finally{f.close();}
  }
});
