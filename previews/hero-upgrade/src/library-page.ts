/** ProjectsGrid / ProjectPreviewCard composition, TDX c73bc49 (MIT).
 * The collection and access rules come from the existing SANSPHASE library.
 * Local samples are explicitly separate from the real collection and permissions.
 */
import { createContentReader } from '../../../src/content-reader.ts';
import { lang } from './i18n';
import { esc, pad2 } from './util';
import { libraryMainURL, libraryQuery, parseLibraryList } from './library-model';
import type { LibraryCatalog } from './library-model';
import { mountLibraryBook } from './library-book';
import { demoLibrary, demoBook, demoLibraryHref } from './demo-library';
import { openSample } from './sample-dialog';
import { icon } from './icons';
import { isSiteIntegration, isLocalIntegration, localContentURL } from './integration-context';
import { integratedDateLabel } from './integration-date.ts';

const copy = (zh: string, en: string) => lang() === 'en' ? en : zh;
const arrow = `<i aria-hidden="true">${icon('arrow-up-right')}</i>`;
const bookIcon = icon('book-open');
type LibrarySource = 'demo' | 'live';
type State = { query: string; draft: string; category: string; page: number; layout: 'grid' | 'list'; source: LibrarySource; language: string };
const state: State = { query: '', draft: '', category: 'all', page: 1, layout: 'grid', source: 'demo', language: '' };
const active = new WeakMap<HTMLElement, { dispose(): void }>();
const focusAttributes = ['data-library-search', 'data-library-category', 'data-library-layout', 'data-library-page-action', 'data-library-source'] as const;
type LibraryFocus = { attribute: typeof focusAttributes[number]; value: string };
export function captureLibraryFocus(root: HTMLElement): LibraryFocus | null {
  const focused = root.ownerDocument.activeElement;
  if (!(focused instanceof HTMLElement) || !root.contains(focused) || root.closest('[inert],[hidden],[aria-hidden="true"]')) return null;
  const attribute = focusAttributes.find(name => focused.hasAttribute(name));
  return attribute ? { attribute, value: focused.getAttribute(attribute)! } : null;
}
function restoreLibraryFocus(root: HTMLElement, identity: LibraryFocus | null) {
  const document = root.ownerDocument;
  if (!identity || !root.isConnected || root.closest('[inert],[hidden],[aria-hidden="true"]') || document.activeElement !== document.body) return;
  const replacement = Array.from(root.querySelectorAll<HTMLElement>(`[${identity.attribute}]`)).find(element => element.getAttribute(identity.attribute) === identity.value);
  const target = replacement?.matches(':disabled') ? root.querySelector<HTMLElement>('[data-library-page-current]') : replacement;
  target?.focus({ preventScroll: true });
}

export function renderLibraryPage() {
  const local=isSiteIntegration();if(local)state.source='live';
  return `<div class="library-page">
    <header class="library-hero container">
      <nav class="page-crumb" aria-label="${copy('面包屑','Breadcrumb')}"><a href="/">${copy('首页','Home')}</a><span aria-hidden="true">/</span><span aria-current="page">${copy('资源中心','Resource center')}</span><small>THE READING ROOM / 06</small></nav>
      <div class="library-hero-grid"><div class="library-copy" data-page-reveal><p class="eyebrow">SANSPHASE / RESOURCE CENTER</p><h1>${copy('藏书，','A place to read.')}<br><em>${copy('也藏下一次发现。','And discover.')}</em></h1><p class="lead">${copy('收藏成册的文字与插图，从一本书开始，读到你想停留的地方。','Books, words and illustrations. Open a book and find a place to stay.')}</p><a href="#library-catalog" class="btn primary" data-magnetic>${copy('浏览藏书','Browse the library')}${arrow}</a></div>
      <figure class="library-object" data-library-book data-book-language="${lang()}" data-page-reveal><div class="library-book-stage"><div class="library-book-canvas" data-library-book-canvas data-cursor="explore"></div><div class="library-book-fallback" data-library-book-fallback aria-hidden="true"><small>SANSPHASE / LIBRARY</small><strong>THE<br>READING<br>ROOM</strong><span>${copy('藏书与阅读','WORDS. IDEAS. DISCOVERIES.')}</span></div></div><span class="visually-hidden" data-library-book-status role="status" aria-live="polite" aria-atomic="true"></span></figure></div>
      <div class="library-features"><span>01 / ${copy('按章节阅读','CHAPTERS')}</span><span>02 / ${copy('回到上次读到的位置','PICK UP WHERE YOU LEFT OFF')}</span><span>03 / ${copy('为段落留下书签','BOOKMARK A PASSAGE')}</span></div>
    </header>
    <section id="library-catalog" class="library-catalog container" aria-labelledby="library-catalog-title"><div class="library-source-bar"><p data-library-source-note></p>${local?'':`<div role="group" aria-label="${copy('书目来源','Book source')}"><button type="button" data-library-source="demo" aria-pressed="${state.source==='demo'}">${copy('演示书目','Sample books')}</button><button type="button" data-library-source="live" aria-pressed="${state.source==='live'}">${copy('主站书库','Live library')}</button></div>`}</div><header class="library-catalog-heading"><div><p class="eyebrow">THE COLLECTION</p><h2 id="library-catalog-title">${copy('藏书目录','The library')}</h2></div><p class="library-status" data-library-status role="status" aria-live="polite" aria-atomic="true">${copy('正在读取书库…','Loading the library…')}</p></header>
      <form class="library-search" role="search"><label class="visually-hidden" for="library-search">${copy('搜索书名、摘要或标签','Search titles, summaries or tags')}</label>${icon('search')}<input id="library-search" type="search" data-library-search value="${esc(state.draft)}" placeholder="${copy('寻找一本书，或一个感兴趣的话题','Find a book, or something you’re curious about')}" maxlength="200" disabled><button type="submit" disabled>${copy('搜索','Search')} ${arrow}</button></form>
      <div class="library-toolbar"><div class="library-categories" data-library-categories aria-label="${copy('书籍分类','Book categories')}"></div><div class="library-layout" aria-label="${copy('目录布局','Catalog layout')}">${(['grid','list'] as const).map(layout=>`<button type="button" data-library-layout="${layout}" aria-pressed="${state.layout===layout}" disabled>${layout==='grid'?copy('书架','Shelf'):copy('列表','Index')}</button>`).join('')}</div></div>
      <div data-library-results data-state="loading" aria-busy="true"><div class="library-gate">${bookIcon}<p class="eyebrow">THE READING ROOM</p><h3>${copy('正在打开书库','Opening the library')}</h3></div></div><nav class="library-pagination" data-library-pagination aria-label="${copy('书库分页','Library pagination')}"></nav>
    </section>
    <section class="library-guide container" aria-labelledby="library-guide-title"><header><p class="eyebrow">BEFORE YOU OPEN A BOOK</p><h2 id="library-guide-title">${copy('阅读，自有节奏。','Read at your own pace.')}</h2></header>
      <div>${[
        [copy('从目录进入，不必从头开始','Start from the contents'),copy('打开书籍后，可以先看介绍和章节目录，直接跳到想读的章节与小节。正文按需加载，阅读过程中可继续前往上一节或下一节。','Open a book for its introduction and contents. Jump to a chapter or section, then move to the previous or next section as you read.')],
        [copy('续读与书签，留在当前浏览器','Keep your place in this browser'),copy('主站阅读器会在当前浏览器保存读到的位置，也可以为段落添加书签。更换设备、清理浏览器数据或使用隐私模式时，记录可能不会保留；它不是账号云同步。','The main-site reader saves your position and passage bookmarks in this browser. They do not sync between devices and may be lost when browser data is cleared or private browsing ends.')],
        [copy('沿用现有账号与书籍权限','Use your existing reading access'),copy('资源中心需要登录。普通书籍向已登录读者开放；标记为 VIP 的书籍需要有效 VIP。书籍内的插图与附件也遵守同样的权限。','Sign in to read the library. Standard books are available to signed-in readers; VIP books require an active membership. Illustrations and attachments follow the same access rules.')],
      ].map(([title,body],index)=>`<details><summary><span>${pad2(index+1)}</span><h3>${title}</h3><i aria-hidden="true">+</i></summary><p>${body}</p></details>`).join('')}</div>
    </section></div>`;
}

export function disposeLibrary(root: HTMLElement) { active.get(root)?.dispose(); active.delete(root); }
export function bindLibrary(root: HTMLElement, fetcher: typeof fetch = fetch, initialFocus: LibraryFocus | null = null, source?: LibrarySource) {
  disposeLibrary(root);
  const local=isSiteIntegration(root.ownerDocument),localEnvironment=isLocalIntegration(root.ownerDocument),view=root.ownerDocument.defaultView!;
  if(local)state.source='live';else if (source) state.source = source;
  const accountURL=()=>'/account?return='+encodeURIComponent(view.location.pathname+view.location.search+view.location.hash);
  if (state.language !== lang()) { state.category = 'all'; state.page = 1; state.language = lang(); }
  const reader = createContentReader(fetcher, { maxEntries: 0 });
  const bookView = mountLibraryBook(root);
  const events = new AbortController();
  let disposed = false, generation = 0, catalog: LibraryCatalog | null = null;
  let sample: ReturnType<typeof openSample> | null = null;
  let pendingFocus = initialFocus;
  const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const results = query<HTMLElement>('[data-library-results]');
  const status = query<HTMLElement>('[data-library-status]');
  const search = query<HTMLInputElement>('[data-library-search]');
  const categories = query<HTMLElement>('[data-library-categories]');
  const pagination = query<HTMLElement>('[data-library-pagination]');
  const refresh = () => root.dispatchEvent(new CustomEvent('page:content', { bubbles: true }));
  function sourceState() {
    query<HTMLElement>('.library-page').dataset.librarySource = state.source;
    query<HTMLElement>('[data-library-source-note]').textContent = localEnvironment?copy('本地已连接 · 原站藏书、章节与阅读权限。','LOCAL CONNECTION · ORIGINAL BOOKS, CHAPTERS AND READING ACCESS.'):state.source === 'demo'
      ? copy('本地演示 · 3 本开源参考书目。体验目录与详情，正式藏书保持独立。', 'LOCAL DEMO · Three open-source sample books. Explore the catalog and notes; the live library stays separate.')
      : copy('主站真实书库 · 沿用原有登录、VIP、章节与附件权限。', 'LIVE LIBRARY · Original sign-in, VIP, chapter and attachment access rules apply.');
    root.querySelectorAll<HTMLButtonElement>('[data-library-source]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.librarySource === state.source)));
  }
  function showSample(id: string, trigger?: HTMLElement | null) {
    const detail = demoBook(id, lang());
    if (!detail || disposed || state.source !== 'demo') return;
    sample?.dispose();
    const location = root.ownerDocument.defaultView!.location, history = root.ownerDocument.defaultView!.history;
    const url = new URL(location.href);url.searchParams.set('sample', id);history.replaceState(history.state, '', url);
    sample = openSample(root, { title: detail.book.title, summary: detail.book.summary, sections: detail.sections, sourceURL: detail.sourceURL, sourceLabel: detail.sourceLabel, license: detail.license }, trigger);
  }
  function controls(enabled: boolean) { root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.library-search input,.library-search button,[data-library-layout]').forEach(element => { element.disabled = !enabled; }); }
  function message(kind: 'auth' | 'error' | 'empty' | 'filtered' | 'vip', vipAction = '') {
    results.dataset.state = kind; results.setAttribute('aria-busy','false'); pagination.innerHTML = '';
    const messages = {
      auth:[copy('登录后，打开你的书库。','Sign in. Open the library.'),copy('本地预览尚未连接主站登录。使用现有账号前往主站，即可查看权限内的藏书与章节。','This local preview is not connected to main-site sign-in. Use your existing account on the main site to browse books and chapters available to you.')],
      error:[copy('暂时没有连接上书库。','The library is out of reach.'),copy('目录未能加载，暂时无法确认书目。你可以重试，也可以直接前往主站阅读。','The catalog could not be loaded. Try again, or open the library on the main site.')],
      empty:[copy('藏书尚未发布。','No books published yet.'),copy('书籍发布后会出现在这里。你也可以先阅读博客里的公开记录。','Published books will appear here. In the meantime, explore the public journal.')],
      filtered:[copy('还没找到这本书。','No matching books.'),copy('试试更短的关键词，或者清除搜索与分类。','Try a shorter search, or clear the search and category.')],
      vip:[copy('请在主站确认阅读权限。','Check your reading access.'),copy('书库返回了访问限制，请使用现有账号在主站查看可读内容。','The library returned an access restriction. Use your existing account on the main site to check available books.')],
    };
    const [title,body] = messages[kind];
    const localCopy=local?{
      auth:[copy('登录后，打开你的书库。','Sign in. Open the library.'),copy('使用现有账号登录，继续阅读权限内的藏书与章节。','Sign in with your existing account to read the books and chapters available to you.')],
      error:[copy('书库暂时不可用。','The library is unavailable.'),localEnvironment?copy('请重试。若仍然失败，请确认本地内容服务已经启动。','Try again. If the problem persists, check the local content service.'):copy('请重新加载。若仍然无法连接，请稍后重试。','Reload the collection. If it is still unavailable, please try again later.')],
      vip:[copy('当前书籍需要阅读权限。','Reading access is required.'),copy('请在账号页查看会员状态。VIP 书籍需要有效 VIP，正文与附件由服务端核验权限。','Check your membership on the account page. VIP books require an active membership; the server checks chapters and files.')],
    }[kind as 'auth'|'error'|'vip']:undefined;
    const messageTitle=localCopy?.[0]??title,messageBody=localCopy?.[1]??body;
    status.textContent = kind === 'auth' ? copy('需要登录','SIGN-IN REQUIRED') : kind === 'error' ? copy('暂时不可用','TEMPORARILY UNAVAILABLE') : kind === 'vip' ? copy('访问受限','ACCESS RESTRICTED') : kind === 'empty' ? copy('尚无已发布藏书','NO PUBLISHED BOOKS') : copy('没有匹配的书籍','NO MATCHING BOOKS');
    results.innerHTML = `<div class="library-gate">${bookIcon}<p class="eyebrow">${kind==='auth'?'YOUR ACCOUNT / YOUR LIBRARY':'THE READING ROOM'}</p><h3>${messageTitle}</h3><p>${messageBody}</p><div class="library-state-actions">${vipAction}${kind==='error'?`<button class="btn ghost" data-library-retry>${copy('重新加载','Try again')} ↻</button>`:''}${kind==='filtered'?`<button class="btn primary" data-library-clear>${copy('清除筛选','Clear filters')}</button>`:kind==='empty'?`<a class="btn ghost" href="/blog">${copy('阅读博客','Read the journal')}${arrow}</a>`:local?`${kind==='auth'||kind==='vip'?`<a class="btn ${kind==='vip'?'ghost':'primary'}" href="${accountURL()}">${copy('查看账号','Open account')}${arrow}</a>`:''}`:`<a class="btn primary" href="${libraryMainURL()}" target="_blank" rel="noopener noreferrer">${copy('前往主站阅读','Read on the main site')}${arrow}</a>`}${kind==='vip'?`<a class="btn ghost" href="/blog">${copy('阅读博客','Read the journal')}${arrow}</a>`:''}</div></div>`;
    refresh();
  }
  function renderBooks() {
    if (!catalog) return;
    controls(true);
    categories.innerHTML = ['all',...catalog.categories.filter(category=>category!=='all')].map(category=>`<button type="button" data-library-category="${esc(category)}" aria-pressed="${category===state.category}">${category==='all'?copy('全部藏书','All books'):esc(category)}</button>`).join('');
    root.querySelectorAll<HTMLButtonElement>('[data-library-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.libraryLayout===state.layout)));
    if (!catalog.items.length) return message(state.query || state.category!=='all' ? 'filtered' : 'empty');
    results.dataset.state = 'ready';results.setAttribute('aria-busy','false');
    status.textContent = `${pad2(catalog.total)} ${state.source==='demo'?copy('本示例书目','SAMPLE BOOKS'):copy('本藏书','BOOKS')} · ${pad2(catalog.page)} / ${pad2(catalog.pages)}`;
    results.innerHTML = `<div class="library-books" data-layout="${state.layout}">${catalog.items.map((book,index)=>`
      <a class="library-book" href="${esc(local?localContentURL('resource-center',book.id):state.source==='demo'?demoLibraryHref(book.id):libraryMainURL(book.id))}" ${local?'':state.source==='demo'?`data-library-sample="${esc(book.id)}"`:'target="_blank" rel="noopener noreferrer"'} data-page-card data-cursor="read">
        <div class="library-shelf-stage">
          <div class="library-book-object book-cover-3d" aria-hidden="true">
            <div class="library-cover">${book.coverSrc?`<img src="${esc(book.coverSrc)}" alt="" loading="lazy" decoding="async">`:''}<div class="library-cover-fallback"${book.coverSrc?' hidden':''}><small>SANSPHASE / ${pad2((catalog!.page-1)*12+index+1)}</small><strong>${esc(book.title)}</strong><span>${state.source==='demo'?'OPEN SOURCE / SAMPLE':'THE READING ROOM'}</span></div></div>
            <span class="library-book-spine"><span>${esc(book.title)}</span><small>SANSPHASE</small></span>
            <span class="library-book-edge library-book-edge-top"></span><span class="library-book-edge library-book-edge-bottom"></span>
          </div>
        </div>
        <div class="library-book-copy"><p class="library-book-meta"><span>${esc(book.category)}</span>${state.source==='demo'?`<span class="library-sample-label">${copy('本地示例','LOCAL SAMPLE')}</span>`:''}${book.vipOnly?`<span class="library-vip">VIP${book.locked?` · ${copy('需权限','RESTRICTED')}`:''}</span>`:''}</p><h3>${esc(book.title)}</h3><p>${esc(book.summary)}</p><div class="library-book-foot">${book.date?`<time${local?` datetime="${esc(book.date)}"`:''}>${esc(local?integratedDateLabel(book.date,'-'):book.date.slice(0,10))}</time>`:'<span></span>'}<span>${state.source==='demo'?copy('查看示例','Explore sample'):book.locked?copy('查看权限','Check access'):copy('进入阅读','Open book')}${arrow}</span></div></div>
      </a>`).join('')}</div>`;
    results.querySelectorAll<HTMLImageElement>('img').forEach(image => image.addEventListener('error',()=>{image.hidden=true;image.nextElementSibling?.removeAttribute('hidden');},{once:true,signal:events.signal}));
    pagination.innerHTML = catalog.pages>1?`<button type="button" data-library-page="${catalog.page-1}" data-library-page-action="previous" ${catalog.page===1?'disabled':''}>← ${copy('上一页','Previous')}</button><span data-library-page-current tabindex="-1">${catalog.page} / ${catalog.pages}</span><button type="button" data-library-page="${catalog.page+1}" data-library-page-action="next" ${catalog.page===catalog.pages?'disabled':''}>${copy('下一页','Next')} →</button>`:'';
    refresh();
  }
  async function load() {
    const request = ++generation;
    sourceState();
    status.textContent = copy('正在读取书库…','Loading the library…');results.setAttribute('aria-busy','true');
    try {
      const response: unknown = state.source === 'demo' ? demoLibrary(state, lang()) : await reader.read(libraryQuery(state));
      if (disposed || request!==generation) return;
      const localModel=local?await import('./integration-content-model'):null;
      if(disposed||request!==generation)return;
      const parsed = localModel?localModel.parseIntegratedList(response,'resource-center'):parseLibraryList(response);
      if (!parsed) throw new Error('Invalid library metadata');
      const focus = captureLibraryFocus(root) ?? pendingFocus;
      pendingFocus = null;
      catalog=parsed;state.page=parsed.page;renderBooks();restoreLibraryFocus(root, focus);
    } catch (error: unknown) {
      if (disposed || request!==generation) return;
      catalog=null;controls(false);categories.innerHTML='';
      const code = error && typeof error==='object' && 'status' in error ? error.status : null;
      if (code===403) {
        try {
          const {vipContactAction}=await import('./integration-access');
          if (disposed || request!==generation) return;
          message('vip',vipContactAction(lang()==='en'));
        } catch { if (!disposed && request===generation) message('error'); }
      } else message(code===401?'auth':'error');
    }
  }
  // An unfinished search is presentation state, not a new backend query.
  search.addEventListener('input',()=>{state.draft=search.value;},{signal:events.signal});
  root.ownerDocument.addEventListener('focusin',event=>{if(event.target instanceof Element && !root.contains(event.target)) pendingFocus=null;},{signal:events.signal});
  root.ownerDocument.addEventListener('pointerdown',event=>{if(event.target instanceof Element && !root.contains(event.target)) pendingFocus=null;},{signal:events.signal});
  root.addEventListener('submit',event=>{
    if (!(event.target instanceof Element) || !event.target.matches('.library-search')) return;
    event.preventDefault();state.draft=search.value;state.query=state.draft.trim();state.page=1;void load();
  },{signal:events.signal});
  root.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('[data-library-sample]'):null;
    if(link && event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault();showSample(link.dataset.librarySample!,link);return; }
    const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;
    if (!button || button.disabled) return;
    if (button.dataset.librarySource === 'demo' || button.dataset.librarySource === 'live') {
      if(local)return;
      if (button.dataset.librarySource === state.source) return;
      sample?.dispose();sample = null;reader.cancel();generation++;catalog=null;
      state.source = button.dataset.librarySource;state.query='';state.draft='';state.category='all';state.page=1;search.value='';pendingFocus=null;
      // A different source must never inherit actionable cards or metadata
      // from the old collection while its first request is being validated.
      controls(false);categories.replaceChildren();pagination.replaceChildren();
      results.dataset.state='loading';
      results.innerHTML=`<div class="library-gate" role="status"><p>${copy('正在读取书库…','Loading the library…')}</p></div>`;
      refresh();
      void load();
    }
    else if (button.hasAttribute('data-library-retry')) void load();
    else if (button.hasAttribute('data-library-clear')) {state.query='';state.draft='';state.category='all';state.page=1;search.value='';search.focus();void load();}
    else if (button.dataset.libraryCategory!==undefined) {state.category=button.dataset.libraryCategory;state.page=1;void load();}
    else if (button.dataset.libraryLayout==='grid' || button.dataset.libraryLayout==='list') {
      state.layout=button.dataset.libraryLayout;
      const books=root.querySelector<HTMLElement>('.library-books');if(books)books.dataset.layout=state.layout;
      root.querySelectorAll<HTMLButtonElement>('[data-library-layout]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.libraryLayout===state.layout)));
    }
    else if (button.dataset.libraryPage && catalog) {const page=Number(button.dataset.libraryPage);if(page>=1&&page<=catalog.pages){state.page=page;root.dispatchEvent(new CustomEvent('collection:position',{bubbles:true,detail:{target:results}}));void load();}}
  },{signal:events.signal});
  const controller={dispose(){if(disposed)return;disposed=true;generation++;events.abort();reader.cancel();bookView.dispose();sample?.dispose();sample=null;}};
  active.set(root,controller);void load();
  const sampleID = new URL(root.ownerDocument.defaultView!.location.href).searchParams.get('sample');
  if (sampleID && state.source === 'demo') {
    const trigger=Array.from(root.querySelectorAll<HTMLElement>('[data-library-sample]')).find(element=>element.dataset.librarySample===sampleID) ?? search;
    showSample(sampleID,trigger);
  }
  return controller;
}
