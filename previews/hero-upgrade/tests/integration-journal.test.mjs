import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
let bundled;
const item=(id='note-1')=>({id,title:'真实文章 '+id,summary:'仅目录摘要',category:'实践',tags:['AI'],date:'2026-10-19T00:00:00Z',bodyHTML:'<h1>must never project</h1>'});
const listing=(items=[item()],extra={})=>({items,total:items.length,page:1,pages:1,totalPublished:items.length,categories:['实践'],highlights:[],...extra});
async function fixture(request=async()=>Response.json(listing()),english=false,timeZone,prepareNotes=false){
 bundled??=build({stdin:{contents:"export * from './src/integration-journal.ts'; export * from './src/integration-runtime.ts'; export {posts} from './src/content.ts'; export {setLang} from './src/i18n.ts';",resolveDir:sourceRoot},bundle:true,write:false,platform:'browser',format:'iife',globalName:'JournalBridge',target:'es2022',loader:{'.css':'empty'}}).then(output=>output.outputFiles[0].text);
 const dom=new JSDOM('<main id="root"></main>',{url:'http://localhost/blog',runScripts:'outside-only',pretendToBeVisual:true});
 if(timeZone){const NativeFormat=dom.window.Intl.DateTimeFormat;dom.window.Intl.DateTimeFormat=class extends NativeFormat{constructor(locale,options={}){super(locale,{timeZone,...options});}};}
 const calls=[];const fetcher=async(url,init)=>{calls.push([url,init]);return request(url,init);};
 Object.assign(dom.window,{Response,Headers,TextEncoder,fetch:fetcher});vm.runInContext(await bundled,dom.getInternalVMContext());
 const api=vm.runInContext('JournalBridge',dom.getInternalVMContext());api.setLang(english?'en':'zh');
 if(prepareNotes){await api.loadIntegration({includeNotes:false});await api.loadIntegratedNotes();}
 const root=dom.window.document.getElementById('root');root.innerHTML=api.renderIntegratedJournal();
 const bridge=api.mountIntegratedJournal(root,{english:()=>english,fetcher,initialList:prepareNotes?api.takeIntegratedNotesList():undefined});
 return{api,dom,root,bridge,calls,tick:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){bridge.dispose();api.clearIntegration();dom.window.close();}};
}

test('a cold blog uses one real summary request for its hero, timeline and initial directory',async()=>{
 const items=Array.from({length:4},(_,i)=>({...item('cold-'+i),date:`2026-10-${String(10+i).padStart(2,'0')}`,coverSrc:'/api/media/11111111-1111-4111-8111-111111111111?w=960'}));
 const f=await fixture(async url=>Response.json(String(url).includes('view=bootstrap')?{reader:null,author:null,readerRegistrationEnabled:true,collections:{notes:{totalPublished:4,tagCount:1,latest:'2026-10-13'}}}:listing(items)),false,undefined,true);
 try{
  await f.bridge.ready;assert.equal(f.calls.length,2,'one account bootstrap plus one notes summary batch, no duplicate initial directory request');
  assert.equal(f.api.posts.length,4);assert.equal(f.root.querySelectorAll('[data-journal-milestone]').length,4);assert.equal(f.root.querySelectorAll('.journal-publication').length,4);
  assert.match(f.root.querySelector('[data-journal-feature]').textContent,/cold-3/);assert.equal(f.root.querySelector('[data-journal-feature]').getAttribute('href'),'/blog/cold-3');
  assert.doesNotMatch(f.root.textContent,/文章发布后会出现在这里|must never project/);
  f.root.querySelector('[data-integrated-journal-search]').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();
  assert.equal(f.calls.length,3,'a later deliberate query is revalidated by the original reader');
 }finally{f.close();}
});

test('journal uses approved shell and original same-origin bounded notes query without full bodies',async()=>{
 const f=await fixture();try{await f.bridge.ready;
  assert.ok(f.root.querySelector('[data-journal-feature]'));assert.ok(f.root.querySelector('[data-journal-timeline]'));
  assert.equal(f.calls.length,1);const [url,init]=f.calls[0],q=new URL(url,'http://localhost').searchParams;
  assert.equal(q.get('view'),'list');assert.equal(q.get('kind'),'notes');assert.equal(q.get('page'),'1');assert.equal(q.get('public'),'1');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');
  const directory=f.root.querySelector('[data-integrated-journal]');assert.equal(directory.querySelectorAll('.journal-publication').length,1);assert.equal(directory.querySelector('.journal-publication h3 a').getAttribute('href'),'/blog/note-1');assert.doesNotMatch(directory.textContent,/must never project/);
 }finally{f.close();}
});

test('journal rows match the original local publication day and retain the original timestamp for machines',async()=>{
 for(const english of [false,true])for(const [timeZone,date,expected]of [
  ['Asia/Shanghai','2026-09-24T17:30:00Z','2026.09.25'],
  ['America/Los_Angeles','2026-09-25T03:30:00Z','2026.09.24'],
  ['America/Los_Angeles','2026-09-25','2026.09.25'],
 ]){
  const f=await fixture(async()=>Response.json(listing([{...item(),date}])),english,timeZone);
  try{await f.bridge.ready;const time=f.root.querySelector('.journal-publication-date');assert.equal(time.textContent,expected);assert.equal(time.getAttribute('datetime'),date);}
  finally{f.close();}
 }
});

test('server categories, submitted search, pagination and clear issue original query shapes',async()=>{
 const f=await fixture(async(url)=>{const p=new URL(url,'http://localhost').searchParams;return Response.json(listing([item('page-'+p.get('page'))],{total:13,pages:2,totalPublished:13,page:Number(p.get('page'))}));});try{
  await f.bridge.ready;f.root.querySelector('[data-integrated-journal-category="实践"]').click();await f.tick();
  assert.equal(new URL(f.calls.at(-1)[0],'http://localhost').searchParams.get('category'),'实践');
  const input=f.root.querySelector('[data-integrated-journal-query]');input.value='AI 视频';f.root.querySelector('[data-integrated-journal-search]').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();
  assert.equal(new URL(f.calls.at(-1)[0],'http://localhost').searchParams.get('q'),'AI 视频');
  f.root.querySelector('[data-integrated-journal-page="2"]').click();await f.tick();assert.equal(new URL(f.calls.at(-1)[0],'http://localhost').searchParams.get('page'),'2');
  f.root.querySelector('[data-integrated-journal-clear]').click();await f.tick();const q=new URL(f.calls.at(-1)[0],'http://localhost').searchParams;assert.equal(q.get('page'),'1');assert.equal(q.get('q'),'');assert.equal(q.get('category'),'all');
 }finally{f.close();}
});

test('empty, unavailable and malformed responses are honest and retryable',async()=>{
 let mode='empty';const f=await fixture(async()=>mode==='error'?Response.json({error:'Unavailable'},{status:503}):Response.json(mode==='malformed'?listing([],{pages:0}):listing([])));try{
  await f.bridge.ready;assert.match(f.root.querySelector('[data-integrated-journal-results]').textContent,/发布|整理/);assert.equal(f.root.querySelectorAll('[data-integrated-journal-results] a').length,0);
  mode='error';f.root.querySelector('[data-integrated-journal-search]').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();assert.ok(f.root.querySelector('[data-integrated-journal-retry]'));
  mode='malformed';f.root.querySelector('[data-integrated-journal-retry]').click();await f.tick();assert.ok(f.root.querySelector('[data-integrated-journal-retry]'));assert.equal(f.root.querySelectorAll('[data-integrated-journal-results] .journal-publication').length,0);
 }finally{f.close();}
});

test('new search preserves row height while pending, and disposal aborts stale work',async()=>{
 let release;let delayed=false;const f=await fixture(async()=>delayed?new Promise(resolve=>{release=resolve;}):Response.json(listing()));try{
  await f.bridge.ready;delayed=true;
  const form=f.root.querySelector('[data-integrated-journal-search]'),row=f.root.querySelector('.journal-publication');form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(f.root.querySelector('.journal-publication'),row);assert.equal(f.root.querySelector('[data-integrated-journal-results]').getAttribute('aria-busy'),'true');
  const held=f.calls.at(-1)[1].signal;f.bridge.dispose();assert.equal(held.aborted,true);const before=f.root.innerHTML;release(Response.json(listing([item('late')])));await f.tick();assert.equal(f.root.innerHTML,before);
 }finally{f.close();}
});

test('journal pagination positions existing results at click time and preserves rows until commit',async()=>{
 let release,count=0;const f=await fixture(async()=>++count===1?Response.json(listing([item()],{total:13,pages:2,totalPublished:13})):new Promise(resolve=>release=resolve));try{
  await f.bridge.ready;const row=f.root.querySelector('.journal-publication'),targets=[];
  f.root.addEventListener('collection:position',event=>targets.push(event.detail.target));
  f.root.querySelector('[data-integrated-journal-page="2"]').click();assert.equal(targets.length,1);assert.equal(targets[0],f.root.querySelector('[data-integrated-journal-results]'));assert.equal(f.root.querySelector('.journal-publication'),row);
  release(Response.json(listing([item('second')],{total:13,pages:2,totalPublished:13,page:2})));await f.tick();assert.match(f.root.querySelector('.journal-publication').textContent,/second/);assert.equal(targets.length,1);
 }finally{f.close();}
});

test('journal DTO rejects invalid pages, oversized batches, duplicates and unsafe text is escaped',async()=>{
 const f=await fixture();try{await f.bridge.ready;
  assert.equal(f.api.parseIntegratedJournalList(listing(Array.from({length:13},(_,i)=>item(String(i))))),null);
  assert.equal(f.api.parseIntegratedJournalList(listing([item(),item()])),null);
  assert.equal(f.api.parseIntegratedJournalList(listing([item()],{total:13,pages:1,totalPublished:13})),null);
  const parsed=f.api.parseIntegratedJournalList(listing([{...item(),id:'path/with space',title:'<script>alert(1)</script>'}]));assert.ok(parsed);assert.equal('bodyHTML' in parsed.items[0],false);
 }finally{f.close();}
});

test('search focus only changes its containing border and stylesheet remains scoped',async()=>{
 const css=await readFile(new URL('../src/integration-journal.css',import.meta.url),'utf8');
 assert.match(css,/\.integrated-journal-search:focus-within[^}]*border-color:\s*var\(--accent\)/);
 assert.match(css,/input:focus-visible[^}]*outline:\s*none[^}]*box-shadow:\s*none/);
 assert.doesNotMatch(css,/!important/);
});


test('catalog escapes hostile content, encodes detail paths and never retains ETag pages',async()=>{
 const f=await fixture(async()=>Response.json(listing([{...item(),id:'path/with space',title:'<script>alert(1)</script>',summary:'<img src=x onerror=alert(1)>',category:'<x>',tags:['<a>']}]),{headers:{ETag:'"fixture"'}}));try{
  await f.bridge.ready;const results=f.root.querySelector('[data-integrated-journal-results]');assert.equal(results.querySelector('script,img'),null);assert.equal(results.querySelector('h3 a').getAttribute('href'),'/blog/path%2Fwith%20space');assert.match(results.textContent,/<script>/);
  f.root.querySelector('[data-integrated-journal-search]').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();assert.equal(f.calls.length,2);assert.equal(new Headers(f.calls[1][1].headers).has('If-None-Match'),false);
 }finally{f.close();}
});

test('keyboard Escape resets filters and keeps focus in the stable search input',async()=>{
 const f=await fixture();try{await f.bridge.ready;const input=f.root.querySelector('[data-integrated-journal-query]');input.value='AI';input.focus();input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await f.tick();assert.equal(input.value,'');assert.equal(f.dom.window.document.activeElement,input);assert.equal(new URL(f.calls.at(-1)[0],'http://localhost').searchParams.get('q'),'');}finally{f.close();}
});
