import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
const bundle=await build({stdin:{contents:`export * from './src/catalog-page'; export {setLang} from './src/i18n';`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
let sequence=0;
async function fixture(kind='resources',path='/learning',liveFetch=async()=>Response.json({error:'sign in'},{status:401})){
 const dom=new JSDOM('<body><main id="root"></main><button id="outside">Outside</button></body>',{url:'http://localhost'+path,pretendToBeVisual:true});
 const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','CustomEvent','AbortController','localStorage'];const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64')+'#'+(++sequence));api.setLang('zh');
 const root=dom.window.document.getElementById('root');root.innerHTML=api.renderCatalogPage(kind);let calls=0;
 const bind=()=>api.bindCatalog(root,kind,async()=>{calls++;return liveFetch();});let controller=bind();
 return{dom,root,api,calls:()=>calls,settle:()=>new Promise(r=>setTimeout(r,0)),rerender(){controller.dispose();root.innerHTML=api.renderCatalogPage(kind);controller=bind();},close(){controller.dispose();dom.window.close();for(const[key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}};
}
test('default demo is complete, explicit and performs no live/auth requests',async()=>{
 for(const kind of ['resources','software']){const f=await fixture(kind);try{await f.settle();assert.equal(f.calls(),0);assert.equal(f.root.querySelectorAll('.catalog-entry').length,6);assert.match(f.root.querySelector('[data-catalog-source-note]').textContent,/本地演示/);assert.equal(f.root.querySelectorAll('a[target="_blank"][data-sample-id]').length,0);assert.equal(f.root.querySelector('[data-catalog-search]').disabled,false);}finally{f.close();}}
});
test('sample opens local native dialog, closes with focus restored; source switch retains original401',async()=>{
 const f=await fixture();try{const link=f.root.querySelector('[data-sample-id]');link.focus();link.click();assert.ok(f.root.querySelector('dialog[open]'));assert.match(f.dom.window.location.search,/sample=demo-/);assert.ok(f.root.querySelector('dialog a[href^="https://github.com/"]'));f.root.querySelector('[data-sample-close]').click();assert.equal(f.root.querySelector('dialog'),null);assert.equal(f.dom.window.document.activeElement,link);assert.equal(f.dom.window.location.search,'');f.root.querySelector('[data-catalog-source="live"]').click();await f.settle();assert.equal(f.calls(),1);assert.equal(f.root.querySelector('[data-catalog-results]').dataset.state,'auth');assert.equal(f.root.querySelectorAll('.catalog-entry').length,0);f.root.querySelector('[data-catalog-source="demo"]').click();assert.equal(f.root.querySelectorAll('.catalog-entry').length,6);}finally{f.close();}
});
test('hero shortcuts filter meaningful content; localization resets stale category; dispose clears dialog',async()=>{
 const f=await fixture('software','/software');try{f.root.querySelector('[data-catalog-preset="Logseq"]').click();assert.equal(f.root.querySelectorAll('.catalog-entry').length,1);assert.match(f.root.querySelector('.catalog-entry h3').textContent,/Logseq/);f.root.querySelector('[data-catalog-clear]').click();const category=f.root.querySelector('[data-catalog-category]:not([data-catalog-category="all"])');category.click();f.api.setLang('en');f.rerender();assert.equal(f.root.querySelectorAll('.catalog-entry').length,6);f.root.querySelector('[data-sample-id]').click();assert.ok(f.root.querySelector('dialog'));f.rerender();assert.equal(f.root.querySelector('dialog'),null);}finally{f.close();}
});
test('changing source removes actionable demo records before a delayed live request settles',async()=>{
 let release;const f=await fixture('resources','/learning',()=>new Promise(resolve=>{release=resolve;}));try{assert.equal(f.root.querySelectorAll('[data-sample-id]').length,6);f.root.querySelector('[data-catalog-source="live"]').click();assert.equal(f.root.querySelectorAll('[data-sample-id]').length,0);assert.equal(f.root.querySelector('[data-catalog-results]').getAttribute('aria-busy'),'true');assert.equal(f.root.querySelector('[data-catalog-search]').disabled,true);release(Response.json({error:'sign in'},{status:401}));await f.settle();assert.equal(f.root.querySelector('[data-catalog-results]').dataset.state,'auth');assert.equal(f.root.querySelector('dialog'),null);}finally{f.close();}
});

test('sample dialog wraps Tab and Shift+Tab within its native modal controls',async()=>{
 const f=await fixture();try{
  f.root.querySelector('[data-sample-id]').click();
  const dialog=f.root.querySelector('dialog'),first=dialog.querySelector('button'),last=dialog.querySelector('a');
  for(const [from,to,shiftKey]of [[last,first,false],[first,last,true]]){
   from.focus();const event=new f.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey,bubbles:true,cancelable:true});from.dispatchEvent(event);
   assert.equal(event.defaultPrevented,true);assert.equal(f.dom.window.document.activeElement,to);
  }
  first.focus();const modified=new f.dom.window.KeyboardEvent('keydown',{key:'Tab',ctrlKey:true,bubbles:true,cancelable:true});first.dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);
 }finally{f.close();}
});
