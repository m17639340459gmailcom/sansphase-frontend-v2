/**
 * Native DOM adaptation of Dingxin Tao's MIT WhatIDo, DepthCard and SpotlightGroup.
 * Upstream: DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751
 * Sources: src/components/home/{what-i-do,showcase/depth-card}.tsx and
 * src/components/fx/spotlight.tsx. Copyright (c) 2026 Dingxin Tao.
 * License: ../vendor/tdx/LICENSE. The three real author directions replace the
 * source's four product cards. GSAP quickTo/ScrollTrigger replace React springs
 * and FxTrigger; the normalized coordinates and shared neighbour light remain.
 * The native whole-card overlay and CSS entrance state are retained. Title
 * tokenization adapts src/components/fx/split.ts at the same fixed commit.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { fields, posts } from './content';
import { lang, pick, t } from './i18n';
import { clamp, esc, pad2 } from './util';
import { icon } from './icons';

gsap.registerPlugin(ScrollTrigger);

type DirectionOptions = { reduced: boolean; readPost(index: number): void };
type Quick = ReturnType<typeof gsap.quickTo>;
type Tilt = { x: Quick; y: Quick };
const arrow = `<span class="direction-arrow" aria-hidden="true"><span>${icon('arrow-up-right')}</span><span>${icon('arrow-up-right')}</span></span>`;
// Fixed upstream split.ts auto mode: Latin words stay intact; CJK glyphs keep
// closing punctuation attached. Rendering is the only native DOM adaptation.
const CJK_RANGE = '\u2e80-\u2fff\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef';
const CLOSING = '\u3002\uff0c\u3001\uff1b\uff1a\uff1f\uff01\uff09\u300d\u300f\u3011\u300b\u3009\u2026\u2014\uff05,.;:?!)\\]}\u201d\u2019';
const OPENING = '\uff08\u300c\u300e\u3010\u300a\u3008(\\[{\u201c\u2018';
const TOKENS = new RegExp(`\\s+|[${OPENING}]*(?:[${CJK_RANGE}][${CLOSING}]*|[^\\s${CJK_RANGE}]+[${CLOSING}]*)`, 'g');
type SplitSegment = { type: 'space' } | { type: 'word'; units: { text: string; index: number }[] };
function splitText(text: string): SplitSegment[] {
  const segments: SplitSegment[] = [];
  let index = 0;
  for (const token of text.match(TOKENS) ?? []) {
    if (/^\s+$/.test(token)) {
      if (segments.length && segments.at(-1)?.type !== 'space') segments.push({ type: 'space' });
      continue;
    }
    segments.push({ type: 'word', units: [{ text: token, index: index++ }] });
  }
  if (segments.at(-1)?.type === 'space') segments.pop();
  return segments;
}
function titleMarkup(text: string): string {
  return splitText(text).map(segment => segment.type === 'space' ? ' ' : `<span class="direction-word">${segment.units.map(unit => `<span class="direction-unit" style="--i:${unit.index}">${esc(unit.text)}</span>`).join('')}</span>`).join('');
}

/** Content markup remains useful and keyboard operable before any motion mounts. */
export function directionsMarkup(): string {
  return fields.map((field, index) => {
    const postIndex = field.key === 'ai' ? 0 : field.key === 'video' ? 1 : undefined;
    const post = postIndex === undefined ? undefined : posts[postIndex];
    const href = post ? `/blog/${esc(post.slug)}` : '/contact';
    const attrs = post ? ` data-post="${postIndex}" data-cursor="read"` : '';
    const title = pick(field.name);
    const delay = [0, 0.1, 0.05][index] ?? 0;
    return `<div class="direction-cell ${index === 0 ? 'direction-tall' : 'direction-wide'}" data-direction-cell="${esc(field.key)}" data-fx-state="done" style="--delay:${delay}s"><div class="direction-reveal"><article class="direction-card" data-direction="${esc(field.key)}" data-fx-spot="">
      <span class="direction-shadow" aria-hidden="true"></span>
      <div class="direction-media" aria-hidden="true"><div class="direction-zoom">${post ? `<img class="direction-artwork" src="${esc(post.cover)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</div></div>
      <span class="direction-lamp" aria-hidden="true"></span>${index === 0 ? '<span class="direction-beam" aria-hidden="true"></span>' : ''}
      <a class="direction-overlay" href="${href}" tabindex="-1" aria-hidden="true"${attrs}></a>
      <div class="direction-plane direction-meta"><span class="direction-index">${pad2(index + 1)}</span><span class="direction-rule" aria-hidden="true"></span><span class="direction-label" lang="${lang()}">${esc(title)}</span></div>
      <div class="direction-plane direction-content"><div class="direction-copy"><h3 class="direction-title" aria-label="${esc(title)}"><span class="direction-title-visual" aria-hidden="true">${titleMarkup(title)}</span></h3><p class="direction-text direction-rise">${esc(pick(field.line))}</p><a class="direction-cta direction-rise" href="${href}"${attrs}>${t(post ? 'fields.open' : 'nav.cta')}${arrow}</a></div></div>
    </article></div></div>`;
  }).join('');
}

/**
 * One delegated mouse handler paints all neighbour lights in a single rAF.
 * Every rectangle is read before any style write. Only the active card tilts;
 * GSAP owns pointer interpolation; ScrollTrigger starts the upstream CSS state.
 */
export function mountDirections(root: HTMLElement, options: DirectionOptions) {
  const fine = matchMedia('(pointer: fine)');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = options.reduced || reducedQuery.matches;
  let cards: HTMLElement[] = [];
  let cells: HTMLElement[] = [];
  let pointer: { x: number; y: number; card: HTMLElement | null } | null = null;
  let activeCard: HTMLElement | null = null;
  let frame = 0;
  let disposed = false;
  let active = true;
  let focused = true;
  let inView = true;
  let revealed = false;
  let entrancePlaying = false;
  let generation = 0;
  let trigger: ScrollTrigger | null = null;
  const tilts = new Map<HTMLElement, Tilt>();
  const tracking = () => !disposed && active && focused && inView && !document.hidden && fine.matches && !reduced;

  function neutralize() {
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    activeCard = null;
    root.removeAttribute('data-fx-spot-active');
    root.style.removeProperty('--mx');
    root.style.removeProperty('--my');
    for (const tilt of tilts.values()) {
      tilt.x.tween.kill();
      tilt.y.tween.kill();
    }
    tilts.clear();
    for (const card of cards) {
      card.style.setProperty('--px', '0');
      card.style.setProperty('--py', '0');
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    }
  }
  function tiltFor(card: HTMLElement): Tilt {
    let tilt = tilts.get(card);
    if (!tilt) {
      const timing = { duration: 0.48, ease: 'power3.out' };
      tilt = { x: gsap.quickTo(card, '--px', timing), y: gsap.quickTo(card, '--py', timing) };
      tilts.set(card, tilt);
    }
    return tilt;
  }
  function paint() {
    frame = 0;
    if (!tracking() || !pointer) return;
    const position = pointer;
    const rootBounds = root.getBoundingClientRect();
    const bounds = cards.map(card => card.getBoundingClientRect());
    root.style.setProperty('--mx', `${(position.x - rootBounds.left).toFixed(1)}px`);
    root.style.setProperty('--my', `${(position.y - rootBounds.top).toFixed(1)}px`);
    cards.forEach((card, index) => {
      card.style.setProperty('--mx', `${(position.x - bounds[index].left).toFixed(1)}px`);
      card.style.setProperty('--my', `${(position.y - bounds[index].top).toFixed(1)}px`);
    });
    root.setAttribute('data-fx-spot-active', '');
    if (activeCard && activeCard !== position.card) {
      const previous = tiltFor(activeCard);
      previous.x(0); previous.y(0);
    }
    activeCard = position.card;
    if (!activeCard) return;
    const index = cards.indexOf(activeCard);
    if (index < 0) return;
    const rect = bounds[index];
    const tilt = tiltFor(activeCard);
    tilt.x(clamp(-1, 1, ((position.x - rect.left) / Math.max(rect.width, 1)) * 2 - 1));
    tilt.y(clamp(-1, 1, ((position.y - rect.top) / Math.max(rect.height, 1)) * 2 - 1));
  }
  function schedule() {
    if (!frame && pointer && tracking()) frame = requestAnimationFrame(paint);
  }
  function onMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !tracking()) return;
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.direction-card') : null;
    pointer = { x: event.clientX, y: event.clientY, card: card && root.contains(card) ? card : null };
    schedule();
  }
  function onScroll() {
    if (!pointer) return;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    pointer.card = target?.closest<HTMLElement>('.direction-card') ?? null;
    if (pointer.card && !root.contains(pointer.card)) pointer.card = null;
    schedule();
  }
  function onRead(event: MouseEvent) {
    if (disposed || event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a.direction-cta[data-post], a.direction-overlay[data-post]') : null;
    if (!link || !root.contains(link) || link.hasAttribute('download') || link.target) return;
    const index = Number(link.dataset.post);
    if (!Number.isInteger(index) || !posts[index] || link.getAttribute('href') !== `/blog/${posts[index].slug}`) return;
    event.preventDefault();
    // The whole-card hit area is hidden from keyboard/AT navigation. Reader
    // saves activeElement as its opener, so hand it the visible control first.
    if (link.classList.contains('direction-overlay')) {
      link.closest<HTMLElement>('.direction-card')?.querySelector<HTMLAnchorElement>('a.direction-cta')?.focus({ preventScroll: true });
    }
    options.readPost(index);
  }
  function mediaState(event: Event) {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.closest<HTMLElement>('.direction-card')?.toggleAttribute('data-media-unavailable', event.type === 'error');
  }
  function stopEntrance() {
    trigger?.kill(); trigger = null;
    entrancePlaying = false;
    generation++;
  }
  function setState(state: 'idle' | 'play' | 'done') {
    cells.forEach(cell => { cell.dataset.fxState = state; });
  }
  function showImmediately() {
    revealed = true;
    stopEntrance();
    setState('done');
  }
  function onAnimationEnd(event: AnimationEvent) {
    if (disposed || !entrancePlaying || event.animationName !== 'direction-settle') return;
    const target = event.target;
    if (!(target instanceof Element) || !target.classList.contains('direction-zoom')) return;
    const cell = target.closest<HTMLElement>('.direction-cell');
    if (!cell || !root.contains(cell) || cell.dataset.fxState !== 'play') return;
    cell.dataset.fxState = 'done';
    entrancePlaying = cells.some(item => item.dataset.fxState === 'play');
  }
  function availability() {
    if (!tracking()) {
      neutralize();
      if (entrancePlaying || !active || document.hidden || reduced || !fine.matches) showImmediately();
    }
    root.toggleAttribute('data-direction-active', !disposed && active && focused && inView && !document.hidden && !reduced);
    cards.forEach(card => card.toggleAttribute('data-depth', tracking()));
  }
  function onPreference() {
    reduced = reducedQuery.matches;
    if (reduced) showImmediately();
    availability();
  }
  function onFinePointer() {
    if (!fine.matches) showImmediately();
    availability();
  }
  function onFocus() {
    // A keyboard target never waits behind an idle or running CSS curtain.
    if (!revealed || entrancePlaying) showImmediately();
  }
  function onBlur() {
    focused = false;
    showImmediately();
    availability();
  }
  function onWindowFocus() {
    focused = true;
    availability();
  }
  function setActive(value: boolean) {
    if (disposed || active === value) return;
    active = value;
    // Reader/search overlays stop the CSS curtain without replaying on close.
    if (!active) showImmediately();
    availability();
  }
  function focusRole() {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || !root.contains(element) || !element.classList.contains('direction-cta')) return null;
    return element.closest<HTMLElement>('[data-direction]')?.dataset.direction ?? null;
  }
  function refresh() {
    if (disposed) return;
    const focus = active && focused && !document.hidden && !root.closest('[inert]') ? focusRole() : null;
    neutralize();
    stopEntrance();
    root.innerHTML = directionsMarkup();
    cards = Array.from(root.querySelectorAll<HTMLElement>('.direction-card'));
    cells = Array.from(root.querySelectorAll<HTMLElement>('.direction-cell'));
    cards.forEach(card => {
      card.style.setProperty('--px', '0');
      card.style.setProperty('--py', '0');
    });
    if (focus) cards.find(card => card.dataset.direction === focus)?.querySelector<HTMLAnchorElement>('.direction-cta')?.focus({ preventScroll: true });
    availability();
    if (!active || reduced || !fine.matches || revealed) {
      // A language refresh never sends an already revealed card back offscreen.
      showImmediately();
      return;
    }
    setState('idle');
    const entranceGeneration = generation;
    trigger = ScrollTrigger.create({
      trigger: root,
      start: 'top 85%',
      once: true,
      onEnter() {
        if (disposed || !active || revealed || entranceGeneration !== generation) return;
        if (document.hidden || reduced || !fine.matches) { showImmediately(); return; }
        revealed = true;
        trigger?.kill(); trigger = null;
        entrancePlaying = true;
        setState('play');
      },
    });
  }

  const observer = new IntersectionObserver(([entry]) => {
    inView = Boolean(entry?.isIntersecting);
    availability();
  }, { threshold: 0 });
  observer.observe(root);
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', neutralize);
  root.addEventListener('click', onRead);
  root.addEventListener('focusin', onFocus);
  root.addEventListener('animationend', onAnimationEnd);
  root.addEventListener('error', mediaState, true);
  root.addEventListener('load', mediaState, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onWindowFocus);
  document.addEventListener('visibilitychange', availability);
  fine.addEventListener('change', onFinePointer);
  reducedQuery.addEventListener('change', onPreference);
  refresh();

  return {
    refresh,
    setActive,
    dispose() {
      if (disposed) return;
      neutralize();
      showImmediately();
      disposed = true;
      root.removeAttribute('data-direction-active');
      observer.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', neutralize);
      root.removeEventListener('click', onRead);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('animationend', onAnimationEnd);
      root.removeEventListener('error', mediaState, true);
      root.removeEventListener('load', mediaState, true);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', availability);
      fine.removeEventListener('change', onFinePointer);
      reducedQuery.removeEventListener('change', onPreference);
      for (const card of cards) card.removeAttribute('data-depth');
    },
  };
}
