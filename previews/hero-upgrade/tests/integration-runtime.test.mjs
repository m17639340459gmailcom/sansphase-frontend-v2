import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: {
  contents: "export * from './src/integration-runtime.ts'; export {posts,numbers,profile,sections} from './src/content.ts'; export {readIntegratedArticle} from './src/integration-article-source.ts';",
  loader: 'ts', resolveDir: sourceRoot,
}, bundle: true, write: false, platform: 'browser', target: 'es2022', format: 'iife', globalName: 'RuntimeBridge', loader: { '.css': 'empty' } });
const code = bundle.outputFiles[0].text;
const media = '/api/media/11111111-1111-4111-8111-111111111111?w=960&view=content';
const post = (extra = {}) => ({ id: 'local-published', title: '本地已发布文章', summary: '独立本地联调记录。', category: '测试', tags: ['本地'], date: '2026-01-01T00:00:00Z', coverSrc: media, ...extra });
const identity = { nickname: '本地读者', email: 'reader@example.test', role: 'reader', vip: false, vipUntil: null };
const bootstrap = (extra = {}) => ({ source: 'cms', delivery: 'paged-v1', reader: identity, author: null, readerRegistrationEnabled: true,
  profile: { name: '無相', signature: '本地签名', bio: '本地简介' },
  collections: { notes: { totalPublished: 13, tagCount: 7, latest: '2026-10-19T00:00:00Z' }, works: { totalPublished: 2 } }, ...extra });
const listing = (extra = {}) => ({ items: [post()], total: 13, totalPublished: 13, page: 1, pages: 2, categories: ['测试'], highlights: [], ...extra });

function fixture(fetcher, timeZone, controlledDeadline = false) {
  const dom = new JSDOM('<!doctype html><head><script type="application/json" id="site-integration">{"mode":"local","origin":"http://127.0.0.1:4286"}</script></head><body></body>', { url: 'http://127.0.0.1:4286/', runScripts: 'outside-only', pretendToBeVisual: true });
  if (timeZone) {
    const NativeFormat = dom.window.Intl.DateTimeFormat;
    dom.window.Intl.DateTimeFormat = class extends NativeFormat { constructor(locale, options = {}) { super(locale, { timeZone, ...options }); } };
  }
  const deadlines=new Map();
  if(controlledDeadline) {
    const schedule=dom.window.setTimeout.bind(dom.window),cancel=dom.window.clearTimeout.bind(dom.window);
    let timer=-1;
    dom.window.setTimeout=(callback,milliseconds,...args)=>{
      if(milliseconds!==15000)return schedule(callback,milliseconds,...args);
      deadlines.set(timer,()=>callback(...args));return timer--;
    };
    dom.window.clearTimeout=id=>{if(!deadlines.delete(id))cancel(id);};
  }
  Object.assign(dom.window, { fetch: fetcher, Response, Headers, AbortController, AbortSignal, TextEncoder });
  vm.runInContext(code, dom.getInternalVMContext());
  const api = vm.runInContext('RuntimeBridge', dom.getInternalVMContext());
  return { dom, api, deadlines, close() { api.clearIntegration(); dom.window.close(); } };
}

test('the local environment notice remains display-only and is absent in production', () => {
  const f = fixture(async () => Response.json({}));
  try {
    const doc = f.dom.window.document;
    f.api.mountLocalEnvironment(doc);
    assert.equal(doc.querySelector('.integration-environment a[href="/original"]').textContent, '版本1 · 原主站 ↗');
    assert.match(doc.querySelector('.integration-environment').textContent, /隔离测试数据/);
    f.api.mountLocalEnvironment(doc);
    assert.equal(doc.querySelectorAll('.integration-environment').length, 1);
    doc.querySelector('#site-integration').textContent = JSON.stringify({mode:'production', origin:f.dom.window.location.origin});
    f.api.mountLocalEnvironment(doc);
    assert.equal(doc.querySelector('.integration-environment'), null);
  } finally { f.close(); }
});

test('a route-authorized article passes to the Reader once without another detail request',async()=>{
  const calls=[];
  const f=fixture(async(url,options)=>{calls.push({url,options});return Response.json({item:post({bodyHTML:'<p>Authorized body</p>'})});});
  try {
    assert.equal(await f.api.ensureIntegratedPost('local-published'),f.api.posts.findIndex(item=>item.slug==='local-published'));
    const value=await f.api.readIntegratedArticle('local-published');
    assert.equal(value.item.bodyHTML,'<p>Authorized body</p>');assert.equal(calls.length,1);
    await f.api.readIntegratedArticle('local-published');
    assert.equal(calls.length,2,'the consumed body is not reused on another opening');
  }finally{f.close();}
});

test('Reader article requests use the existing fifteen-second deadline and can retry after timeout',async()=>{
  const requests=[];
  const f=fixture((_url,options)=>new Promise((resolve,reject)=>{
    requests.push({resolve,signal:options.signal});options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  }),undefined,true);
  try {
    const pending=f.api.readIntegratedArticle('local-published');
    assert.equal(f.deadlines.size,1);[...f.deadlines.values()][0]();
    await assert.rejects(pending,{name:'TimeoutError'});assert.equal(requests[0].signal.aborted,true);
    const retry=f.api.readIntegratedArticle('local-published');
    requests[1].resolve(Response.json({item:post({bodyHTML:'<p>Retry body</p>'})}));
    assert.equal((await retry).item.bodyHTML,'<p>Retry body</p>');
    assert.equal(f.deadlines.size,0);
  }finally{f.close();}
});

test('identity clearing revokes a route handoff even before its Reader continuation runs',async()=>{
  const f=fixture(async()=>Response.json({item:post({bodyHTML:'<p>Previous identity</p>'})}));
  try {
    await f.api.ensureIntegratedPost('local-published');
    const pending=f.api.readIntegratedArticle('local-published');f.api.clearIntegration();
    await assert.rejects(pending,{name:'AbortError'});
  }finally{f.close();}
});

test('runtime bootstrap uses same-origin original identity and publication metadata without static preview posts', async () => {
  const calls = [];
  const f = fixture(async (url, options) => {
    calls.push({ url, options });
    return Response.json(String(url).includes('view=bootstrap') ? bootstrap() : listing());
  });
  try {
    assert.equal(await f.api.loadIntegration(), true);
    assert.equal(f.api.integrationState.reader.nickname, identity.nickname);
    assert.equal(f.api.integrationState.readerRegistrationEnabled, true);
    assert.equal(f.api.posts.length, 1); assert.equal(f.api.posts[0].slug, 'local-published');
    assert.equal(f.api.numbers.posts, 13); assert.equal(f.api.numbers.tags, 7);
    assert.equal(f.api.numbers.latest, '2026.10.19', 'a manual article order must not replace the real latest publication date');
    assert.equal(f.api.sections.find(section => section.id === 'works').status.zh, '2 项已发布');
    assert.equal(f.api.profile.signature, '本地签名');
    for (const { url, options } of calls) { assert.match(url, /^\/api\/content\?/); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); }
    assert.ok(calls.some(call => /kind=notes/.test(call.url)));
  } finally { f.close(); }
});

test('direct inner-page initialization verifies identity without requesting an unrelated home article list',async()=>{
  const calls=[];
  const f=fixture(async(url)=>{calls.push(String(url));return Response.json(bootstrap());});
  try {
    assert.equal(await f.api.loadIntegration({includeNotes:false}),true);
    assert.equal(calls.length,1);assert.match(calls[0],/view=bootstrap/);
    assert.equal(f.api.posts.length,0,'preview article records cannot leak into a connected inner page');
    assert.equal(f.api.integrationState.reader.email,identity.email);
    assert.equal(f.api.numbers.latest,'2026.10.19','the bootstrap still supplies real homepage metadata');
  }finally{f.close();}
});

test('the homepage section map reflects real publication metadata instead of frozen demo availability',async()=>{
 const collections={notes:{totalPublished:4},works:{totalPublished:4},resources:{totalPublished:1},software:{totalPublished:8},'resource-center':{totalPublished:5}};
 const f=fixture(async()=>Response.json(bootstrap({collections})));
 try{
  assert.equal(await f.api.loadIntegration({includeNotes:false}),true);
  for(const [id,metadata] of Object.entries(collections)){
   const section=f.api.sections.find(item=>item.id===id);
   assert.equal(section.open,true,id);assert.equal(section.status.zh,`${metadata.totalPublished} 项已发布`);
  }
  const community=f.api.sections.find(item=>item.id==='community');assert.equal(community.open,false);assert.equal(community.status.zh,'本地未连接');
 }finally{f.close();}
});

test('the first later home visit loads real notes once and does not re-bootstrap the account',async()=>{
  const calls=[];let release;
  const f=fixture(async(url,options)=>{
    calls.push(String(url));
    if(String(url).includes('view=bootstrap'))return Response.json(bootstrap());
    return new Promise((resolve,reject)=>{release=()=>resolve(Response.json(listing()));options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
  });
  try {
    assert.equal(await f.api.loadIntegration({includeNotes:false}),true);
    const one=f.api.loadIntegratedNotes(),two=f.api.loadIntegratedNotes();
    assert.equal(calls.length,2);assert.equal(f.api.homeIntegrationReady,false);
    release();assert.equal(await one,true);assert.equal(await two,true);
    assert.equal(f.api.homeIntegrationReady,true);assert.equal(f.api.posts[0].slug,'local-published');
    assert.equal(await f.api.loadIntegratedNotes(),true);assert.equal(calls.length,2);
  }finally{f.close();}
});

test('the first notes summary batch hands to the journal once without any article body or identity',async()=>{
 const calls=[];const f=fixture(async url=>{calls.push(String(url));return Response.json(String(url).includes('view=bootstrap')?bootstrap():listing({items:[post({bodyHTML:'private body must not transfer',reader:identity})]}));});
 try{
  await f.api.loadIntegration({includeNotes:false});await f.api.loadIntegratedNotes();
  const summary=f.api.takeIntegratedNotesList();assert.ok(summary);assert.equal(summary.items[0].id,'local-published');assert.equal(summary.items[0].coverSrc,media);
  assert.equal('bodyHTML' in summary.items[0],false);assert.equal('reader' in summary.items[0],false);assert.equal('reader' in summary,false);
  assert.equal(f.api.takeIntegratedNotesList(),undefined,'the transfer is consumed once, not a second list cache');
  assert.equal(calls.length,2);
 }finally{f.close();}
});

test('notes summary handoff expires promptly and is discarded when identity changes',async()=>{
 const f=fixture(async url=>Response.json(String(url).includes('view=bootstrap')?bootstrap():listing()));
 try{
  await f.api.loadIntegration();const now=f.dom.window.Date.now;f.dom.window.Date.now=()=>now()+5001;
  assert.equal(f.api.takeIntegratedNotesList(),undefined);
  f.dom.window.Date.now=now;await f.api.loadIntegration();f.api.clearIntegration();
  assert.equal(f.api.takeIntegratedNotesList(),undefined);
 }finally{f.close();}
});

test('integrated article metadata follows the original local calendar in eastern and western time zones', () => {
  for (const [timeZone, timestamp, expected] of [
    ['Asia/Shanghai', '2026-09-24T17:30:00Z', '2026.09.25'],
    ['America/Los_Angeles', '2026-09-25T03:30:00Z', '2026.09.24'],
    ['Asia/Shanghai', '2026-09-25', '2026.09.25'],
    ['America/Los_Angeles', '2026-09-25', '2026.09.25'],
  ]) {
    const f = fixture(async () => Response.json({}), timeZone);
    try { assert.equal(f.api.parseIntegratedPost(post({ date: timestamp })).date, expected, timeZone + ' ' + timestamp); }
    finally { f.close(); }
  }
});

test('latest publication and article metadata use the same local date, including date-only publication values', async () => {
  for (const [timeZone, date, expected] of [
    ['Asia/Shanghai', '2026-09-24T17:30:00Z', '2026.09.25'],
    ['America/Los_Angeles', '2026-09-25T03:30:00Z', '2026.09.24'],
    ['America/Los_Angeles', '2026-09-25', '2026.09.25'],
  ]) {
    const f = fixture(async url => Response.json(String(url).includes('view=bootstrap')
      ? bootstrap({ collections: { notes: { totalPublished: 1, tagCount: 1, latest: date } } })
      : listing({ items: [post({ date })], total: 1, totalPublished: 1, pages: 1 })), timeZone);
    try {
      assert.equal(await f.api.loadIntegration(), true);
      assert.equal(f.api.numbers.latest, expected);
      assert.equal(f.api.posts[0].date, expected);
    } finally { f.close(); }
  }
});

test('invalid calendar-only article dates are rejected instead of silently rolling into another month', () => {
  const f = fixture(async () => Response.json({}), 'America/Los_Angeles');
  try {
    for (const date of ['2026-02-29', '2026-02-31', 'not-a-date']) assert.equal(f.api.parseIntegratedPost(post({ date })), null, date);
    assert.equal(f.api.parseIntegratedPost(post({ date: '2024-02-29' })).date, '2024.02.29');
  } finally { f.close(); }
});

test('an article-list fault does not erase the account that bootstrap has independently verified', async () => {
  const f = fixture(async url => String(url).includes('view=bootstrap') ? Response.json(bootstrap()) : new Response('Temporary content fault', { status: 503 }));
  try {
    assert.equal(await f.api.loadIntegration(), false);
    assert.equal(f.api.integrationState.reader?.email, identity.email, 'sign-in and account settings must survive an unrelated journal-list failure');
    assert.equal(f.api.posts.length, 0); assert.ok(f.api.integrationError);
  } finally { f.close(); }
});

test('a failed identity bootstrap cannot leave a previously authenticated membership in the runtime', async () => {
  let failed = false;
  const f = fixture(async url => {
    if (failed) return new Response('Session store unavailable', { status: 503 });
    return Response.json(String(url).includes('view=bootstrap') ? bootstrap({ reader: { ...identity, vip: true, vipUntil: '2099-01-01T00:00:00Z' } }) : listing());
  });
  try {
    assert.equal(await f.api.loadIntegration(), true); assert.equal(f.api.integrationState.reader.vip, true);
    failed = true; assert.equal(await f.api.loadIntegration(), false);
    assert.equal(f.api.integrationState.reader, null); assert.equal(f.api.integrationState.author, null);
    assert.equal(f.api.posts.length, 0);
  } finally { f.close(); }
});

test('clearing account state aborts a pending original detail request and prevents a stale post commit', async () => {
  let release, signal;
  const f = fixture(async (_url, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); });
  try {
    f.api.clearIntegration();
    const pending = f.api.ensureIntegratedPost('local-old-post');
    await Promise.resolve(); f.api.clearIntegration();
    assert.equal(signal.aborted, true);
    release(Response.json({ item: post({ id: 'local-old-post' }) }));
    await assert.rejects(pending);
    assert.equal(f.api.posts.length, 0);
  } finally { f.close(); }
});

test('legacy hash conversion preserves functional routes and never produces an external destination', () => {
  const f = fixture(async () => Response.json({}));
  try {
    for (const [hash, expected] of [
      ['#/home', '/'], ['#/notes', '/blog'], ['#/note/local-note', '/blog/local-note'], ['#/works/local-work', '/work/local-work'],
      ['#/resources/local-resource', '/learning/local-resource'], ['#/software/local-tool', '/software/local-tool'], ['#/resource-center/local-book', '/resources/local-book'],
      ['#/account?return=%2Fresources%2Flocal-book', '/account?return=%2Fresources%2Flocal-book'], ['#/verify/request-id?email=reader%40example.test', '/verify/request-id?email=reader%40example.test'],
      ['#/reset/local-token', '/reset/local-token'], ['#/admin', '/admin-console/'], ['#/community', '/community'],
    ]) assert.equal(f.api.legacyIntegrationPath(hash), expected, hash);
    for (const hash of ['#fields', '#/unknown', '#/home/evil.example', '#/home/%2Fevil.example', '#/home//evil.example', '#/note/a/b']) {
      assert.equal(f.api.legacyIntegrationPath(hash), null, hash);
    }
  } finally { f.close(); }
});

test('legacy account links preserve invitations and console returns; post-login returns stay same-origin', () => {
  const f = fixture(async () => Response.json({}));
  try {
    assert.equal(f.api.legacyIntegrationPath('#/account','?invite=abcdefghijklmnopqrstuvwx'),'/account?invite=abcdefghijklmnopqrstuvwx');
    assert.equal(f.api.legacyIntegrationPath('#/account','?adminReturn=articles'),'/account?adminReturn=articles');
    assert.equal(f.api.legacyIntegrationPath('#/account?return=%2Fresources','?invite=example'),'/account?invite=example&return=%2Fresources');
    assert.equal(f.api.safeIntegrationReturn('/resources/local-public-book','http://127.0.0.1:4286'),'/resources/local-public-book');
    for (const target of ['//evil.example','/\\evil.example','/\nevil.example','https://evil.example','/account','/account?return=/resources']) assert.equal(f.api.safeIntegrationReturn(target,'http://127.0.0.1:4286'),null);
  } finally { f.close(); }
});

test('legacy navigation out of account flows discards account-only query context',()=>{
  const f=fixture(async()=>Response.json({}));
  try{
    const context='?return=%2Fresources%2Flocal-vip-book&invite=abcdefghijklmnopqrstuvwx&adminReturn=readers&q=AI';
    for(const [hash,path] of [['#/notes','/blog'],['#/home','/'],['#/resources','/learning']])
      assert.equal(f.api.legacyIntegrationPath(hash,context),path+'?q=AI',hash);
    assert.equal(f.api.legacyIntegrationPath('#/verify/local-id','?email=reader%40example.test&return=%2Fresources'),'/verify/local-id?email=reader%40example.test&return=%2Fresources');
    assert.equal(f.api.legacyIntegrationPath('#/reset/local-token','?return=%2Fresources'),'/reset/local-token?return=%2Fresources');
  }finally{f.close();}
});
