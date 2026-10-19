// Isolated SANSPHASE preview. The surrounding portfolio order and navigation
// retain the V4 reference baseline. The hero reuses Dingxin Tao's particle
// engine, HUD, ambient and cursor; exact sources/adaptations are in SOURCES.json.
// Existing author content is in content.ts; public records load through server.ts.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/noto-sans-sc/index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import './hero.css';
import './ambient.css';
import './directions.css';
import './showcase.css';
import './facts.css';
import './manifesto.css';
import './home-sections.css';
import './home-closing.css';
import './inner-pages.css';
import './page-experience.css';
import './journal-page.css';
import '../vendor/book-cover-3d/book.css';
import './library-page.css';
import './catalog-page.css';
import './software-cards.css';
import './icons.css';
import './sample-dialog.css';
import 'photoswipe/style.css';
import './reader.css';
import { mountHero } from './hero';
import { mountDirections } from './directions';
import { mountShowcase } from './showcase';
import { mountFacts } from './facts';
import { mountManifesto } from './manifesto';
import { mountHomeSections } from './home-sections';
import { mountHomeClosing } from './home-closing';
import { mountMagnetic } from './magnetic';
import { mountHeader } from './header';
import { mountPageTransition } from './page-transition';
import { mountReaderReveal } from './reader-reveal';
import { mountPageExperience } from './page-experience';
import { mountJournalExperience } from './journal-experience';
import { mountRouteAnchor } from './route-anchor';
import { createHistoryPositions, mountNavigationRestore, samePageRoute } from './navigation-state';
import { Marquee } from './marquee';
import { Reader } from './article';
import { community, fields, icp, posts, profile, sections, services, socials } from './content';
import { EXTRA, NAV, boardsMarkup, logMarkup, parseRoute, postCard, postPath, renderPage, sectionPath } from './pages';
import type { PageId, Route } from './pages';
import { clamp, esc, pad2 } from './util';
import { initialLang, lang, onLang, pick, setLang, t, ui } from './i18n';
import { Palette, postKeywords, sectionKeywords } from './palette';
import type { Command } from './palette';
import { initTheme, setTheme, theme } from './theme';
import { disposeLibrary } from './library-page';
import { disposeCatalog } from './catalog-page';
import { isSiteIntegration } from './integration-context';
import './integration.css';
import './integration-account.css';
import './integration-content.css';
import type { AccountPage } from './integration-account';
import type { IntegratedKind } from './integration-content';

const integrated = isSiteIntegration();
let localRuntime: typeof import('./integration-runtime') | null = null;
let accountModule: typeof import('./integration-account') | null = null;
let contentModule: typeof import('./integration-content') | null = null;
let journalModule: typeof import('./integration-journal') | null = null;
let communityModule: typeof import('./integration-community') | null = null;
let account: ReturnType<typeof import('./integration-account')['mountAccountIntegration']> | null = null;
let disposeIntegrated = () => {};
let homeContentDirty = false;
let journalNotesReady = false;

gsap.registerPlugin(ScrollTrigger, SplitText);
const historyPositions = createHistoryPositions(window, () => window.scrollY);
// Native history restoration must not race Lenis and asynchronous page mounts.
ScrollTrigger.clearScrollMemory('manual');
scrollTo(0, 0);

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const html = document.documentElement;
const en = () => lang() === 'en';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;

initTheme();
setLang(initialLang());

const SEP = '<svg class="sep" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6v28M6 20h28"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

// ---------------------------------------------------------------- text helpers
function setRoll(el: HTMLElement, text: string) {
  el.innerHTML = `<span class="roll-a">${esc(text)}</span><span class="roll-b" aria-hidden="true">${esc(text)}</span>`;
}

// SplitText remembers the markup it split, so revert every split before new
// text goes in; otherwise a revert would bring the old language back.
const splits = new Map<HTMLElement, SplitText>();
function revertSplits() {
  splits.forEach((s) => s.revert());
  splits.clear();
}
function pieces(el: HTMLElement) {
  const s = splits.get(el);
  if (!s) return [];
  return (en() ? s.words : s.chars) as HTMLElement[];
}
function split(el: HTMLElement) {
  splits.set(el, SplitText.create(el, en() ? { type: 'words', mask: 'words' } : { type: 'chars', mask: 'chars' }));
}

function applyI18n() {
  revertSplits();
  $$('[data-i18n]').forEach((el) => {
    const text = t(el.dataset.i18n!);
    if (el.classList.contains('roll')) setRoll(el, text);
    else el.textContent = text;
  });
  $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria!)));
  $('#mod-key').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
}

// Heading groups: diamond marker, words rising from masks, the accent settling
// through Archivo's width axis over its ink band.
const groups = () => $$('.heading, .hero-copy, .banner-copy');
const fadeTargets = ':scope > .body, .hero-lead, .hero-actions, .hero-stats, .services, .banner-actions, .eyebrow span';
function prepareGroup(group: HTMLElement) {
  $$('.split', group).forEach(split);
  if (group.dataset.played || reduced) return;
  $$('.split', group).forEach((el) => gsap.set(pieces(el), { yPercent: 118 }));
  gsap.set($$('.eyebrow i', group), { scale: 0, rotate: group.classList.contains('hero-copy') || group.closest('.directions') ? 0 : -135 });
  if ($$('.accent', group).length) gsap.set($$('.accent', group), { '--wd': 62, '--band': 0 });
  gsap.set($$(fadeTargets, group), { y: 16, opacity: 0 });
}
function playGroup(group: HTMLElement) {
  if (group.dataset.played) return;
  group.dataset.played = '1';
  if (reduced) return;
  const tl = gsap.timeline();
  tl.to($$('.eyebrow i', group), { scale: 1, rotate: group.classList.contains('hero-copy') || group.closest('.directions') ? 0 : 45, duration: 0.9, ease: 'back.out(2.2)' }, 0);
  let at = 0.12;
  $$('.split', group).forEach((el) => {
    const p = pieces(el);
    tl.to(p, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: en() ? 0.055 : 0.03 }, at);
    at += 0.1 + p.length * (en() ? 0.05 : 0.025);
  });
  if ($$('.accent', group).length) {
    tl.to($$('.accent', group), { '--wd': 122, duration: 1.4, ease: 'expo.out' }, Math.max(0.2, at - 0.3));
    tl.to($$('.accent', group), { '--band': 1, duration: 0.9, ease: 'expo.inOut' }, at);
  }
  tl.to($$(fadeTargets, group), { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' }, 0.3);
}

// ---------------------------------------------------------------- builders
function buildHero() {
  heroExperience.refresh();
}

const marqueeChips = () => {
  const seen = new Set<string>();
  const out: string[] = [];
  fields.forEach((f) => out.push(pick(f.name)));
  posts.forEach((p) => p.tags.forEach((tag) => out.push(pick(tag))));
  services.items.forEach((s) => out.push(pick(s)));
  return out.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
};
const giantWords = () => (en() ? ['SANSPHASE', '無相', 'Formless', 'Taking shape', 'Case notes', 'Written while building'] : ['SANSPHASE', '無相', '无形', '成相', '复盘', '边做边记']);

function buildMarquee() {
  const chips = marqueeChips()
    .map((c) => `<span class="chip">${esc(c)}</span>`)
    .join('');
  const giant = giantWords()
    .map((w) => `<span class="giant-word"><span class="o">${esc(w)}</span><span class="f" aria-hidden="true">${esc(w)}</span>${SEP}</span>`)
    .join('');
  // The first copy is read; the two loop copies are hidden from assistive tech.
  $('#marquee-chips').innerHTML = `${chips}<span class="marquee-copy" aria-hidden="true">${chips}${chips}</span>`;
  $('#marquee-giant').innerHTML = giant + giant + giant;
  marquees.forEach((m) => m.measure());
}

function buildWork() {
  showcaseExperience.refresh();
}

function buildFacts() {
  factsExperience.refresh();
}

function buildManifesto() {
  manifestoExperience.refresh();
}

function buildCommunity() {
  $('#community-status').textContent = pick(community.status);
  $('#community-desc').textContent = pick(community.description);
  $('#club-stats').innerHTML = [
    [pad2(community.boards.length), t('community.boardsCount')],
    [pad2(community.systems.length), t('community.systemsCount')],
  ]
    .map(([v, k]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  $('#club-cta').textContent = pick(community.status);
  $('#boards').innerHTML = boardsMarkup();
  $('#log-systems').innerHTML = community.systems.map((s) => `<span><b>${esc(pick(s.name))}</b>${esc(pick(s.line))}</span>`).join('');
  buildLog();
}

function buildLog() {
  const log = logMarkup();
  const grid = $('#log-grid');
  grid.innerHTML = log.grid;
  $('#log-total').innerHTML = log.total;
  // Newest weeks first on narrow screens.
  requestAnimationFrame(() => (grid.scrollLeft = grid.scrollWidth));
}

function buildJournal() {
  $('#posts').innerHTML = posts.slice(0, 3).map((_, i) => postCard(i)).join('');
}

function buildArchive() {
  $('#archive-map').innerHTML = sections.map((s) => `<i class="${s.open ? 'is-open' : ''}"></i>`).join('');
  $('#archive-list').innerHTML = sections
    .map(
      (s, i) => `<li><a href="${sectionPath(s)}" data-i="${i}">
        <span class="archive-num">${pad2(i + 1)}</span>
        <span><span class="archive-name">${esc(pick(s.name))}</span><span class="archive-desc">${esc(pick(s.description))}</span></span>
        <span class="archive-state${s.open ? ' is-open' : ''}">${esc(s.open ? `${t('index.open')} · ${pick(s.status)}` : pick(s.status))}</span>
        <span class="archive-arrow" aria-hidden="true">→</span>
      </a></li>`,
    )
    .join('');

}

function buildContact() {
  $('#contact-summary').textContent = pick(services.summary);
  $('#services').innerHTML = services.items.map((s) => `<li>${esc(pick(s))}</li>`).join('');
  $('#banner-actions').innerHTML = `
    <a class="btn primary" href="${socials[1].url}" target="_blank" rel="noopener" data-magnetic><span class="roll"></span><i aria-hidden="true">↗</i></a>
    <a class="btn ghost" href="${socials[0].url}" target="_blank" rel="noopener" data-magnetic><span class="roll"></span><i aria-hidden="true">↗</i></a>`;
  const rolls = $$('#banner-actions .roll');
  setRoll(rolls[0], t('contact.qq'));
  setRoll(rolls[1], t('contact.douyin'));
}

const PAGES = [...NAV, ...EXTRA];
function buildNav() {
  $('#nav-list').innerHTML = NAV.map((n) => `<li><a href="${n.path}" data-page="${n.page}"><span class="roll"></span></a></li>`).join('');
  $$('#nav-list a').forEach((a, i) => setRoll(a.querySelector<HTMLElement>('.roll')!, t(NAV[i].key)));
  $$('#links li').forEach((li) => {
    li.addEventListener('pointerenter', () => movePill(li));
    li.addEventListener('focusin', (e) => (e.target as HTMLElement).matches(':focus-visible') && movePill(li));
  });
  if (integrated && account) {
    let slot = document.querySelector<HTMLElement>('[data-local-account]');
    if (!slot) { slot = document.createElement('div'); slot.dataset.localAccount = ''; document.querySelector('.bar-end')?.prepend(slot); }
    slot.innerHTML = account.navMarkup();
  }
}
function buildFooter() {
  $('#footer-tagline').textContent = pick(profile.tagline);
  $('#footer-sign').textContent = profile.signature;
  const links = PAGES.map((n, i) => `<li><a href="${n.path}" data-page="${n.page}"><small>${pad2(i + 1)}</small>${esc(t(n.key))}</a></li>`).join('');
  $('#footer-links').innerHTML = links;
  $('#menu-links').innerHTML = links;
  $('#footer-connect').innerHTML = [
    `<li><a href="${socials[0].url}" target="_blank" rel="noopener">${ARROW}${esc(pick(socials[0].label))}</a></li>`,
    `<li><a href="${socials[1].url}" target="_blank" rel="noopener">${ARROW}${esc(pick(socials[1].label))}</a></li>`,
    `<li><a href="https://www.sansphase.com/" target="_blank" rel="noopener">${ARROW}${esc(t('footer.site'))} · sansphase.com</a></li>`,
  ].join('');
  const icpLink = $<HTMLAnchorElement>('#icp');
  icpLink.textContent = icp.text;
  icpLink.href = icp.url;
}

function renderAll() {
  applyI18n();
  buildNav();
  buildHero();
  buildMarquee();
  directionsExperience.refresh();
  buildWork();
  buildFacts();
  buildManifesto();
  buildCommunity();
  buildJournal();
  buildArchive();
  buildContact();
  buildFooter();
  renderCurrentPage();
  groups().forEach(prepareGroup);
  $$('.heading', viewPage).forEach(playGroup);
  bindJumps();
  homeSectionsExperience.refresh();
  closingExperience.refresh();
  magneticExperience.refresh();
  headerExperience.refreshLanguage();
  markCurrent(viewShown ?? 'home');
}

// ---------------------------------------------------------------- scroll
const lenis = new Lenis({ lerp: reduced ? 1 : 0.1, smoothWheel: !reduced });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop();

function jumpTo(id: string) {
  closeMenu();
  closeArticle();
  lenis.scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72, duration: reduced ? 0 : 1.4, immediate: reduced });
}
function bindJumps() {
  $$<HTMLAnchorElement>('[data-jump]').forEach((a) => {
    if (a.dataset.jumpBound) return;
    a.dataset.jumpBound = '1';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      jumpTo(a.dataset.jump!);
    });
  });
}

// Header: docks into a glass capsule after the top, hides going down.
const header = $('#header');
let menuOpen = false;
const headerExperience = mountHeader(header, { reduced, getLanguage: lang, setLanguage: setLang });
lenis.on('scroll', (l: Lenis) => {
  const y = l.scroll;
  headerExperience.scroll(y);
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const p = clamp(0, 1, y / max);
  gsap.set('#progress', { scaleX: p });
  $('#top-ring').style.strokeDashoffset = String(1 - p);
});

// One capsule glides between hovered or focused links; the current-section
// bar springs between links.
const pill = $('#pill');
const linksBox = $('#links');
let pillOn = false;
function movePill(li: HTMLElement) {
  if (!pillOn) pill.classList.add('is-instant');
  pill.style.setProperty('--l', `${li.offsetLeft}px`);
  pill.style.setProperty('--w', `${li.offsetWidth}px`);
  if (!pillOn) {
    void pill.offsetWidth;
    pill.classList.remove('is-instant');
  }
  pill.classList.add('is-on');
  pillOn = true;
}
function hidePill() {
  pill.classList.remove('is-on');
  pillOn = false;
}
linksBox.addEventListener('pointerleave', hidePill);
linksBox.addEventListener('focusout', (e) => !linksBox.contains(e.relatedTarget as Node | null) && hidePill());

function markCurrent(page: PageId) {
  let found: HTMLElement | null = null;
  $$<HTMLAnchorElement>('a[data-page]').forEach((a) => {
    const on = a.dataset.page === page;
    a.classList.toggle('is-current', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    if (on && a.closest('#links')) found = a.parentElement;
  });
  const bar = $('#current');
  const li = found as HTMLElement | null;
  if (li) bar.style.setProperty('--cl', `${li.offsetLeft + li.offsetWidth / 2}px`);
  bar.style.opacity = li ? '1' : '0';
}

// Mobile menu: a circle opens from the burger; the page behind is inert and
// Tab stays inside the burger + menu.
const burger = $('#burger');
const menu = $('#menu');
function menuTrap(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const targets = [burger, ...$$('a, button', menu)];
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
function openMenu() {
  const r = burger.getBoundingClientRect();
  menu.style.setProperty('--mx', `${r.left + r.width / 2}px`);
  menu.style.setProperty('--my', `${r.top + r.height / 2}px`);
  menu.style.setProperty('--mr', `${Math.hypot(innerWidth, innerHeight) + 80}px`);
  menuOpen = true;
  headerExperience.setMenuOpen(true);
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  burger.setAttribute('aria-expanded', 'true');
  $('#main').inert = true;
  $('#footer').inert = true;
  lenis.stop();
  document.addEventListener('keydown', menuTrap);
  if (!reduced) gsap.fromTo('#menu-links li', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.05, delay: 0.2, clearProps: 'transform,opacity' });
  requestAnimationFrame(() => menu.querySelector<HTMLElement>('a')?.focus({ preventScroll: true }));
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  headerExperience.setMenuOpen(false);
  const hadFocus = menu.contains(document.activeElement);
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false');
  $('#main').inert = false;
  $('#footer').inert = false;
  document.removeEventListener('keydown', menuTrap);
  if (!readerActive()) lenis.start();
  if (hadFocus) burger.focus({ preventScroll: true });
}
burger.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && closeMenu());

// Theme and language.
$('#theme').addEventListener('click', (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setTheme(theme() === 'dark' ? 'light' : 'dark', { x: r.left + r.width / 2, y: r.top + r.height / 2 }, reduced);
});
onLang(() => {
  refreshReaderOpener(renderAll);
  setDocTitle(viewShown ?? 'home');
  if (readerActive()) reader.fill();
  ScrollTrigger.refresh();
});
$$('#open-palette, #open-palette-icon').forEach((b) =>
  b.addEventListener('click', () => {
    closeMenu();
    palette.show();
  }),
);

// The reusable 3D engine is bound to real content by a small page adapter.
const heroExperience = mountHero();
const directionsExperience = mountDirections($('#bento'), { reduced, readPost: openArticle });
const showcaseExperience = mountShowcase($('#work-showcase'), { reduced, readPost: openArticle });
const factsExperience = mountFacts($('#facts-grid'), { reduced });
const manifestoExperience = mountManifesto($('#manifesto-text'), { reduced });
const homeSectionsExperience = mountHomeSections($('#view-home'), { reduced });
const closingExperience = mountHomeClosing($('#banner'), $('#footer'), { reduced });
const magneticExperience = mountMagnetic(document.body, { reduced });
const pageExperience = mountPageExperience($('#view-page'), { reduced });
const journalExperience = mountJournalExperience($('#view-page'), { reduced });
$('#view-page').addEventListener('page:content', () => magneticExperience.refresh());
function sizeHero() { heroExperience.resize(); }

// ---------------------------------------------------------------- marquee
const marquees = [new Marquee($('#marquee-chips'), -1, 42), new Marquee($('#marquee-giant'), 1, 30)];
const pageTransition = mountPageTransition($('#main'), { reduced: () => reduced });
const routeAnchors = mountRouteAnchor($('#main'), { scrollTo: target => {
  // A path swap replaces a long page with different bounds. Reconcile Lenis'
  // cached position/limit with native scroll before resolving a DOM target.
  lenis.resize();
  lenis.scrollTo(target, { offset: -108, immediate: true, force: true });
} });
const navigationRestore = mountNavigationRestore($('#main'), {
  ready: () => !pageTransition.pending && (viewShown === 'home' || !viewPage.querySelector('[aria-busy="true"]')),
  unavailable: () => !viewPage.hidden && Boolean(viewPage.querySelector('.integration-gate, .integration-content.integrated-empty, [data-state="auth"], [data-state="restricted"], [data-state="vip"], [data-state="error"]')),
  limit: () => Math.max(0, document.documentElement.scrollHeight - innerHeight),
  scrollTo: top => { lenis.resize(); lenis.scrollTo(top, { immediate: true, force: true }); },
});
$('#main').addEventListener('collection:position', event => {
  const target: unknown = (event as CustomEvent<{target?: unknown}>).detail?.target;
  if (!(target instanceof HTMLElement) || !target.isConnected || !viewPage.contains(target) || viewPage.hidden || target.closest('[hidden],[inert],[aria-hidden="true"]')) return;
  navigationRestore.cancel();
  lenis.resize();
  lenis.scrollTo(target, { offset: -110, immediate: true, force: true });
  historyPositions.complete();
});
// Child controllers handle their own media changes. Keep the shared scrolling
// and heading layer in the same preference, including changes during a visit.
motionPreference.addEventListener('change', (event) => {
  reduced = event.matches;
  headerExperience.setReduced(reduced);
  if (reduced && pageTransition.pending) void applyRoute(route);
  lenis.options.smoothWheel = !reduced;
  lenis.options.lerp = reduced ? 1 : 0.1;
  if (!reduced) return;
  lenis.scrollTo(lenis.scroll, { immediate: true, force: true });
  // Page cards own their reveal lifecycle and live preference independently.
  groups().forEach((group) => {
    group.dataset.played = '1';
    const glyphs = $$('.split', group).flatMap(pieces);
    const fades = $$(fadeTargets, group);
    const markers = $$('.eyebrow i', group);
    const accents = $$('.accent', group);
    const rising = [...glyphs, ...fades, ...markers];
    gsap.killTweensOf([...rising, ...accents]);
    if (rising.length) gsap.set(rising, { clearProps: 'transform,opacity' });
    if (accents.length) gsap.set(accents, { '--wd': 122, '--band': 1 });
  });
});
// ---------------------------------------------------------------- heading reveals
let homeRevealsInstalled = false;

function reveals() {
  if (viewShown !== 'home' || homeRevealsInstalled) return;
  homeRevealsInstalled = true;
  groups().forEach((group) => {
    if (!group.closest('#view-home')) return;
    if (group.closest('.hero')) return;
    ScrollTrigger.create({ trigger: group, start: 'top 84%', once: true, onEnter: () => playGroup(group) });
  });

}

// Footer clock; the closing controller owns wordmark interactions.
const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const tickClock = () => ($('#footer-clock').textContent = clockFormat.format(new Date()));
tickClock();
setInterval(tickClock, 1000);
// ---------------------------------------------------------------- router
// Real paths for every page (serve.mjs answers them all with index.html);
// home and the other pages live in two views, articles open in the reader.
const viewHome = $('#view-home');
const viewPage = $('#view-page');
let route: Route = parseRoute(location.pathname);
let viewShown: PageId | null = null;
let viewRoute: Route | null = null;
let routeEpoch = 0;
let identityRefreshEpoch = 0;
let identityRefreshNavigation: { epoch: number; url: string; legacyHash: string; pending: boolean } | null = null;

function clearStaticArticle() {
  document.getElementById('site-article-static')?.remove();
  delete document.body.dataset.staticArticle;
}
function setDocTitle(page: PageId) {
  const article = readerActive() ? posts[reader.index] : null;
  const detailTitle = route.id ? viewPage.querySelector<HTMLElement>('.integration-book')?.dataset.integratedTitle || viewPage.querySelector('.integration-detail .integrated-article > header h1')?.textContent?.trim() : '';
  if (article || detailTitle) { document.title = `${article ? pick(article.title) : detailTitle} — SANSPHASE 無相`; return; }
  const entry = PAGES.find((n) => n.page === page);
  document.title = page === 'home' ? t('page.title') : `${entry ? t(entry.key) : ['account','verify','reset'].includes(page) ? en() ? 'Your account' : '我的账号' : '404'} — SANSPHASE 無相`;
}
function refreshIntegratedPage() {
  magneticExperience.refresh(); pageExperience.refresh(); journalExperience.refresh();
  viewPage.dispatchEvent(new CustomEvent('page:content', {bubbles:true}));
  lenis.resize(); ScrollTrigger.refresh();
  if (viewShown) setDocTitle(viewShown);
}
function integrationGate(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  if (status !== 401 && status !== 403 && status !== 404) { showLoadingFailure(); return; }
  clearStaticArticle();
  navigationRestore.cancel(); historyPositions.complete();
  const cleanup = disposeIntegrated; disposeIntegrated = () => {}; cleanup();
  const gate = document.createElement('section'); gate.className = 'integration-gate container';
  gate.setAttribute('aria-busy','true');
  gate.innerHTML = `<p role="status">${en()?'Loading access details…':'正在读取访问说明…'}</p>`;
  viewPage.replaceChildren(gate);
  refreshIntegratedPage();
  return import('./integration-access').then(({integratedAccessContent}) => {
    if (!gate.isConnected || gate.parentElement !== viewPage) return;
    gate.innerHTML = integratedAccessContent(status,en(),location.pathname+location.search);
    gate.removeAttribute('aria-busy'); refreshIntegratedPage();
  }).catch(() => { if (gate.isConnected && gate.parentElement === viewPage) showLoadingFailure(); });
}
function showLoadingFailure() {
  clearStaticArticle();
  if (readerActive()) hideArticle();
  closeMenu(); pageTransition.settle();
  const cleanup = disposeIntegrated; disposeIntegrated = () => {}; cleanup();
  navigationRestore.cancel(); historyPositions.complete();
  document.body.classList.remove('is-loading'); delete html.dataset.bootRoute;
  viewHome.hidden = true; viewPage.hidden = false;
  viewRoute = null;
  viewPage.innerHTML = `<section class="integration-gate container"><h1>页面暂时未能载入。</h1><p>请重新加载，或使用原版界面继续。</p><div class="page-actions"><button class="btn primary" type="button" data-reload>重新加载 ↻</button><a class="btn ghost" href="/original">打开原版界面 ↗</a></div></section>`;
  viewPage.querySelector('[data-reload]')?.addEventListener('click',()=>location.reload());
  lenis.start();
}
function handleIntegratedError(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  if (status === 401 || status === 403 || status === 404) integrationGate(error);
  else { navigationRestore.cancel(); historyPositions.complete(); refreshIntegratedPage(); }
}
function renderCurrentPage() {
  if (!viewShown || viewShown === 'home') return;
  disposeIntegrated(); disposeIntegrated = () => {};
  if (integrated && accountModule && account && localRuntime) {
    disposeLibrary(viewPage); disposeCatalog(viewPage);
    account.route(viewShown, route.id ?? '');
    if (['account','verify','reset'].includes(viewShown)) {
      viewPage.innerHTML = accountModule.renderAccountPage(viewShown as AccountPage, route.id ?? '', localRuntime.integrationState, en());
      account.refresh(); refreshIntegratedPage(); return;
    }
    if (viewShown === 'blog' && journalModule) {
      journalNotesReady = localRuntime.homeIntegrationReady;
      viewPage.innerHTML = `<div class="page" data-page="blog">${journalModule.renderIntegratedJournal()}</div>`;
      const mounted = journalModule.mountIntegratedJournal(viewPage, {english:en,onReady:refreshIntegratedPage,initialList:localRuntime.takeIntegratedNotesList()});
      disposeIntegrated = () => mounted.dispose(); refreshIntegratedPage(); return;
    }
    if (viewShown === 'community' && communityModule) {
      const mounted = communityModule.mountIntegratedCommunity(viewPage, {english:en,readState:()=>localRuntime!.integrationState,readCommunity:()=>localRuntime!.integrationCommunity,navigate});
      disposeIntegrated = () => mounted.dispose(); refreshIntegratedPage(); return;
    }
    const kind = ({work:'works',learning:'resources',software:'software',resources:'resource-center'} as Partial<Record<PageId,IntegratedKind>>)[viewShown];
    if (contentModule && kind && (route.id || viewShown === 'work')) {
      disposeIntegrated = contentModule.mountIntegratedContent(viewPage,{kind,id:route.id},{english:en,onReady:refreshIntegratedPage,onError:handleIntegratedError});
      return;
    }
  }
  renderPage(viewShown, viewPage, reduced);
  $$<HTMLElement>('.roll[data-roll]', viewPage).forEach((el) => setRoll(el, el.dataset.roll!));
  magneticExperience.refresh();
  pageExperience.refresh();
  journalExperience.refresh();
}
async function prepareIntegratedRoute(next: Route) {
  if (!integrated || !localRuntime) return;
  const modules: Promise<unknown>[] = [];
  if (next.page === 'blog' && !journalModule) modules.push(import('./integration-journal').then(value => { journalModule = value; }));
  if (next.page === 'community' && !communityModule) modules.push(import('./integration-community').then(value => { communityModule = value; }));
  if ((next.page === 'work' || next.id && ['learning','software','resources'].includes(next.page)) && !contentModule) modules.push(import('./integration-content').then(value => { contentModule = value; }));
  if ((next.page === 'home' || next.page === 'blog') && !next.slug && !localRuntime.homeIntegrationReady) modules.push(localRuntime.loadIntegratedNotes().then(loaded => {
    if (!loaded) throw new Error('Public notes unavailable');
    homeContentDirty = true;
  }));
  await Promise.all(modules);
}
async function swapView(page: PageId, animate: boolean, next: Route = { page }) {
  return pageTransition.run(() => {
    viewShown = page;
    viewRoute = { page, id: next.id };
    if (page === 'home') { disposeIntegrated(); disposeIntegrated = () => {}; disposeLibrary(viewPage); disposeCatalog(viewPage); account?.route('home'); }
    viewHome.hidden = page !== 'home';
    viewPage.hidden = page === 'home';
    document.body.dataset.page = page;
    if (page === 'home' && homeContentDirty) { homeContentDirty = false; renderAll(); }
    if (page === 'home') { void heroExperience.enter(); reveals(); playGroup($('#hero-copy')); }
    renderCurrentPage();
    const heading = viewPage.querySelector<HTMLElement>('.heading');
    if (page !== 'home' && heading) {
      prepareGroup(heading);
      playGroup(heading);
    }
    lenis.scrollTo(0, { immediate: true, force: true });
    markCurrent(page);
    setDocTitle(page);
    ScrollTrigger.refresh();
  }, animate);
}
async function applyRoute(next: Route, hash = location.hash, restoreTop?: number) {
  const epoch = ++routeEpoch;
  const scrollIntent = navigationRestore.intentVersion;
  navigationRestore.cancel();
  const finishAnchor = routeAnchors.prepare(next.slug ? '' : hash);
  route = next;
  account?.route(next.page, next.id ?? '');
  try { await prepareIntegratedRoute(next); }
  catch { if (epoch === routeEpoch) showLoadingFailure(); return; }
  if (epoch !== routeEpoch) return;
  // prepare() already owns the overlay and inert state, before reveal() sets
  // reader.open. A newer route must clear that pending ownership as well.
  if (readerReveal.pending) hideArticle();
  if (next.slug) {
    pageTransition.settle();
    if (!viewShown) await swapView('blog', false);
    if (epoch !== routeEpoch) return;
    let index = posts.findIndex((p) => p.slug === next.slug);
    if (integrated && localRuntime) {
      try { index = await localRuntime.ensureIntegratedPost(next.slug); }
      catch (error) { if (epoch === routeEpoch) { hideArticle(); viewHome.hidden = true; viewPage.hidden = false; viewShown = 'blog'; viewRoute = null; document.body.dataset.page = 'blog'; integrationGate(error); historyPositions.complete(); } return; }
    }
    if (epoch !== routeEpoch) return;
    showArticle(index);
    historyPositions.complete();
    return;
  }
  clearStaticArticle();
  if (readerActive()) hideArticle();
  closeMenu();
  let completed = true;
  try {
    if (samePageRoute(viewRoute, next)) {
      if (pageTransition.pending) pageTransition.settle();
      if (next.page === 'blog' && !journalNotesReady && localRuntime?.homeIntegrationReady) renderCurrentPage();
    }
    else completed = await swapView(next.page, viewShown !== null, next);
  } catch {
    // A render failure can occur after the new view's shell has committed.
    // Keep the current URL recoverable instead of exposing the preceding DOM.
    if (epoch === routeEpoch) showLoadingFailure();
    return;
  }
  if (epoch !== routeEpoch) return;
  if (!completed) { historyPositions.complete(); return; }
  if (scrollIntent !== navigationRestore.intentVersion) { historyPositions.complete(); return; }
  // Preserve mounted controls on same-page hashes and reader close. Restoration
  // waits for the real collection, not the temporary loading shell's height.
  const scrolling = restoreTop !== undefined ? navigationRestore.to(restoreTop)
    : hash ? navigationRestore.run(() => { void finishAnchor(true); }) : Promise.resolve(true);
  void scrolling.then(() => { if (epoch === routeEpoch) historyPositions.complete(); });
}
function navigate(path: string, replace = false) {
  const url = new URL(path, location.href);
  if (url.origin !== location.origin || /^\/(admin-console(?:\/|$)|original(?:\/|$))/.test(url.pathname)) { location.assign(url.href); return; }
  // pushState does not emit hashchange. Consume links from the reused account
  // and content modules before committing them to the path router.
  const legacy = integrated ? localRuntime?.legacyIntegrationPath(url.hash, url.search) : null;
  if (legacy) { navigate(legacy, replace); return; }
  const target = url.pathname + url.search + url.hash;
  if (url.pathname === '/' && !url.hash && location.pathname === '/' && viewShown === 'home' && !readerActive() && !pageTransition.pending) {
    jumpTo('top');
    return;
  }
  if (!historyPositions.navigate(target, replace)) {
    if (url.hash) void applyRoute(parseRoute(url.pathname), url.hash);
    return;
  }
  void applyRoute(parseRoute(url.pathname), url.hash);
}
addEventListener('popstate', () => void applyRoute(parseRoute(location.pathname), location.hash, historyPositions.pop()));
addEventListener('hashchange', () => {
  const legacy = integrated ? localRuntime?.legacyIntegrationPath(location.hash,location.search) : null;
  if (legacy) {
    const identityNavigation = identityRefreshNavigation;
    const identityHandoff = identityNavigation?.pending && identityNavigation.epoch === routeEpoch
      && identityNavigation.url === location.href && identityNavigation.legacyHash === location.hash;
    navigate(legacy, true);
    if (identityHandoff && identityRefreshNavigation === identityNavigation) {
      identityNavigation.epoch = routeEpoch; identityNavigation.url = location.href; identityNavigation.legacyHash = '';
    }
  }
});
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || /^\/(api|media|build|admin-console|original)(?:\/|$)/.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
document.addEventListener('pointerover', (e) => {
  const card = (e.target as Element).closest<HTMLElement>('[data-post]');
  if (card) reader.prefetch(Number(card.dataset.post));
});

// ---------------------------------------------------------------- reader
let readerOpener: HTMLElement | null = null;
// Re-rendering translated chrome must update the return target without
// focusing the inert page underneath the reader or command palette.
function refreshReaderOpener(rebuild: () => void) {
  const old = readerOpener;
  const scopeId = old?.closest<HTMLElement>('[id]')?.id;
  const post = old?.dataset.post;
  const href = old?.getAttribute('href');
  const matches = (element: HTMLElement) => post !== undefined ? element.dataset.post === post : !!href && element.getAttribute('href') === href;
  const previousScope = (scopeId && document.getElementById(scopeId)) || document.getElementById('main')!;
  const position = old ? [previousScope, ...previousScope.querySelectorAll<HTMLElement>('[data-post],a[href]')].filter(matches).indexOf(old) : -1;
  rebuild();
  if (!old || old.isConnected) return;
  const scope = (scopeId && document.getElementById(scopeId)) || document.getElementById('main')!;
  const replacements = [scope, ...scope.querySelectorAll<HTMLElement>('[data-post],a[href]')].filter(matches);
  readerOpener = replacements[Math.max(0, position)] ?? replacements[0] ?? null;
}
const reader = new Reader((i) => navigate(postPath(i), true), reduced);
const readerReveal = mountReaderReveal(() => {
  reader.reveal();
  clearStaticArticle();
  reader.root.focus({ preventScroll: true });
});
const readerActive = () => reader.open || readerReveal.pending;
// Opening a post is a navigation to /blog/<slug>; the route shows the reader.
function openArticle(i: number) {
  if (posts[i]) navigate(postPath(i));
}
function closeArticle() {
  if (!readerActive()) return;
  if ((history.state as { fromApp?: boolean } | null)?.fromApp) history.back();
  else navigate('/blog', true);
}
function showArticle(i: number) {
  if (!posts[i]) return;
  closeMenu();
  palette.close();
  if (reader.open) {
    reader.prepare(i);
    reader.root.scrollTop = 0;
    reader.reveal();
    clearStaticArticle();
    reader.root.focus({ preventScroll: true });
    setDocTitle('blog');
    return;
  }
  readerOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  reader.prepare(i);
  html.classList.add('is-reading');
  ['header', 'main', 'footer'].forEach((id) => (document.getElementById(id)!.inert = true));
  lenis.stop();
  showcaseExperience.setActive(false);
  factsExperience.setActive(false);
  manifestoExperience.setActive(false);
  homeSectionsExperience.setActive(false);
  closingExperience.setActive(false);
  magneticExperience.setActive(false);
  readerReveal.schedule();
  setDocTitle('blog');
}
function hideArticle() {
  readerReveal.cancel();
  reader.conceal();
  html.classList.remove('is-reading');
  ['header', 'main', 'footer'].forEach((id) => (document.getElementById(id)!.inert = false));
  if (!menuOpen) lenis.start();
  if (readerOpener?.isConnected) readerOpener.focus({ preventScroll: true });
  readerOpener = null;
  if (viewShown) setDocTitle(viewShown);
}
$('#reader-close').addEventListener('click', closeArticle);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (readerActive()) closeArticle();
  else closeMenu();
});

// ---------------------------------------------------------------- palette
const palette = new Palette((): Command[] => {
  const chapters: Command[] = PAGES.map((n, i) => ({
    id: `page-${n.page}`,
    group: t('palette.chapters'),
    label: t(n.key),
    hint: pad2(i + 1),
    keywords: `${ui[n.key].en} ${ui[n.key].zh} ${n.path}`,
    run: () => navigate(n.path),
  }));
  const postCommands: Command[] = posts.map((p, i) => ({ id: `post-${i}`, group: t('palette.posts'), label: pick(p.title), hint: p.date, keywords: postKeywords(i), run: () => openArticle(i) }));
  const sectionCommands: Command[] = sections.map((s, i) => ({
    id: `section-${s.id}`,
    group: t('palette.sections'),
    label: pick(s.name),
    hint: pick(s.status),
    keywords: sectionKeywords(i),
    run: () => navigate(sectionPath(s)),
  }));
  const actions: Command[] = [
    { id: 'theme', group: t('palette.actions'), label: t('palette.theme'), hint: theme() === 'dark' ? '☾' : '☀', keywords: 'theme dark light 主题 深色 浅色', run: () => setTheme(theme() === 'dark' ? 'light' : 'dark', undefined, reduced) },
    { id: 'lang', group: t('palette.actions'), label: t('palette.lang'), hint: en() ? '中' : 'EN', keywords: 'language 语言 english 中文', run: () => setLang(en() ? 'zh' : 'en') },
  ];
  return [...chapters, ...postCommands, ...sectionCommands, ...actions];
}, reduced, () => !reader.imageOpen && !document.querySelector('dialog[open]'));

// ---------------------------------------------------------------- frame loop
let windowFocused = document.hasFocus();
addEventListener('focus', () => { windowFocused = true; });
addEventListener('blur', () => { windowFocused = false; });
let heroVisible = false;
const heroViewport = new IntersectionObserver(entries => {
  heroVisible = entries.some(entry => entry.isIntersecting);
});
heroViewport.observe($('#hero-stage'));
gsap.ticker.add((_time, deltaMs) => {
  const dt = Math.min(deltaMs / 1000, 0.05);
  const usable = !readerActive() && !palette.open && !menuOpen && !document.querySelector('dialog[open]') && !document.hidden && windowFocused && !pageTransition.pending;
  const marqueeActive = !reduced && viewShown === 'home' && usable;
  marquees.forEach((m) => {
    m.setActive(marqueeActive);
    if (marqueeActive) m.update(dt, lenis.velocity);
  });
  heroExperience.setActive(viewShown === 'home' && heroVisible && usable);
  directionsExperience.setActive(viewShown === 'home' && usable);
  showcaseExperience.setActive(viewShown === 'home' && usable);
  factsExperience.setActive(viewShown === 'home' && usable);
  manifestoExperience.setActive(viewShown === 'home' && usable);
  homeSectionsExperience.setActive(viewShown === 'home' && usable);
  homeSectionsExperience.tick();
  closingExperience.setActive(usable);
  magneticExperience.setActive(usable);
  pageExperience.setActive(viewShown !== null && viewShown !== 'home' && usable);
  journalExperience.setActive(viewShown === 'blog' && usable);
});

// ---------------------------------------------------------------- start
function layout() {
  sizeHero();
  marquees.forEach((m) => m.measure());
  markCurrent(viewShown ?? 'home');
  ScrollTrigger.refresh();
}
addEventListener('resize', layout);

async function initIntegration() {
    [localRuntime, accountModule] = await Promise.all([import('./integration-runtime'),import('./integration-account')]);
    const refreshIdentity = async () => {
      const request = ++identityRefreshEpoch;
      const navigation = { epoch: routeEpoch, url: location.href, legacyHash: '', pending: true };
      identityRefreshNavigation = navigation;
      const returnPath = localRuntime!.safeIntegrationReturn(new URLSearchParams(location.search).get('return'),location.origin);
      // The original form writes its legacy hash synchronously after emitting
      // identity. Accept that one handoff, never a later user navigation.
      queueMicrotask(() => {
        if (identityRefreshNavigation !== navigation || navigation.epoch !== routeEpoch) return;
        const original = new URL(navigation.url);
        if (original.pathname + original.search === location.pathname + location.search && original.hash !== location.hash
          && localRuntime!.legacyIntegrationPath(location.hash, location.search)) {
          navigation.url = location.href; navigation.legacyHash = location.hash;
        }
      });
      disposeIntegrated(); disposeIntegrated = () => {}; disposeLibrary(viewPage); disposeCatalog(viewPage);
      contentModule?.resetIntegratedContentState(viewPage);
      if (readerActive()) hideArticle();
      localRuntime!.clearIntegration();
      const loaded = await localRuntime!.loadIntegration({includeNotes:viewShown === 'home'});
      if (request !== identityRefreshEpoch) return;
      navigation.pending = false;
      const ownsNavigation = navigation.epoch === routeEpoch && navigation.url === location.href;
      if (!loaded) {
        if (ownsNavigation) showLoadingFailure(); else buildNav();
        return;
      }
      homeContentDirty = !localRuntime!.homeIntegrationReady;
      // A valid identity still refreshes the current view and navigation chrome,
      // even when the visitor has moved away from the originating account form.
      renderAll();
      if (ownsNavigation && returnPath && (localRuntime!.integrationState.reader || localRuntime!.integrationState.author)) navigate(returnPath,true);
    };
    account = accountModule.mountAccountIntegration({english:en,readState:()=>localRuntime!.integrationState,onIdentity:refreshIdentity,navigate,changed:()=>{
      // Adapter renders may have waited for an older identity promise. They may
      // update a current account form, but cannot replay its old navigation.
      if (identityRefreshNavigation?.pending || !['account','verify','reset'].includes(route.page)) return;
      // Reset/verification forms update their legacy route with replaceState,
      // which does not emit hashchange. Consume it before rendering the page.
      const legacy = localRuntime!.legacyIntegrationPath(location.hash,location.search);
      if (legacy) { navigate(legacy,true); return; }
      const target = localRuntime!.safeIntegrationReturn(new URLSearchParams(location.search).get('return'),location.origin);
      const ownsNavigation = !identityRefreshNavigation || identityRefreshNavigation.epoch === routeEpoch && identityRefreshNavigation.url === location.href;
      if (ownsNavigation && (localRuntime!.integrationState.reader || localRuntime!.integrationState.author) && target) navigate(target,true);
      else if (!identityRefreshNavigation || !localRuntime!.integrationState.reader && !localRuntime!.integrationState.author) renderCurrentPage();
    }});
    const legacy = localRuntime.legacyIntegrationPath(location.hash,location.search);
    if (legacy) history.replaceState(null,'',legacy);
    route = parseRoute(location.pathname);
    if (!await localRuntime.loadIntegration({includeNotes:route.page === 'home' && !route.slug})) throw new Error('Original account bootstrap failed');
    localRuntime.mountLocalEnvironment();
}
async function start() {
  if (integrated) await initIntegration();
  renderAll();
  await applyRoute(route, location.hash, historyPositions.initialTop);
  reveals();
  document.body.classList.remove('is-loading');
  delete html.dataset.bootRoute;
  if (!readerActive() && !menuOpen) lenis.start();
  // Content is immediately usable; font or GPU preparation never blocks entry.
  document.fonts.ready.then(layout);
  if (!reduced) {
    gsap.fromTo('.bar', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', clearProps: 'transform,opacity' });
    gsap.fromTo('.hero-bottom', { opacity: 0 }, { opacity: 1, duration: 1, delay: .8, clearProps: 'opacity' });
  }
}
void start().catch(showLoadingFailure);
addEventListener('pagehide', (event) => {
  historyPositions.remember();
  navigationRestore.cancel();
  if (!event.persisted) navigationRestore.dispose();
  if (!event.persisted) { disposeIntegrated(); localRuntime?.clearIntegration(); }
  if (!event.persisted) { disposeCatalog(viewPage); disposeLibrary(viewPage); readerReveal.dispose(); heroExperience.dispose(); directionsExperience.dispose(); showcaseExperience.dispose(); factsExperience.dispose(); manifestoExperience.dispose(); homeSectionsExperience.dispose(); closingExperience.dispose(); magneticExperience.dispose(); pageExperience.dispose(); journalExperience.dispose(); headerExperience.dispose(); pageTransition.dispose(); routeAnchors.dispose(); marquees.forEach(marquee => marquee.dispose()); heroViewport.disconnect(); }
});
