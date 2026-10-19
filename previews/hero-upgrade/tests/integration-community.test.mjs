import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({ stdin: {
  contents: "export * from './src/integration-community.ts'; export * from './src/integration-runtime.ts'; export {community,sections} from './src/content.ts'; export {renderPage} from './src/pages.ts'; export {setLang,ui} from './src/i18n.ts';",
  loader: 'ts', resolveDir: root,
}, bundle: true, write: false, platform: 'browser', target: 'es2022', format: 'iife', globalName: 'CommunityBridge', loader: { '.css': 'empty' } });
const code = bundled.outputFiles[0].text;
const destination = 'https://community.sansphase.com';
const ticket = 'a'.repeat(43);
const post = '11111111-1111-4111-8111-111111111111';
const identity = { nickname: '测试读者', email: 'reader@example.test' };
const bootstrap = extra => ({ source: 'cms', delivery: 'paged-v1', reader: identity, author: null, collections: { notes: { totalPublished: 0 } }, ...extra });
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture({ mode = 'production', fetcher, search = '', marker = true } = {}) {
  const origin = mode === 'local' ? 'http://127.0.0.1:4286' : 'https://www.sansphase.com';
  const html = `<!doctype html><head>${marker ? `<script type="application/json" id="site-integration">${JSON.stringify({mode,origin})}</script>` : ''}</head><body><main></main></body>`;
  const dom = new JSDOM(html, { url: `${origin}/community${search}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const calls = [], navigations = [];
  Object.assign(dom.window, { Response, Headers, AbortController, AbortSignal, TextEncoder, fetch: async (url, init) => {
    calls.push({url,init});
    return fetcher ? fetcher(url,init,calls.length) : Response.json(bootstrap({communityDestination:destination,communityEnabled:false}));
  } });
  vm.runInContext(code, dom.getInternalVMContext());
  const api = vm.runInContext('CommunityBridge', dom.getInternalVMContext());
  api.setLang('zh');
  const main = dom.window.document.querySelector('main');
  let mounted;
  const mount = () => mounted = api.mountIntegratedCommunity(main, {
    english: () => false, readState: () => api.integrationState, readCommunity: () => api.integrationCommunity,
    navigate: url => navigations.push(url),
  });
  return { dom,api,main,calls,navigations,mount,close() { mounted?.dispose();api.clearIntegration();dom.window.close(); } };
}

test('production availability follows the original bootstrap and the entry uses the existing same-origin handoff', async () => {
  const f = fixture({ search: `?post=${post}`, fetcher: async url => Response.json(String(url).includes('bootstrap')
    ? bootstrap({communityDestination:destination,communityEnabled:false})
    : {url:`${destination}/community-enter#community-entry=${ticket}`,expiresAt:Date.now()+60000}) });
  try {
    assert.equal(await f.api.loadIntegration({includeNotes:false}),true);f.mount();
    assert.equal(f.api.integrationCommunity.mode,'bridge');
    assert.equal(f.api.sections.find(item=>item.id==='community').open,true);
    assert.equal(f.api.community.status.zh,'进入现有社区');
    assert.doesNotMatch(f.api.ui['community.note'].zh,/尚未开放|筹备/);
    assert.match(f.main.textContent,/进入现有社区/);assert.doesNotMatch(f.main.textContent,/正在筹备|计划中的版块/);
    assert.equal(f.main.querySelectorAll(`a[href^="${destination}"]`).length,0,'the UI must not construct an external sign-in link');
    f.main.querySelector('[data-community-entry-enter]').click();
    f.main.querySelector('[data-community-entry-enter]').click();
    await pause();
    const requests = f.calls.filter(call=>call.url==='/api/community-entry');
    assert.equal(requests.length,1);assert.equal(requests[0].init.method,'POST');
    assert.equal(requests[0].init.credentials,'same-origin');assert.equal(requests[0].init.cache,'no-store');
    assert.equal(requests[0].init.headers['X-Reader-Request'],'1');
    assert.deepEqual(f.navigations,[`${destination}/community-enter#community-entry=${ticket}&post=${post}`]);
  } finally { f.close(); }
});

test('signed-out readers return through the original account flow without requesting a handoff',async()=>{
  const f=fixture({search:`?post=${post}`,fetcher:async()=>Response.json(bootstrap({reader:null,communityDestination:destination}))});
  try{
    await f.api.loadIntegration({includeNotes:false});f.mount();
    assert.equal(f.main.querySelector('[data-community-entry-enter]'),null);
    const account=f.main.querySelector('[data-community-account]');assert.ok(account);
    assert.equal(new URL(account.href).searchParams.get('return'),`/community?post=${post}`);
    account.click();assert.deepEqual(f.navigations,[`/account?return=${encodeURIComponent(`/community?post=${post}`)}`]);
    assert.equal(f.calls.length,1);
  }finally{f.close();}
});

test('expired sessions show a sign-in action and malformed handoffs remain on the page with retry',async()=>{
  for(const status of [401,503,200]){
    const f=fixture({fetcher:async url=>String(url).includes('bootstrap')?Response.json(bootstrap({communityDestination:destination})):Response.json({url:'https://evil.example/community-enter#community-entry='+ticket,expiresAt:Date.now()+60000},{status})});
    try{
      await f.api.loadIntegration({includeNotes:false});f.mount();f.main.querySelector('[data-community-entry-enter]').click();await pause();
      assert.equal(f.navigations.length,0);
      if(status===401){assert.ok(f.main.querySelector('[data-community-account]'));assert.match(f.main.textContent,/登录/);}
      else{assert.equal(f.main.querySelector('[data-community-entry-enter]').disabled,false);assert.match(f.main.querySelector('[role="status"]').textContent,/重试/);}
    }finally{f.close();}
  }
});

test('disabled local integration honestly stays offline even if an external destination leaks into its response',async()=>{
  const f=fixture({mode:'local',fetcher:async()=>Response.json(bootstrap({communityEnabled:false,communityDestination:destination}))});
  try{
    await f.api.loadIntegration({includeNotes:false});f.mount();
    assert.equal(f.api.integrationCommunity.mode,'disabled');assert.equal(f.api.community.status.zh,'本地未连接');
    assert.match(f.api.ui['community.note'].zh,/本地.*未启用/);
    assert.match(f.main.textContent,/本地.*未启用|本地.*未连接/);
    assert.equal(f.main.querySelector('[data-community-entry-enter]'),null);assert.equal(f.calls.length,1);
    assert.equal(f.main.querySelectorAll(`a[href^="${destination}"]`).length,0);assert.equal(f.navigations.length,0);
  }finally{f.close();}
});

test('same-host original communities keep their existing original UI and a closed server does not claim availability',async()=>{
  for(const communityEnabled of [true,false]){
    const f=fixture({fetcher:async()=>Response.json(bootstrap({communityEnabled}))});
    try{
      await f.api.loadIntegration({includeNotes:false});f.mount();
      assert.equal(f.api.integrationCommunity.mode,communityEnabled?'legacy':'disabled');
      const entry=f.main.querySelector('[data-community-original]');
      if(communityEnabled)assert.equal(entry.getAttribute('href'),'/original#/community/home');
      else{assert.equal(entry,null);assert.match(f.main.textContent,/暂未开放/);}
      assert.equal(f.main.querySelector('[data-community-entry-enter]'),null);
    }finally{f.close();}
  }
});

test('unmount cancels an outstanding handoff and reloading bootstrap clears stale availability',async()=>{
  let release;let enabled=true;
  const f=fixture({fetcher:async url=>String(url).includes('bootstrap')?Response.json(bootstrap(enabled?{communityDestination:destination}:{communityEnabled:false})):new Promise(resolve=>{release=()=>resolve(Response.json({url:`${destination}/community-enter#community-entry=${ticket}`,expiresAt:Date.now()+60000}));})});
  try{
    await f.api.loadIntegration({includeNotes:false});const mounted=f.mount();f.main.querySelector('[data-community-entry-enter]').click();await pause();mounted.dispose();release();await pause();
    assert.equal(f.navigations.length,0);
    enabled=false;await f.api.loadIntegration({includeNotes:false});assert.equal(f.api.integrationCommunity.mode,'disabled');assert.equal(f.api.sections.find(item=>item.id==='community').open,false);
  }finally{f.close();}
});

test('a browser return restores the entry control and consumes a post destination only once',async()=>{
  const f=fixture({search:`?post=${post}`,fetcher:async url=>Response.json(String(url).includes('bootstrap')?bootstrap({communityDestination:destination}):{url:`${destination}/community-enter#community-entry=${ticket}`,expiresAt:Date.now()+60000})});
  try{
    await f.api.loadIntegration({includeNotes:false});f.mount();f.main.querySelector('[data-community-entry-enter]').click();await pause();
    assert.equal(f.main.querySelector('[data-community-entry-enter]').disabled,true);assert.equal(f.dom.window.location.search,'');
    f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pageshow',{persisted:true}));
    assert.equal(f.main.querySelector('[data-community-entry-enter]').disabled,false);f.main.querySelector('[data-community-entry-enter]').click();await pause();
    assert.equal(f.navigations.length,2);assert.equal(f.navigations[1],`${destination}/community-enter#community-entry=${ticket}`);
  }finally{f.close();}
});

test('invalid and community-host bootstrap destinations never turn into a main-site entry',async()=>{
  for(const extra of [{communityDestination:'https://evil.example'},{communityDestination:destination,communityOnly:true}]){
    const f=fixture({fetcher:async()=>Response.json(bootstrap(extra))});
    try{await f.api.loadIntegration({includeNotes:false});f.mount();assert.equal(f.api.integrationCommunity.mode,'disabled');assert.equal(f.main.querySelector('[data-community-entry-enter]'),null);assert.equal(f.calls.length,1);}
    finally{f.close();}
  }
});

test('the standalone demo retains its preparation page and never mounts authenticated community behavior',()=>{
  const f=fixture({marker:false});
  try{
    f.api.renderPage('community',f.main,true);assert.match(f.main.textContent,/正在筹备/);
    f.mount();assert.match(f.main.textContent,/正在筹备/);assert.equal(f.main.querySelector('[data-community-entry-enter]'),null);assert.equal(f.calls.length,0);
  }finally{f.close();}
});
