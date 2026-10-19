import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const bundled=await build({stdin:{contents:"export * from './src/integration-content.ts';",resolveDir:sourceRoot,loader:'ts'},bundle:true,platform:'node',target:'node24',format:'esm',loader:{'.css':'empty'},write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const mediaId='c57acd8d-a84c-459b-9eb3-6e7f84a82a2e';
const image=`/api/media/${mediaId}?w=960&view=content`;
const attachment=`/api/media/${mediaId}?download=1`;
const entry=(extra={})=>({id:'test-entry',title:'本地契约夹具',summary:'仅在测试中使用，不是作者发布内容。',category:'测试',tags:['测试'],date:'2026-10-19T00:00:00Z',coverSrc:image,format:'PDF',file:'fixture.pdf',fileSize:2048,externalUrl:'https://example.org/',downloadUrl:attachment,...extra});
const list=(extra={})=>({items:[entry()],total:1,page:1,pages:1,totalPublished:1,categories:['测试'],highlights:[],...extra});
const detail=(extra={})=>({item:entry({recordId:'record-test-entry',bodyHTML:'<h2>真实正文结构</h2><p>正文由原内容服务清洗后返回。</p>',attachments:[{name:'测试附件',url:attachment}],...extra})});
const manifest={revision:'test-revision',chapters:[{id:'chapter-1',title:'测试章节',parts:1,headings:[]}]};
function fixture(fetcher,path='/works') {
  const dom=new JSDOM('<body><main id="root"></main></body>',{url:'http://localhost:4285'+path,pretendToBeVisual:true});
  const win=dom.window;
  win.fetch=fetcher;win.scrollTo=()=>{};
  win.IntersectionObserver=class {observe(){}unobserve(){}disconnect(){}};
  win.ResizeObserver=class {observe(){}unobserve(){}disconnect(){}};
  win.Range.prototype.getBoundingClientRect=()=>({top:200,bottom:220,left:0,right:100,width:100,height:20,x:0,y:200,toJSON(){return {};}});
  win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  win.HTMLDialogElement.prototype.close=function(){this.open=false;};
  return {dom,win,root:win.document.getElementById('root'),close(){win.close();}};
}

test('integrated routes reuse each original collection without production links',()=>{
  for(const[kind,path]of [['works','/work'],['resources','/learning'],['software','/software'],['resource-center','/resources']]){
    assert.equal(api.integratedContentPath(kind),path);
    assert.equal(api.integratedContentPath(kind,'中文/slug'),path+'/%E4%B8%AD%E6%96%87%2Fslug');
  }
  assert.throws(()=>api.integratedContentPath('authors'),TypeError);
});
test('media links preserve same-origin access, variants and download permission checks',()=>{
  assert.equal(api.integratedMedia(image),image);assert.equal(api.integratedMedia(attachment,true),attachment);
  for(const url of ['//evil.example'+image,'https://www.sansphase.com'+image,'https://evil.example'+image,'/api/author/media/'+mediaId,'/media/'+mediaId,image+'&preview=secret',image+'&w=12','/api/media/'+mediaId+'?w=4097','/api/media/'+mediaId+'#bad','/api/media/'+mediaId+'?download=1'])assert.equal(api.integratedMedia(url),'');
  for(const url of [attachment+'&preview=secret',attachment+'&download=1',attachment.replace('=1','=0'),image])assert.equal(api.integratedMedia(url,true),'');
});
test('list DTO is bounded and excludes body, attachments, record IDs and author identity',()=>{
  const value=api.parseIntegratedList(list({items:[entry({bodyHTML:'PRIVATE_BODY',recordId:'PRIVATE_ID',attachments:[attachment],author:'PRIVATE_AUTHOR'})]}),'works');
  assert.ok(value);assert.equal(value.items[0].coverSrc,image);assert.equal(value.items[0].fileSize,'2048');
  assert.equal(JSON.stringify(value).includes('PRIVATE_'),false);
  for(const value of [list({items:Array.from({length:13},()=>entry())}),list({total:0}),list({total:2,totalPublished:1}),list({page:2}),list({categories:[5]}),list({items:[entry({tags:[2]})]})])assert.equal(api.parseIntegratedList(value,'works'),null);
  assert.equal(api.parseIntegratedList(list(),'author'),null);
});
test('detail adapters preserve real downloads, body and stable progress identity',()=>{
  const value=api.parseIntegratedDetail(detail(),'resources');assert.ok(value);
  assert.equal(value.recordId,'record-test-entry');assert.equal(value.bodyHTML,detail().item.bodyHTML);
  assert.deepEqual(value.attachments,[{name:'测试附件',url:attachment}]);
  assert.equal(api.parseIntegratedDetail(detail({locked:true}),'resources'),null);
  assert.equal(api.parseIntegratedDetail(detail(),'resource-center'),null);
  assert.ok(api.parseIntegratedDetail(detail({book:manifest}),'resource-center'));
  assert.equal(api.parseIntegratedDetail(detail({book:{...manifest,chapters:[{...manifest.chapters[0],parts:0}]}}),'resource-center'),null);
});
test('detail markup escapes user fields and deduplicates attachment actions',()=>{
  const value=api.parseIntegratedDetail(detail({title:'<img onerror="bad">',summary:'<script>bad</script>',externalUrl:'javascript:bad'}),'resources');
  const html=api.integratedDetailMarkup('resources',value);
  assert.match(html,/&lt;img onerror=/);assert.doesNotMatch(html,/<script>|javascript:/);assert.equal((html.match(/download data-cursor-text/g)||[]).length,1);
  assert.match(html,/href="\/learning"/);assert.doesNotMatch(html,/sansphase\.com/);
});

test('integrated collection lists and details display local publication days while preserving raw datetime values',async()=>{
  const NativeFormat=Intl.DateTimeFormat;
  try{
    for(const[timeZone,date,expected]of [['Asia/Shanghai','2026-09-24T17:30:00Z','2026.09.25'],['America/Los_Angeles','2026-09-25T03:30:00Z','2026.09.24'],['America/Los_Angeles','2026-09-25','2026.09.25']]){
      Intl.DateTimeFormat=class extends NativeFormat{constructor(locale,options={}){super(locale,{timeZone,...options});}};
      for(const kind of ['works','resources','software','resource-center']){
        const value=api.parseIntegratedDetail(detail({date,...(kind==='resource-center'?{book:manifest}:{})}),kind);
        const dom=new JSDOM(api.integratedDetailMarkup(kind,value));
        try{const time=dom.window.document.querySelector('time');assert.equal(time.textContent,expected,kind);assert.equal(time.getAttribute('datetime'),date);}finally{dom.window.close();}
      }
      const f=fixture(async()=>Response.json(list({items:[entry({date})]})));let mount;
      try{mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;assert.equal(f.root.querySelector('.integrated-card time').textContent,expected);assert.equal(f.root.querySelector('.integrated-card time').getAttribute('datetime'),date);}
      finally{mount?.();f.close();}
    }
  }finally{Intl.DateTimeFormat=NativeFormat;}
});
test('works list uses original paged query, filtering and genuine detail URLs',async()=>{
  const calls=[];const f=fixture(async(url,options)=>{calls.push({url,options});const page=new URL(url,'http://localhost').searchParams.get('page');return Response.json(list({page:Number(page),pages:2,total:13,totalPublished:13}));});
  let mount;try{
    mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    assert.equal(f.root.querySelector('.integrated-card a').getAttribute('href'),'/work/test-entry');
    assert.equal(calls[0].options.credentials,'same-origin');assert.match(calls[0].url,/kind=works/);assert.match(calls[0].url,/public=1/);
    f.root.querySelector('[data-integrated-page="2"]').click();await new Promise(resolve=>setTimeout(resolve,0));assert.match(calls[1].url,/page=2/);
    const input=f.root.querySelector('input');input.value='查询';f.root.querySelector('form').dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(new URL(calls[2].url,'http://localhost').searchParams.get('q'),'查询');assert.match(calls[2].url,/page=1/);
  }finally{mount?.();f.close();}
});

test('works refresh keeps rows and search focus until the latest response commits',async()=>{
  const pending=[];let initial=true;
  const f=fixture(async()=>initial?(initial=false,Response.json(list())):new Promise(resolve=>pending.push(resolve)));let mount;
  try{
    mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    const input=f.root.querySelector('input'),card=f.root.querySelector('.integrated-card');input.focus();input.value='first';
    const submit=()=>f.root.querySelector('form').dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));
    submit();assert.equal(f.root.querySelector('.integrated-card'),card);assert.equal(f.root.querySelector('[data-integrated-results]').getAttribute('aria-busy'),'true');
    input.value='second';submit();input.value='unfinished draft';
    pending[0](Response.json(list({items:[entry({title:'stale'})]})));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.root.querySelector('.integrated-card'),card);
    pending[1](Response.json(list({items:[entry({title:'latest'})]})));await new Promise(resolve=>setTimeout(resolve,0));
    assert.match(f.root.querySelector('.integrated-card').textContent,/latest/);assert.equal(f.root.querySelector('input'),input);assert.equal(input.value,'unfinished draft');assert.equal(f.win.document.activeElement,input);
    assert.equal(f.root.querySelector('[data-integrated-results]').getAttribute('aria-busy'),'false');
  }finally{mount?.();f.close();}
});

test('works list returns to its submitted filters, page and unsubmitted input draft without caching entries',async()=>{
  const calls=[];
  const f=fixture(async url=>{
    const params=new URL(url,'http://localhost').searchParams;calls.push(params);
    return Response.json(params.get('view')==='detail'?detail():list({items:[entry({title:'Fresh response '+calls.length})],page:Number(params.get('page')),total:24,pages:2,totalPublished:24}));
  });let mount;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  try{
    const options={english:()=>false,fetcher:f.win.fetch};
    mount=api.mountIntegratedContent(f.root,{kind:'works'},options);await mount.ready;
    f.root.querySelector('[data-integrated-category="测试"]').click();await tick();
    const input=f.root.querySelector('input');input.value='AI';input.dispatchEvent(new f.win.Event('input',{bubbles:true}));
    f.root.querySelector('form').dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));await tick();
    f.root.querySelector('[data-integrated-page="2"]').click();await tick();
    input.value='AI / unfinished draft';input.dispatchEvent(new f.win.Event('input',{bubbles:true}));
    mount();mount=api.mountIntegratedContent(f.root,{kind:'works',id:'test-entry'},options);await mount.ready;mount();
    mount=api.mountIntegratedContent(f.root,{kind:'works'},options);await mount.ready;
    const returned=calls.at(-1);
    assert.equal(returned.get('view'),'list');assert.equal(returned.get('category'),'测试');assert.equal(returned.get('q'),'AI');assert.equal(returned.get('page'),'2');
    assert.equal(f.root.querySelector('input').value,'AI / unfinished draft');
    assert.equal(f.root.querySelector('[data-integrated-category="测试"]').getAttribute('aria-pressed'),'true');
    assert.match(f.root.querySelector('.integrated-card').textContent,new RegExp('Fresh response '+calls.length));
  }finally{mount?.();f.close();}
});

test('integrated list UI state is isolated by host and collection, and identity reset removes it',async()=>{
  const calls=[];
  const f=fixture(async url=>{const params=new URL(url,'http://localhost').searchParams;calls.push(params);return Response.json(list({page:Number(params.get('page'))}));});let mount;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  try{
    const options={english:()=>false,fetcher:f.win.fetch};
    mount=api.mountIntegratedContent(f.root,{kind:'works'},options);await mount.ready;
    const input=f.root.querySelector('input');input.value='private search';input.dispatchEvent(new f.win.Event('input',{bubbles:true}));
    f.root.querySelector('form').dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));await tick();mount();
    mount=api.mountIntegratedContent(f.root,{kind:'software'},options);await mount.ready;
    assert.equal(calls.at(-1).get('q'),'');assert.equal(f.root.querySelector('input').value,'');mount();
    const other=f.win.document.createElement('main');f.win.document.body.append(other);
    mount=api.mountIntegratedContent(other,{kind:'works'},options);await mount.ready;
    assert.equal(calls.at(-1).get('q'),'');mount();
    api.resetIntegratedContentState(f.root);
    mount=api.mountIntegratedContent(f.root,{kind:'works'},options);await mount.ready;
    assert.equal(calls.at(-1).get('q'),'');assert.equal(calls.at(-1).get('category'),'all');assert.equal(calls.at(-1).get('page'),'1');assert.equal(f.root.querySelector('input').value,'');
  }finally{mount?.();f.close();}
});

test('works pagination requests position immediately, never after a delayed response',async()=>{
  let release,count=0;const f=fixture(async()=>++count===1?Response.json(list({total:13,pages:2,totalPublished:13})):new Promise(resolve=>release=resolve));let mount;
  try{
    const targets=[];f.root.addEventListener('collection:position',event=>targets.push(event.detail.target));
    mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    f.root.querySelector('[data-integrated-page="2"]').click();assert.equal(targets.length,1);assert.equal(targets[0],f.root.querySelector('[data-integrated-results]'));
    release(Response.json(list({total:13,pages:2,totalPublished:13,page:2})));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(targets.length,1);
  }finally{mount?.();f.close();}
});
test('real resource detail uses original media and image viewer; teardown removes content',async()=>{
  const f=fixture(async()=>Response.json(detail()),'/learning/test-entry');let mount;
  try{mount=api.mountIntegratedContent(f.root,{kind:'resources',id:'test-entry'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    assert.match(f.root.querySelector('[data-integrated-body]').textContent,/真实正文结构/);assert.equal(f.root.querySelector('a[download]').getAttribute('href'),attachment);
    f.root.querySelector('[data-integrated-image]').click();assert.ok(f.win.document.querySelector('dialog[open]'));mount();assert.equal(f.root.childElementCount,0);assert.equal(f.win.document.querySelector('dialog'),null);
  }finally{mount?.();f.close();}
});

test('detail image zoom preserves author links and modified-click browser behavior',async()=>{
  const f=fixture(async()=>Response.json(detail({bodyHTML:`<a href="https://example.org/original" target="_blank"><img src="${image}" alt="Author destination"></a><img src="${image}" alt="Plain illustration">`})),'/learning/test-entry');let mount;
  try{
    mount=api.mountIntegratedContent(f.root,{kind:'resources',id:'test-entry'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    const linked=f.root.querySelector('.integrated-body a img');assert.equal(linked.getAttribute('role'),null);assert.equal(linked.hasAttribute('tabindex'),false);
    const linkedClick=new f.win.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});linked.dispatchEvent(linkedClick);assert.equal(linkedClick.defaultPrevented,false);assert.equal(f.win.document.querySelector('dialog[open]'),null);
    const plain=f.root.querySelector('.integrated-body>img'),modified=new f.win.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});plain.dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);assert.equal(f.win.document.querySelector('dialog[open]'),null);
    plain.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.ok(f.win.document.querySelector('dialog[open]'));
  }finally{mount?.();f.close();}
});
test('401 and VIP403 are reported as original errors and never replaced by demonstrations',async()=>{
  for(const status of [401,403]){
    const errors=[],f=fixture(async()=>Response.json({code:status===403?'VIP_REQUIRED':'LOGIN_REQUIRED'},{status}));let refreshed=0,mount;
    try{mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch,refreshIdentity:async()=>{refreshed++;},onError:error=>errors.push(error)});await mount.ready;
      assert.equal(errors.length,1);assert.equal(errors[0].status,status);assert.equal(refreshed,1);assert.equal(f.root.querySelector('.integrated-card'),null);assert.match(f.root.textContent,/暂时无法打开/);assert.equal(f.win.location.pathname,'/works');
    }finally{mount?.();f.close();}
  }
});
test('disposal aborts pending requests and prevents stale content from entering a new route',async()=>{
  let release,signal;const f=fixture((_url,options)=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});});
  try{const mount=api.mountIntegratedContent(f.root,{kind:'works'},{english:()=>false,fetcher:f.win.fetch});mount();assert.equal(signal.aborted,true);release(Response.json(list()));await mount.ready;assert.equal(f.root.childElementCount,0);}finally{f.close();}
});
test('resource center mounts original reader, reads original book-part and saves reusable bookmarks',async()=>{
  const calls=[],f=fixture(async(url)=>{calls.push(url);const query=new URL(url,'http://localhost').searchParams;
    return Response.json(query.get('view')==='book-part'?{revision:'test-revision',chapter:'chapter-1',title:'测试章节',part:0,parts:1,relocated:false,html:'<div data-book-block="block-1" data-book-offset="0"><p>本地章节正文，沿用原阅读进度与书签。</p></div>'}:detail({book:manifest}));
  },'/resources/test-entry');let mount;
  try{mount=api.mountIntegratedContent(f.root,{kind:'resource-center',id:'test-entry'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;
    assert.ok(f.root.querySelector('.section-reader'));assert.equal(f.root.querySelector('.section-back').getAttribute('href'),'/resources');
    f.root.querySelector('[data-section-action="start"]').click();await new Promise(resolve=>setTimeout(resolve,0));assert.match(calls[1],/view=book-part/);assert.match(calls[1],/chapter=chapter-1/);assert.match(f.root.querySelector('.section-body').textContent,/本地章节正文/);
    f.root.querySelector('[data-section-action="marks"]').click();f.root.querySelector('[data-section-action="save-mark"]').click();assert.match(f.root.querySelector('.section-marks').textContent,/测试章节/);
    const stored=JSON.parse(f.win.localStorage.getItem('sansphase-book-reading-v1'));assert.equal(stored['record-test-entry'].bookmarks[0].block,'block-1');
    mount();f.root.innerHTML='';mount=api.mountIntegratedContent(f.root,{kind:'resource-center',id:'test-entry'},{english:()=>false,fetcher:f.win.fetch});await mount.ready;assert.ok(f.root.querySelector('[data-section-action="resume"]'));
  }finally{mount?.();f.close();}
});
