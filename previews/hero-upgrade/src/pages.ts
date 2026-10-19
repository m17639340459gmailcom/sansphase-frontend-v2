// The site's pages besides home, rebuilt from the live site's structure:
// Blog (+ articles in the reader), Work, Learning, Software, Community,
// Resource center, Contact, Support and 404. Routes are real paths handled
// by the router in main.ts; serve.mjs answers every page path with index.html.
import { community, posts, services, socials } from './content';
import type { Section } from './content';
import { lang, pick, t } from './i18n';
import { DAY, esc, litDays, pad2, todayUTC } from './util';
import { blogTags, queryPosts, tagKey } from './blog-query';
import type { BlogSort } from './blog-query';
import { practices, practicePosts } from './practice-content';
import type { Practice } from './practice-content';
import { renderJournalPage } from './journal-page';
import { renderLibraryPage, bindLibrary, disposeLibrary, captureLibraryFocus } from './library-page';
import { renderCatalogPage, bindCatalog, disposeCatalog, captureCatalogFocus } from './catalog-page';
import { icon } from './icons';
import { isSiteIntegration } from './integration-context';

export type PageId = 'home' | 'blog' | 'work' | 'learning' | 'software' | 'community' | 'resources' | 'contact' | 'support' | 'account' | 'verify' | 'reset' | '404';
export type Route = { page: PageId; slug?: string; id?: string };

// Primary navigation, in the live site's order.
export const NAV: { page: PageId; path: string; key: string }[] = [
  { page: 'home', path: '/', key: 'nav.home' },
  { page: 'blog', path: '/blog', key: 'nav.blog' },
  { page: 'work', path: '/work', key: 'nav.work' },
  { page: 'learning', path: '/learning', key: 'nav.learning' },
  { page: 'software', path: '/software', key: 'nav.software' },
  { page: 'community', path: '/community', key: 'nav.community' },
  { page: 'resources', path: '/resources', key: 'nav.resources' },
];
export const EXTRA: { page: PageId; path: string; key: string }[] = [
  { page: 'contact', path: '/contact', key: 'nav.contact' },
  { page: 'support', path: '/support', key: 'nav.support' },
];

// Live-site section id → page here.
const SECTION_PAGE: Record<string, PageId> = { notes: 'blog', works: 'work', resources: 'learning', software: 'software', community: 'community', 'resource-center': 'resources' };

export const pathOf = (page: PageId) => [...NAV, ...EXTRA].find((n) => n.page === page)?.path ?? '/';
export const sectionPath = (s: Section) => pathOf(SECTION_PAGE[s.id] ?? 'home');
export const postPath = (i: number) => `/blog/${encodeURIComponent(posts[i].slug)}`;

export function parseRoute(pathname: string): Route {
  let parts: string[];
  try { parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent); } catch { return {page:'404'}; }
  if (parts.some(part => /[\\/\u0000-\u001f]/.test(part))) return {page:'404'};
  if (!parts.length) return { page: 'home' };
  const local = typeof document !== 'undefined' && isSiteIntegration();
  if (local && ['account','verify','reset'].includes(parts[0]) && parts.length <= 2) return {page:parts[0] as PageId,id:parts[1]};
  if (parts[0] === 'blog' && parts.length === 2) return local || posts.some((p) => p.slug === parts[1]) ? { page: 'blog', slug: parts[1] } : { page: '404' };
  const hit = [...NAV, ...EXTRA].find((n) => n.path === `/${parts[0]}`);
  if (local && hit && ['work','learning','software','resources'].includes(hit.page) && parts.length === 2) return {page:hit.page,id:parts[1]};
  return hit && parts.length === 1 ? { page: hit.page } : { page: '404' };
}

const en = () => lang() === 'en';
const arrow = `<i aria-hidden="true">${icon('arrow-up-right')}</i>`;

function head(page: PageId, kicker: string, title: string, accent: string, body: string, side = '') {
  const label = [...NAV, ...EXTRA].find(item => item.page === page);
  const watermark = { blog: 'JOURNAL', work: 'WORK', learning: 'LEARN', software: 'TOOLS', resources: 'INDEX', community: 'CONNECT', contact: 'HELLO', support: 'THANKS', '404': '404', home: '', account:'ACCOUNT',verify:'VERIFY',reset:'RESET' }[page];
  return `<header class="page-head container">
    <nav class="page-crumb" aria-label="${en() ? 'Breadcrumb' : '面包屑'}"><a href="/">${esc(t('nav.home'))}</a><span aria-hidden="true">/</span><span aria-current="page">${label ? esc(t(label.key)) : '404'}</span><small>${page === '404' ? '/404' : pathOf(page)}</small></nav>
    <span class="page-watermark" aria-hidden="true">${watermark}</span>
    <div class="page-head-row"><div class="heading">
      <p class="eyebrow"><i></i><span>${esc(kicker)}</span></p>
      <h1 class="page-title"><span class="split">${esc(title)}</span>${en() ? ' ' : ''}<em class="accent"><span class="split">${esc(accent)}</span></em></h1>
      <p class="body">${esc(body)}</p>
    </div>${side}</div>
  </header>`;
}

// ---------------------------------------------------------------- shared pieces
export function postCard(i: number) {
  const p = posts[i];
  if (!p) return '';
  return `<article class="post"><a href="${postPath(i)}" data-post="${i}">
    <div class="post-media"><img src="${p.cover}" alt="" loading="lazy" decoding="async" draggable="false"><span class="post-chip">${esc(pick(p.category))}</span></div>
    <div class="post-body">
      <p class="post-tags">${p.tags.slice(0, 3).map((tag) => `<span>${esc(pick(tag))}</span>`).join('')}</p>
      <h3 class="post-title">${esc(pick(p.title))}</h3>
      <p class="post-text">${esc(pick(p.summary))}</p>
      <p class="post-foot"><span>${esc(p.date)}</span><i aria-hidden="true">↗</i></p>
    </div>
  </a></article>`;
}

const BOARD_ICONS: Record<string, string> = {
  qa: '<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9.4a2 2 0 1 1 2.8 1.9c-.5.3-.8.7-.8 1.2"/><path d="M12 14.6h.01"/>',
  showcase: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="m3.5 16 5-5 4 4 3-3 5 5"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  tools: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  moments: '<path d="M20 4c-6 0-11 4-12 11l-3 5"/><path d="M8 15c4 0 7-2 9-6"/>',
};
export const boardsMarkup = () =>
  community.boards
    .map(
      (b, i) => `<article class="board">
        <p class="board-head"><span class="board-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${BOARD_ICONS[b.key] ?? ''}</svg></span><span>${pad2(i + 1)} / ${esc(t('community.board'))}</span></p>
        <h3>${esc(pick(b.name))}</h3>
        <p>${esc(pick(b.line))}</p>
      </article>`,
    )
    .join('');

// Publishing log: 26 weeks of days, lit where a post went live.
export function logMarkup() {
  const today = Math.max(todayUTC(), ...litDays);
  const end = today + (6 - new Date(today).getUTCDay()) * DAY;
  const weeks = 26;
  const start = end - (weeks * 7 - 1) * DAY;
  const months = en() ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  let cells = '';
  let lastMonth = -1;
  let count = 0;
  for (let w = 0; w < weeks; w++) {
    const first = start + w * 7 * DAY;
    const m = new Date(first).getUTCMonth();
    cells += `<span class="log-month" style="grid-column:${w + 1}">${m !== lastMonth ? months[m] : ''}</span>`;
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const time = first + d * DAY;
      const on = litDays.has(time);
      if (on) count++;
      const label = new Date(time).toISOString().slice(0, 10);
      cells += `<span class="log-day${on ? ' is-on' : ''}${time === today ? ' is-today' : ''}" style="grid-column:${w + 1};grid-row:${d + 2}" title="${label}${on ? ` · ${en() ? 'post published' : '发布文章'}` : ''}"></span>`;
    }
  }
  return { grid: `<div class="log-cols">${cells}</div>`, total: `<b>${pad2(count)}</b> ${esc(t('log.total'))}` };
}

// ---------------------------------------------------------------- blog
// Existing BlogExplorer query rules, presented through TDX About Publications.
const blog = { tag: 'all', query: '', sort: 'newest' as BlogSort, expanded: false };
const words = (zh: string, english: string) => en() ? english : zh;
function tagsMarkup() {
  const tags = blogTags(posts);
  const visible = tags.filter((tag, index) => blog.expanded || index < 6 || tagKey(tag) === blog.tag);
  const chip = (value: string, label: string) => `<button type="button" class="journal-tag" data-tag="${esc(value)}" aria-pressed="${blog.tag === value}">${esc(label)}</button>`;
  return `${chip('all', t('blog.all'))}${visible.map(tag => chip(tagKey(tag), pick(tag))).join('')}${tags.length > 6 ? `<button class="journal-tag-more" type="button" data-blog-expand aria-expanded="${blog.expanded}">${words(blog.expanded ? '收起标签' : '更多标签', blog.expanded ? 'Fewer tags' : 'More tags')} <span aria-hidden="true">${blog.expanded ? '−' : '+'}</span></button>` : ''}`;
}
function blogList() {
  const results = queryPosts(posts, blog, lang());
  const count = `<div class="journal-results-head"><p class="journal-result-count" role="status" aria-live="polite" aria-atomic="true">${esc(t('blog.count').replace('{n}', pad2(results.length)))}</p>${blog.tag !== 'all' || blog.query.trim() ? `<button type="button" class="journal-clear" data-blog-clear>${esc(t('blog.clear'))} <span aria-hidden="true">×</span></button>` : `<span class="journal-eyebrow">${words('探索的轨迹，持续记录。', 'A growing record of exploration.')}</span>`}</div>`;
  if (!results.length) return `${count}<div class="journal-empty"><h3>${esc(t('blog.empty'))}</h3><p>${words('试试更少的关键词，或清除当前标签。', 'Try fewer keywords, or clear the selected tag.')}</p><button class="journal-clear" type="button" data-blog-clear>${esc(t('blog.clear'))}${arrow}</button></div>`;
  return `${count}<ol class="journal-publications">${results.map(({ p, i }, index) => `<li class="journal-publication" data-journal-enter>
    <span class="journal-publication-number" aria-hidden="true">${pad2(index + 1)}</span>
    <time class="journal-publication-date" datetime="${p.date.replaceAll('.', '-')}">${p.date}</time>
    <article class="journal-publication-copy"><p class="journal-publication-meta"><span>${esc(pick(p.category))}</span><span aria-hidden="true">·</span><span>${p.tags.slice(0, 3).map(tag => esc(pick(tag))).join(' · ')}</span></p>
      <h3><a href="${postPath(i)}" data-post="${i}" data-journal-focus="catalog-${p.slug}">${esc(pick(p.title))}</a></h3>
      <p class="journal-publication-summary">${esc(pick(p.summary))}</p>
      <span class="journal-publication-action" aria-hidden="true">${esc(t('work.read'))}<span class="journal-roll-arrow"><i>↗</i><i>↗</i></span></span>
    </article></li>`).join('')}</ol>`;
}
function blogPage() {
  const catalog = `<div class="journal-index">
    <div class="journal-index-tools" data-journal-enter>
      <label class="journal-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input type="search" data-blog-search placeholder="${esc(t('blog.search'))}" aria-label="${esc(t('blog.search'))}" value="${esc(blog.query)}"><kbd aria-hidden="true">ESC</kbd></label>
      <label class="journal-sort"><span>${words('排序', 'Sort')}</span><select data-blog-sort aria-label="${words('文章排序', 'Sort posts')}">${[['newest', words('最新发布', 'Newest first')], ['oldest', words('最早发布', 'Oldest first')], ['title', words('标题排序', 'Title')]].map(([value, label]) => `<option value="${value}"${blog.sort === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
    <div class="journal-tags" data-blog-tags role="group" aria-label="${words('按标签筛选', 'Filter by tag')}">${tagsMarkup()}</div>
    <div class="journal-results" data-blog-results>${blogList()}</div>
  </div>`;
  return renderJournalPage(postPath, catalog);
}
function bindBlog(root: HTMLElement) {
  const shell = root.querySelector<HTMLElement>('.journal-index')!;
  const search = shell.querySelector<HTMLInputElement>('[data-blog-search]')!;
  const results = shell.querySelector<HTMLElement>('[data-blog-results]')!;
  const tags = shell.querySelector<HTMLElement>('[data-blog-tags]')!;
  const refresh = () => { results.innerHTML = blogList(); root.dispatchEvent(new CustomEvent('page:content', { bubbles: true })); };
  const clear = () => { blog.query = ''; blog.tag = 'all'; search.value = ''; tags.innerHTML = tagsMarkup(); refresh(); search.focus({ preventScroll: true }); };
  search.addEventListener('input', () => { blog.query = search.value; refresh(); });
  search.addEventListener('keydown', event => { if (event.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); clear(); } });
  shell.querySelector<HTMLSelectElement>('[data-blog-sort]')!.addEventListener('change', event => { blog.sort = (event.target as HTMLSelectElement).value as BlogSort; refresh(); });
  shell.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!target) return;
    if (target.hasAttribute('data-blog-clear')) { clear(); return; }
    if (target.hasAttribute('data-blog-expand')) {
      blog.expanded = !blog.expanded; tags.innerHTML = tagsMarkup(); tags.querySelector<HTMLButtonElement>('[data-blog-expand]')?.focus({ preventScroll: true }); return;
    }
    if (target.dataset.tag) {
      blog.tag = target.dataset.tag; tags.innerHTML = tagsMarkup();
      Array.from(tags.querySelectorAll<HTMLButtonElement>('[data-tag]')).find(button => button.dataset.tag === blog.tag)?.focus({ preventScroll: true }); refresh(); return;
    }
  });
}
// ---------------------------------------------------------------- content sections
// TDX ProjectsGrid's real category counts, dual view and return-state memory;
// ProjectPreviewCard's cover / category / process / action hierarchy. The
// author's process records replace product demos and screenshot galleries.
const practiceState = { filter: 'all', view: 'grid' as 'grid' | 'list' };
function practiceCount() {
  return `<dl class="page-meta"><div><dt>${words('实践专题', 'Practices')}</dt><dd>${pad2(practices.length)}</dd></div><div><dt>${words('过程记录', 'Field notes')}</dt><dd>${pad2(practices.reduce((count, practice) => count + practicePosts(practice).length, 0))}</dd></div></dl>`;
}
function practiceCard(practice: Practice, index: number) {
  const entries = practicePosts(practice);
  const latest = entries.at(-1)!;
  return `<article class="practice-card" data-page-card data-page-reveal>
    <a class="practice-cover feature-media" href="${postPath(latest.i)}" data-post="${latest.i}" aria-label="${esc(`${words('阅读', 'Read')} ${pick(practice.title)}`)}" data-cursor-text="${words('阅读', 'Read')}">
      <img src="${latest.p.cover}" alt="${esc(pick(practice.title))}" loading="lazy" decoding="async" draggable="false">
      <span class="practice-cover-action" aria-hidden="true">${words('进入创作记录', 'Read the field notes')} ${arrow}</span>
    </a>
    <div class="practice-copy"><div class="practice-meta"><span>${pad2(index + 1)} / ${esc(pick(practice.category))}</span><time datetime="${latest.p.date.replaceAll('.', '-')}">${latest.p.date}</time></div>
      <h2><a href="${postPath(latest.i)}" data-post="${latest.i}">${esc(pick(practice.title))} ${arrow}</a></h2>
      <p class="practice-summary">${esc(pick(practice.summary))}</p>
      <ul class="tags practice-focus">${practice.focus.map(focus => `<li>${esc(pick(focus))}</li>`).join('')}</ul>
      <div class="practice-records"><p class="caption-meta">${words('过程记录', 'THE PROCESS')} <span>${pad2(entries.length)}</span></p>${entries.map(({ p, i }, n) => `<a href="${postPath(i)}" data-post="${i}"><span class="record-step" aria-hidden="true">${pad2(n + 1)}</span><span>${esc(pick(p.title))}</span>${arrow}</a>`).join('')}</div>
    </div>
  </article>`;
}
function practiceResults() {
  const visible = practices.filter(practice => practiceState.filter === 'all' || practice.id === practiceState.filter);
  const count = `<p class="catalog-count" role="status" aria-live="polite" aria-atomic="true">${pad2(visible.length)} ${words('个实践专题', visible.length === 1 ? 'practice' : 'practices')}</p>`;
  if (practiceState.view === 'grid') return `${count}<div class="practice-grid">${visible.map(practice => practiceCard(practice, practices.indexOf(practice))).join('')}</div>`;
  return `${count}<ol class="practice-index">${visible.map(practice => {
    const entries = practicePosts(practice); const latest = entries.at(-1)!;
    return `<li data-practice-row data-page-reveal><a href="${postPath(latest.i)}" data-post="${latest.i}" data-page-card><span class="index-number">${pad2(practices.indexOf(practice) + 1)}</span><span class="index-preview"><img src="${latest.p.cover}" alt="" loading="lazy" decoding="async"></span><span class="index-copy"><b>${esc(pick(practice.title))}</b><small>${esc(pick(practice.summary))}</small></span><span class="index-category">${esc(pick(practice.category))}<small>${pad2(entries.length)} ${words('篇记录', 'notes')}</small></span>${arrow}</a></li>`;
  }).join('')}</ol>`;
}
function workPage() {
  const filters = [{ id: 'all', label: words('全部', 'All'), count: practices.length }, ...practices.map(practice => ({ id: practice.id, label: pick(practice.category), count: 1 }))];
  return `${head('work', 'SELECTED PRACTICES / 02', words('作品', 'Work'), words('与实践。', '& practice.'), words('把想法投入真实的创作，再把过程留下。这里记录个人知识库与 AI 影像工作流的建立、调整和复盘。', 'Putting ideas into practice, and keeping the process. Building, refining and reviewing a personal knowledge base and an AI video workflow.'), practiceCount())}
    <div class="container page-body practice-shell"><div class="practice-toolbar" data-page-reveal><div class="practice-filters" role="group" aria-label="${words('按实践方向筛选', 'Filter practices')}">${filters.map(filter => `<button type="button" data-practice-filter="${filter.id}" aria-pressed="${practiceState.filter === filter.id}">${esc(filter.label)} <sup>${pad2(filter.count)}</sup></button>`).join('')}</div><div class="view-toggle" role="group" aria-label="${words('作品显示方式', 'Practice layout')}"><button type="button" data-practice-view="grid" aria-pressed="${practiceState.view === 'grid'}"><span aria-hidden="true">▦</span> ${words('卡片', 'Grid')}</button><button type="button" data-practice-view="list" aria-pressed="${practiceState.view === 'list'}"><span aria-hidden="true">☷</span> ${words('列表', 'List')}</button></div></div><div data-practice-results>${practiceResults()}</div><p class="practice-note">${words('从封面进入原文，查看完整过程。文中的图片可以点击放大。', 'Open a cover to read the full story. Images in the article can be enlarged.')}</p></div>`;
}
function bindPractices(root: HTMLElement) {
  const shell = root.querySelector<HTMLElement>('.practice-shell')!;
  shell.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-practice-filter],[data-practice-view]');
    if (!button) return;
    if (button.dataset.practiceFilter) practiceState.filter = button.dataset.practiceFilter;
    if (button.dataset.practiceView) practiceState.view = button.dataset.practiceView as 'grid' | 'list';
    shell.querySelectorAll<HTMLButtonElement>('[data-practice-filter]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.practiceFilter === practiceState.filter)));
    shell.querySelectorAll<HTMLButtonElement>('[data-practice-view]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.practiceView === practiceState.view)));
    shell.querySelector<HTMLElement>('[data-practice-results]')!.innerHTML = practiceResults();
    root.dispatchEvent(new CustomEvent('page:content', { bubbles: true }));
  });
}

function statusPanel(index: string, title: string, body: string) {
  return `<section class="publication-status" data-page-card data-page-reveal><span class="status-monogram" aria-hidden="true">${index}</span><div class="publication-copy"><p class="caption-meta">${words('社区计划 / IN PREPARATION', 'COMMUNITY / IN PREPARATION')}</p><h2>${esc(title)}</h2><p class="body">${esc(body)}</p></div></section>`;
}
// ---------------------------------------------------------------- community
function communityPage() {
  return `${head('community', 'COMMUNITY / 05', t('community.title'), t('community.accent'), pick(community.description), `<span class="status">${esc(pick(community.status))}</span>`)}
  <div class="container page-body">
    ${statusPanel('05', words('一个正在筹备的交流空间。', 'A space to connect, in preparation.'), t('community.entryNote'))}
    <section aria-labelledby="boards-title"><div class="inner-section-head" data-page-reveal><div><p class="caption-meta">COMMUNITY PLAN / 01</p><h2 id="boards-title">${words('计划中的版块', 'Planned boards')}</h2></div><span class="archive-state">${esc(pick(community.status))}</span></div><div class="boards inner-boards">${boardsMarkup().replaceAll('class="board"', 'class="board" data-page-card data-page-reveal')}</div></section>
    <section aria-labelledby="systems-title"><div class="inner-section-head" data-page-reveal><div><p class="caption-meta">COMMUNITY PLAN / 02</p><h2 id="systems-title">${words('参与机制', 'Participation')}</h2></div></div><div class="systems">${community.systems.map((system, index) => `<article class="system" data-page-card data-page-reveal><span class="other-num">${pad2(index + 1)}</span><h3>${esc(pick(system.name))}</h3><p>${esc(pick(system.line))}</p></article>`).join('')}</div></section>
    <div class="community-contact" data-page-reveal><p>${words('开放前，可以通过现有平台找到我。', 'Until launch, find me through the existing channels.')}</p><a href="/contact" class="btn ghost" data-magnetic>${esc(t('contact.reach'))}${arrow}</a></div>
  </div>`;
}
// ---------------------------------------------------------------- contact & support
function contactPage() {
  const reach = socials.map((social, i) => `<a class="reach" href="${esc(social.url)}" target="_blank" rel="noopener noreferrer" data-page-card data-page-reveal><span class="other-num">${pad2(i + 1)}</span><span class="reach-main"><b>${esc(pick(social.label))}</b><small>${i === 0 ? 'DOUYIN' : 'QQ GROUP'}</small></span><span class="reach-go" aria-hidden="true"><i>↗</i><i>↗</i></span></a>`).join('');
  return `${head('contact', 'CONTACT / LET’S TALK', t('contact.title'), t('contact.accent'), pick(services.summary))}
  <div class="container page-body contact-body"><section><div class="inner-section-head" data-page-reveal><div><p class="caption-meta">DEVELOPMENT & COMMISSIONS</p><h2>${esc(t('contact.services'))}</h2></div></div><div class="systems">${services.items.map((service, i) => `<article class="system service-card" data-page-card data-page-reveal><span class="other-num">0${i + 1} / ${esc(service.en.toUpperCase())}</span><h3>${esc(pick(service))}</h3><span class="service-rule" aria-hidden="true"></span></article>`).join('')}</div></section><section><div class="inner-section-head" data-page-reveal><div><p class="caption-meta">FIND ME HERE</p><h2>${esc(t('contact.reach'))}</h2></div></div><div class="reach-list">${reach}</div><p class="page-note">${esc(t('contact.note'))}</p></section></div>`;
}
function messagePage(page: 'support' | '404') {
  const support = page === 'support';
  return `${head(page, support ? 'SUPPORT / THANK YOU' : '404 / OFF TRACK', t(support ? 'support.title' : 'nf.title'), t(support ? 'support.accent' : 'nf.accent'), t(support ? 'support.body' : 'nf.body'))}<div class="container page-body"><section class="message-screen" data-page-reveal><span class="message-mark" aria-hidden="true">${support ? 'THANK YOU' : '404'}</span><div class="page-actions"><a class="btn primary" href="/" data-magnetic>${esc(t('nf.home'))}<i aria-hidden="true">→</i></a><a class="btn ghost" href="/blog" data-magnetic>${esc(t('page.meanwhile'))}${arrow}</a></div></section></div>`;
}
// ---------------------------------------------------------------- entry
export function renderPage(page: PageId, root: HTMLElement, _reduced = false) {
  disposeLibrary(root);
  disposeCatalog(root);
  // A chrome-language refresh preserves the actual control the reader was
  // using, without taking focus from a modal or a different destination.
  const focused = document.activeElement;
  const restore = root.querySelector('[data-page]')?.getAttribute('data-page') === page
    && focused instanceof HTMLElement && root.contains(focused) && !root.closest('[inert],[hidden],[aria-hidden="true"]');
  const roles = ['data-blog-search', 'data-blog-sort', 'data-tag', 'data-blog-expand', 'data-practice-filter', 'data-practice-view', 'data-journal-focus'];
  const focusRole = restore ? roles.find(role => focused.hasAttribute(role)) : undefined;
  const focusValue = focusRole && focused instanceof HTMLElement ? focused.getAttribute(focusRole) : null;
  const link = restore && focused instanceof HTMLAnchorElement ? focused.getAttribute('href') : null;
  const linkPosition = link ? Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(element => element.getAttribute('href') === link).indexOf(focused as HTMLAnchorElement) : -1;
  const selection = restore && focused instanceof HTMLInputElement ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
  const libraryFocus = restore && page === 'resources' ? captureLibraryFocus(root) : null;
  const catalogFocus = restore && (page === 'learning' || page === 'software') ? captureCatalogFocus(root) : null;
  const markup = page === 'resources' ? renderLibraryPage() : page === 'blog' ? blogPage() : page === 'work' ? workPage() : page === 'learning' || page === 'software' ? renderCatalogPage(page === 'learning' ? 'resources' : 'software') : page === 'community' ? communityPage() : page === 'contact' ? contactPage() : messagePage(page === 'support' ? 'support' : '404');
  root.innerHTML = `<div class="page" data-page="${page}">${markup}</div>`;
  if (page === 'blog') bindBlog(root);
  if (page === 'work') bindPractices(root);
  if (page === 'resources') bindLibrary(root, fetch, libraryFocus);
  if (page === 'learning' || page === 'software') bindCatalog(root, page === 'learning' ? 'resources' : 'software', fetch, catalogFocus);
  const replacement = focusRole ? Array.from(root.querySelectorAll<HTMLElement>(`[${focusRole}]`)).find(element => element.getAttribute(focusRole) === focusValue)
    : link ? Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(element => element.getAttribute('href') === link)[Math.max(0, linkPosition)] : undefined;
  replacement?.focus({ preventScroll: true });
  if (selection && replacement instanceof HTMLInputElement && replacement.type !== 'search') replacement.setSelectionRange(selection.start, selection.end);
}
