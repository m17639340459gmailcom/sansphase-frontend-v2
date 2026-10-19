import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({stdin:{contents:`export * from './src/library-page';export {setLang} from './src/i18n';`,resolveDir:sourceRoot},bundle:true,platform:'node',format:'esm',write:false});
const moduleURL='data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64');
let serial=0;
async function fixture(fetcher=async()=>new Response('{}',{status:401}), url='http://localhost/resources') {
  const dom=new JSDOM('<body><main id="root"></main></body>',{url,pretendToBeVisual:true});
  const names=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','CustomEvent','AbortController','localStorage','location','history'];
  const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  for(const name of names)Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  const api=await import(moduleURL+'#library-demo-'+(++serial));api.setLang('zh');
  const root=dom.window.document.getElementById('root');root.innerHTML=api.renderLibraryPage();
  let controller=api.bindLibrary(root,fetcher);
  return {root,dom,api,get controller(){return controller;},settle:()=>new Promise(resolve=>setTimeout(resolve,0)),
    rebuild(language){controller.dispose();api.setLang(language);root.innerHTML=api.renderLibraryPage();controller=api.bindLibrary(root,fetcher);},
    close(){controller.dispose();dom.window.close();for(const [name,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}};
}

test('default sample library is useful immediately without requesting the private CMS',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;throw new Error('Private catalog should not be requested');});
  try{await f.settle();assert.equal(calls,0);assert.equal(f.root.querySelectorAll('[data-library-sample]').length,3);assert.equal(f.root.querySelector('[data-library-results]').dataset.state,'ready');assert.match(f.root.querySelector('[data-library-source-note]').textContent,/演示|示例/);assert.equal(f.root.querySelector('[data-library-source="demo"]').getAttribute('aria-pressed'),'true');assert.equal(f.root.querySelectorAll('.library-book[target]').length,0);for(const link of f.root.querySelectorAll('.library-book'))assert.match(link.href,/\/resources\?sample=demo-book-/);assert.equal(f.root.querySelector('[data-library-search]').disabled,false);}finally{f.close();}
});

test('switching to live keeps sign-in denial and original main-site reader destination',async()=>{
  const calls=[];const f=await fixture(async(url,options)=>{calls.push({url:String(url),options});return new Response('{}',{status:401});});
  try{await f.settle();f.root.querySelector('[data-library-source="live"]').click();await f.settle();assert.equal(calls.length,1);assert.equal(new URL(calls[0].url,'http://localhost').searchParams.get('kind'),'resource-center');assert.equal(f.root.querySelector('[data-library-results]').dataset.state,'auth');assert.equal(f.root.querySelectorAll('[data-library-sample]').length,0);assert.equal(f.root.querySelector('.library-gate a').href,'https://www.sansphase.com/#/resource-center');assert.equal(f.root.querySelector('[data-library-search]').disabled,true);f.root.querySelector('[data-library-source="demo"]').click();await f.settle();assert.equal(calls.length,1);assert.equal(f.root.querySelectorAll('[data-library-sample]').length,3);}finally{f.close();}
});

test('a source switch immediately retires old demo cards while the live request is pending',async()=>{
  let finish;const f=await fixture(()=>new Promise(resolve=>{finish=resolve;}));
  try{await f.settle();assert.equal(f.root.querySelectorAll('[data-library-sample]').length,3);
    f.root.querySelector('[data-library-source="live"]').click();
    const results=f.root.querySelector('[data-library-results]');
    assert.equal(results.dataset.state,'loading');assert.equal(results.getAttribute('aria-busy'),'true');
    assert.equal(f.root.querySelectorAll('.library-book,[data-library-sample]').length,0,'no demo destination remains beneath a live source label');
    assert.equal(f.root.querySelector('[data-library-search]').disabled,true);assert.equal(f.root.querySelectorAll('[data-library-category]').length,0);
    assert.match(results.textContent,/正在|Loading/);assert.equal(f.root.querySelector('dialog'),null);
    finish(new Response('{}',{status:401}));await f.settle();assert.equal(results.dataset.state,'auth');
    f.root.querySelector('[data-library-source="demo"]').click();assert.equal(f.root.querySelectorAll('[data-library-sample]').length,3);
  }finally{f.close();}
});

test('sample filtering, category reset and layout remain local and meaningful',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;throw new Error('No remote request');});
  try{await f.settle();f.root.querySelector('[data-library-category="流程记录"]').click();await f.settle();assert.equal(f.root.querySelectorAll('.library-book').length,1);assert.match(f.root.querySelector('.library-book').textContent,/Mermaid|流程/);f.root.querySelector('[data-library-category="all"]').click();await f.settle();const input=f.root.querySelector('[data-library-search]');input.value='no such book';f.root.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.settle();assert.equal(f.root.querySelector('[data-library-results]').dataset.state,'filtered');f.root.querySelector('[data-library-clear]').click();await f.settle();assert.equal(f.root.querySelectorAll('.library-book').length,3);f.root.querySelector('[data-library-layout="list"]').click();assert.equal(f.root.querySelector('.library-books').dataset.layout,'list');assert.equal(calls,0);}finally{f.close();}
});

test('sample details open locally, retain attribution and return focus on close',async()=>{
  const f=await fixture();try{await f.settle();const card=f.root.querySelector('[data-library-sample]');card.focus();card.click();assert.ok(f.root.querySelector('dialog[open]'));assert.equal(f.root.querySelectorAll('.sample-body > section').length,3);assert.match(f.root.querySelector('.sample-body').textContent,/演示|示例/);assert.match(f.root.querySelector('.sample-body footer a').href,/^https:\/\/github\.com\//);assert.equal(f.dom.window.location.searchParams,undefined);assert.ok(new URL(f.dom.window.location.href).searchParams.get('sample'));f.root.querySelector('[data-sample-close]').click();assert.equal(f.root.querySelector('dialog'),null);assert.equal(f.dom.window.document.activeElement,card);assert.equal(new URL(f.dom.window.location.href).searchParams.has('sample'),false);}finally{f.close();}
});

test('sample deep links work and route disposal removes the modal without late CMS paint',async()=>{
  const f=await fixture(undefined,'http://localhost/resources?sample=demo-book-mermaid');try{await f.settle();assert.ok(f.root.querySelector('dialog[open]'));assert.match(f.root.querySelector('#sample-title').textContent,/工作流/);f.controller.dispose();assert.equal(f.root.querySelector('dialog'),null);}finally{f.close();}
  let release;const pending=await fixture(()=>new Promise(resolve=>{release=resolve;}));try{await pending.settle();pending.root.querySelector('[data-library-source="live"]').click();pending.root.querySelector('[data-library-source="demo"]').click();release(Response.json({items:[],total:0,page:1,pages:1,totalPublished:0,categories:[]}));await pending.settle();assert.equal(pending.root.querySelectorAll('[data-library-sample]').length,3);}finally{pending.close();}
});

test('language refresh resets localized categories without losing demo source',async()=>{
  const f=await fixture();try{await f.settle();f.root.querySelector('[data-library-category="AI 学习"]').click();await f.settle();assert.equal(f.root.querySelectorAll('.library-book').length,1);f.rebuild('en');await f.settle();assert.equal(f.root.querySelector('[data-library-category="all"]').getAttribute('aria-pressed'),'true');assert.equal(f.root.querySelectorAll('[data-library-sample]').length,3);assert.match(f.root.querySelector('[data-library-source-note]').textContent,/sample|demo/i);}finally{f.close();}
});
