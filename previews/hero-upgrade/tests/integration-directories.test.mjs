import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
import {vipContactURL} from '../../../src/vip-book-prompt.mjs';

const result=await build({stdin:{contents:"export * from './src/catalog-page.ts';export * from './src/library-page.ts';export * from './src/integration-context.ts';export {mountLocalEnvironment} from './src/integration-runtime.ts';export {setLang} from './src/i18n.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',target:'node24',format:'esm',write:false});
let sequence=0;
const mediaId='c57acd8d-a84c-459b-9eb3-6e7f84a82a2e';
const payload=()=>({items:[{id:'local-entry',title:'本地正式接口夹具',summary:'仅在测试中使用。',category:'测试',tags:['测试'],date:'2026-10-19',coverSrc:`/api/media/${mediaId}?w=960&view=content`,format:'PDF',file:'fixture.pdf',fileSize:2048,externalUrl:'https://example.org/',downloadUrl:`/api/media/${mediaId}?download=1`,vipOnly:true,locked:true}],total:1,page:1,pages:1,totalPublished:1,categories:['测试'],highlights:[]});
async function fixture(kind='resources',fetcher=async()=>Response.json(payload()),marker={mode:'local',origin:'http://localhost:4285'},language='zh'){
  const path=kind==='resource-center'?'/resources':kind==='software'?'/software':'/learning';
  const dom=new JSDOM('<body><script id="site-integration" type="application/json"></script><main id="root"></main></body>',{url:'http://localhost:4285'+path,pretendToBeVisual:true});
  dom.window.document.querySelector('#site-integration').textContent=JSON.stringify(marker);
  const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','CustomEvent','AbortController','localStorage'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],writable:true,configurable:true});
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64')+'#'+(++sequence));api.setLang(language);
  const root=dom.window.document.querySelector('#root');root.innerHTML=kind==='resource-center'?api.renderLibraryPage():api.renderCatalogPage(kind);
  const calls=[];const mocked=async(url,options)=>{calls.push({url,options});return fetcher(url,options);};
  const controller=kind==='resource-center'?api.bindLibrary(root,mocked):api.bindCatalog(root,kind,mocked);
  return{api,dom,root,calls,settle:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){controller.dispose();dom.window.close();for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}};
}
test('local integration requires the exact per-document origin and cannot be enabled by URL or malformed marker',async()=>{
  for(const marker of [{mode:'local',origin:'http://evil.example'},{mode:'demo',origin:'http://localhost:4285'},null,[],{mode:'local'}]){
    const f=await fixture('resources',undefined,marker);try{await f.settle();assert.equal(f.api.isLocalIntegration(),false);assert.equal(f.calls.length,0);assert.ok(f.root.querySelector('[data-catalog-source="demo"]'));assert.equal(f.root.querySelectorAll('[data-sample-id]').length,6);}finally{f.close();}
  }
});

test('production documents connect existing data without pretending to be a local test environment',async()=>{
  for(const kind of ['resources','software','resource-center']){
    const f=await fixture(kind,undefined,{mode:'production',origin:'http://localhost:4285',frontendVersion:2,originalVersion:1});
    try{
      await f.settle();assert.equal(f.api.isSiteIntegration(),true);assert.equal(f.api.isLocalIntegration(),false);assert.equal(f.api.localIntegrationMetadata(),null);
      assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.credentials,'same-origin');
      assert.equal(f.root.querySelector('[data-sample-id]'),null);assert.equal(f.root.querySelector('[data-catalog-source="demo"]'),null);
      const note=f.root.querySelector('[data-catalog-source-note],[data-library-source-note]');assert.doesNotMatch(note.textContent,/本地|LOCAL CONNECTION/);
    }finally{f.close();}
  }
});
test('local environment badge identifies both frontend versions and only displays whitelisted data-source labels',async()=>{
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64')+'#badge');
  for(const [source,label]of [[undefined,'隔离测试数据'],['existing-local','本地主站数据'],['secret-path:<img src=x onerror=alert(1)>','本地联调'],[{'path':'private.db'},'本地联调']]){
    const dom=new JSDOM('<head><script id="site-integration" type="application/json"></script></head><body></body>',{url:'http://127.0.0.1:4286/'});
    try{
      const doc=dom.window.document,marker={mode:'local',origin:dom.window.location.origin,...(source===undefined?{}:{dataSource:source}),databasePath:'secret-path:private.db',password:'never-show-me'};
      doc.getElementById('site-integration').textContent=JSON.stringify(marker);
      assert.equal(api.isLocalIntegration(doc),true);
      api.mountLocalEnvironment(doc);
      const badge=doc.querySelector('.integration-environment'),links=[...badge.querySelectorAll('a')];
      assert.equal(links.length,2);assert.equal(links[0].getAttribute('href'),'/__local-test');assert.equal(links[1].getAttribute('href'),'/original');
      assert.match(links[0].textContent,/版本2 · 新版前端/);assert.match(links[1].textContent,/版本1 · 原主站/);assert.ok(links[0].textContent.includes(label));
      assert.doesNotMatch(badge.textContent,/private\.db|never-show-me|secret-path/);assert.equal(badge.querySelector('img,script'),null);
      assert.deepEqual(Object.keys(api.localIntegrationMetadata(doc)),['dataSource'],'raw marker fields must not escape the safe metadata projection');
    }finally{dom.window.close();}
  }
  for(const marker of [{mode:'production',origin:'https://www.sansphase.com',frontendVersion:2},null]){
    const dom=new JSDOM('<head><script id="site-integration" type="application/json"></script></head><body></body>',{url:'https://www.sansphase.com/'});
    try{
      const doc=dom.window.document;doc.getElementById('site-integration').textContent=JSON.stringify(marker);
      api.mountLocalEnvironment(doc);
      assert.equal(doc.querySelector('.integration-environment'),null,'production and standalone documents must never present local test links');
    }finally{dom.window.close();}
  }
});
test('badge metadata does not weaken the same-origin local marker boundary',async()=>{
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64')+'#badge-metadata');
  const dom=new JSDOM('<head><script id="site-integration" type="application/json"></script></head>',{url:'http://127.0.0.1:4286/?dataSource=existing-local'});
  try{
    const doc=dom.window.document,marker=doc.getElementById('site-integration');
    for(const value of [{mode:'local',origin:'https://untrusted.example',dataSource:'existing-local'},{mode:'demo',origin:dom.window.location.origin,dataSource:'existing-local'},null,[]]){
      marker.textContent=JSON.stringify(value);assert.equal(api.isLocalIntegration(doc),false);assert.equal(api.localIntegrationMetadata(doc),null);
    }
    marker.textContent='invalid JSON';assert.equal(api.localIntegrationMetadata(doc),null);marker.remove();assert.equal(api.localIntegrationMetadata(doc),null);
  }finally{dom.window.close();}
});
test('local materials and software retain approved distinct heroes while connecting original source, media and detail routes',async()=>{
  for(const[kind,path,hero]of [['resources','/learning','.materials-launchpad'],['software','/software','.software-workbench']]){
    const f=await fixture(kind);try{await f.settle();assert.ok(f.root.querySelector(hero));assert.equal(f.root.querySelector('[data-catalog-source]'),null);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.credentials,'same-origin');assert.match(f.calls[0].url,new RegExp('kind='+kind));
      const card=f.root.querySelector('.catalog-entry>a');assert.equal(card.getAttribute('href'),path+'/local-entry');assert.equal(card.hasAttribute('target'),false);assert.equal(card.querySelector('img').getAttribute('src'),`/api/media/${mediaId}?w=960&view=content`);assert.match(f.root.querySelector('[data-catalog-source-note]').textContent,/本地已连接/);assert.equal(f.root.querySelector('[data-sample-id]'),null);assert.equal(f.root.querySelector('a[href*="sansphase.com"]'),null);
    }finally{f.close();}
  }
});
test('live catalog launchers never advertise demo software or apply absent preset searches',async()=>{
  for(const kind of ['resources','software']){
    const f=await fixture(kind);
    try{
      await f.settle();
      assert.equal(f.root.querySelector('[data-catalog-preset]'),null,'live entries must not inherit demo-only search buttons');
      const launcher=f.root.querySelector('[data-catalog-launcher]');
      assert.ok(launcher);
      const links=[...launcher.querySelectorAll('a[href]')];
      assert.equal(links.length,3);
      for(const link of links){
        const target=f.root.querySelector(link.getAttribute('href'));
        assert.ok(target,'a live shortcut reaches an existing directory control or guide');
        assert.equal(link.hasAttribute('target'),false);
      }
      if(kind==='software')assert.doesNotMatch(f.root.querySelector('.catalog-hero').textContent,/Logseq|Kdenlive|Excalidraw|开源工具|open-source tools/i);
      assert.equal(f.root.querySelector('.catalog-search input').value,'');
    }finally{f.close();}
  }
});
test('switching demo and live sources updates launcher semantics with the catalog source',async()=>{
  const f=await fixture('software',undefined,null);
  try{
    await f.settle();
    assert.equal(f.root.querySelectorAll('[data-catalog-preset]').length,3);
    assert.match(f.root.querySelector('.catalog-hero').textContent,/Logseq/);
    f.root.querySelector('[data-catalog-source="live"]').click();await f.settle();
    assert.equal(f.root.querySelector('[data-catalog-preset]'),null);
    assert.equal(f.root.querySelectorAll('[data-catalog-launcher] a').length,3);
    assert.doesNotMatch(f.root.querySelector('.catalog-hero').textContent,/Logseq|Kdenlive|Excalidraw|开源工具|open-source tools/i);
    f.root.querySelector('[data-catalog-source="demo"]').click();await f.settle();
    assert.equal(f.root.querySelectorAll('[data-catalog-preset]').length,3);
    assert.match(f.root.querySelector('.catalog-hero').textContent,/Logseq/);
  }finally{f.close();}
});
test('local library retains interactive book, links locked items to original local reader and never mixes sample records',async()=>{
  const f=await fixture('resource-center');try{await f.settle();assert.ok(f.root.querySelector('[data-library-book]'));assert.equal(f.root.querySelector('button[data-library-source]'),null);assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/kind=resource-center/);
    const link=f.root.querySelector('.library-book');assert.equal(link.getAttribute('href'),'/resources/local-entry');assert.equal(link.hasAttribute('target'),false);assert.match(link.textContent,/VIP/);assert.equal(link.querySelector('img').getAttribute('src'),`/api/media/${mediaId}?w=960&view=content`);assert.equal(f.root.querySelector('[data-library-sample]'),null);assert.match(f.root.querySelector('[data-library-source-note]').textContent,/本地已连接/);
  }finally{f.close();}
});

test('local materials, software and library cards use local dates without shifting calendar-only values',async()=>{
  const NativeFormat=Intl.DateTimeFormat;
  try{
    for(const[timeZone,date,expected]of [['Asia/Shanghai','2026-09-24T17:30:00Z','2026-09-25'],['America/Los_Angeles','2026-09-25T03:30:00Z','2026-09-24'],['America/Los_Angeles','2026-09-25','2026-09-25']]){
      Intl.DateTimeFormat=class extends NativeFormat{constructor(locale,options={}){super(locale,{timeZone,...options});}};
      for(const kind of ['resources','software','resource-center']){
        const value=payload();value.items[0].date=date;
        const f=await fixture(kind,async()=>Response.json(value));
        try{await f.settle();const time=f.root.querySelector(kind==='resource-center'?'.library-book time':'.catalog-entry time');assert.equal(time.textContent,expected,kind+' '+timeZone);assert.equal(time.getAttribute('datetime'),date);}
        finally{f.close();}
      }
    }
  }finally{Intl.DateTimeFormat=NativeFormat;}
});
test('401 and403 local directory gates offer same-origin account return and preserve the visible page',async()=>{
  for(const kind of ['resources','software','resource-center'])for(const status of [401,403]){
    const f=await fixture(kind,async()=>Response.json({code:status===403?'VIP_REQUIRED':'LOGIN_REQUIRED'},{status}));try{const before=f.dom.window.location.pathname;await f.settle();const selector=kind==='resource-center'?'[data-library-results]':'[data-catalog-results]';assert.equal(f.root.querySelector(selector).dataset.state,status===401?'auth':kind==='resource-center'?'vip':'restricted');
      const link=f.root.querySelector(selector+' a[href^="/account?"]');assert.ok(link);assert.equal(new URL(link.href).searchParams.get('return'),before);assert.equal(link.hasAttribute('target'),false);assert.equal(f.dom.window.location.pathname,before);assert.equal(f.root.textContent.includes('尚未连接主站登录'),false);assert.equal(f.root.querySelector(selector+' a[href*="sansphase.com"]'),null);
    }finally{f.close();}
  }
});

test('restricted integrated library states restore the original VIP contact in both languages without offering it for login or missing content',async()=>{
  for(const language of ['zh','en'])for(const mode of ['local','production'])for(const status of [401,403,404]){
    const f=await fixture('resource-center',async()=>Response.json({code:status===403?'VIP_REQUIRED':'UNAVAILABLE'},{status}),{mode,origin:'http://localhost:4285'},language);
    try{
      await f.settle();
      const gate=f.root.querySelector('[data-library-results]'),contact=gate.querySelector('[data-vip-contact]');
      if(status===403){
        assert.ok(contact,'a rejected library read preserves the existing author-contact path');
        assert.equal(contact.href,vipContactURL);assert.equal(contact.target,'_blank');assert.equal(contact.rel,'noopener noreferrer');
        assert.equal(contact.textContent.trim(),language==='zh'?'联系作者开通 VIP':'Contact the author to activate VIP');
        assert.ok(gate.querySelector('a[href^="/account?"]'));assert.ok(gate.querySelector('a[href="/blog"]'));
      }else assert.equal(contact,null,'login and missing-content states must not advertise VIP activation');
    }finally{f.close();}
  }
});

test('local sign-in copy works for existing main-site accounts in either local data mode and language',async()=>{
  for(const kind of ['resources','software','resource-center'])for(const dataSource of [undefined,'existing-local'])for(const language of ['zh','en']){
    const marker={mode:'local',origin:'http://localhost:4285',...(dataSource?{dataSource}:{})};
    const f=await fixture(kind,async()=>Response.json({code:'LOGIN_REQUIRED'},{status:401}),marker,language);
    try{
      await f.settle();
      const selector=kind==='resource-center'?'[data-library-results]':'[data-catalog-results]';
      const gate=f.root.querySelector(selector);
      assert.equal(gate.dataset.state,'auth');
      assert.match(gate.textContent,language==='zh'?/使用现有账号登录/:/Sign in with your existing account/);
      assert.doesNotMatch(gate.textContent,/测试账号|演示账号|test account|demo account/i);
      assert.equal(new URL(gate.querySelector('a[href^="/account?"]').href).searchParams.get('return'),f.dom.window.location.pathname);
    }finally{f.close();}
  }
});
