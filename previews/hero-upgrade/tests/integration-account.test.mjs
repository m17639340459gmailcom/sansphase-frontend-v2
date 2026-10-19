import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const changedStart=main.indexOf('changed:()=>{'),changedEnd=main.indexOf('\n    }});',changedStart);
assert.ok(changedStart>=0&&changedEnd>changedStart,'the production account refresh callback must be exercised');
const changedCallback='()=>{'+main.slice(changedStart+'changed:()=>{'.length,changedEnd)+'\n}';
const hashStart=main.indexOf("addEventListener('hashchange', () => {"),hashEnd=main.indexOf('\n});',hashStart);
assert.ok(hashStart>=0&&hashEnd>hashStart,'the production legacy hash handler must be exercised');
const hashCallback='()=>{'+main.slice(hashStart+"addEventListener('hashchange', () => {".length,hashEnd)+'\n}';
const navigateStart=main.indexOf('function navigate('),navigateEnd=main.indexOf("addEventListener('popstate'",navigateStart);
const clickStart=main.indexOf("document.addEventListener('click', (e) => {",navigateEnd),clickEnd=main.indexOf("document.addEventListener('pointerover'",clickStart);
assert.ok(navigateStart>=0&&navigateEnd>navigateStart&&clickStart>navigateEnd&&clickEnd>clickStart,'the production navigation and ordinary anchor handler must be exercised');
const clickNavigation=`
 export function mountProductionClickNavigation(env){
  const document=window.document,location=env.location??window.location,integrated=env.integrated!==false,localRuntime={legacyIntegrationPath};
  const viewShown=env.viewShown??'account',readerActive=()=>false,pageTransition={pending:false},jumpTo=env.jumpTo;
  const historyPositions=createHistoryPositions(window,()=>0),applyRoute=env.applyRoute;
  ${main.slice(navigateStart,navigateEnd)}
  ${main.slice(clickStart,clickEnd)}
  return {navigate};
 }
`;
let bundled;
async function fixture(state={reader:null,author:null,readerRegistrationEnabled:true},options={}) {
  bundled ??= build({stdin:{contents:`export * from './src/integration-account.ts'; import {legacyIntegrationPath,safeIntegrationReturn} from './src/integration-runtime.ts'; import {parseRoute} from './src/pages.ts'; import {createHistoryPositions} from './src/navigation-state.ts'; ${clickNavigation} export function productionAccountChanged(env){const localRuntime={legacyIntegrationPath,safeIntegrationReturn,integrationState:env.state},location=window.location,navigate=env.navigate,renderCurrentPage=env.render;let identityRefreshNavigation=null,routeEpoch=0;return ()=>{const route={page:location.pathname.slice(1).split('/')[0]||'home'};return (${changedCallback})();};} export function productionHashChanged(env){const integrated=true,localRuntime={legacyIntegrationPath},location=window.location,navigate=env.navigate;let identityRefreshNavigation=null,routeEpoch=0;return ${hashCallback};}`,resolveDir:sourceRoot,loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'AccountBridge',target:'es2022',loader:{'.css':'empty'}}).then(result=>result.outputFiles[0].text);
  let page=options.page??'account',id=options.id??'';
  const dom=new JSDOM('<main id="main"></main>',{url:`http://localhost/${page}${id?'/'+id:''}${options.search??''}`,runScripts:'outside-only',pretendToBeVisual:true});
  const requests=[],navigations=[],identities=[];
  Object.assign(dom.window,{Response,Headers,AbortSignal,AbortController,fetch:async(path,init={})=>{
    requests.push([path,init]);
    if(String(path).includes('login-challenge'))return Response.json({enabled:false});
    if(path==='/api/reader/session')return Response.json(state.reader);
    if(path==='/api/reader/profile')return Response.json({...state.reader,nickname:'已更新',reviewPending:true});
    if(path==='/api/reader/logout')return Response.json({ok:true});
    if(path==='/api/reader/reset'||path==='/api/reader/verify')return Response.json({message:'ok'});
    if(path==='/api/reader/login')return options.login?.(init)??Response.json({...state.reader,email:'reader@example.test',nickname:'测试读者',vip:false,vipUntil:null});
    throw new Error('Unexpected request '+path);
  }});
  vm.runInContext(await bundled,dom.getInternalVMContext());
  const api=vm.runInContext('AccountBridge',dom.getInternalVMContext());
  const root=dom.window.document.getElementById('main');
  let bridge;
  const render=()=>{root.innerHTML=['account','verify','reset'].includes(page)?api.renderAccountPage(page,id,state,false):`<div data-test-page="${page}"></div>`;bridge?.route(page,id);};
  const navigate=(path,replace=false)=>{
    navigations.push(path);
    if(!options.productionRouting)return;
    dom.window.history[replace?'replaceState':'pushState'](null,'',path);
    const [nextPage,nextId='']=dom.window.location.pathname.slice(1).split('/');page=nextPage;id=nextId;
    render();
  };
  bridge=api.mountAccountIntegration({english:()=>false,readState:()=>state,navigate,changed:options.productionRouting?api.productionAccountChanged({state,navigate,render}):render,onIdentity:()=>{identities.push(true);return options.onIdentity?.(state,render);}});
  if(options.productionRouting)dom.window.addEventListener('hashchange',api.productionHashChanged({navigate}));
  render();
  return{dom,root,api,bridge,state,requests,navigations,identities,tick:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){bridge.route('home','');dom.window.close();}};
}

async function clickFixture(path='/account',options={}){
 const f=await fixture(undefined,{search:options.search??''});
 f.dom.window.history.replaceState(null,'',path+(options.search??''));
 const marker=f.dom.window.document.createElement('script');marker.id='site-integration';marker.type='application/json';marker.textContent=JSON.stringify({mode:'local',origin:f.dom.window.location.origin});f.dom.window.document.head.append(marker);
 const applied=[],assigned=[],jumps=[];
 const location={get href(){return f.dom.window.location.href},get origin(){return f.dom.window.location.origin},get pathname(){return f.dom.window.location.pathname},assign(url){assigned.push(url)}};
 const navigation=f.api.mountProductionClickNavigation({location,integrated:options.integrated,viewShown:options.viewShown,applyRoute(route,hash){applied.push({route,hash});},jumpTo(target){jumps.push(target);}});
 const click=(href,attributes={})=>{
  const link=f.dom.window.document.createElement('a');link.href=href;link.textContent='Open';for(const [name,value]of Object.entries(attributes))link.setAttribute(name,value);f.root.append(link);
  const event=new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});link.dispatchEvent(event);return event;
 };
 return {...f,navigation,applied,assigned,jumps,click};
}

test('ordinary clicks consume legacy account exits and resource links through the production path router',async()=>{
 const f=await clickFixture('/account',{search:'?return=%2Fresources%2Flocal-book&invite=abcdefghijklmnopqrstuvwx&adminReturn=readers'});try{
  const exit=f.root.querySelector('.reader-exit');
  const event=new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});exit.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);assert.equal(f.dom.window.location.pathname,'/blog');assert.equal(f.dom.window.location.search,'');assert.equal(f.dom.window.location.hash,'');
  assert.deepEqual(JSON.parse(JSON.stringify(f.applied.at(-1))),{route:{page:'blog'},hash:''});
  for(const [href,path,page,id]of [['#/resources/local-material','/learning/local-material','learning','local-material'],['#/resource-center/local-book','/resources/local-book','resources','local-book']]){
   f.click(href);assert.equal(f.dom.window.location.pathname,path);assert.equal(f.dom.window.location.hash,'');
   assert.deepEqual(JSON.parse(JSON.stringify(f.applied.at(-1))),{route:{page,id},hash:''});
  }
 }finally{f.close();}
});

test('ordinary legacy account clicks preserve invitations, return queries and original console navigation',async()=>{
 const f=await clickFixture('/learning',{search:'?invite=abcdefghijklmnopqrstuvwx&adminReturn=readers'});try{
  f.click('#/account?return=%2Fresources%2Flocal-book');
  assert.equal(f.dom.window.location.pathname,'/account');
  assert.equal(f.dom.window.location.search,'?invite=abcdefghijklmnopqrstuvwx&adminReturn=readers&return=%2Fresources%2Flocal-book');
  assert.deepEqual(JSON.parse(JSON.stringify(f.applied.at(-1))),{route:{page:'account'},hash:''});
  const count=f.applied.length;f.click('#/admin');
  assert.deepEqual(f.assigned,['http://localhost/admin-console/']);assert.equal(f.applied.length,count);
  f.navigation.navigate('/original#/resources/local-material');
  f.navigation.navigate('/admin-console/#/readers');
  f.navigation.navigate('https://outside.example/#/account');
  assert.deepEqual(f.assigned,['http://localhost/admin-console/','http://localhost/original#/resources/local-material','http://localhost/admin-console/#/readers','https://outside.example/#/account']);
 }finally{f.close();}
});

test('legacy click adaptation leaves ordinary anchors, browser-owned links and demo navigation intact',async()=>{
 const f=await clickFixture('/learning');try{
  f.click('#catalog-guide');assert.equal(f.dom.window.location.pathname,'/learning');assert.equal(f.dom.window.location.hash,'#catalog-guide');
  assert.deepEqual(JSON.parse(JSON.stringify(f.applied.at(-1))),{route:{page:'learning'},hash:'#catalog-guide'});
  f.click('/#top');assert.equal(f.dom.window.location.pathname,'/');assert.equal(f.dom.window.location.hash,'#top');
  assert.deepEqual(JSON.parse(JSON.stringify(f.applied.at(-1))),{route:{page:'home'},hash:'#top'});
  for(const [href,attrs]of [['https://outside.example/#/notes',{}],['/original#/notes',{}],['/admin-console/#/readers',{}],['/api/media/file?download=1',{download:''}],['#/notes',{target:'_blank'}]]){
   const before=f.applied.length,event=f.click(href,attrs);assert.equal(event.defaultPrevented,false);assert.equal(f.applied.length,before);
  }
 }finally{f.close();}
 const demo=await clickFixture('/learning',{integrated:false});try{
  demo.click('#/notes');assert.equal(demo.dom.window.location.pathname,'/learning');assert.equal(demo.dom.window.location.hash,'#/notes');
 }finally{demo.close();}
});

test('account rendering reuses original verification/register/forgot/reset contract',async()=>{
 const f=await fixture();try{
  assert.ok(f.root.querySelector('[data-reader-form="login"] [data-login-verification-control]'));
  f.root.querySelector('[data-reader-mode="register"]').click();await f.tick();
  assert.ok(f.root.querySelector('[data-reader-form="register"] [data-reader-phone]'));
  assert.ok(f.root.querySelector('[data-reader-nickname]'));
  f.root.querySelector('[data-reader-mode="forgot"]').click();await f.tick();
  assert.ok(f.root.querySelector('[data-reader-form="forgot"]'));
  const reset=f.api.renderAccountPage('reset','untrusted\"/><script>',f.state,false);
  assert.match(reset,/data-reader-form="reset"/);assert.doesNotMatch(reset,/<script>/);
 }finally{f.close();}
});

test('server identity controls profile/VIP; safe nav and original author console are preserved',async()=>{
 const state={reader:{uid:'000001',nickname:'<script>',email:'reader@example.test',phone:'13800000000',vip:true,vipUntil:'2000-01-01T00:00:00Z'},author:null};
 const f=await fixture(state);try{
  assert.ok(f.root.querySelector('[data-reader-membership][data-vip="true"]'));
  assert.ok(f.root.querySelector('[data-reader-avatar-trigger]'));
  assert.match(f.bridge.navMarkup(),/VIP/);assert.doesNotMatch(f.bridge.navMarkup(),/<script>/);
  state.reader=null;state.author={name:'作者'};f.root.innerHTML=f.api.renderAccountPage('account','',state,false);f.bridge.route('account','');
  f.root.querySelector('[data-author-login]').click();assert.deepEqual(f.navigations,['/admin-console/#/readers']);
  assert.match(f.bridge.navMarkup(),/admin-console/);
 }finally{f.close();}
});

test('profile save keeps original API request and identity invalidation; password toggle preserves input',async()=>{
 const f=await fixture({reader:{uid:'000001',nickname:'测试',email:'reader@example.test',phone:'13800000000',vip:false,vipUntil:null},author:null});try{
  const form=f.root.querySelector('[data-reader-form="profile"]');
  form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();
  const request=f.requests.find(([path])=>path==='/api/reader/profile');assert.ok(request);
  assert.equal(request[1].credentials,'same-origin');assert.equal(request[1].headers['X-Reader-Request'],'1');assert.equal(f.identities.length,1);
  f.state.reader=null;f.root.innerHTML=f.api.renderAccountPage('reset','token',f.state,false);f.bridge.route('reset','token');
  const password=f.root.querySelector('[name="password"]');password.value='keptpassword';f.root.querySelector('[data-reader-password-toggle]').click();assert.equal(password.type,'text');assert.equal(password.value,'keptpassword');
 }finally{f.close();}
});

test('reader logout uses existing namespace and emits identity reset before local route mapping',async()=>{
 const f=await fixture({reader:{nickname:'测试',email:'reader@example.test',phone:'13800000000',vip:false,vipUntil:null},author:null});try{
  let reset=0;f.dom.window.addEventListener('reader:identity',event=>{if(event.detail===null)reset++;});
  f.root.querySelector('[data-reader-logout]').click();await f.tick();
  assert.ok(f.requests.some(([path])=>path==='/api/reader/logout'));assert.equal(reset,1);assert.equal(f.identities.length,1);
 }finally{f.close();}
});

test('account adapter styles preserve single border feedback and readable theme tokens',async()=>{
 const css=await readFile(new URL('../src/integration-account.css',import.meta.url),'utf8');
 assert.match(css,/var\(--fg\)/);assert.match(css,/var\(--accent\)/);assert.match(css,/font-size:\s*13px/);
 assert.match(css,/input:focus-visible[^{]*\{[^}]*outline:\s*none[^}]*box-shadow:\s*none[^}]*border-color:\s*var\(--accent\)/);
 assert.doesNotMatch(css,/!important/);
 assert.match(css,/\.login-verification-control:not\(\[hidden\]\)/, 'disabled local verification must remain hidden instead of showing a fake slider');
});

test('disabled verification remains hidden under account styling and visible controls keep their layout',async()=>{
 const f=await fixture();try{
  const css=await readFile(new URL('../src/integration-account.css',import.meta.url),'utf8');
  const style=f.dom.window.document.createElement('style');
  style.textContent=css.replace(/^@import[^;]*;/m,'');f.dom.window.document.head.append(style);
  await f.tick();await f.tick();
  const control=f.root.querySelector('[data-login-verification-control]');
  assert.equal(control.hidden,true,'the original challenge API disabled verification');
  assert.equal(f.dom.window.getComputedStyle(control).display,'none','a more specific account rule must not override hidden');
  control.hidden=false;
  assert.equal(f.dom.window.getComputedStyle(control).display,'flex','enabled verification retains the approved control layout');
 }finally{f.close();}
});

test('bootstrap identity projection rejects malformed security fields without fabricating membership',async()=>{
 const f=await fixture();try{
  assert.deepEqual(JSON.parse(JSON.stringify(f.api.parseAccountState({reader:null,author:null,readerRegistrationEnabled:false}))),{reader:null,author:null,readerRegistrationEnabled:false});
  assert.throws(()=>f.api.parseAccountState({reader:{nickname:'测试',email:'reader@example.test',vip:'true'}}),/flag/);
  assert.throws(()=>f.api.parseAccountState({reader:{nickname:'测试',email:'reader@example.test',vipUntil:'later'}}),/expiry/);
  assert.throws(()=>f.api.parseAccountState({reader:{nickname:'测试',email:'reader@example.test',ownerReader:false}}),/owner/);
  assert.throws(()=>f.api.parseAccountState({reader:{nickname:'测试'},author:null}),/identity/);
  assert.throws(()=>f.api.parseAccountState({reader:null,author:{name:42}}),/author/);
  const parsed=f.api.parseAccountState({reader:{nickname:'测试',email:'reader@example.test',vip:false,vipUntil:'2099-01-01T00:00:00Z',password:'never-project'},author:null});
  assert.equal(parsed.reader.vip,false);assert.equal('password' in parsed.reader,false);
 }finally{f.close();}
});

test('successful reset and email verification consume replaceState account routes without a hashchange',async()=>{
 for(const page of ['reset','verify']){
  const f=await fixture(undefined,{page,id:'local-token',productionRouting:true});try{
   let hashChanges=0;f.dom.window.addEventListener('hashchange',()=>hashChanges++);
   const form=f.root.querySelector('form');
   for(const input of form.querySelectorAll('input'))input.value=input.name==='email'?'reader@example.test':input.name==='code'?'123456':'updatedpassword123';
   form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();await f.tick();
   assert.ok(f.requests.some(([path])=>path===`/api/reader/${page}`));
   assert.equal(hashChanges,0,'the existing form deliberately uses replaceState rather than a hashchange');
   assert.equal(f.dom.window.location.pathname,'/account');assert.equal(f.dom.window.location.hash,'');
   assert.ok(f.root.querySelector('[data-reader-form="login"]'),`${page} success must open the login form`);
   assert.equal(f.root.querySelector(`[data-reader-form="${page}"]`),null);
  }finally{f.close();}
 }
});

test('ordinary account refresh keeps authenticated return destinations while guests remain on the form',async()=>{
 const state={reader:{nickname:'测试',email:'reader@example.test',vip:false,vipUntil:null},author:null};
 const f=await fixture(state,{search:'?return=%2Fresources%2Flocal-book',productionRouting:true});try{
  f.api.productionAccountChanged({state,navigate:path=>f.navigations.push(path),render:()=>{throw new Error('A valid authenticated return should navigate.');}})();
  assert.deepEqual(f.navigations,['/resources/local-book']);
  state.reader=null;let rendered=0;
  f.api.productionAccountChanged({state,navigate:()=>{throw new Error('A guest must not enter the protected return route.');},render:()=>rendered++})();
  assert.equal(rendered,1);
 }finally{f.close();}
});

test('logout reaches the journal and a delayed identity refresh cannot restore the account form or its return query',async()=>{
 const state={reader:{nickname:'测试',email:'reader@example.test',vip:false,vipUntil:null},author:null};
 let release;
 const f=await fixture(state,{search:'?return=%2Fresources%2Flocal-vip-book',productionRouting:true,onIdentity(current,render){current.reader=null;return new Promise(resolve=>{release=()=>{render();resolve();};});}});try{
  f.root.querySelector('[data-reader-logout]').click();await f.tick();await f.tick();
  assert.ok(f.requests.some(([path])=>path==='/api/reader/logout'));assert.equal(f.dom.window.location.pathname,'/blog');assert.equal(f.dom.window.location.search,'');
  assert.ok(f.root.querySelector('[data-test-page="blog"]'));assert.equal(f.root.querySelector('[data-reader-form]'),null);
  release();await f.tick();
  assert.equal(f.dom.window.location.pathname,'/blog');assert.ok(f.root.querySelector('[data-test-page="blog"]'));assert.equal(f.root.querySelector('[data-reader-form]'),null);
 }finally{f.close();}
});

test('a real path navigation cancels a delayed reader or owner login while the outgoing account DOM is retained',async()=>{
 for(const role of ['reader','owner']){
  let release;
  const f=await fixture(undefined,{search:'?return=%2Fresources%2Frequested-book',productionRouting:true,login:()=>new Promise(resolve=>{release=()=>resolve(Response.json({role,email:'reader@example.test',nickname:'迟到的账号',vip:false,vipUntil:null}));})});try{
   await f.tick();await f.tick();
   const form=f.root.querySelector('[data-reader-form="login"]');
   form.querySelector('[name="email"]').value='reader@example.test';form.querySelector('[name="password"]').value='synthetic-password';
   form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();
   const request=f.requests.find(([path])=>path==='/api/reader/login');assert.ok(request);
   f.api.mountProductionClickNavigation({applyRoute(route){f.bridge.route(route.page,route.id??'');},jumpTo(){}});
   const destination=f.dom.window.document.createElement('a');destination.href='/work/selected';destination.textContent='Selected work';f.root.append(destination);
   destination.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
   assert.equal(f.dom.window.location.pathname,'/work/selected');assert.equal(f.dom.window.location.hash,'');
   assert.equal(form.isConnected,true,'the real page preparation and exit animation retain the old DOM before replacement');
   assert.equal(request[1].signal.aborted,true,'the original reader lifecycle cancels sign-in without waiting for hashchange');
   release();await f.tick();await f.tick();
   assert.equal(f.identities.length,0);assert.equal(f.dom.window.location.pathname,'/work/selected');assert.equal(f.dom.window.location.hash,'');
   assert.deepEqual(f.navigations,[],'the response must not open the old return route, blog, or owner console');
  }finally{release?.();f.close();}
 }
});

test('returning to account can submit a new login while an aborted old transport is still settling',async()=>{
 const pending=[];
 const f=await fixture(undefined,{productionRouting:true,login:init=>new Promise(resolve=>pending.push({init,finish:()=>resolve(Response.json({email:'reader@example.test',nickname:'测试读者',vip:false,vipUntil:null}))}))});try{
  const submit=async()=>{
   await f.tick();await f.tick();
   const form=f.root.querySelector('[data-reader-form="login"]');form.querySelector('[name="email"]').value='reader@example.test';form.querySelector('[name="password"]').value='synthetic-password';
   form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.tick();return form;
  };
  await submit();assert.equal(pending.length,1);
  f.dom.window.history.pushState(null,'','/work/selected');f.bridge.route('work','selected');assert.equal(pending[0].init.signal.aborted,true);
  f.dom.window.history.pushState(null,'','/account');f.root.innerHTML=f.api.renderAccountPage('account','',f.state,false);f.bridge.route('account');
  const current=await submit();assert.equal(pending.length,2,'canceling the old route clears only its login lock');
  pending[0].finish();await f.tick();
  assert.equal(f.identities.length,0);assert.equal(pending[1].init.signal.aborted,false);assert.equal(current.querySelector('[type="submit"]').disabled,true,'old cleanup cannot unlock the newer request');
  pending[1].finish();await f.tick();await f.tick();
  assert.equal(f.identities.length,1);assert.equal(f.dom.window.location.pathname,'/blog');
 }finally{for(const request of pending)request.finish();f.close();}
});

test('an aborted login cannot release a newer request when a quick return retains the same form',async()=>{
 const pending=[];
 const f=await fixture(undefined,{productionRouting:true,login:init=>new Promise(resolve=>pending.push({init,finish:()=>resolve(Response.json({email:'reader@example.test',nickname:'测试读者',vip:false,vipUntil:null}))}))});try{
  await f.tick();await f.tick();
  const form=f.root.querySelector('[data-reader-form="login"]'),button=form.querySelector('[type="submit"]'),control=form.querySelector('[data-login-verification-control]');
  form.querySelector('[name="email"]').value='reader@example.test';form.querySelector('[name="password"]').value='synthetic-password';
  const submit=()=>form.dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit();await f.tick();assert.equal(pending.length,1);
  f.dom.window.history.pushState(null,'','/work/selected');f.bridge.route('work','selected');assert.equal(pending[0].init.signal.aborted,true);
  f.dom.window.history.pushState(null,'','/account');f.bridge.route('account');
  assert.equal(f.root.querySelector('[data-reader-form="login"]'),form,'a superseded exit animation never replaced the form');
  await f.tick();await f.tick();submit();await f.tick();assert.equal(pending.length,2);
  assert.equal(button.disabled,true);assert.equal(control.disabled,true);assert.equal(control.getAttribute('aria-busy'),'true');
  pending[0].finish();await f.tick();
  assert.equal(f.identities.length,0);assert.equal(pending[1].init.signal.aborted,false);
  assert.equal(button.disabled,true,'the old transport must not unlock the submit button owned by the newer request');
  assert.equal(control.disabled,true,'the old transport must not release the verification control owned by the newer request');
  assert.equal(control.getAttribute('aria-busy'),'true');
  pending[1].finish();await f.tick();await f.tick();
  assert.equal(f.identities.length,1);assert.equal(f.dom.window.location.pathname,'/blog');
 }finally{for(const request of pending)request.finish();f.close();}
});
