/**
 * Materials/software directory. TDX SkillMatrix / CardFrame / Spotlight / Reveal
 * composition, MIT @ c73bc4966f0ba808b978e22eccf5a063fc649751; see SOURCES.json.
 * Content and access come from the existing production contentQuery/reader.
 * This module does not manufacture inventory, ratings, software facts or media.
 */
import { createContentReader } from '../../../src/content-reader.ts';
import { lang, pick } from './i18n';
import { esc, pad2 } from './util';
import { practices, practicePosts } from './practice-content';
import { mountAmbient } from './ambient';
import { catalogMainURL, catalogQuery, parseCatalogList } from './catalog-model';
import type { CatalogKind, CatalogEntry, CatalogList } from './catalog-model';
import { demoCatalog, demoEntry, demoHref } from './demo-catalog';
import { openSample } from './sample-dialog';
import { icon } from './icons';
import { isSiteIntegration, isLocalIntegration, localContentURL } from './integration-context';
import { integratedDateLabel } from './integration-date.ts';

const copy = (zh: string, en: string) => lang() === 'en' ? en : zh;
const arrow = `<i aria-hidden="true">${icon('arrow-up-right')}</i>`;
type CatalogState = { query: string; draft: string; category: string; page: number; layout: 'grid' | 'list'; source:'demo'|'live'; language:string };
const states: Record<CatalogKind, CatalogState> = {
  resources: { query:'', draft:'', category:'all', page:1, layout:'grid',source:'demo',language:'' },
  software: { query:'', draft:'', category:'all', page:1, layout:'grid',source:'demo',language:'' },
};
const active = new WeakMap<HTMLElement, { dispose(): void }>();
const focusAttributes = ['data-catalog-search','data-catalog-category','data-catalog-layout','data-catalog-page-action','data-catalog-retry','data-catalog-source'] as const;
type CatalogFocus = { attribute: typeof focusAttributes[number]; value: string };
export function captureCatalogFocus(root: HTMLElement): CatalogFocus | null {
  const focused = root.ownerDocument.activeElement;
  if (!(focused instanceof HTMLElement) || !root.contains(focused) || root.closest('[inert],[hidden],[aria-hidden="true"]')) return null;
  const attribute = focusAttributes.find(key => focused.hasAttribute(key));
  return attribute ? { attribute, value: focused.getAttribute(attribute)! } : null;
}
function restoreFocus(root: HTMLElement, saved: CatalogFocus | null) {
  const doc = root.ownerDocument;
  if (!saved || !root.isConnected || doc.activeElement !== doc.body || root.closest('[inert],[hidden],[aria-hidden="true"]')) return;
  const target = Array.from(root.querySelectorAll<HTMLElement>(`[${saved.attribute}]`)).find(node => node.getAttribute(saved.attribute) === saved.value);
  if (target?.matches(':disabled')) root.querySelector<HTMLElement>('[data-catalog-status]')?.focus({preventScroll:true});
  else target?.focus({preventScroll:true});
}

function guideItems(kind: CatalogKind) {
  return kind === 'resources' ? [
    [copy('先看用途','Find the purpose'),copy('资料是为哪一步准备的？先阅读介绍，再判断是否适合眼前的任务。','Read the introduction and decide how the material fits the task in front of you.')],
    [copy('再选获取方式','Choose how to use it'),copy('条目可能包含附件或来源链接。格式、文件名与获取方式，以实际资料介绍为准。','An entry may include an attachment or source link. Check its description, file name and format before using it.')],
    [copy('带回自己的实践','Put it into practice'),copy('把资料带回实际任务。这里的资料目录与资源中心的成册书籍分别维护。','Use it in your own work. These materials are a separate collection from the books in the resource center.')],
  ] : [
    [copy('从用途开始','Start with the task'),copy('先确定想解决什么问题，再看软件的用途与使用介绍。','Know what you want to accomplish, then read what the software does and how it is used.')],
    [copy('读完介绍再选择','Read before choosing'),copy('推荐条目记录实际介绍与体验。价格、版本和系统要求，以软件官方网站的当前说明为准。','Read the notes and experience first. Consult the official website for current pricing, versions and system requirements.')],
    [copy('通过原入口获取','Follow the original link'),copy('有官方网站或附件时，进入条目查看。账号与附件访问继续使用主站原有流程。','Open an entry for its official website or available files. Account and attachment access use the existing main-site flow.')],
  ];
}
function relatedReading() {
  // Retain published cross-page fragments, without calling these resources.
  return `<aside class="catalog-related" aria-label="${copy('相关公开实践记录','Related public field notes')}"><p class="catalog-kicker">${copy('想先读公开记录？','PUBLIC FIELD NOTES')}</p><div>${practices.map(practice => {
    const entries = practicePosts(practice);
    return `<details id="track-${practice.id}"><summary>${esc(pick(practice.title))}<span aria-hidden="true">+</span></summary><ol>${entries.map(({p})=>`<li><a href="/blog/${esc(p.slug)}">${esc(pick(p.title))}${arrow}</a></li>`).join('')}</ol></details>`;
  }).join('')}</div><p class="catalog-main-note">${copy('这些是博客原文，独立于上方的资料目录。','These are original journal articles, separate from the materials directory above.')}</p></aside>`;
}

function catalogIntroduction(kind: CatalogKind, source: 'demo'|'live'): string {
  if(kind==='resources')return copy('学习资料、实践笔记与模板。带着问题来，找到能用在眼前任务里的参考。','Learning resources, practical notes and templates. Bring a question. Leave with something useful.');
  return source==='demo'
    ? copy('从记录、构思到影像制作。一组围绕创作流程挑选的开源工具，先看用途，再选适合自己的。','From notes and ideas to video. Explore open-source tools by what you want to make.')
    : copy('整理软件的用途、上手方法与适用场景。先看介绍，再选择适合自己的工具。','Explore software by its purpose, getting started notes and use cases. Read the introduction before choosing a tool.');
}
function catalogLauncher(kind: CatalogKind, source: 'demo'|'live'): string {
  const material=kind==='resources';
  if(source==='live'){
    // Live inventory belongs to the original content service. These shortcuts
    // navigate existing controls; they never promise an unverified product.
    const shortcuts=[
      {href:'#catalog-directory',name:copy('按分类浏览','Browse categories'),line:copy('从当前已发布的目录开始','EXPLORE PUBLISHED ENTRIES'),symbol:'layers' as const,tag:'BROWSE'},
      {href:'#catalog-search',name:material?copy('搜索资料','Find a reference'):copy('搜索软件','Find a tool'),line:copy('名称、用途或标签','NAME / PURPOSE / TAGS'),symbol:'search' as const,tag:'SEARCH'},
      {href:'#catalog-guide',name:copy('选择与获取','Choose & access'),line:copy('先了解用途，再查看来源','PURPOSE / NOTES / SOURCES'),symbol:'files' as const,tag:'GUIDE'},
    ];
    return shortcuts.map((item,index)=>`<a class="catalog-preset" href="${item.href}" data-page-card data-cursor="open"><span class="preset-top"><span>${pad2(index+1)} / ${item.tag}</span>${arrow}</span><span class="preset-symbol" aria-hidden="true">${icon(item.symbol)}</span><span class="preset-name">${item.name}</span><span class="preset-description">${item.line}</span></a>`).join('');
  }
  const presets=material?[
    {query:'AI',name:copy('从 AI 基础开始','Start with AI'),line:copy('概念、模型与动手练习','CONCEPTS / MODELS / PRACTICE'),symbol:'layers' as const,code:'01',tag:'AI'},
    {query:'Web',name:copy('把网站做出来','Build for the web'),line:copy('基础、开发与自动化','FOUNDATIONS / DEVELOPMENT'),symbol:'terminal' as const,code:'02',tag:'WEB'},
    {query:'Mermaid',name:copy('让流程更清楚','Make the process clear'),line:copy('用图表梳理知识与工作流','KNOWLEDGE / FLOWCHARTS'),symbol:'workflow' as const,code:'03',tag:'FLOW'},
  ]:[
    {query:'Logseq',name:copy('知识记录','Knowledge'),line:'Logseq',symbol:'book-open' as const,code:'01',tag:'NOTES'},
    {query:'Kdenlive',name:copy('影像剪辑','Film & editing'),line:'Kdenlive',symbol:'monitor' as const,code:'02',tag:'FILM'},
    {query:'Excalidraw',name:copy('图解想法','Visual thinking'),line:'Excalidraw',symbol:'workflow' as const,code:'03',tag:'IDEAS'},
  ];
  const cards=presets.map(item=>`<button type="button" class="catalog-preset" data-catalog-preset="${item.query}" data-page-card data-cursor-text="${copy('查找','FIND')}"><span class="preset-top"><span>${item.code} / ${item.tag}</span>${arrow}</span><span class="preset-symbol" aria-hidden="true">${icon(item.symbol)}</span><span class="preset-name">${item.name}</span><span class="preset-description">${item.line}</span></button>`).join('');
  return cards;
}
function catalogHero(kind: CatalogKind) {
  const material=kind==='resources';
  const crumb=`<nav class="page-crumb" aria-label="${copy('面包屑','Breadcrumb')}"><a href="/">${copy('首页','Home')}</a><span aria-hidden="true">/</span><span aria-current="page">${material?copy('资料','Materials'):copy('软件推荐','Software')}</span><small>SANSPHASE / ${material?'MATERIALS':'TOOLBOX'}</small></nav>`;
  const cards=catalogLauncher(kind,states[kind].source);
  return `<header class="catalog-hero ${material?'materials-hero':'software-hero'}"><div class="container">${crumb}<div class="catalog-heading" data-page-reveal><p class="catalog-kicker"><span></span>${material?'THE PRACTICE ARCHIVE':'A SMALL, USEFUL TOOLBOX'}</p><div class="catalog-heading-row"><h1>${material?copy('为下一次实践，','For your next step,'):copy('少些折腾。','Less friction.')}<br><em>${material?copy('找一个好起点。','a place to begin.'):copy('多些顺手。','More flow.')}</em></h1><div class="catalog-intro"><p data-catalog-intro>${catalogIntroduction(kind,states[kind].source)}</p><a class="catalog-guide-link" href="#catalog-directory">${material?copy('进入资料索引','Explore the archive'):copy('打开工具清单','Explore the tools')}${icon('arrow-down')}</a></div></div></div><div class="${material?'materials-launchpad':'software-workbench'}" data-catalog-launcher="${states[kind].source}" data-page-reveal>${cards}</div><div class="catalog-hero-foot"><span>${material?copy('带着问题检索，带着方法继续。','FIND A REFERENCE. TAKE THE NEXT STEP.'):copy('工具只是起点，创作才是目的。','THE TOOL IS A START. MAKING IS THE POINT.')}</span><a href="${catalogMainURL(kind)}" target="_blank" rel="noopener noreferrer" class="catalog-main-link">${copy('主站完整栏目','MAIN-SITE COLLECTION')}${arrow}</a></div></div></header>`;
}
export function renderCatalogPage(kind: CatalogKind) {
  const material = kind === 'resources', state = states[kind];
  const local=isSiteIntegration();if(local)state.source='live';
  const guide = guideItems(kind);
  return `<div class="catalog-page" data-catalog-kind="${kind}">
    ${catalogHero(kind)}
    <section id="catalog-directory" class="catalog-directory container" aria-labelledby="catalog-directory-title"><div class="catalog-source-bar"><p data-catalog-source-note></p>${local?'':`<div role="group" aria-label="${copy('内容来源','Content source')}"><button type="button" data-catalog-source="demo" aria-pressed="${state.source==='demo'}">${copy('演示内容','Demo collection')}</button><button type="button" data-catalog-source="live" aria-pressed="${state.source==='live'}">${copy('主站目录','Live collection')}</button></div>`}</div><div class="catalog-directory-head" data-page-reveal><div><p class="catalog-kicker">${material?'MATERIALS / DIRECTORY':'SOFTWARE / DIRECTORY'}</p><h2 id="catalog-directory-title">${material?copy('资料目录','The materials index'):copy('工具清单','The software index')}</h2></div><p class="catalog-status" data-catalog-status role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${copy('正在连接目录…','Connecting to the collection…')}</p></div>
      <div class="catalog-workspace"><aside class="catalog-sidebar"><p class="catalog-category-label">${copy('按分类浏览','BROWSE BY CATEGORY')}</p><div class="catalog-categories" data-catalog-categories role="group" aria-label="${copy('目录分类','Collection categories')}"><button type="button" data-catalog-category="all" aria-pressed="true" disabled>${copy('全部','All')}<span aria-hidden="true">↗</span></button></div><div class="catalog-sidebar-note"><span class="catalog-caption">${copy('栏目说明','ABOUT THIS COLLECTION')}</span><p>${material?copy('先阅读资料介绍，再查看附件或来源。','Read the introduction before opening files or source links.'):copy('先了解使用场景，再前往官方网站。','Understand the use case before visiting the official website.')}</p><a href="#catalog-guide">${copy('了解更多','Learn more')} ${arrow}</a></div></aside>
      <div class="catalog-content"><div class="catalog-toolbar"><form class="catalog-search" role="search"><span aria-hidden="true">⌕</span><label class="visually-hidden" for="catalog-search">${material?copy('搜索资料名称、用途或标签','Search materials, purpose or tags'):copy('搜索软件名称、用途或标签','Search software, purpose or tags')}</label><input id="catalog-search" type="search" data-catalog-search value="${esc(state.draft)}" maxlength="200" placeholder="${material?copy('搜索资料名称、用途或标签','Search materials, purpose or tags'):copy('搜索软件名称、用途或标签','Search software, purpose or tags')}" disabled><button type="submit" disabled aria-label="${copy('搜索目录','Search the collection')}">↗</button></form><div class="catalog-layout" role="group" aria-label="${copy('目录显示方式','Collection layout')}">${(['grid','list'] as const).map(layout=>`<button type="button" data-catalog-layout="${layout}" aria-pressed="${state.layout===layout}" disabled>${layout==='grid'?copy('卡片','Grid'):copy('列表','List')}</button>`).join('')}</div></div>
      <div data-catalog-results data-state="loading" aria-busy="true"><div class="catalog-state"><span class="catalog-state-index" aria-hidden="true">${material?'R':'S'}</span><div><p class="catalog-kicker">CONNECTING THE COLLECTION</p><h3>${copy('正在读取目录。','Opening the collection.')}</h3><p>${copy('请稍候。','One moment.')}</p></div></div></div><nav class="catalog-pagination" data-catalog-pagination aria-label="${copy('目录分页','Collection pagination')}"></nav></div></div>
    </section>
    <section id="catalog-guide" class="catalog-guide container" aria-labelledby="catalog-guide-title"><header><p class="catalog-kicker">A LITTLE CONTEXT</p><h2 id="catalog-guide-title">${material?copy('让资料，真正用起来。','Make it useful.'):copy('工具，服务于你的选择。','Choose with context.')}</h2><p>${copy('有目的地找，也有依据地选。','Find with purpose. Choose with context.')}</p></header><div>${guide.map(([title,body],index)=>`<details ${index===0?'open':''}><summary><span class="catalog-caption">${pad2(index+1)}</span><h3>${title}</h3><span class="catalog-guide-plus" aria-hidden="true">+</span></summary><p>${body}</p></details>`).join('')}</div></section>
    ${material&&!local?`<div class="container">${relatedReading()}</div>`:''}
  </div>`;
}

function entryMarkup(kind: CatalogKind, entry: CatalogEntry, index: number) {
  const demo=states[kind].source==='demo';
  const local=isSiteIntegration();
  const size = entry.fileSize ? `${new Intl.NumberFormat(lang() === 'en' ? 'en' : 'zh-CN').format(BigInt(entry.fileSize))} B` : '';
  const details = kind === 'resources' ? [entry.format, size].filter(Boolean) : [];
  const date = local ? integratedDateLabel(entry.date,'-') : entry.date ? entry.date.slice(0,10).replaceAll('.','-') : '';
  // shadcn/ui Item's media/content/footer composition, adapted to the existing
  // native-link renderer. Original source + MIT notice: vendor/shadcn-item.
  // Software is a compact directory item; materials retain their document card.
  if (kind === 'software') return `<article class="catalog-entry software-entry" data-page-card data-page-reveal>
    <a class="software-card" data-slot="item" href="${esc(local?localContentURL(kind,entry.id):demo?demoHref(kind,entry.id):catalogMainURL(kind,entry.id))}" ${local?'':demo?`data-sample-id="${esc(entry.id)}"`:'target="_blank" rel="noopener noreferrer"'} data-cursor="read">
      <div class="software-card-media" data-slot="item-media" aria-hidden="true">
        ${entry.coverSrc?`<img src="${esc(entry.coverSrc)}" alt="" loading="lazy" decoding="async">`:''}
        <div class="catalog-cover-fallback"${entry.coverSrc?' hidden':''}>${icon('monitor')}</div>
      </div>
      <div class="software-card-heading" data-slot="item-content">
        <p class="software-card-category">${esc(entry.category)}</p>
        <h3 data-slot="item-title" title="${esc(entry.title)}">${esc(entry.title)}</h3>
      </div>
      ${entry.summary?`<p class="software-card-summary" data-slot="item-description">${esc(entry.summary)}</p>`:''}
      ${entry.tags.length?`<ul class="software-card-tags" aria-label="${copy('标签','Tags')}">${entry.tags.slice(0,3).map(tag=>`<li title="${esc(tag)}">${esc(tag)}</li>`).join('')}</ul>`:''}
      <div class="software-card-footer" data-slot="item-footer">
        ${date?`<time datetime="${esc(local?entry.date:date)}">${esc(date)}</time>`:'<span></span>'}
        <span class="software-card-action">${copy('查看介绍','Read the notes')}${arrow}</span>
      </div>
    </a>
  </article>`;
  return `<article class="catalog-entry" data-page-card data-page-reveal>
    <a href="${esc(local?localContentURL(kind,entry.id):demo?demoHref(kind,entry.id):catalogMainURL(kind,entry.id))}" ${local?'':demo?`data-sample-id="${esc(entry.id)}"`:'target="_blank" rel="noopener noreferrer"'} data-cursor="read">
      <div class="catalog-entry-media feature-media">
        ${entry.coverSrc?`<img src="${esc(entry.coverSrc)}" alt="" loading="lazy" decoding="async">`:''}
        <div class="catalog-cover-fallback"${entry.coverSrc?' hidden':''}>
          <span class="catalog-caption">${kind==='resources'?'MATERIAL /':'SOFTWARE /'} ${pad2(index+1)}</span>
          <span class="catalog-entry-initial" aria-hidden="true">${demo?icon(kind==='resources'?'files':'monitor'):esc(entry.title.slice(0,1))}</span>
        </div>
        <span class="catalog-entry-format">${esc(details.join(' · ') || (kind==='resources'?copy('资料介绍','Material notes'):copy('使用介绍','Usage notes')))}</span>
      </div>
      <div class="catalog-entry-copy">
        <div class="catalog-entry-description">
          <p class="catalog-entry-meta"><span>${esc(entry.category)}</span>${details.length?`<span class="catalog-entry-details">${esc(details.join(' · '))}</span>`:''}${date?`<time datetime="${esc(local?entry.date:date)}">${esc(date)}</time>`:''}</p>
          <h3>${esc(entry.title)}</h3>
          ${entry.summary?`<p class="catalog-entry-summary">${esc(entry.summary)}</p>`:''}
          ${entry.tags.length?`<ul class="catalog-entry-tags" aria-label="${copy('标签','Tags')}">${entry.tags.slice(0,3).map(tag=>`<li>${esc(tag)}</li>`).join('')}</ul>`:''}
        </div>
        <p class="catalog-entry-action"><span>${copy('查看介绍','Read the notes')}</span>${arrow}</p>
      </div>
    </a>
  </article>`;
}
export function disposeCatalog(root: HTMLElement) { active.get(root)?.dispose(); active.delete(root); }
export function bindCatalog(root: HTMLElement, kind: CatalogKind, fetcher: typeof fetch = fetch, initialFocus: CatalogFocus | null = null, initialSource?:'demo'|'live') {
  disposeCatalog(root);
  const reader = createContentReader(fetcher,{maxEntries:0}), events = new AbortController(), state = states[kind];
  const view=root.ownerDocument.defaultView!;
  const local=isSiteIntegration(root.ownerDocument),localEnvironment=isLocalIntegration(root.ownerDocument);
  if(local)state.source='live';else if(initialSource)state.source=initialSource;
  const accountURL=()=>'/account?return='+encodeURIComponent(view.location.pathname+view.location.search+view.location.hash);
  if(local)root.querySelectorAll<HTMLAnchorElement>('.catalog-main-link').forEach(link=>{link.href='#catalog-directory';link.removeAttribute('target');link.removeAttribute('rel');link.innerHTML=copy('浏览当前目录','EXPLORE THE COLLECTION')+arrow;});
  if(state.language!==lang()){state.language=lang();state.category='all';state.page=1;}
  const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const result = query<HTMLElement>('[data-catalog-results]'), status = query<HTMLElement>('[data-catalog-status]');
  const search = query<HTMLInputElement>('[data-catalog-search]'), categories = query<HTMLElement>('[data-catalog-categories]'), pagination = query<HTMLElement>('[data-catalog-pagination]');
  const ambient = typeof matchMedia === 'function' && typeof IntersectionObserver !== 'undefined' ? mountAmbient(query('.catalog-hero')) : null;
  let disposed = false, generation = 0, catalog: CatalogList | null = null, pendingFocus = initialFocus;
  let sample:ReturnType<typeof openSample>|null=null;
  const sourceNote=root.querySelector<HTMLElement>('[data-catalog-source-note]')!;
  function syncSource(){
    root.querySelectorAll<HTMLElement>('[data-catalog-source]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.catalogSource===state.source)));
    const launcher=root.querySelector<HTMLElement>('[data-catalog-launcher]');
    if(launcher&&launcher.dataset.catalogLauncher!==state.source){launcher.innerHTML=catalogLauncher(kind,state.source);launcher.dataset.catalogLauncher=state.source;}
    const introduction=root.querySelector<HTMLElement>('[data-catalog-intro]');
    if(introduction)introduction.textContent=catalogIntroduction(kind,state.source);
    sourceNote.textContent=localEnvironment?copy('本地已连接 · 原站已发布内容、账号与附件权限','LOCAL CONNECTION · PUBLISHED CONTENT, ACCOUNTS AND FILE ACCESS'):state.source==='demo'?copy('本地演示 · 开源参考，非主站已发布内容','LOCAL DEMO · OPEN-SOURCE REFERENCES, SEPARATE FROM LIVE CONTENT'):copy('主站目录 · 沿用现有账号和访问权限','LIVE COLLECTION · EXISTING ACCOUNTS AND ACCESS RULES');
  }
  function showSample(id:string,trigger?:HTMLElement|null){
    if(state.source!=='demo')return;
    const detail=demoEntry(kind,id,lang());if(!detail)return;
    sample?.dispose();sample=openSample(root,{...detail,title:detail.entry.title,summary:detail.entry.summary},trigger);
    const url=new URL(view.location.href);url.searchParams.set('sample',id);view.history.replaceState(view.history.state,'',url);
  }
  const refresh = () => root.dispatchEvent(new CustomEvent('page:content',{bubbles:true}));
  const controls = (enabled: boolean) => root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('.catalog-search input,.catalog-search button,[data-catalog-layout],[data-catalog-category],[data-catalog-preset]').forEach(control=>{control.disabled=!enabled;});
  function message(mode: 'auth'|'error'|'empty'|'filtered'|'restricted') {
    const material = kind === 'resources';
    const descriptions = {
      auth:[copy('登录后，打开完整目录。','Sign in to explore the collection.'),copy('本地预览尚未连接主站登录。使用现有账号前往主站，查看条目介绍与附件。','This local preview is not connected to main-site sign-in. Use your account on the main site to read entries and access files.')],
      restricted:[copy('请在主站确认访问权限。','Check your access on the main site.'),copy('当前请求受到访问限制，暂时无法确认目录内容。','Access is restricted. The collection cannot be confirmed from this preview.')],
      error:[copy('暂时没有连接上。','The collection is out of reach.'),copy('目录加载失败，无法确认内容。你可以重试，或直接前往主站。','The collection could not be loaded. Try again, or open it on the main site.')],
      empty:[material?copy('资料尚未发布。','No materials published yet.'):copy('推荐清单尚未发布。','No recommendations published yet.'),copy('已发布的条目会出现在这里。','Published entries will appear here.')],
      filtered:[copy('没有找到匹配的内容。','No matching entries.'),copy('试试更短的关键词，或清除当前筛选。','Try a shorter query, or clear the current filters.')],
    };
    const [title,body] = descriptions[mode];
    const localCopy=local?{
      auth:[copy('登录后，打开完整目录。','Sign in to explore the collection.'),copy('使用现有账号登录，继续查看权限内的条目介绍与附件。','Sign in with your existing account to read the entries and access the files available to you.')],
      restricted:[copy('当前内容需要访问权限。','Access is required.'),copy('请在账号页查看当前身份与会员状态，服务端会核验访问权限。','Check your account and membership status. Access is verified by the server.')],
      error:[copy('目录暂时不可用。','The collection is unavailable.'),localEnvironment?copy('请重试。若仍然失败，请确认本地内容服务已经启动。','Try again. If the problem persists, check the local content service.'):copy('请重新加载。若仍然无法连接，请稍后重试。','Reload the collection. If it is still unavailable, please try again later.')],
    }[mode as 'auth'|'restricted'|'error']:undefined;
    const messageTitle=localCopy?.[0]??title,messageBody=localCopy?.[1]??body;
    status.textContent = mode==='auth'?copy('需要登录 · 目录未读取','SIGN-IN REQUIRED · COLLECTION NOT LOADED'):mode==='error'?copy('连接暂时不可用','TEMPORARILY UNAVAILABLE'):mode==='restricted'?copy('访问受限','ACCESS RESTRICTED'):mode==='empty'?copy('暂无已发布条目','NO PUBLISHED ENTRIES'):copy('没有匹配的条目','NO MATCHING ENTRIES');
    result.dataset.state = mode; result.setAttribute('aria-busy','false'); pagination.innerHTML='';
    result.innerHTML=`<div class="catalog-state"><span class="catalog-state-index" aria-hidden="true">${material?'R':'S'}</span><div><p class="catalog-kicker">${mode==='auth'?'YOUR ACCOUNT / YOUR COLLECTION':material?'THE MATERIALS INDEX':'THE SOFTWARE INDEX'}</p><h3>${messageTitle}</h3><p>${messageBody}</p><div class="catalog-state-actions">${mode==='filtered'?`<button class="btn primary" type="button" data-catalog-clear>${copy('清除筛选','Clear filters')}${arrow}</button>`:local?`${mode==='auth'||mode==='restricted'?`<a class="btn primary" href="${accountURL()}">${copy('查看账号','Open account')}${arrow}</a>`:''}${mode==='error'?`<button class="catalog-retry" type="button" data-catalog-retry>${copy('重新加载','Try again')} ↻</button>`:''}`:`<a class="btn primary catalog-main-link" href="${catalogMainURL(kind)}" target="_blank" rel="noopener noreferrer">${copy('前往主站','Open the main site')}${arrow}</a>${mode==='error'?`<button class="catalog-retry" type="button" data-catalog-retry>${copy('重新加载','Try again')} ↻</button>`:''}`}</div></div></div>`;
    refresh();
  }
  function renderItems() {
    if (!catalog) return;
    controls(true);
    categories.innerHTML=['all',...catalog.categories.filter(name=>name!=='all')].map(name=>`<button type="button" data-catalog-category="${esc(name)}" aria-pressed="${state.category===name}">${name==='all'?copy('全部','All'):esc(name)}<span aria-hidden="true">↗</span></button>`).join('');
    if (!catalog.items.length) { message(state.query || state.category!=='all'?'filtered':'empty'); return; }
    status.textContent=`${pad2(catalog.total)} ${copy('项内容','ENTRIES')} · ${state.source==='demo'?copy('演示','DEMO'):`${pad2(catalog.page)} / ${pad2(catalog.pages)}`}`;
    result.dataset.state='ready';result.setAttribute('aria-busy','false');
    result.innerHTML=`<div class="catalog-entries${kind==='software'?' software-entries':''}" data-layout="${state.layout}">${catalog.items.map((entry,index)=>entryMarkup(kind,entry,(catalog!.page-1)*12+index)).join('')}</div>${state.query||state.category!=='all'?`<button class="catalog-clear" type="button" data-catalog-clear>${copy('清除当前筛选','Clear current filters')} ×</button>`:''}`;
    result.querySelectorAll<HTMLImageElement>('img').forEach(image=>image.addEventListener('error',()=>{image.hidden=true;image.nextElementSibling?.removeAttribute('hidden');},{once:true,signal:events.signal}));
    pagination.innerHTML=catalog.pages>1?`<button type="button" data-catalog-page-action="previous" ${catalog.page===1?'disabled':''}>← ${copy('上一页','Previous')}</button><span>${catalog.page} / ${catalog.pages}</span><button type="button" data-catalog-page-action="next" ${catalog.page===catalog.pages?'disabled':''}>${copy('下一页','Next')} →</button>`:'';
    refresh();
  }
  async function load() {
    const request = ++generation;
    status.textContent=copy('正在连接目录…','Connecting to the collection…');result.setAttribute('aria-busy','true');
    try {
      syncSource();
      const response: unknown=state.source==='demo'?demoCatalog(kind,state,lang()):await reader.read(catalogQuery(kind,state));
      if (disposed || request!==generation) return;
      const localModel=local?await import('./integration-content-model'):null;
      if(disposed||request!==generation)return;
      const parsed=localModel?localModel.parseIntegratedList(response,kind):parseCatalogList(response,kind); if (!parsed) throw new Error('Invalid catalog response');
      const focus=captureCatalogFocus(root) ?? pendingFocus;pendingFocus=null;catalog=parsed;state.page=parsed.page;
      renderItems();restoreFocus(root,focus);
    } catch(error: unknown) {
      if (disposed || request!==generation) return;
      catalog=null;controls(false);categories.innerHTML=`<button type="button" data-catalog-category="all" aria-pressed="true" disabled>${copy('全部','All')}<span aria-hidden="true">↗</span></button>`;
      const code=error && typeof error==='object' && 'status' in error?error.status:null;
      message(code===401?'auth':code===403?'restricted':'error');
    }
  }
  search.addEventListener('input',()=>{state.draft=search.value;},{signal:events.signal});
  root.addEventListener('submit',event=>{if (!(event.target instanceof Element) || !event.target.matches('.catalog-search')) return;event.preventDefault();state.draft=search.value;state.query=search.value.trim();state.page=1;void load();},{signal:events.signal});
  root.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest<HTMLElement>('[data-sample-id]'):null;
    if(link&&event instanceof view.MouseEvent&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&event.button===0){event.preventDefault();showSample(link.dataset.sampleId!,link);return;}
    const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!button||button.disabled)return;
    if(button.dataset.catalogSource==='demo'||button.dataset.catalogSource==='live'){
      if(local)return;
      if(state.source===button.dataset.catalogSource)return;
      reader.cancel();generation++;sample?.dispose();sample=null;state.source=button.dataset.catalogSource;state.query='';state.draft='';state.category='all';state.page=1;search.value='';
      catalog=null;controls(false);pagination.innerHTML='';result.dataset.state='loading';result.innerHTML=`<div class="catalog-state"><div><p class="catalog-kicker">${copy('正在切换内容来源','SWITCHING COLLECTION')}</p><h3>${copy('正在读取目录。','Opening the collection.')}</h3></div></div>`;refresh();void load();
    }
    else if(button.dataset.catalogPreset){state.query=button.dataset.catalogPreset;state.draft=state.query;state.category='all';state.page=1;search.value=state.query;void load();root.querySelector('#catalog-directory')?.scrollIntoView?.({behavior:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}
    else if(button.hasAttribute('data-catalog-retry'))void load();
    else if(button.hasAttribute('data-catalog-clear')){state.query='';state.draft='';state.category='all';state.page=1;search.value='';search.focus();void load();}
    else if(button.dataset.catalogCategory!==undefined){state.category=button.dataset.catalogCategory;state.page=1;void load();}
    else if(button.dataset.catalogLayout==='grid'||button.dataset.catalogLayout==='list'){
      state.layout=button.dataset.catalogLayout;const entries=root.querySelector<HTMLElement>('.catalog-entries');if(entries)entries.dataset.layout=state.layout;
      root.querySelectorAll<HTMLButtonElement>('[data-catalog-layout]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.catalogLayout===state.layout)));
    } else if(button.dataset.catalogPageAction && catalog){const next=state.page+(button.dataset.catalogPageAction==='next'?1:-1);if(next>=1&&next<=catalog.pages){state.page=next;root.dispatchEvent(new CustomEvent('collection:position',{bubbles:true,detail:{target:result}}));void load();}}
  },{signal:events.signal});
  root.ownerDocument.addEventListener('focusin',event=>{if(event.target instanceof Element&&!root.contains(event.target))pendingFocus=null;},{signal:events.signal});
  root.ownerDocument.addEventListener('pointerdown',event=>{if(event.target instanceof Element&&!root.contains(event.target))pendingFocus=null;},{signal:events.signal});
  const controller={dispose(){if(disposed)return;disposed=true;generation++;events.abort();reader.cancel();ambient?.dispose();sample?.dispose();}};
  active.set(root,controller);void load();
  const initialId=new URL(view.location.href).searchParams.get('sample');if(initialId&&state.source==='demo')showSample(initialId);
  return controller;
}
