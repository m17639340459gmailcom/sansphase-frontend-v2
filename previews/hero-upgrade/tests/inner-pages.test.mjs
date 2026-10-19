import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `export * from './src/pages'; export * from './src/blog-query'; export {setLang} from './src/i18n'; export {posts} from './src/content'; export {disposeLibrary} from './src/library-page'; export {disposeCatalog} from './src/catalog-page';`, resolveDir: root }, bundle:true, platform:'node', format:'esm', write:false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
function fixture(page='blog',fetcher=async()=>new Response('{}',{status:401})) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {url:'http://localhost/',pretendToBeVisual:true});
  const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLAnchorElement','Element','CustomEvent','localStorage','AbortController'];
  const previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  const previousFetch=globalThis.fetch;globalThis.fetch=fetcher;
  for(const key of keys) globalThis[key]=dom.window[key];
  api.setLang('zh');
  const root=dom.window.document.getElementById('root');
  api.renderPage(page,root,true);
  return {root,window:dom.window,async settle(){await new Promise(resolve=>setTimeout(resolve,10));},close(){api.disposeCatalog(root);api.disposeLibrary(root);dom.window.close();Object.assign(globalThis,previous);globalThis.fetch=previousFetch;}};
}
test('blog query normalizes full-width text and matches every independent token',()=>{
  const results=api.queryPosts(api.posts,{query:'ＯＢＳＩＤＩＡＮ　Codex',tag:'all',sort:'newest'},'zh');
  assert.deepEqual(results.map(result=>result.i),[2]);
  assert.equal(api.queryPosts(api.posts,{query:'Obsidian 不存在',tag:'all',sort:'newest'},'zh').length,0);
});
test('tags are deduplicated from true content and sort does not mutate the source',()=>{
  const before=api.posts.map(p=>p.slug);
  assert.equal(api.blogTags(api.posts).filter(t=>t.en==='AI video').length,1);
  const rows=api.queryPosts(api.posts,{query:'',tag:'all',sort:'oldest'},'zh');
  assert.equal(rows[0].i,3);
  assert.deepEqual(api.posts.map(p=>p.slug),before);
  assert(api.queryPosts(api.posts,{query:'',tag:'obsidian',sort:'newest'},'zh').every(({p})=>p.tags.some(t=>t.en==='Obsidian')));
});
test('journal replaces the old catalog instead of embedding a second blog design',()=>{
  const f=fixture();
  try{
    const catalog=f.root.querySelector('#journal-catalog');
    assert.equal(catalog.querySelectorAll('.blog-shell,.feature,.posts,.rows,[data-view],.view-toggle').length,0);
    assert.equal(catalog.querySelectorAll('.journal-publications > li').length,api.posts.length);
    assert.equal(catalog.querySelectorAll('img,[data-page-card],[data-page-reveal]').length,0);
    for(const {slug} of api.posts){
      const link=catalog.querySelector(`[data-journal-focus="catalog-${slug}"]`);
      assert.equal(link?.getAttribute('href'),`/blog/${slug}`);
      assert.ok(link.closest('.journal-publication[data-journal-enter]'));
    }
  }finally{f.close();}
});
test('blog controls update real results, reset focus, and preserve state on return',()=>{
  const f=fixture();
  try{
    const search=f.root.querySelector('[data-blog-search]');
    search.value='没有这样的文章'; search.dispatchEvent(new f.window.Event('input',{bubbles:true}));
    assert.equal(f.root.querySelectorAll('[data-blog-results] [data-post]').length,0);
    assert.equal(f.root.querySelector('[role="status"]').getAttribute('aria-live'),'polite');
    f.root.querySelector('[data-blog-clear]').click();
    assert.equal(f.window.document.activeElement,search);
    const select=f.root.querySelector('[data-blog-sort]'); select.value='oldest'; select.dispatchEvent(new f.window.Event('change',{bubbles:true}));
    assert.equal(f.root.querySelector('.journal-publications [data-post]').dataset.post,'3');
    api.renderPage('contact',f.root,true); api.renderPage('blog',f.root,true);
    assert.equal(f.root.querySelector('[data-blog-sort]').value,'oldest');
    assert.equal(f.root.querySelector('.journal-publications [data-post]').dataset.post,'3');
    assert.equal(f.root.querySelectorAll('[data-view]').length,0);
    const current=f.root.querySelector('[data-blog-sort]');current.value='newest';current.dispatchEvent(new f.window.Event('change',{bubbles:true}));
  }finally{f.close();}
});
test('the new journal index retains filtering, results announcements and article focus across language changes',()=>{
  const f=fixture();
  try{
    let updates=0;f.root.addEventListener('page:content',()=>updates++);
    f.root.querySelector('[data-tag="obsidian"]').click();
    assert.equal(f.root.querySelectorAll('.journal-publication').length,2);
    assert.match(f.root.querySelector('[role="status"]').textContent,/02/);
    assert.ok(updates>0);
    const article=f.root.querySelector('.journal-publication [data-post]');
    const identity=article.dataset.journalFocus;article.focus();
    api.setLang('en');api.renderPage('blog',f.root,true);
    assert.equal(f.window.document.activeElement.dataset.journalFocus,identity);
    assert.equal(f.root.querySelector('[data-tag="obsidian"]').getAttribute('aria-pressed'),'true');
    assert.equal(f.root.querySelectorAll('.journal-publication').length,2);
    f.root.querySelector('[data-blog-clear]').click();
    assert.equal(f.root.querySelectorAll('.journal-publication').length,api.posts.length);
    assert.equal(f.window.document.activeElement,f.root.querySelector('[data-blog-search]'));
  }finally{f.close();}
});
test('work groups actual records by practice, with clickable covers and no simulated product gallery',()=>{
  const f=fixture('work');
  try{
    assert.equal(f.root.querySelectorAll('.practice-card').length,2);
    assert.equal(f.root.querySelectorAll('.practice-records [data-post]').length,4);
    assert.equal(f.root.querySelectorAll('.practice-cover[data-post]').length,2);
    assert.equal(f.root.querySelectorAll('.publication-status, iframe, canvas').length,0);
    assert.match(f.root.textContent,/个人知识库/);
    assert.match(f.root.textContent,/AI 影像工作流/);
    assert.doesNotMatch(f.root.textContent,/免费课程|进入演示|在线体验|已上线产品/);
    for(const a of f.root.querySelectorAll('[data-post]')) assert.equal(api.parseRoute(a.getAttribute('href')).page,'blog');
  }finally{f.close();}
});

test('work filtering and view survive article navigation and language refresh without stealing focus',()=>{
  const f=fixture('work');
  try{
    const filter=f.root.querySelector('[data-practice-filter="film"]');
    filter.focus(); filter.click();
    assert.equal(f.root.querySelectorAll('.practice-card').length,1);
    assert.match(f.root.querySelector('[data-practice-results]').textContent,/AI 影像工作流/);
    assert.equal(f.window.document.activeElement,filter);
    f.root.querySelector('[data-practice-view="list"]').click();
    assert.equal(f.root.querySelectorAll('.practice-index [data-practice-row]').length,1);
    api.renderPage('contact',f.root,true); api.renderPage('work',f.root,true);
    assert.equal(f.root.querySelector('[data-practice-filter="film"]').getAttribute('aria-pressed'),'true');
    assert.equal(f.root.querySelector('[data-practice-view="list"]').getAttribute('aria-pressed'),'true');
    const view=f.root.querySelector('[data-practice-view="list"]'); view.focus();
    api.setLang('en'); api.renderPage('work',f.root,true);
    assert.equal(f.window.document.activeElement,f.root.querySelector('[data-practice-view="list"]'));
    f.root.querySelector('[data-practice-filter="all"]').click();
    f.root.querySelector('[data-practice-view="grid"]').click();
  }finally{f.close();}
});

test('learning keeps old topic fragments as small related-reading links, not a course or catalog inventory',()=>{
  const f=fixture('learning');
  try{
    assert.equal(f.root.querySelectorAll('.learning-track,.related-notes,.learning-steps,[data-post]').length,0);
    for(const id of ['knowledge','film']) {
      const section=f.root.querySelector(`#track-${id}`);
      assert.ok(section,`the existing #track-${id} entry must remain reachable`);
      assert.ok(section.closest('.catalog-related'),'blog references belong to the related-reading area');
      const links=section.querySelectorAll('a[href^="/blog/"]');
      assert.ok(links.length>0,'related reading uses ordinary article destinations');
      for(const link of links)assert.equal(api.parseRoute(link.getAttribute('href')).page,'blog');
      assert.equal(section.querySelectorAll('img,canvas,progress,[role="progressbar"],[download],[data-post]').length,0);
    }
    assert.equal(f.root.querySelectorAll('.publication-status, progress, [role="progressbar"], [download]').length,0);
    assert.doesNotMatch(f.root.textContent,/免费课程|课时|客观题|已学完/);
  }finally{f.close();}
});

test('language refresh keeps the same link when a topic repeats its latest article destination',()=>{
  const f=fixture('work');
  try{
    for(const [page,selector] of [['work','.practice-records a:last-child'],['work','.practice-copy h2 a']]){
      api.setLang('zh'); api.renderPage(page,f.root,true);
      f.root.querySelector(selector).focus();
      api.setLang('en'); api.renderPage(page,f.root,true);
      assert.equal(f.window.document.activeElement,f.root.querySelector(selector),selector);
    }
  }finally{f.close();}
});

test('materials and software separate demo collections from live sign-in and empty inventory states',async()=>{
  for(const [page,kind] of [['learning','resources'],['software','software']]){
    const f=fixture(page);
    try{
      const catalog=f.root.querySelector(`[data-catalog-kind="${kind}"]`);
      assert.ok(catalog,`${page} renders its own catalog kind`);
      const results=catalog.querySelector('[data-catalog-results]');
      assert.equal(results?.dataset.state,'ready');
      assert.equal(catalog.querySelectorAll('.catalog-entry').length,6);
      catalog.querySelector('[data-catalog-source="live"]').click();
      assert.equal(results?.dataset.state,'loading');
      assert.equal(results.getAttribute('aria-busy'),'true');
      assert.equal(catalog.querySelectorAll('.learning-track,.related-notes,[data-post],.publication-status,[download],canvas').length,0);
      assert.equal(f.root.querySelectorAll('h1').length,1);
      assert.ok(f.root.querySelector('h1').textContent.trim());
      const entry=catalog.querySelector('.catalog-main-link');
      const destination=new URL(entry.href);
      assert.equal(destination.origin,'https://www.sansphase.com');
      assert.equal(destination.hash,`#/${kind}`);
      assert.match(entry.rel,/noopener/);
      await f.settle();
      assert.equal(results.dataset.state,'auth');
      assert.equal(results.getAttribute('aria-busy'),'false');
      assert.match(results.textContent,/登录/);
      assert.doesNotMatch(results.textContent,/尚未发布|没有内容|整理中/,'an unauthorized catalog must not claim that its inventory is empty');
      for(const anchor of f.root.querySelectorAll('a[href^="/"]')) assert.notEqual(api.parseRoute(anchor.getAttribute('href')).page,'404');
    }finally{f.close();}
  }
});
test('IME Escape does not clear composition, while language refresh preserves the active control',()=>{
  const f=fixture();
  try{
    const search=f.root.querySelector('[data-blog-search]'); search.focus();
    search.value='Obsidian'; search.dispatchEvent(new f.window.Event('input',{bubbles:true}));
    const composing=new f.window.KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true}); search.dispatchEvent(composing);
    assert.equal(search.value,'Obsidian'); assert.equal(composing.defaultPrevented,false);
    api.setLang('en'); api.renderPage('blog',f.root,true);
    assert.equal(f.window.document.activeElement,f.root.querySelector('[data-blog-search]'));
    assert.equal(f.window.document.activeElement.value,'Obsidian');
    const outside=f.window.document.createElement('button'); f.window.document.body.append(outside); outside.focus();
    api.renderPage('blog',f.root,true); assert.equal(f.window.document.activeElement,outside,'refresh cannot steal modal focus');
  }finally{f.close();}
});
test('community presents the existing plan without simulated activity or particle canvases',()=>{
  const f=fixture('community');
  try{
    assert.match(f.root.textContent,/筹备中/);
    assert.equal(f.root.querySelectorAll('.board').length,4);
    assert.equal(f.root.querySelectorAll('.system').length,3);
    assert.equal(f.root.querySelectorAll('canvas,[data-pulse],[data-count]').length,0);
    assert.doesNotMatch(f.root.textContent,/当前在线|18[,.]?600|今日发帖/);
  }finally{f.close();}
});
test('contact and support use existing channels, external safety, and separate status',()=>{
  const f=fixture('contact');
  try{
    assert.equal(f.root.querySelectorAll('.reach').length,2);
    assert.equal(f.root.querySelectorAll('.system').length,3);
    for(const a of f.root.querySelectorAll('.reach')) assert.match(a.rel,/noopener/);
    api.renderPage('support',f.root,true);
    assert.match(f.root.textContent,/赞助渠道暂未开放/);
    assert.doesNotMatch(f.root.textContent,/404/);
    assert.equal(f.root.querySelectorAll('form, input').length,0);
  }finally{f.close();}
});
test('all inner pages support English and expose one meaningful page heading',()=>{
  const f=fixture();
  try{
    api.setLang('en');
    for(const page of ['blog','work','learning','software','community','resources','contact','support','404']){
      api.renderPage(page,f.root,true);
      assert.equal(f.root.querySelectorAll('h1').length,1,page);
      assert(f.root.querySelector('h1').textContent.trim().length>0,page);
      assert(f.root.querySelector('[aria-label="Breadcrumb"]'),page);
      assert.doesNotMatch(f.root.innerHTML,/undefined|NaN/);
    }
  }finally{f.close();}
});
test('library language refresh keeps the search draft and restores focus only while it still belongs to the page',async()=>{
  const f=fixture('resources',async()=>Response.json({items:[],total:0,page:1,pages:1,totalPublished:0,categories:[]}));
  const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
  try{
    await settle();
    const search=f.root.querySelector('[data-library-search]');
    search.value='待提交的书名';search.dispatchEvent(new f.window.Event('input',{bubbles:true}));search.focus();
    api.setLang('en');api.renderPage('resources',f.root,true);await settle();
    assert.equal(f.root.querySelector('[data-library-search]').value,'待提交的书名');
    assert.equal(f.window.document.activeElement,f.root.querySelector('[data-library-search]'));
    const outside=f.window.document.createElement('button');f.window.document.body.append(outside);outside.focus();
    api.setLang('zh');api.renderPage('resources',f.root,true);await settle();
    assert.equal(f.window.document.activeElement,outside);
    const current=f.root.querySelector('[data-library-search]');current.focus();
    api.renderPage('resources',f.root,true);outside.focus();await settle();
    assert.equal(f.window.document.activeElement,outside,'an async refresh must not reclaim a newly focused modal control');
  }finally{f.close();}
});
