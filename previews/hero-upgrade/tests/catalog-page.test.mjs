import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
const project=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`export * from './src/catalog-page'; export {setLang} from './src/i18n'; export {posts} from './src/content';`,resolveDir:project},bundle:true,platform:'node',format:'esm',write:false});
const moduleURL='data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64');let fixtureId=0;
// Isolated synthetic contract fixture, never part of user-facing inventory.
const entry={id:'test-material',title:'测试资料',summary:'隔离测试内容',category:'模板',tags:['练习'],date:'2026-10-01',coverSrc:'',format:'PDF',file:'guide.pdf',fileSize:'2048',downloadUrl:'',externalUrl:'https://example.org/guide'};
const data={items:[entry],total:1,page:1,pages:1,totalPublished:1,categories:['模板'],highlights:[]};

test('integrated materials render with no homepage notes and never resolve demo article indices',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><script id="site-integration" type="application/json">{"mode":"local","origin":"http://localhost"}</script><main></main></body></html>',{url:'http://localhost/learning'});
 const names=['window','document','localStorage'];const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
 try{
  const api=await import(moduleURL+'#integrated-empty-notes');api.setLang('zh');api.posts.splice(0);
  for(const kind of ['resources','software']){
   let markup;assert.doesNotThrow(()=>{markup=api.renderCatalogPage(kind)});
   const root=dom.window.document.querySelector('main');root.innerHTML=markup;
   assert.ok(root.querySelector('[data-catalog-results]'));
   assert.equal(root.querySelector('.catalog-related'),null,'real catalog must not contain demo field-note bindings');
  }
  assert.equal(api.posts.length,0,'rendering a catalog does not require unrelated homepage requests');
 }finally{dom.window.close();for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});
async function fixture(fetcher,kind='resources'){
 const dom=new JSDOM('<body><div id="root"></div></body>',{url:'http://localhost/',pretendToBeVisual:true});
 const names=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','CustomEvent','AbortController','localStorage'];
 const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
 const api=await import(moduleURL+'#fixture-'+(++fixtureId));api.setLang('zh');const root=dom.window.document.getElementById('root');root.innerHTML=api.renderCatalogPage(kind);
 const controller=api.bindCatalog(root,kind,fetcher,null,'live');
 return {dom,root,controller,api,settle:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){controller.dispose();dom.window.close();for(const [name,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}};
}
test('restricted resources and software never turn blogs into inventory or claim an empty catalog',async()=>{
 for(const kind of ['resources','software']){const f=await fixture(async()=>Response.json({error:'sign in'},{status:401}),kind);try{await f.settle();assert.equal(f.root.querySelector('[data-catalog-results]').dataset.state,'auth');assert.equal(f.root.querySelectorAll('[data-post],.learning-track,.related-notes').length,0);assert.match(f.root.querySelector('[data-catalog-results]').textContent,/登录/);assert.doesNotMatch(f.root.querySelector('[data-catalog-results]').textContent,/尚未发布/);assert.equal(f.root.querySelector('[data-catalog-search]').disabled,true);assert.equal(f.root.querySelector('.catalog-main-link').href,`https://www.sansphase.com/#/${kind}`);}finally{f.close();}}
});
test('materials and software have distinct task-driven heroes rather than journal cover layouts',async()=>{
 const f=await fixture(async()=>Response.json(data));try{
  assert.ok(f.root.querySelector('.materials-launchpad'));
  assert.equal(f.root.querySelectorAll('[data-catalog-launcher] a').length,3);
  assert.equal(f.root.querySelector('[data-catalog-preset]'),null);
  const software=f.api.renderCatalogPage('software');
  assert.match(software,/software-workbench/);assert.doesNotMatch(software,/materials-launchpad/);
  assert.equal(f.root.querySelectorAll('.catalog-route-card,.journal-feature,.journal-hero').length,0);
 }finally{f.close();}
});
test('real metadata gets purpose, format and main-site detail links without synthetic ratings or downloads',async()=>{
 const f=await fixture(async()=>Response.json(data));try{await f.settle();const card=f.root.querySelector('.catalog-entry');assert.ok(card);assert.match(card.textContent,/测试资料/);assert.match(card.textContent,/PDF · 2,048 B/);assert.equal(card.querySelector('a').href,'https://www.sansphase.com/#/resources/test-material');assert.equal(card.querySelectorAll('a a,button a,[download]').length,0);assert.equal(f.root.querySelector('[data-catalog-search]').disabled,false);assert.equal(f.root.querySelector('[data-catalog-category="模板"]').getAttribute('aria-pressed'),'false');assert.doesNotMatch(card.textContent,/评分|下载量|熟练度/);}finally{f.close();}
});

test('failed covers leave a visible fallback despite the site-wide img display rule',async()=>{
 const cover='/media/00000000-0000-4000-8000-000000000001';
 const f=await fixture(async()=>Response.json({...data,items:[{...entry,coverSrc:cover}]}));
 try{await f.settle();const style=f.dom.window.document.createElement('style');style.textContent='img{display:block}'+await readFile(new URL('../src/catalog-page.css',import.meta.url),'utf8');f.dom.window.document.head.append(style);const image=f.root.querySelector('.catalog-entry img');assert.ok(image);image.dispatchEvent(new f.dom.window.Event('error'));assert.equal(f.dom.window.getComputedStyle(image).display,'none');assert.notEqual(f.dom.window.getComputedStyle(image.nextElementSibling).display,'none');f.root.querySelector('[data-catalog-layout="list"]').click();const details=f.root.querySelector('.catalog-entry-details');assert.match(details.textContent,/PDF · 2,048 B/);assert.notEqual(f.dom.window.getComputedStyle(details).display,'none');}finally{f.close();}
});
test('software has a distinct recommendation card while materials keep their metadata card',async()=>{
 const softwareEntry={...entry,id:'software-notes',title:'Example Tool：保留完整的用途说明与原始标题',summary:'这是已有的软件使用介绍，不添加平台、价格或评分。',category:'笔记工具',tags:['Example Tool','知识记录'],format:'',file:'',fileSize:''};
 const software=await fixture(async()=>Response.json({...data,items:[softwareEntry],categories:['笔记工具']}),'software');
 try{
  await software.settle();
  const card=software.root.querySelector('article.catalog-entry.software-entry');assert.ok(card);
  assert.ok(card.hasAttribute('data-page-card'));assert.ok(card.hasAttribute('data-page-reveal'));
  const link=card.querySelector('a.software-card');assert.ok(link);assert.equal(card.querySelectorAll('a').length,1);
  assert.equal(link.getAttribute('href'),'https://www.sansphase.com/#/software/software-notes');assert.equal(link.getAttribute('target'),'_blank');assert.match(link.getAttribute('rel'),/noopener/);
  assert.ok(link.querySelector('.software-card-media'));assert.equal(link.querySelector('.feature-media'),null);
  assert.equal(link.querySelector('h3').textContent,softwareEntry.title);assert.equal(link.querySelector('.software-card-summary').textContent,softwareEntry.summary);
  assert.deepEqual(Array.from(link.querySelectorAll('.software-card-tags li'),tag=>tag.textContent),softwareEntry.tags);
  assert.equal(link.querySelector('time').textContent,softwareEntry.date);assert.equal(card.querySelectorAll('a a,button,[download]').length,0);
 }finally{software.close();}
 const material=await fixture(async()=>Response.json(data));
 try{
  await material.settle();const card=material.root.querySelector('article.catalog-entry');assert.ok(card);
  assert.equal(card.classList.contains('software-entry'),false);assert.equal(card.querySelector('.software-card,.software-card-media'),null);
  assert.ok(card.querySelector('.catalog-entry-media.feature-media'));assert.equal(card.querySelector('h3').textContent,entry.title);assert.match(card.textContent,/PDF · 2,048 B/);
  assert.equal(card.querySelector('a').getAttribute('href'),'https://www.sansphase.com/#/resources/test-material');
 }finally{material.close();}
});
test('software cover failure and grid/list switching preserve the native detail link without refetching',async()=>{
 const calls=[],cover='/media/00000000-0000-4000-8000-000000000001';
 const f=await fixture(async url=>{calls.push(String(url));return Response.json({...data,items:[{...entry,id:'software-cover',coverSrc:cover}]});},'software');
 try{
  await f.settle();const style=f.dom.window.document.createElement('style');style.textContent='img{display:block}'+await readFile(new URL('../src/catalog-page.css',import.meta.url),'utf8')+await readFile(new URL('../src/software-cards.css',import.meta.url),'utf8');f.dom.window.document.head.append(style);
  const link=f.root.querySelector('.software-entry>a.software-card');assert.ok(link);const href=link.getAttribute('href');
  const image=link.querySelector('.software-card-media img');assert.ok(image);assert.equal(image.getAttribute('loading'),'lazy');assert.equal(image.getAttribute('decoding'),'async');assert.equal(image.getAttribute('alt'),'');
  const fallback=image.nextElementSibling;assert.ok(fallback.classList.contains('catalog-cover-fallback'));assert.equal(fallback.hasAttribute('hidden'),true);
  image.dispatchEvent(new f.dom.window.Event('error'));assert.equal(f.dom.window.getComputedStyle(image).display,'none');assert.equal(fallback.hasAttribute('hidden'),false);assert.notEqual(f.dom.window.getComputedStyle(fallback).display,'none');
  const before=calls.length;
  for(const layout of ['list','grid']){
   const button=f.root.querySelector(`[data-catalog-layout="${layout}"]`);button.focus();button.click();
   assert.equal(f.root.querySelector('.catalog-entries').dataset.layout,layout);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(f.dom.window.document.activeElement,button);
   assert.equal(f.root.querySelector('.software-entry>a.software-card'),link);assert.equal(link.getAttribute('href'),href);assert.equal(f.root.querySelector('.software-card-media img'),image);assert.equal(image.hidden,true);assert.equal(fallback.hasAttribute('hidden'),false);
  }
  assert.equal(calls.length,before);assert.equal(before,1);assert.equal(new URL(calls[0],'http://localhost').searchParams.get('kind'),'software');
 }finally{f.close();}
});
test('search, category and pagination use existing query fields while layout stays local',async()=>{
 const calls=[];const f=await fixture(async url=>{calls.push(String(url));return Response.json({...data,total:25,totalPublished:25,pages:3});});try{await f.settle();const before=calls.length;f.root.querySelector('[data-catalog-layout="list"]').click();assert.equal(f.root.querySelector('.catalog-entries').dataset.layout,'list');assert.equal(calls.length,before);const input=f.root.querySelector('[data-catalog-search]');input.value='模板';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));f.root.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.settle();let params=new URL(calls.at(-1),'http://localhost').searchParams;assert.equal(params.get('kind'),'resources');assert.equal(params.get('q'),'模板');assert.equal(params.get('page'),'1');f.root.querySelector('[data-catalog-category="模板"]').click();await f.settle();params=new URL(calls.at(-1),'http://localhost').searchParams;assert.equal(params.get('category'),'模板');f.root.querySelector('[data-catalog-page-action="next"]').click();await f.settle();assert.equal(new URL(calls.at(-1),'http://localhost').searchParams.get('page'),'2');}finally{f.close();}
});
test('errors remain retryable and late requests cannot paint a disposed page',async()=>{
 let call=0;const f=await fixture(async()=>{call++;return call===1?Response.json({items:'invalid'}):Response.json({...data,items:[],total:0,totalPublished:0});});try{await f.settle();assert.equal(f.root.querySelector('[data-catalog-results]').dataset.state,'error');f.root.querySelector('[data-catalog-retry]').click();await f.settle();assert.equal(f.root.querySelector('[data-catalog-results]').dataset.state,'empty');}finally{f.close();}
 let resolve;const stale=await fixture(()=>new Promise(r=>{resolve=r;}));try{stale.controller.dispose();stale.root.innerHTML='<h1>下一页</h1>';resolve(Response.json(data));await stale.settle();assert.equal(stale.root.textContent,'下一页');}finally{stale.close();}
});

test('catalog pagination positions once at click time and keeps mounted results during the request',async()=>{
 let release,calls=0;const f=await fixture(async()=>++calls===1?Response.json({...data,total:13,totalPublished:13,pages:2}):new Promise(resolve=>release=resolve));try{
  await f.settle();const row=f.root.querySelector('.catalog-entry'),targets=[];f.root.addEventListener('collection:position',event=>targets.push(event.detail.target));
  f.root.querySelector('[data-catalog-page-action="next"]').click();assert.equal(targets.length,1);assert.equal(targets[0],f.root.querySelector('[data-catalog-results]'));assert.equal(f.root.querySelector('.catalog-entry'),row);
  release(Response.json({...data,total:13,totalPublished:13,pages:2,page:2}));await f.settle();assert.equal(targets.length,1);assert.equal(f.root.querySelector('[data-catalog-results]').getAttribute('aria-busy'),'false');
 }finally{f.close();}
});
test('query/category focus survives async replacement without stealing focus from outside the catalog',async()=>{
 let release;let count=0;const f=await fixture(()=>++count===1?Promise.resolve(Response.json(data)):new Promise(resolve=>{release=resolve;}));try{await f.settle();let button=f.root.querySelector('[data-catalog-category="模板"]');button.focus();button.click();release(Response.json(data));await f.settle();assert.equal(f.dom.window.document.activeElement.getAttribute('data-catalog-category'),'模板');button=f.root.querySelector('[data-catalog-category="all"]');button.focus();button.click();const outside=f.dom.window.document.createElement('button');f.dom.window.document.body.append(outside);outside.focus();release(Response.json(data));await f.settle();assert.equal(f.dom.window.document.activeElement,outside);}finally{f.close();}
});
