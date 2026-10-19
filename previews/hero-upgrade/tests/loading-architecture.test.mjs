import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer, request } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createBuildOptions, buildManifest, applyBuildManifest } from '../scripts/build-config.ts';
import { finishResponse, encodingFor } from '../server-response.ts';
import { vipContactURL } from '../../../src/vip-book-prompt.mjs';

test('direct inner routes show their loading state and recover if the entry module cannot load', async () => {
  const html = await readFile(new URL('../www/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:4285/learning', runScripts: 'dangerously', beforeParse(window) {
    window.matchMedia = () => ({ matches: true });
  } });
  try {
    const doc = dom.window.document;
    assert.equal(doc.documentElement.dataset.bootRoute, 'inner');
    assert.equal(doc.querySelector('#app-load-error').hidden, true);
    doc.querySelector('script[type="module"]').dispatchEvent(new dom.window.Event('error'));
    assert.equal(doc.querySelector('#app-load-error').hidden, false);
    assert.equal(doc.body.classList.contains('is-loading'), false);
    assert.ok(doc.querySelector('#app-load-error a[href="https://www.sansphase.com/"]'));
    assert.equal(doc.documentElement.dataset.bootRoute, 'inner', 'failure must not reveal an unrelated homepage');
  } finally { dom.window.close(); }
});

test('entry dependencies exclude Three.js, GPU scene and PhotoSwipe until their optional experience is opened', async () => {
  const result = await build({ ...createBuildOptions({ artifacts: false }), write: false, logLevel: 'silent' });
  const outputs = result.metafile.outputs;
  const manifest = buildManifest(result.metafile);
  assert.match(manifest.script, /^\/build\/main-[A-Z0-9]{8}\.js$/);
  assert.match(manifest.stylesheet, /^\/build\/main-[A-Z0-9]{8}\.css$/);
  const initial = new Set();
  const walk = path => {
    if (initial.has(path)) return;
    initial.add(path);
    for (const edge of outputs[path].imports) if (edge.kind !== 'dynamic-import' && outputs[edge.path]) walk(edge.path);
  };
  const main = Object.keys(outputs).find(path => path.endsWith(manifest.script.slice('/build/'.length)));
  walk(main);
  const inputs = [...initial].flatMap(path => Object.keys(outputs[path].inputs));
  assert.equal(inputs.some(path => /node_modules\/three\//.test(path)), false, 'inner page does not download the WebGL library');
  assert.equal(inputs.some(path => /src\/scene\.ts$/.test(path)), false);
  assert.equal(inputs.some(path => /node_modules\/photoswipe\/.*\.js$/.test(path)), false, 'image viewing core is requested by Reader');
  assert.equal(inputs.some(path => /src\/integration-access\.ts$/.test(path)), false, 'access copy and the existing VIP contact load only after a permission response');
  assert.ok(Object.values(outputs).some(value => value.entryPoint?.endsWith('src/scene.ts')));
  assert.ok(Object.values(outputs).some(value => value.entryPoint?.includes('photoswipe')));
  const initialBytes = [...initial].reduce((sum, path) => sum + outputs[path].bytes, 0);
  assert.ok(initialBytes < 450_000, `initial source budget: ${initialBytes} raw bytes`);
  assert.ok(manifest.assets.every(path => !path.endsWith('.map')), 'production source maps are not emitted');
  const html = applyBuildManifest('<link href="/build/main.css"><script src="/build/main.js"></script>', manifest);
  assert.ok(html.includes(manifest.script) && html.includes(manifest.stylesheet));
});

test('compression accepts explicit preferences and never overrides q=0', () => {
  assert.equal(encodingFor('gzip, br'), 'br');
  assert.equal(encodingFor('gzip;q=1, br;q=0.5'), 'gzip');
  assert.equal(encodingFor('br;q=0, gzip;q=0'), null);
  assert.equal(encodingFor('br;q=0, *;q=1'), 'gzip');
  assert.equal(encodingFor('gzip;q=invalid'), null);
});

test('startup failures offer a retry without revealing demo content, and transient detail failures keep their retry UI',async()=>{
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  const contents=`export function mount(env){const document=env.document,html=document.documentElement,viewHome=document.querySelector('#view-home'),viewPage=document.querySelector('#view-page'),location={reload(){env.reloads++}},lenis={start(){env.started++}},navigationRestore={cancel(){env.cancelled++}},historyPositions={complete(){env.completed++}},readerActive=()=>false,hideArticle=()=>{},closeMenu=()=>{},clearStaticArticle=()=>{},pageTransition={settle(){}};let disposeIntegrated=()=>{},viewRoute={page:'software'};const integrationGate=()=>{env.gates++},refreshIntegratedPage=()=>{env.refreshed++};${extract('function showLoadingFailure()', 'function renderCurrentPage()')}return{showLoadingFailure,handleIntegratedError,get committed(){return viewRoute}}}`;
  const result=await build({stdin:{contents,loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
  const {mount}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  const dom=new JSDOM('<!doctype html><html data-boot-route="inner"><body class="is-loading"><main><section id="view-home">Demo content</section><section id="view-page" hidden></section></main></body></html>');
  const env={document:dom.window.document,reloads:0,started:0,cancelled:0,completed:0,gates:0,refreshed:0};
  try {
    const api=mount(env);api.showLoadingFailure();
    assert.equal(env.document.querySelector('#view-home').hidden,true);
    assert.equal(env.document.body.classList.contains('is-loading'),false);
    assert.equal(api.committed,null);
    env.document.querySelector('[data-reload]').click();assert.equal(env.reloads,1);
    const page=env.document.querySelector('#view-page');page.innerHTML='<section class="integrated-empty"><button data-integrated-retry>Try again</button></section>';
    api.handleIntegratedError({status:503});api.handleIntegratedError(new DOMException('Timed out','TimeoutError'));
    assert.ok(page.querySelector('[data-integrated-retry]'));
    assert.equal(env.gates,0);assert.equal(env.refreshed,2);
    api.handleIntegratedError({status:401});assert.equal(env.gates,1);
    assert.equal(env.cancelled,3);assert.equal(env.completed,3);
    assert.match(source,/onError:handleIntegratedError/,'the mounted content flow uses the verified error handler');
  }finally{dom.window.close();}
});

test('article access gate reserves unpublished copy for 404 and gives service or timeout failures a retry',async()=>{
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  const first=source.indexOf('function integrationGate('),last=source.indexOf('function renderCurrentPage()',first);
  const contents=`export function mount(env){const document=env.document,html=document.documentElement,viewHome=document.querySelector('#view-home'),viewPage=document.querySelector('#view-page'),location={pathname:'/blog/first',search:'',reload(){}},lenis={start(){}},navigationRestore={cancel(){}},historyPositions={complete(){}},readerActive=()=>false,hideArticle=()=>{},closeMenu=()=>{},clearStaticArticle=()=>{},pageTransition={settle(){}},en=()=>env.language==='en',refreshIntegratedPage=()=>{};let viewRoute={page:'blog'},disposeIntegrated=()=>{env.disposed++};${source.slice(first,last)}return{integrationGate}}`;
  const result=await build({stdin:{contents,loader:'ts',resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'esm',platform:'node',write:false});
  const {mount}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  for(const language of ['zh','en'])for(const error of [{status:503},new DOMException('Timed out','TimeoutError'),new TypeError('Failed to fetch'),{status:401},{status:403},{status:404}]){
    const dom=new JSDOM('<!doctype html><html><body><section id="view-home"></section><section id="view-page"></section></body></html>');
    const env={document:dom.window.document,disposed:0,language,vipContactURL};
    try{
      await mount(env).integrationGate(error);
      const page=env.document.querySelector('#view-page');
      assert.equal(env.disposed,1,'each failed surface disposes its previous asynchronous content');
      if([401,403,404].includes(error.status)){
        assert.equal(page.querySelector('[data-reload]'),null);
        assert.ok(page.querySelector('a[href^="/account"]'));
      }else{
        assert.ok(page.querySelector('[data-reload]'),'transient errors offer an explicit reload');
        assert.doesNotMatch(page.textContent,/尚未发布|已撤回|相应权限/,'a transport failure is not evidence of publication or permission status');
      }
      const contact=page.querySelector('[data-vip-contact]');
      if(error.status===403){
        assert.ok(contact,'the permission page retains the original VIP author-contact action');
        assert.equal(contact.href,vipContactURL);assert.equal(contact.target,'_blank');assert.equal(contact.rel,'noopener noreferrer');
        assert.equal(contact.textContent.trim(),language==='zh'?'联系作者开通 VIP':'Contact the author to activate VIP');
        assert.ok(page.querySelector('a[href="/blog"]'));
      }else assert.equal(contact,null,'401,404 and transport failures must not show an incorrect membership action');
    }finally{dom.window.close();}
  }
  const dom=new JSDOM('<!doctype html><section id="view-home"></section><section id="view-page"></section>');
  try{
    const env={document:dom.window.document,disposed:0,language:'zh',vipContactURL},api=mount(env),page=env.document.querySelector('#view-page');
    const pending=api.integrationGate({status:403});page.innerHTML='<h1>Later destination</h1>';await pending;
    assert.equal(page.textContent,'Later destination','a late access module must not replace a newer route');
  }finally{dom.window.close();}
});

test('identity refresh clears retained list state after disposal and before the new identity loads',async()=>{
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  const first=source.indexOf('const refreshIdentity = async () => {'),last=source.indexOf('    account = accountModule.',first);
  const contents=`export function mount(env){const location={href:'http://localhost/software',pathname:'/software',search:'',hash:'',origin:'http://localhost'},viewPage=env.root,viewShown='software',localRuntime={safeIntegrationReturn(){return null},legacyIntegrationPath(){return null},clearIntegration(){env.events.push('clear-identity')},async loadIntegration(){env.events.push('load-identity');return true},integrationState:{}},contentModule={resetIntegratedContentState(root){if(root!==viewPage)throw Error('wrong scope');env.events.push('reset-list')}},disposeLibrary=()=>{},disposeCatalog=()=>{},readerActive=()=>false,hideArticle=()=>{},showLoadingFailure=()=>{},buildNav=()=>{},renderAll=()=>{env.events.push('render')},navigate=()=>{};let disposeIntegrated=()=>{env.events.push('dispose')},homeContentDirty=true,routeEpoch=0,identityRefreshEpoch=0,identityRefreshNavigation=null;${source.slice(first,last)}return refreshIdentity}`;
  const result=await build({stdin:{contents,loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
  const {mount}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  const env={root:{},events:[]};await mount(env)();
  assert.deepEqual(env.events,['dispose','reset-list','clear-identity','load-identity','render']);
});

let identityNavigationHarness;
async function identityNavigationFixture(path='/account?return=%2Fresources%2Frequested-book') {
  identityNavigationHarness ??= (async()=>{
    const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
    const first=source.indexOf('const refreshIdentity = async () => {'),last=source.indexOf('    account = accountModule.',first);
    const changedStart=source.indexOf('changed:()=>{'),changedEnd=source.indexOf('\n    }});',changedStart);
    const hashStart=source.indexOf("addEventListener('hashchange', () => {"),hashEnd=source.indexOf('\n});',hashStart);
    const contents=`import {legacyIntegrationPath,safeIntegrationReturn} from './src/integration-runtime.ts';
      export function mount(env){const location=env.window.location,viewPage=env.root,localRuntime=env.runtime,
      contentModule={resetIntegratedContentState(){env.events.push('reset-list')}},disposeLibrary=()=>{},disposeCatalog=()=>{},
      readerActive=()=>false,hideArticle=()=>{},showLoadingFailure=()=>env.events.push('failure'),
      buildNav=()=>env.events.push('nav-'+(localRuntime.integrationState.reader?.nickname??'guest')),
      renderAll=()=>env.events.push('render-'+location.pathname+'-'+(localRuntime.integrationState.reader?.nickname??'guest')),
      renderCurrentPage=()=>env.events.push('changed-'+location.pathname),integrated=true,
      navigate=(path,replace=false)=>{env.events.push('navigate-'+path);env.window.history[replace?'replaceState':'pushState'](null,'',path);routeEpoch++;route={page:location.pathname.slice(1).split('/')[0]||'home'};viewShown=route.page};
      let disposeIntegrated=()=>env.events.push('dispose'),homeContentDirty=true,viewShown='account',route={page:'account'},routeEpoch=0,
      identityRefreshEpoch=0,identityRefreshNavigation=null;
      Object.assign(localRuntime,{legacyIntegrationPath,safeIntegrationReturn});
      ${source.slice(first,last)}
      const changed=()=>{${source.slice(changedStart+'changed:()=>{'.length,changedEnd)}};
      const hashChanged=()=>{${source.slice(hashStart+"addEventListener('hashchange', () => {".length,hashEnd)}};
      env.window.addEventListener('hashchange',hashChanged);
      return {refreshIdentity,changed,navigate,get dirty(){return homeContentDirty},close(){env.window.removeEventListener('hashchange',hashChanged)}}}
    `;
    const result=await build({stdin:{contents,loader:'ts',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,format:'esm',platform:'node',write:false});
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  })();
  const dom=new JSDOM('<!doctype html><main></main>',{url:'http://localhost'+path});
  const events=[],requests=[];
  let runtimeGeneration=0;
  const runtime={integrationState:{reader:null,author:null},homeIntegrationReady:false,
    clearIntegration(){runtimeGeneration++;this.integrationState={reader:null,author:null};this.homeIntegrationReady=false;events.push('clear-identity')},
    loadIntegration(options){const generation=runtimeGeneration;events.push('load-identity');return new Promise(resolve=>requests.push({finish(success=true,nickname='current',staleResult=false){if(generation===runtimeGeneration){if(success)runtime.integrationState={reader:{nickname},author:null};runtime.homeIntegrationReady=success&&options.includeNotes}resolve(staleResult?success:generation===runtimeGeneration&&success)}}))},
  };
  const {mount}=await identityNavigationHarness;
  const api=mount({window:dom.window,root:dom.window.document.querySelector('main'),runtime,events});
  return {api,runtime,requests,events,window:dom.window,tick:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){api.close();dom.window.close()}};
}

test('a slow post-login identity bootstrap refreshes current identity without restoring a departed return route',async()=>{
  const f=await identityNavigationFixture();try{
    const pending=f.api.refreshIdentity();f.api.navigate('/software');f.requests[0].finish(true,'latest-reader');await pending;
    assert.equal(f.window.location.pathname,'/software');
    assert.ok(f.events.includes('render-/software-latest-reader'),'the new page and account chrome still receive the validated identity');
    assert.equal(f.events.includes('navigate-/resources/requested-book'),false);
    f.api.changed();assert.equal(f.window.location.pathname,'/software','the adapter changed callback cannot replay the old return');
  }finally{f.close()}
});

test('late bootstrap failure cannot replace a later route or a same-page anchor navigation',async()=>{
  for(const destination of ['/software','/account?return=%2Fresources%2Frequested-book#details']){
    const f=await identityNavigationFixture();try{
      const pending=f.api.refreshIdentity();f.api.navigate(destination);f.requests[0].finish(false);await pending;f.api.changed();
      assert.equal(f.window.location.pathname+f.window.location.search+f.window.location.hash,destination);
      assert.equal(f.events.includes('failure'),false,'an old bootstrap cannot own a later error surface');
      assert.ok(f.events.includes('nav-guest'),'even a failed current bootstrap clears outdated account chrome');
    }finally{f.close()}
  }
});

test('leaving and returning to the same account URL does not revive the old login return intent',async()=>{
  const f=await identityNavigationFixture();try{
    const pending=f.api.refreshIdentity();f.api.navigate('/software');f.api.navigate('/account?return=%2Fresources%2Frequested-book');
    f.requests[0].finish();await pending;f.api.changed();
    assert.equal(f.window.location.pathname,'/account');
    assert.equal(f.events.includes('navigate-/resources/requested-book'),false);
  }finally{f.close()}
});

test('superseded identity refresh success and failure cannot render or redirect over the latest refresh',async()=>{
  for(const oldFirst of [false,true])for(const oldSuccess of [false,true])for(const returnPath of [false,true]){
    const f=await identityNavigationFixture(returnPath?undefined:'/account');try{
      const first=f.api.refreshIdentity(),second=f.api.refreshIdentity();
      if(oldFirst){f.requests[0].finish(oldSuccess,'stale',true);await first;assert.equal(f.events.includes('failure'),false);f.api.changed();assert.equal(f.events.some(value=>value.startsWith('changed-')),false)}
      f.requests[1].finish(true,'new-identity');await second;
      const committed=[...f.events];
      if(!oldFirst){f.requests[0].finish(oldSuccess,'stale',true);await first;f.api.changed();assert.deepEqual(f.events,committed,'old completion and callback must not touch the new page')}
      assert.equal(f.events.includes('failure'),false);assert.equal(f.runtime.integrationState.reader.nickname,'new-identity');
      assert.equal(f.window.location.pathname,returnPath?'/resources/requested-book':'/account');
    }finally{f.close()}
  }
});

test('a later user legacy hash cancels identity return while current guest account controls remain usable',async()=>{
  const f=await identityNavigationFixture();try{
    const pending=f.api.refreshIdentity();await Promise.resolve();
    f.window.location.hash='#/software';await f.tick();
    f.requests[0].finish();await pending;f.api.changed();
    assert.equal(f.window.location.pathname,'/software');assert.equal(f.events.includes('navigate-/resources/requested-book'),false);
    f.api.navigate('/account');f.runtime.integrationState={reader:null,author:null};f.api.changed();
    assert.ok(f.events.includes('changed-/account'),'a new guest form can still switch login and registration modes');
  }finally{f.close()}
});

test('normal login returns after identity bootstrap and preserves the original synchronous legacy-hash handoff',async()=>{
  for(const legacyHandoff of ['none','pending','immediate']){
    const f=await identityNavigationFixture();try{
      const pending=f.api.refreshIdentity();
      if(legacyHandoff!=='none'){f.window.location.hash='#/notes';if(legacyHandoff==='pending')await f.tick()}
      f.requests[0].finish(true,'signed-in');await pending;f.api.changed();
      assert.equal(f.window.location.pathname,'/resources/requested-book');
      assert.ok(f.events.includes('render-'+(legacyHandoff==='pending'?'/blog':'/account')+'-signed-in'));
      assert.equal(f.events.filter(value=>value==='navigate-/resources/requested-book').length,1);
    }finally{f.close()}
  }
});

test('document title follows the real original section reader and stays the book name after opening a chapter',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 const first=source.indexOf('function setDocTitle('),last=source.indexOf('function refreshIntegratedPage()',first);
 const contents=`import {mountIntegratedContent} from './src/integration-content.ts'; export function mount(env){const document=env.document,viewPage=document.querySelector('main'),route={page:'resources',id:'book'},readerActive=()=>false,posts=[],reader={},PAGES=[{page:'resources',key:'library'}],pick=value=>value.zh,t=value=>value==='library'?'资源中心':'首页',en=()=>false;${source.slice(first,last)}return{setDocTitle,mountBook:()=>mountIntegratedContent(viewPage,{kind:'resource-center',id:'book'},{english:en,onReady:()=>setDocTitle('resources')})}}`;
 const result=await build({stdin:{contents,loader:'ts',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,format:'esm',platform:'node',write:false});
 const {mount}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
 const dom=new JSDOM('<!doctype html><html><head><title>资源中心</title></head><body><main></main></body></html>',{url:'http://localhost/resources/book',pretendToBeVisual:true});
 const win=dom.window,doc=win.document;
 win.scrollTo=()=>{};win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 win.fetch=async url=>Response.json(String(url).includes('view=book-part')?{revision:'revision',chapter:'third',title:'第三章',part:0,parts:1,relocated:false,html:'<div data-book-block="body" data-book-offset="0"><p>真实阅读结构。</p></div>'}:{item:{id:'book',title:'图解 Agent 工作原理',summary:'记录模型与工具的运行方式。',category:'教程',tags:[],date:'2026-10-19',attachments:[],book:{revision:'revision',chapters:[{id:'third',title:'第三章',parts:1,headings:[]}]}}});
 let book;
 try{
  const api=mount({document:doc});book=api.mountBook();await book.ready;
  assert.ok(doc.querySelector('.section-reader'),'the real default original reader is mounted');assert.equal(doc.querySelector('.book-running-title'),null,'the paged-mode title is replaced by the real reader');
  assert.equal(doc.title,'图解 Agent 工作原理 — SANSPHASE 無相');
  doc.querySelector('[data-section-action="start"]').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(doc.querySelector('.section-article-heading > h1')?.textContent,'第三章');
  api.setDocTitle('resources');assert.equal(doc.title,'图解 Agent 工作原理 — SANSPHASE 無相','changing chapters cannot replace the book name');
 }finally{book?.();dom.window.close();}
});

test('only the blog index and homepage request shared public summaries, while direct content stays independent',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 const first=source.indexOf('async function prepareIntegratedRoute('),last=source.indexOf('async function swapView(',first);
 const contents=`export function mount(env){const integrated=true,localRuntime=env.runtime;let journalModule={},contentModule={},homeContentDirty=false;${source.slice(first,last)}return{prepareIntegratedRoute,get dirty(){return homeContentDirty}}}`;
 const result=await build({stdin:{contents,loader:'ts'},bundle:false,format:'esm',platform:'node',write:false});
 const {mount}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
 let calls=0;const runtime={homeIntegrationReady:false,async loadIntegratedNotes(){calls++;this.homeIntegrationReady=true;return true}};
 const api=mount({runtime});
 for(const route of [{page:'work'},{page:'learning'},{page:'software',id:'codex'},{page:'blog',slug:'article'}])await api.prepareIntegratedRoute(route);
 assert.equal(calls,0,'an article or unrelated directory must not wait for the homepage index');
 await api.prepareIntegratedRoute({page:'blog'});assert.equal(calls,1);assert.equal(api.dirty,true);
 await api.prepareIntegratedRoute({page:'blog'});await api.prepareIntegratedRoute({page:'home'});assert.equal(calls,1);
});

test('static delivery compresses, validates and distinguishes immutable assets from changing HTML and private APIs', async () => {
  const original = 'Local static delivery. '.repeat(300);
  const server = createServer((req, res) => {
    const cache = req.url === '/api/content' ? undefined : req.url === '/index.html' ? 'revalidate' : 'immutable';
    void finishResponse(res, 200, 'text/javascript; charset=utf-8', original, req.method === 'HEAD', cache);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const read = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers, method }, res => {
      const chunks = []; res.on('data', bytes => chunks.push(bytes)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', reject); req.end();
  });
  try {
    const br = await read('/build/main-HASH1234.js', { 'accept-encoding': 'br' });
    assert.equal(br.headers['content-encoding'], 'br'); assert.equal(brotliDecompressSync(br.body).toString(), original);
    assert.match(br.headers['cache-control'], /immutable/); assert.match(br.headers.vary, /Accept-Encoding/);
    const gzip = await read('/build/main-HASH1234.js', { 'accept-encoding': 'gzip' });
    assert.equal(gunzipSync(gzip.body).toString(), original);
    const unchanged = await read('/build/main-HASH1234.js', { 'if-none-match': br.headers.etag });
    assert.equal(unchanged.status, 304); assert.equal(unchanged.body.length, 0);
    const head = await read('/build/main-HASH1234.js', { 'accept-encoding': 'br' }, 'HEAD');
    assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), br.body.length);
    assert.equal((await read('/index.html')).headers['cache-control'], 'no-cache');
    const api = await read('/api/content'); assert.equal(api.headers['cache-control'], 'no-store'); assert.equal(api.headers.etag, undefined);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
