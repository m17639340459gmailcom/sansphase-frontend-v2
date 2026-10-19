import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=await readFile(new URL('../www/index.html',import.meta.url),'utf8');
const compiled=await build({entryPoints:[root+'/src/hero.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'scene-boundary',setup(p){
 p.onResolve({filter:/^\.\/scene$/},()=>({path:'scene',namespace:'probe'}));
 p.onLoad({filter:/.*/,namespace:'probe'},()=>({contents:`export function mountScene(c,o){const p=globalThis.__heroProbe;p.options=o;return {select(i){p.selected.push(i)},setPaused(v){p.paused=v},setTheme(){},setActive(v){p.active=v},resize(){},dispose(){p.disposed++},getState(){return p.state}}}`}));
 p.onLoad({filter:/[\\/]src[\\/]ambient\.ts$/},()=>({contents:'export const mountAmbient=()=>({setPaused(v){globalThis.__heroProbe.ambientPaused=v},dispose(){globalThis.__heroProbe.ambientDisposed++}});export const mountCursor=()=>()=>{globalThis.__heroProbe.cursorDisposed++}'}));
 p.onLoad({filter:/[\\/]src[\\/]i18n\.ts$/},()=>({contents:'export const lang=()=>globalThis.__heroProbe.language;export const pick=v=>v[lang()]'}));
 p.onLoad({filter:/[\\/]src[\\/]theme\.ts$/},()=>({contents:'export const theme=()=>document.documentElement.dataset.theme'}));
}}]});
const {mountHero}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));

test('static artwork stays hidden before scripts mount and throughout successful loading',async()=>{
 const initial=new JSDOM(html);
 try { assert.equal(initial.window.document.querySelector('.hero-fallback').hidden,true,'the raw document must not flash the large brand fallback'); }
 finally { initial.window.close(); }
 const f=await fixture();try{
 const fallback=f.document.querySelector('.hero-fallback');
 assert.equal(fallback.hidden,true);
 f.hero.enter();f.state({phase:'loading'});assert.equal(fallback.hidden,true);
 f.p.options.onReady();f.state({phase:'entrance',particleCount:14400});assert.equal(fallback.hidden,true);
 }finally{f.close()}
});
async function fixture({enter=true}={}){
 const dom=new JSDOM(html,{url:'http://localhost/'}),w=dom.window;
 const names=['window','document','location','MutationObserver','AbortController','matchMedia'];
 const saved=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const preference=Object.assign(new w.EventTarget(),{matches:false});
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='matchMedia'?()=>preference:w[n]});
 const p=globalThis.__heroProbe={language:'zh',selected:[],active:false,ambientPaused:true,disposed:0,ambientDisposed:0,cursorDisposed:0,state:{index:0,shape:'storyboard',phase:'loading',progress:0,paused:false,manual:false,reduced:false,mode:'shader',particleCount:0,fps:0,pointerX:0,pointerY:0,holdProgress:0}};
 const hero=mountHero();
 assert.equal(p.options,undefined,'hidden home DOM must not start or import a scene');
 if(enter)await hero.enter();
 return {p,w,document:w.document,hero,state(patch){p.state={...p.state,...patch};p.options.onState(p.state)},close(){hero.dispose();w.close();for(const[n,d]of saved)d?Object.defineProperty(globalThis,n,d):delete globalThis[n];delete globalThis.__heroProbe}};
}
test('disposing during the dynamic import prevents a late GPU mount and still removes shared cursor/ambient listeners',async()=>{
 const f=await fixture({enter:false});try{
 const pending=f.hero.enter();f.hero.dispose();await pending;
 assert.equal(f.p.options,undefined);assert.equal(f.p.disposed,0);
 assert.equal(f.p.cursorDisposed,1);assert.equal(f.p.ambientDisposed,1);
 }finally{f.close()}
});
test('scene morphs update HUD and keyboard instructions without restoring auxiliary controls',async()=>{
 const f=await fixture();try{
 f.hero.enter();f.state({phase:'loading'});
 assert.equal(f.p.options.inputSurface,f.document.querySelector('#hero-input'),'input is isolated from the enlarged canvas');
 assert.equal(f.document.querySelector('#hero-mode').textContent,'—','loading does not claim an unconfirmed renderer');
 f.p.options.onReady();f.state({phase:'settled',particleCount:14400,fps:48.6,progress:1});
 assert.equal(f.document.querySelector('#hero-mode').textContent,'SHADER');
 assert.equal(f.document.querySelector('#hero-count').textContent,'14,400');assert.equal(f.document.querySelector('#hero-fps').textContent,'49');
 f.state({index:1,shape:'knowledge',phase:'morphing',progress:.3});
 assert.equal(f.document.querySelector('#hero-shape').textContent,'知识归档');
 assert.match(f.document.querySelector('#hero-input').getAttribute('aria-label'),/知识归档/);
 assert.equal(f.document.querySelector('#hero-source-choices,#hero-record,#hero-pause,#hero-art-caption'),null);
 f.state({index:2,shape:'identity',phase:'settled'});assert.equal(f.document.querySelector('#hero-shape').textContent,'無相');
 }finally{f.close()}
});
test('the focused surface pause shortcut and page lifecycle keep the scene and ambient in sync',async()=>{
 const f=await fixture();try{
 f.hero.enter();assert.equal(f.p.active,true);f.p.options.onReady();f.state({phase:'settled',particleCount:14400,fps:50});
 const surface=f.document.querySelector('#hero-input');
 assert.equal(surface.getAttribute('aria-keyshortcuts'),'P');
 const pause=new f.w.KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true});
 surface.dispatchEvent(pause);assert.equal(pause.defaultPrevented,true);assert.equal(f.p.paused,true);assert.equal(f.p.ambientPaused,true);
 surface.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'p',repeat:true}));assert.equal(f.p.paused,true,'holding the key cannot rapidly toggle motion');
 surface.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'p',ctrlKey:true}));assert.equal(f.p.paused,true,'browser shortcuts remain owned by the browser');
 surface.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'P'}));assert.equal(f.p.paused,false);
 f.hero.setActive(false);assert.equal(f.p.active,false);assert.equal(f.p.ambientPaused,true);
 f.hero.dispose();f.hero.dispose();assert.equal(f.p.disposed,1);assert.equal(f.p.ambientDisposed,1);assert.equal(f.p.cursorDisposed,1);
 }finally{f.close()}
});

test('choosing the currently displayed form still records manual intent and stops autoplay',async()=>{
 const f=await fixture();try{
 f.hero.enter();f.p.options.onReady();f.state({phase:'settled',particleCount:14400});
 f.hero.select(0);
 assert.deepEqual(f.p.selected,[0]);
 }finally{f.close()}
});
test('GPU failure preserves static surface selection and the primary journal link; late callbacks cannot revive disposed UI',async()=>{
 const f=await fixture();try{
 f.p.options.onError(new Error('GPU unavailable'));assert.equal(f.document.querySelector('#hero-stage').classList.contains('is-static'),true);assert.equal(f.document.querySelector('#hero-stage').dataset.playing,'false');
 assert.equal(f.document.querySelector('.hero-fallback').hidden,false,'only an actual failure reveals the static artwork');
 assert.ok(f.document.querySelector('#hero-fallback-image').getAttribute('src'),'the real article cover is available as fallback');
 f.p.options.onReady();f.state({phase:'entrance',particleCount:14400});
 assert.equal(f.document.querySelector('#hero-stage').classList.contains('is-static'),true,'late success cannot undo a failed mount');
 assert.equal(f.document.querySelector('#hero-stage').getAttribute('aria-busy'),'false');
 assert.equal(f.document.querySelector('.hero-fallback').hidden,false);
 assert.ok(f.document.querySelector('.hero-actions a[href="/blog"]'));
 const surface=f.document.querySelector('#hero-input');surface.click();assert.equal(f.document.querySelector('#hero-shape').textContent,'知识归档');
 surface.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',cancelable:true}));assert.equal(f.document.querySelector('#hero-shape').textContent,'影像引擎');
 surface.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'p'}));assert.equal(f.document.querySelector('#hero-stage').dataset.playing,'false');
 f.hero.dispose();const before=f.document.querySelector('#hero-shape').textContent;f.state({index:2});assert.equal(f.document.querySelector('#hero-shape').textContent,before);
 }finally{f.close()}
});
