/** Thin DOM adapter. Publication and book-reader behavior stays in the original modules. */
import { contentQuery, createContentReader } from '../../../src/content-reader.ts';
import { enhanceContentImages, setContentHTML } from '../../../src/content-images.ts';
import { esc } from './util.ts';
import { icon } from './icons.ts';
import { integratedDateLabel } from './integration-date.ts';
import { integratedContentPath, parseIntegratedList, parseIntegratedDetail, isIntegratedKind as isKind } from './integration-content-model.ts';
import type { IntegratedKind, IntegratedList, IntegratedItem, IntegratedRoute } from './integration-content-model.ts';
export { integratedMedia, integratedContentPath, parseIntegratedList, parseIntegratedDetail } from './integration-content-model.ts';
export type { IntegratedKind, IntegratedEntry, IntegratedList, IntegratedBookHeading, IntegratedBookChapter, IntegratedItem, IntegratedRoute } from './integration-content-model.ts';

export type IntegratedContentOptions = {
  english: () => boolean; refreshIdentity?: () => Promise<void>;
  onError?: (error: unknown) => void; onReady?: () => void; fetcher?: typeof fetch;
};
export type IntegratedContentMount = (() => void) & {ready: Promise<void>};
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
type IntegratedListState = { page: number; query: string; category: string; draft: string };
const listStates = new WeakMap<HTMLElement, Partial<Record<IntegratedKind, IntegratedListState>>>();
const initialListState = (): IntegratedListState => ({page:1,query:'',category:'all',draft:''});
function retainedListState(root: HTMLElement, kind: IntegratedKind): IntegratedListState {
  let hosted = listStates.get(root);
  if (!hosted) { hosted = {}; listStates.set(root,hosted); }
  return hosted[kind] ?? (hosted[kind] = initialListState());
}
/** Identity changes clear only control state. Publication data stays in the
 * original request reader and is discarded on every unmount. */
export function resetIntegratedContentState(root: HTMLElement): void { listStates.delete(root); }

function labels(kind: IntegratedKind, english: boolean): [string,string,string] {
  const copy={works:['作品','PROJECTS','软件与创作'],resources:['资料','MATERIALS','学习与实践'],software:['软件推荐','SOFTWARE','工具与体验'],'resource-center':['资源中心','LIBRARY','藏书与阅读']} as const;
  const value=copy[kind];return [english?value[1]:value[0],value[1],english?value[1]:value[2]];
}
const arrow=icon('arrow-up-right');
function publicationTime(value: string): string {
  const label=integratedDateLabel(value);
  return label?`<time datetime="${esc(value)}">${esc(label)}</time>`:'';
}
function sizeLabel(value: string): string {
  const amount=Number(value);if (!Number.isFinite(amount)||amount<=0)return '';
  return amount<1024?`${amount} B`:amount<1048576?`${+(amount/1024).toFixed(1)} KB`:`${+(amount/1048576).toFixed(1)} MB`;
}
export function integratedDetailMarkup(kind: IntegratedKind, item: IntegratedItem, english=false): string {
  const t=(zh:string,en:string)=>english?en:zh, [label,kicker]=labels(kind,english);
  const downloads=[...(item.downloadUrl?[{name:item.file||t('附件','Attachment'),url:item.downloadUrl}]:[]),...item.attachments].filter((file,index,all)=>all.findIndex(other=>other.url===file.url)===index);
  return `<section class="integration-content integration-detail container" data-integrated-kind="${kind}"><nav class="page-crumb" aria-label="${t('面包屑','Breadcrumb')}"><a href="/">${t('首页','Home')}</a><span>/</span><a href="${integratedContentPath(kind)}">${esc(label)}</a><small>SANSPHASE / ${kicker}</small></nav><article class="integrated-article"><header><p class="catalog-kicker">${esc(item.category||label)}</p><h1>${esc(item.title)}</h1><div class="integrated-meta">${publicationTime(item.date)}${item.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><p class="integrated-intro">${esc(item.summary)}</p></header>${item.coverSrc?`<div class="integrated-cover"><img src="${esc(item.coverSrc)}" alt="${esc(item.title)}" decoding="async" fetchpriority="high" data-integrated-image></div>`:''}<div class="integrated-body" data-integrated-body></div>${downloads.length||item.externalUrl?`<section class="integrated-access" aria-label="${t('获取与链接','Downloads and links')}"><div><p class="catalog-kicker">${t('带回你的实践','TAKE IT WITH YOU')}</p><h2>${t('获取与链接','Downloads and links')}</h2>${sizeLabel(item.fileSize)?`<p>${esc(sizeLabel(item.fileSize))}</p>`:''}</div><div>${downloads.map(file=>`<a href="${esc(file.url)}" download data-cursor-text="${t('下载','DOWNLOAD')}">${icon('files')}<span>${esc(file.name)}</span>${arrow}</a>`).join('')}${item.externalUrl?`<a href="${esc(item.externalUrl)}" target="_blank" rel="noopener noreferrer">${icon('arrow-up-right')}<span>${t('相关网站','Related website')}</span>${arrow}</a>`:''}</div></section>`:''}<footer class="integrated-end"><a class="btn" href="${integratedContentPath(kind)}">${t('返回','Back to ')}${esc(label)}${icon('arrow-right')}</a></footer></article></section>`;
}
function listMarkup(kind: IntegratedKind, value: IntegratedList, state: IntegratedListState, english: boolean): string {
  const {query,category,draft}=state;
  const t=(zh:string,en:string)=>english?en:zh,[label,kicker,subtitle]=labels(kind,english);
  return `<section class="integration-content container"><nav class="page-crumb"><a href="/">${t('首页','Home')}</a><span>/</span><span>${esc(label)}</span><small>SANSPHASE / ${kicker}</small></nav><header class="integrated-list-head"><p class="catalog-kicker">${kicker}</p><h1>${esc(subtitle)}</h1><p>${t('从想法到实现，保留每一次探索的记录。','From the first idea to the finished work. A record of exploration.')}</p></header><div class="integrated-list-controls"><form data-integrated-search role="search"><label for="integrated-query">${t('搜索名称、用途或标签','Search titles, purpose or tags')}</label><div><input id="integrated-query" type="search" maxlength="200" value="${esc(draft)}"><button type="submit" aria-label="${t('搜索','Search')}">${icon('search')}</button></div></form><div class="integrated-categories" role="group" aria-label="${t('分类','Categories')}">${['all',...value.categories.filter(name=>name!=='all')].map(name=>`<button type="button" data-integrated-category="${esc(name)}" aria-pressed="${category===name}">${name==='all'?t('全部','All'):esc(name)}</button>`).join('')}</div></div><div data-integrated-results aria-busy="false" tabindex="-1"><p class="integrated-count" role="status">${value.total} ${t('项内容','entries')} · ${value.page} / ${value.pages}</p><div class="integrated-grid">${value.items.map((item,index)=>`<article class="integrated-card" data-page-card><a href="${integratedContentPath(kind,item.id)}" data-cursor-text="${t('查看','EXPLORE')}"><div class="integrated-card-media">${item.coverSrc?`<img src="${esc(item.coverSrc)}" alt="" decoding="async" loading="lazy">`:`<span class="integrated-card-placeholder" aria-hidden="true">${icon(kind==='resource-center'?'book-open':'layers')}</span>`}<span>${String((value.page-1)*12+index+1).padStart(2,'0')}</span></div><div class="integrated-card-copy"><div class="integrated-meta"><span>${esc(item.category)}</span>${item.vipOnly?'<span>VIP</span>':''}${publicationTime(item.date)}</div><h2>${esc(item.title)}${arrow}</h2><p>${esc(item.summary)}</p><div class="integrated-tags">${item.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div></div></a></article>`).join('')||`<div class="integrated-empty"><h2>${query||category!=='all'?t('暂时没有匹配内容','No matching entries'):t('内容正在整理','The collection is being prepared')}</h2><p>${query||category!=='all'?t('换个关键词，或清除筛选再试。','Try another keyword or clear the filters.'):t('作者发布后的内容会显示在这里。','Published entries will appear here.')}</p>${query||category!=='all'?`<button class="btn" type="button" data-integrated-clear>${t('清除筛选','Clear filters')}</button>`:''}</div>`}</div>${value.pages>1?`<nav class="integrated-pagination" aria-label="${t('分页','Pagination')}"><button type="button" data-integrated-page="${value.page-1}" ${value.page===1?'disabled':''}>← ${t('上一页','Previous')}</button><span>${value.page} / ${value.pages}</span><button type="button" data-integrated-page="${value.page+1}" ${value.page===value.pages?'disabled':''}>${t('下一页','Next')} →</button></nav>`:''}</div></section>`;
}

/** Returns immediate teardown, with a ready promise for route and test orchestration.
 * onError receives the original status/code; 401 may open account, 403 must remain
 * a membership gate. Identity refresh never changes server authorization.
 */
export function mountIntegratedContent(root: HTMLElement, route: IntegratedRoute, options: IntegratedContentOptions): IntegratedContentMount {
  if (!isKind(route.kind)) throw new TypeError('Unsupported integration collection');
  const win=root.ownerDocument.defaultView!;
  const reader=createContentReader(options.fetcher??win.fetch.bind(win));
  const events=new win.AbortController();
  const state=route.id?initialListState():retainedListState(root,route.kind);
  let disposed=false, generation=0, cleanup=()=>{};
  const t=(zh:string,en:string)=>options.english()?en:zh;
  const loading=()=>{
    const results=root.querySelector<HTMLElement>('[data-integrated-results]');
    if(results){results.setAttribute('aria-busy','true');results.querySelector('[role="status"]')!.textContent=t('正在更新内容…','Updating the collection…');return;}
    root.innerHTML=`<section class="integration-content container integrated-loading" aria-busy="true"><p class="catalog-kicker">SANSPHASE / ${labels(route.kind,options.english())[1]}</p><p role="status">${t('正在读取内容…','Opening the collection…')}</p></section>`;
  };
  function commitList(list: IntegratedList) {
    cleanup();cleanup=()=>{};
    const markup=listMarkup(route.kind,list,state,options.english());
    const results=root.querySelector<HTMLElement>('[data-integrated-results]');
    if(results){
      const focused=root.ownerDocument.activeElement;
      const pageFocus=focused instanceof win.HTMLButtonElement&&results.contains(focused)?focused.dataset.integratedPage:undefined;
      const template=root.ownerDocument.createElement('template');template.innerHTML=markup;
      const next=template.content.querySelector<HTMLElement>('[data-integrated-results]')!;
      results.replaceChildren(...next.childNodes);results.setAttribute('aria-busy','false');
      const categories=root.querySelector<HTMLElement>('.integrated-categories')!;
      const selected=focused instanceof win.HTMLButtonElement&&categories.contains(focused)?focused.dataset.integratedCategory:undefined;
      categories.replaceChildren(...template.content.querySelector('.integrated-categories')!.childNodes);
      if(selected!==undefined&&root.ownerDocument.activeElement===root.ownerDocument.body){
        [...categories.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.dataset.integratedCategory===selected)?.focus({preventScroll:true});
      }
      if(pageFocus!==undefined&&root.ownerDocument.activeElement===root.ownerDocument.body){
        const target=[...results.querySelectorAll<HTMLButtonElement>('[data-integrated-page]')].find(button=>button.dataset.integratedPage===pageFocus&&!button.disabled);
        (target??results).focus({preventScroll:true});
      }
    }else root.innerHTML=markup;
    cleanup=enhanceContentImages(root,{english:options.english()});
  }
  async function load(): Promise<void> {
    const request=++generation;reader.cancel();loading();
    try {
      const params=contentQuery({page:route.kind,id:route.id},state)!;
      const value:unknown=await reader.read(params);
      if (disposed||request!==generation)return;
      if (!route.id) {
        const list=parseIntegratedList(value,route.kind);if (!list)throw new Error('Invalid publication list');state.page=list.page;
        commitList(list);
      } else {
        const item=parseIntegratedDetail(value,route.kind);if (!item||item.id!==route.id)throw new Error('Invalid publication detail');
        cleanup();cleanup=()=>{};
        if (route.kind==='resource-center' && item.book) {
          const [{bookShell},{mountBookReader}]=await Promise.all([import('../../../src/book-shell.mjs'),import('../../../src/book-reader.mjs')]);
          if (disposed||request!==generation)return;
          root.innerHTML=`<div class="integration-book" data-integrated-title="${esc(item.title)}">${bookShell(item,t)}</div>`;
          const bookRoot=root.querySelector<HTMLElement>('.book-reader')!;
          cleanup=mountBookReader(bookRoot,{...item,book:item.book},{english:options.english()});
          bookRoot.querySelectorAll<HTMLAnchorElement>('a[href="#/resource-center"]').forEach(link=>link.href=integratedContentPath('resource-center'));
        } else {
          root.innerHTML=integratedDetailMarkup(route.kind,item,options.english());
          const body=root.querySelector<HTMLElement>('[data-integrated-body]')!;
          // HTML is sanitized by the original content service before transport.
          setContentHTML(body,item.bodyHTML||`<p>${esc(item.summary)}</p>`);
          const imageCleanup=enhanceContentImages(root,{english:options.english()});
          cleanup=imageCleanup;
          const {createBookImageViewer}=await import('../../../src/book-image-viewer.mjs');
          if (disposed||request!==generation){imageCleanup();return;}
          const viewer=createBookImageViewer(root,{english:options.english(),className:'book-image-viewer integrated-image-viewer'});
          const interactive='a[href],button,summary,[contenteditable]:not([contenteditable="false"])';
          root.querySelectorAll<HTMLImageElement>('.integrated-body img,.integrated-cover img').forEach(image=>{
            if(image.closest(interactive))return;
            image.dataset.integratedImage='';image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label',t('放大查看：','Enlarge: ')+(image.alt||item.title));
          });
          const click=(event:MouseEvent)=>{
            if(event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
            const image=event.target instanceof win.Element?event.target.closest<HTMLImageElement>('[data-integrated-image]'):null;
            if(image&&!image.closest(interactive)){event.preventDefault();viewer.open(image);}
          };
          const key=(event:KeyboardEvent)=>{if(!event.defaultPrevented&&!event.isComposing&&event.target instanceof win.HTMLImageElement && event.target.hasAttribute('data-integrated-image')&&!event.target.closest(interactive)&&['Enter',' '].includes(event.key)){event.preventDefault();viewer.open(event.target);}};
          root.addEventListener('click',click);root.addEventListener('keydown',key);
          cleanup=()=>{imageCleanup();viewer.destroy();root.removeEventListener('click',click);root.removeEventListener('keydown',key);};
        }
      }
      options.onReady?.();
    } catch(error:unknown) {
      if (disposed||request!==generation)return;
      cleanup();cleanup=()=>{};
      root.innerHTML=`<section class="integration-content container integrated-empty"><h1>${t('暂时无法打开内容','This content is unavailable')}</h1><p>${t('请确认账号权限，或稍后重新加载。','Check your account access, or try again.')}</p><button type="button" class="btn" data-integrated-retry>${t('重新加载','Try again')}</button></section>`;
      const status=record(error)?.status;
      if ((status===401||status===403)&&options.refreshIdentity) await options.refreshIdentity().catch(()=>undefined);
      if (!disposed&&request===generation) options.onError?.(error);
    }
  }
  root.addEventListener('input',event=>{
    if(event.target instanceof win.HTMLInputElement&&event.target.id==='integrated-query')state.draft=event.target.value.slice(0,200);
  },{signal:events.signal});
  root.addEventListener('submit',event=>{
    if (!(event.target instanceof win.Element)||!event.target.matches('[data-integrated-search]'))return;
    event.preventDefault();state.draft=root.querySelector<HTMLInputElement>('#integrated-query')?.value.slice(0,200)||'';state.query=state.draft.trim();state.page=1;void load();
  },{signal:events.signal});
  root.addEventListener('click',event=>{
    if (!(event.target instanceof win.Element))return;
    const button=event.target.closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-integrated-category')){state.category=button.dataset.integratedCategory||'all';state.page=1;void load();}
    else if(button.hasAttribute('data-integrated-page')){state.page=Number(button.dataset.integratedPage);const target=root.querySelector('[data-integrated-results]');if(target)root.dispatchEvent(new win.CustomEvent('collection:position',{bubbles:true,detail:{target}}));void load();}
    else if(button.hasAttribute('data-integrated-clear')){Object.assign(state,initialListState());const input=root.querySelector<HTMLInputElement>('#integrated-query');if(input){input.value='';input.focus({preventScroll:true});}void load();}
    else if(button.hasAttribute('data-integrated-retry'))void load();
  },{signal:events.signal});
  const dispose=()=>{if(disposed)return;disposed=true;generation++;const input=root.querySelector<HTMLInputElement>('#integrated-query');if(!route.id&&input)state.draft=input.value.slice(0,200);events.abort();cleanup();reader.clear();root.replaceChildren();};
  return Object.assign(dispose,{ready:load()});
}
