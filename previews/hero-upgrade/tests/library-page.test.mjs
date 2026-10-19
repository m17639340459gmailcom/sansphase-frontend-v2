import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({stdin:{contents:`export * from './src/library-page'; export {setLang} from './src/i18n';`,resolveDir:root},bundle:true,platform:'node',format:'esm',write:false});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const book = {id:'sample-book',title:'测试用书',summary:'仅用于自动化测试',category:'教程',tags:['阅读'],date:'2026-10-01',coverSrc:'',vipOnly:false,locked:false};
const catalog = {items:[book],total:1,page:1,pages:1,totalPublished:1,categories:['教程']};
test('reading-room metadata and controls keep a readable type floor across breakpoints',async()=>{
  const css=await readFile(new URL('../src/library-page.css',import.meta.url),'utf8');
  const declarations=[...css.matchAll(/\b(font(?:-size)?)\s*:\s*([^;}]+)/g)];
  const undersized=declarations.flatMap(([,property,value])=>{
    const pixels=value.match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|\/|$)/);
    return pixels&&Number(pixels[1])<11?[`${property}: ${value}`]:[];
  });
  assert.deepEqual(undersized,[],'labels must not shrink back below 11px in a responsive override');
  for(const selector of ['.library-status','.library-features','.library-book-meta','.library-book-foot']){
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const rule=css.match(new RegExp(`\\.library-page ${escaped}\\s*\\{([^}]+)\\}`));
    assert.ok(rule,`missing reading or action rule: ${selector}`);
    const size=rule[1].match(/font(?:-size)?\s*:\s*(?:[^;}]*?\s)?(\d+(?:\.\d+)?)px(?:\s|\/|;)/);
    assert.ok(size&&Number(size[1])>=12,`${selector} should be legible at the default page zoom`);
    assert.match(rule[1],/color:\s*var\(--fg-2\)/,'reading hints and actions use the stronger existing secondary text token');
  }
});
function fixture(fetcher) {
  const dom = new JSDOM('<html><body><main id="root"></main></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','CustomEvent','localStorage','AbortController'];
  const previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  for(const key of keys) globalThis[key]=dom.window[key];
  api.setLang('zh');
  const root=dom.window.document.getElementById('root');root.innerHTML=api.renderLibraryPage();
  let controller=api.bindLibrary(root,fetcher,null,'live');
  return {root,dom,get controller(){return controller;},
    rebuild(){controller.dispose();root.innerHTML=api.renderLibraryPage();controller=api.bindLibrary(root,fetcher,null,'live');},
    async settle(){await new Promise(resolve=>setTimeout(resolve,10));},close(){controller.dispose();dom.window.close();Object.assign(globalThis,previous);}};
}
function deferredRequests() {
  const requests=[];
  return {requests,fetcher(url,options){return new Promise((resolve,reject)=>{
    const abort=()=>reject(options.signal.reason ?? new DOMException('Aborted','AbortError'));
    options.signal.addEventListener('abort',abort,{once:true});
    requests.push({url:String(url),options,resolve(value){options.signal.removeEventListener('abort',abort);resolve(value);}});
    if(options.signal.aborted)abort();
  });},
    reply(index,value=catalog){requests[index].resolve(Response.json(value));}};
}
const pagedCatalog=(page=1)=>({...catalog,total:25,page,pages:3,totalPublished:25,categories:['教程','笔记']});

test('book pagination positions once on click and keeps the shelf mounted while waiting',async()=>{
  const pending=deferredRequests(),f=fixture(pending.fetcher);try{
    pending.reply(0,pagedCatalog());await f.settle();const book=f.root.querySelector('.library-book'),targets=[];f.root.addEventListener('collection:position',event=>targets.push(event.detail.target));
    f.root.querySelector('[data-library-page-action="next"]').click();assert.equal(targets.length,1);assert.equal(targets[0],f.root.querySelector('[data-library-results]'));assert.equal(f.root.querySelector('.library-book'),book);
    pending.reply(1,pagedCatalog(2));await f.settle();assert.equal(targets.length,1);assert.equal(f.root.querySelector('[data-library-results]').getAttribute('aria-busy'),'false');
  }finally{f.close();}
});
function submit(f,value) {
  f.root.querySelector('[data-library-search]').value=value;
  f.root.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
}
test('resource center replaces the content directory with a real reading collection',async()=>{
  const f=fixture(async()=>new Response('{}',{status:401}));
  try{await f.settle();assert.equal(f.root.querySelectorAll('.directory-card,[data-post],.post').length,0);assert.match(f.root.textContent,/藏书/);assert.match(f.root.querySelector('[data-library-results]').textContent,/登录/);assert.doesNotMatch(f.root.querySelector('[data-library-results]').textContent,/尚未发布/);assert.equal(f.root.querySelector('.library-search input').disabled,true);assert.equal(f.root.querySelector('.library-gate a').href,'https://www.sansphase.com/#/resource-center');}finally{f.close();}
});
test('authorized metadata has one genuine book link, real categories and no fabricated progress',async()=>{
  const f=fixture(async()=>Response.json(catalog));
  try{await f.settle();const link=f.root.querySelector('.library-book');assert.equal(link.href,'https://www.sansphase.com/#/resource-center/sample-book');assert.equal(link.querySelectorAll('a,button').length,0);assert.equal(f.root.querySelector('[data-library-category="教程"]').textContent.trim(),'教程');assert.match(f.root.querySelector('[data-library-status]').textContent,/1|01/);assert.equal(f.root.querySelector('.library-search input').disabled,false);assert.equal(f.root.querySelectorAll('[data-post],progress').length,0);}finally{f.close();}
});

test('physical books keep one reading action and recover a missing cover without duplicate accessible copy',async()=>{
  const coverPath='/media/c57acd8d-a84c-459b-9eb3-6e7f84a82a2e';
  const titledBook={...book,title:'书名 <测试> & "封面"',coverSrc:coverPath};
  const f=fixture(async()=>Response.json({...catalog,items:[titledBook]}));
  try{
    await f.settle();
    const link=f.root.querySelector('.library-book');
    assert.equal(link.querySelectorAll('a,button,[tabindex]').length,0,'the book remains one native keyboard action');
    assert.equal(link.querySelector('h3').textContent,titledBook.title);
    const object=link.querySelector('.library-book-object');
    assert.ok(object,'the catalog contains a physical book, not an article thumbnail');
    assert.equal(object.getAttribute('aria-hidden'),'true','the decorative binding must not repeat the title to screen readers');
    assert.equal(object.querySelectorAll('canvas,.feature-media').length,0,'catalog books neither create GPU contexts nor inherit image-only parallax');
    const image=object.querySelector('img');
    assert.equal(image.getAttribute('src'),coverPath);
    assert.equal(image.getAttribute('loading'),'lazy');
    assert.equal(image.alt,'');
    image.dispatchEvent(new f.dom.window.Event('error'));
    assert.equal(image.hidden,true);
    assert.equal(object.querySelector('.library-cover-fallback').hidden,false);
    assert.equal(object.querySelector('.library-cover-fallback strong').textContent,titledBook.title);
    assert.equal(link.querySelectorAll('script').length,0);
    assert.match(link.href,/resource-center\/sample-book$/);
  }finally{f.close();}
});

test('switching shelf and index reuses physical book nodes and does not reload content',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return Response.json(catalog);});
  try{
    await f.settle();const link=f.root.querySelector('.library-book');
    const list=f.root.querySelector('[data-library-layout="list"]');list.focus();list.click();
    assert.equal(f.root.querySelector('.library-book'),link);
    assert.equal(f.dom.window.document.activeElement,list);
    assert.equal(list.getAttribute('aria-pressed'),'true');
    f.root.querySelector('[data-library-layout="grid"]').click();
    assert.equal(f.root.querySelector('.library-book'),link);
    assert.equal(calls,1,'presentation changes do not trigger another book request');
  }finally{f.close();}
});
test('search uses the real backend query and layout toggle changes the book presentation',async()=>{
  const requests=[];const f=fixture(async(url)=>{requests.push(String(url));return Response.json(catalog);});
  try{await f.settle();f.root.querySelector('[data-library-layout="list"]').click();assert.equal(f.root.querySelector('.library-books').dataset.layout,'list');const input=f.root.querySelector('[data-library-search]');input.value='Obsidian';f.root.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.settle();const query=new URL(requests.at(-1),'http://localhost').searchParams;assert.equal(query.get('q'),'Obsidian');assert.equal(query.get('kind'),'resource-center');assert.equal(query.get('page'),'1');f.root.querySelector('[data-library-category="教程"]').click();await f.settle();assert.equal(new URL(requests.at(-1),'http://localhost').searchParams.get('category'),'教程');}finally{f.close();}
});
test('network and invalid responses are retryable errors, never an empty published collection',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;if(calls===1)throw new Error('offline');return Response.json({...catalog,items:[],total:0,totalPublished:0});});
  try{await f.settle();assert.equal(f.root.querySelector('[data-library-results]').dataset.state,'error');f.root.querySelector('[data-library-retry]').click();await f.settle();if(f.root.querySelector('[data-library-clear]')){f.root.querySelector('[data-library-clear]').click();await f.settle();}assert.equal(f.root.querySelector('[data-library-results]').dataset.state,'empty');assert.match(f.root.querySelector('[data-library-results]').textContent,/尚未发布/);}finally{f.close();}
});
test('leaving the page cancels work so a stale response cannot change a new page',async()=>{
  let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  try{f.controller.dispose();f.root.innerHTML='<h1>下一页</h1>';finish(Response.json(catalog));await f.settle();assert.equal(f.root.textContent,'下一页');}finally{f.close();}
});

test('an asynchronous category result preserves the activated keyboard control',async()=>{
  const network=deferredRequests(),f=fixture(network.fetcher);
  try{
    network.reply(0,pagedCatalog());await f.settle();
    const category=f.root.querySelector('[data-library-category="教程"]');category.focus();category.click();
    assert.equal(network.requests.length,2);assert.equal(f.dom.window.document.activeElement,category);
    network.reply(1,pagedCatalog());await f.settle();
    const replacement=f.root.querySelector('[data-library-category="教程"]');
    assert.equal(replacement.getAttribute('aria-pressed'),'true');
    assert.equal(f.dom.window.document.activeElement,replacement,'replacing category buttons must not send focus to the document body');
  }finally{f.close();}
});

test('an asynchronous page change preserves the same pagination action',async()=>{
  const network=deferredRequests(),f=fixture(network.fetcher);
  try{
    network.reply(0,pagedCatalog());await f.settle();
    const next=f.root.querySelector('[data-library-pagination] button:last-child');next.focus();next.click();
    assert.equal(new URL(network.requests[1].url,'http://localhost').searchParams.get('page'),'2');
    network.reply(1,pagedCatalog(2));await f.settle();
    const replacement=f.root.querySelector('[data-library-pagination] button:last-child');
    assert.equal(replacement.dataset.libraryPage,'3','the next action changes its numeric target after advancing');
    assert.equal(f.dom.window.document.activeElement,replacement,'keyboard readers should be able to continue paging');
  }finally{f.close();}
});

test('category and pagination responses never reclaim focus after the reader moves outside',async()=>{
  const network=deferredRequests(),f=fixture(network.fetcher);
  try{
    const outside=f.dom.window.document.createElement('button');outside.textContent='Outside the library';f.dom.window.document.body.append(outside);
    network.reply(0,pagedCatalog());await f.settle();
    const category=f.root.querySelector('[data-library-category="教程"]');category.focus();category.click();outside.focus();
    network.reply(1,pagedCatalog());await f.settle();
    assert.equal(f.dom.window.document.activeElement,outside,'category completion must respect a newer focus choice');
    const next=f.root.querySelector('[data-library-pagination] button:last-child');next.focus();next.click();outside.focus();
    network.reply(2,pagedCatalog(2));await f.settle();
    assert.equal(f.dom.window.document.activeElement,outside,'pagination completion must respect a newer focus choice');
  }finally{f.close();}
});

test('changing layout during a pending query preserves its busy state and loading announcement',async()=>{
  const network=deferredRequests(),f=fixture(network.fetcher);
  try{
    network.reply(0,pagedCatalog());await f.settle();submit(f,'pending layout query');
    const results=f.root.querySelector('[data-library-results]'),status=f.root.querySelector('[data-library-status]');
    const loading=status.textContent;
    assert.equal(results.getAttribute('aria-busy'),'true');assert.match(loading,/正在读取/);
    f.root.querySelector('[data-library-layout="list"]').click();
    assert.equal(f.root.querySelector('.library-books').dataset.layout,'list');
    assert.equal(network.requests.length,2,'presentation changes must not submit a second query');
    assert.equal(results.getAttribute('aria-busy'),'true','the pending request still owns the loading state');
    assert.equal(status.textContent,loading,'old catalog totals cannot replace the loading announcement');
    network.reply(1,pagedCatalog());await f.settle();
    assert.equal(results.getAttribute('aria-busy'),'false');
    assert.equal(f.root.querySelector('.library-books').dataset.layout,'list');
  }finally{f.close();}
});

test('rebuilding the library preserves an input draft without automatically submitting it',async()=>{
  const requests=[],f=fixture(async url=>{requests.push(String(url));return Response.json(catalog);});
  try{
    await f.settle();submit(f,'committed library query');await f.settle();
    const input=f.root.querySelector('[data-library-search]');input.value='unsubmitted 搜索草稿';
    input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
    const before=requests.length;
    assert.equal(new URL(requests.at(-1),'http://localhost').searchParams.get('q'),'committed library query');
    api.setLang('en');f.rebuild();await f.settle();
    assert.equal(f.root.querySelector('[data-library-search]').value,'unsubmitted 搜索草稿');
    assert.equal(requests.length,before+1,'a rebuild may reload the committed catalog once');
    assert.equal(new URL(requests.at(-1),'http://localhost').searchParams.get('q'),'committed library query');
    assert.equal(requests.some(url=>new URL(url,'http://localhost').searchParams.get('q')==='unsubmitted 搜索草稿'),false);
  }finally{f.close();}
});
