/** Bounded, same-origin publication index inside the approved Journal shell.
 * The formal content reader owns credentials, aborts and the list API contract.
 * No article body or reader identity is retained in this directory.
 */
import { contentQuery, createContentReader } from '../../../src/content-reader.ts';
import { posts } from './content.ts';
import { renderJournalPage } from './journal-page.ts';
import { lang } from './i18n.ts';
import { esc, pad2 } from './util.ts';
import { icon } from './icons.ts';
import { integratedDateLabel } from './integration-date.ts';
import './integration-journal.css';

export interface IntegratedJournalEntry {
  id: string; slug: string; title: string; summary: string; category: string;
  tags: string[]; date: string; englishTitle: string; englishSummary: string;
}
export interface IntegratedJournalList {
  items: IntegratedJournalEntry[]; total: number; page: number; pages: number;
  totalPublished: number; categories: string[];
}
export interface IntegratedJournalOptions {
  english: () => boolean;
  onReady?: () => void;
  fetcher?: typeof fetch;
  /** Already-read, bounded metadata from this navigation, consumed only once. */
  initialList?: unknown;
}
export interface IntegratedJournalMount { dispose(): void; ready: Promise<void> }
const active = new WeakMap<HTMLElement, IntegratedJournalMount>();
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const string = (value: unknown, maximum: number): string =>
  typeof value === 'string' ? value.slice(0, maximum) : '';

/** Validate the notes list DTO actually returned by server/content-delivery.ts. */
export function parseIntegratedJournalList(value: unknown): IntegratedJournalList | null {
  if (!object(value) || !Array.isArray(value.items) || !Array.isArray(value.categories)
    || !Array.isArray(value.highlights) || value.highlights.length !== 0
    || !integer(value.total) || !integer(value.totalPublished)
    || !integer(value.page, 1) || !integer(value.pages, 1)) return null;
  if (value.items.length > 12 || value.items.length > value.total || value.total > value.totalPublished
    || value.pages !== Math.max(1, Math.ceil(value.total / 12)) || value.page > value.pages
    || value.categories.length > 100 || value.categories.some(category => typeof category !== 'string' || category.length > 200)) return null;
  const items: IntegratedJournalEntry[] = [], seen = new Set<string>();
  for (const raw of value.items) {
    if (!object(raw) || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 500
      || seen.has(raw.id) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 1000
      || !Array.isArray(raw.tags) || raw.tags.length > 50 || raw.tags.some(tag => typeof tag !== 'string' || tag.length > 200)) return null;
    if (raw.slug !== undefined && (typeof raw.slug !== 'string' || !raw.slug.trim() || raw.slug.length > 500)) return null;
    const date = string(raw.date, 100);
    if (date && !integratedDateLabel(date)) return null;
    seen.add(raw.id);
    // Deliberately project summaries only, even if a malformed server or fixture
    // includes a body. The directory never renders or caches that body.
    items.push({id:raw.id,slug:typeof raw.slug==='string'?raw.slug:'',title:raw.title,
      summary:string(raw.summary,2000),category:string(raw.category,200),
      tags:raw.tags.filter((tag): tag is string => typeof tag==='string'),date,
      englishTitle:string(raw.en,1000),englishSummary:string(raw.summaryEn,2000)});
  }
  return {items,total:value.total,page:value.page,pages:value.pages,totalPublished:value.totalPublished,
    categories:[...new Set(value.categories.filter((category): category is string => typeof category==='string' && category.length>0))]};
}

const t = (zh: string, en: string) => lang() === 'en' ? en : zh;
const arrow = `<i aria-hidden="true">${icon('arrow-up-right')}</i>`;

export function renderIntegratedJournal(): string {
  const catalog = `<div class="journal-index integrated-journal" data-integrated-journal>
    <form class="integrated-journal-search" data-integrated-journal-search role="search"><label class="visually-hidden" for="integrated-journal-query">${t('搜索文章标题、摘要或标签','Search article titles, summaries or tags')}</label>${icon('search')}<input id="integrated-journal-query" type="search" maxlength="200" data-integrated-journal-query placeholder="${t('搜索文章标题、摘要或标签','Search article titles, summaries or tags')}"><button type="submit" aria-label="${t('搜索文章','Search articles')}">${arrow}</button></form>
    <div class="journal-tags" data-integrated-journal-categories role="group" aria-label="${t('按文章分类筛选','Filter articles by category')}"><button type="button" class="journal-tag" data-integrated-journal-category="all" aria-pressed="true">${t('全部','All')}</button></div>
    <div class="journal-results-head"><p class="journal-result-count" data-integrated-journal-status role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${t('正在读取文章目录…','Opening the journal…')}</p><button type="button" class="journal-clear" data-integrated-journal-clear hidden>${t('清除筛选','Clear filters')} <span aria-hidden="true">×</span></button></div>
    <div class="journal-results" data-integrated-journal-results aria-busy="true"><div class="integrated-journal-state"><p>${t('正在读取文章目录…','Opening the journal…')}</p></div></div>
    <nav class="integrated-journal-pagination" data-integrated-journal-pagination aria-label="${t('文章分页','Article pagination')}"></nav>
  </div>`;
  return renderJournalPage(index => `/blog/${encodeURIComponent(posts[index].slug)}`, catalog);
}

function entriesMarkup(value: IntegratedJournalList, english: boolean): string {
  const copy = (zh: string, en: string) => english ? en : zh;
  return `<ol class="journal-publications">${value.items.map((item,index) => {
    const title = english && item.englishTitle ? item.englishTitle : item.title;
    const summary = english && item.englishSummary ? item.englishSummary : item.summary;
    const date = integratedDateLabel(item.date);
    return `<li class="journal-publication" data-journal-enter><span class="journal-publication-number" aria-hidden="true">${pad2((value.page-1)*12+index+1)}</span><time class="journal-publication-date"${item.date?` datetime="${esc(item.date)}"`:''}>${esc(date)}</time><article class="journal-publication-copy"><p class="journal-publication-meta"><span>${esc(item.category)}</span>${item.tags.length?`<span aria-hidden="true">·</span><span>${item.tags.slice(0,3).map(esc).join(' · ')}</span>`:''}</p><h3><a href="/blog/${encodeURIComponent(item.slug||item.id)}" data-journal-focus="catalog-${esc(item.id)}" data-cursor-text="${copy('阅读','READ')}">${esc(title)}</a></h3>${summary?`<p class="journal-publication-summary">${esc(summary)}</p>`:''}<span class="journal-publication-action" aria-hidden="true">${copy('阅读原文','Read the original')}<span class="journal-roll-arrow">${arrow}${arrow}</span></span></article></li>`;
  }).join('')}</ol>`;
}

export function mountIntegratedJournal(root: HTMLElement, options: IntegratedJournalOptions): IntegratedJournalMount {
  active.get(root)?.dispose();
  const win = root.ownerDocument.defaultView!;
  const candidate = root.querySelector<HTMLElement>('[data-integrated-journal]');
  if (!candidate) throw new Error('The integrated journal surface is missing.');
  const shell = candidate;
  const form = shell.querySelector<HTMLFormElement>('[data-integrated-journal-search]')!;
  const input = shell.querySelector<HTMLInputElement>('[data-integrated-journal-query]')!;
  const categories = shell.querySelector<HTMLElement>('[data-integrated-journal-categories]')!;
  const results = shell.querySelector<HTMLElement>('[data-integrated-journal-results]')!;
  const status = shell.querySelector<HTMLElement>('[data-integrated-journal-status]')!;
  const pagination = shell.querySelector<HTMLElement>('[data-integrated-journal-pagination]')!;
  const clear = shell.querySelector<HTMLButtonElement>('[data-integrated-journal-clear]')!;
  const reader = createContentReader(options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args)), {maxEntries:0});
  const events = new win.AbortController();
  let disposed=false,generation=0,page=1,query='',category='all';
  let initialList=options.initialList;
  const copy=(zh:string,en:string)=>options.english()?en:zh;
  const filtered=()=>query.length>0||category!=='all';
  const loading=()=>{
    results.setAttribute('aria-busy','true');
    results.removeAttribute('data-state');
    // Keep mounted rows and pagination until the new query commits. Replacing a
    // long index with a short spinner clamps the browser's current scroll point.
    status.textContent=copy('正在读取文章目录…','Opening the journal…');clear.hidden=!filtered();
  };
  function categoryMarkup(value: IntegratedJournalList) {
    return ['all',...value.categories.filter(name=>name!=='all')].map(name=>`<button type="button" class="journal-tag" data-integrated-journal-category="${esc(name)}" aria-pressed="${category===name}">${name==='all'?copy('全部','All'):esc(name)}</button>`).join('');
  }
  async function load(focus?: {kind:'category'|'page';value:string}): Promise<void> {
    const request=++generation;reader.cancel();loading();
    try {
      const params=contentQuery({page:'notes'},{page,query,category});
      if (!params) throw new Error('The notes query is unavailable.');
      const seed=initialList;initialList=undefined;
      const response:unknown=seed ?? await reader.read(params);
      if (disposed || request!==generation) return;
      const value=parseIntegratedJournalList(response);
      if (!value) throw new Error('Invalid notes list.');
      page=value.page;categories.innerHTML=categoryMarkup(value);
      status.textContent=copy(`共 ${value.total} 篇 · 第 ${value.page} / ${value.pages} 页`,` ${value.total} articles · Page ${value.page} / ${value.pages}`).trim();
      root.querySelectorAll<HTMLElement>('[data-journal-count]').forEach(node=>node.textContent=pad2(value.totalPublished));
      results.innerHTML=value.items.length ? entriesMarkup(value,options.english())
        : `<div class="integrated-journal-state"><h3>${filtered()?copy('没有匹配的文章','No matching articles'):copy('文章正在整理','The journal is being prepared')}</h3><p>${filtered()?copy('换个关键词，或清除当前筛选。','Try another keyword or clear the filters.'):copy('作者发布文章后，会显示在这里。','Published articles will appear here.')}</p></div>`;
      results.setAttribute('aria-busy','false');
      results.dataset.state=value.items.length?'ready':'empty';
      pagination.innerHTML=value.pages>1?`<button type="button" data-integrated-journal-page="${value.page-1}" ${value.page===1?'disabled':''}><i class="integrated-journal-previous">${icon('arrow-right')}</i> ${copy('上一页','Previous')}</button><span>${value.page} / ${value.pages}</span><button type="button" data-integrated-journal-page="${value.page+1}" ${value.page===value.pages?'disabled':''}>${copy('下一页','Next')} ${icon('arrow-right')}</button>`:'';
      if (focus && root.ownerDocument.activeElement===root.ownerDocument.body) {
        const candidates=[...shell.querySelectorAll<HTMLButtonElement>(focus.kind==='category'?'[data-integrated-journal-category]':'[data-integrated-journal-page]')];
        const attribute=focus.kind==='category'?'data-integrated-journal-category':'data-integrated-journal-page';
        const target=candidates.find(button=>button.getAttribute(attribute)===focus.value && !button.disabled);
        (target??status).focus({preventScroll:true});
      }
      options.onReady?.();
    } catch (error:unknown) {
      if (disposed || request!==generation) return;
      results.setAttribute('aria-busy','false');
      results.dataset.state='error';
      results.innerHTML=`<div class="integrated-journal-state"><h3>${copy('暂时无法读取文章','The journal is temporarily unavailable')}</h3><p>${copy('请稍后重试，或重新加载页面。','Try again shortly, or reload this page.')}</p><button type="button" class="journal-clear" data-integrated-journal-retry>${copy('重新加载','Try again')} ${arrow}</button></div>`;
      status.textContent=copy('文章目录加载失败','The article index could not be loaded');
      options.onReady?.();
    }
  }
  const reset=()=>{query='';category='all';page=1;input.value='';void load();input.focus({preventScroll:true});};
  form.addEventListener('submit',event=>{event.preventDefault();query=input.value.trim().slice(0,200);page=1;void load();},{signal:events.signal});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();reset();}},{signal:events.signal});
  shell.addEventListener('click',event=>{
    const target=event.target instanceof win.Element?event.target.closest<HTMLButtonElement>('button'):null;
    if (!target || target.disabled) return;
    if (target.hasAttribute('data-integrated-journal-clear')) {reset();return;}
    if (target.hasAttribute('data-integrated-journal-retry')) {void load();return;}
    const nextCategory=target.dataset.integratedJournalCategory;
    if (nextCategory!==undefined) {category=nextCategory;page=1;void load({kind:'category',value:category});return;}
    const next=Number(target.dataset.integratedJournalPage);
    if (integer(next,1)) {page=next;root.dispatchEvent(new win.CustomEvent('collection:position',{bubbles:true,detail:{target:results}}));void load({kind:'page',value:String(page)});}
  },{signal:events.signal});
  const ready=load();
  const controller:IntegratedJournalMount={ready,dispose(){if(disposed)return;disposed=true;++generation;events.abort();reader.clear();if(active.get(root)===controller)active.delete(root);}};
  active.set(root,controller);
  return controller;
}
