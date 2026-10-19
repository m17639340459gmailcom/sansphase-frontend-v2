/**
 * Native DOM adaptation of Dingxin Tao's MIT ProjectShowcase / ShowcaseCaption.
 * Upstream: DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751
 * Source: src/components/home/project-showcase.tsx and showcase/caption.tsx.
 * Copyright (c) 2026 Dingxin Tao. License: ../vendor/tdx/LICENSE.
 * React / Motion / Next are replaced by this bounded DOM adapter and the
 * preview's existing GSAP / SplitText. Offset geometry, pointer thresholds,
 * 6500 ms CSS animation clock, glass layers and playback gates remain upstream.
 * Only the four existing author records replace the source's project products.
 */
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { posts } from './content';
import { lang, pick, t } from './i18n';
import { clamp, esc, pad2 } from './util';
import { icon } from './icons';

gsap.registerPlugin(SplitText);
type ShowcaseOptions = { reduced: boolean; readPost(index: number): void };
type Swipe = { id: number; x: number; y: number; captured: boolean; step: number };
type Pointer = { x: number; y: number; tilt: boolean };
const path = (index: number) => `/blog/${posts[index].slug}`;
const arrow = `<span aria-hidden="true">${icon('arrow-up-right')}</span>`;
const localized = (en: string, zh: string) => lang() === 'en' ? en : zh;

/** Every control and record remains usable before the first animation frame. */
export function mountShowcase(root: HTMLElement, options: ShowcaseOptions) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let reduced = options.reduced || preference.matches;
  let active = 0;
  let enabled = true;
  let disposed = false;
  let inView = false;
  let seen = false;
  let windowFocused = true;
  let hovered = false;
  let focused = false;
  let playing = true;
  let swipe: Swipe | null = null;
  let pointer: Pointer | null = null;
  let frame = 0;
  let suppressClickUntil = 0;
  let stage: HTMLElement;
  let caption: HTMLElement;
  let read: HTMLAnchorElement;
  let cards: HTMLElement[] = [];
  let captions: gsap.core.Tween[] = [];
  let splits: SplitText[] = [];
  let tilt: { x: ReturnType<typeof gsap.quickTo>; y: ReturnType<typeof gsap.quickTo> } | null = null;
  let tiltedFrame: HTMLElement | null = null;
  let captionGeneration = 0;
  const cleanups: (() => void)[] = [];
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const currentText = () => get('.showcase-captionText:not(.showcase-captionGhost)');
  const canRestoreFocus = () => !disposed && enabled && windowFocused && !document.hidden && !root.closest('[inert]');
  const interactive = () => !disposed && enabled && inView && windowFocused && !document.hidden;
  const moving = () => interactive() && fine.matches && !reduced;
  const rotating = () => interactive() && !reduced && posts.length > 1 && playing && !hovered && !focused && !swipe;

  function listen<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void, capture = false) {
    target.addEventListener(type, handler as EventListener, capture);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener, capture));
  }
  function stopCaption() {
    captionGeneration++;
    captions.forEach(animation => animation.kill()); captions = [];
    splits.forEach(split => split.revert()); splits = [];
    root.querySelector('.showcase-captionGhost')?.remove();
    root.querySelectorAll<HTMLElement>('.showcase-title,.showcase-summary').forEach(element => {
      element.style.removeProperty('transform'); element.style.removeProperty('opacity'); element.style.removeProperty('filter');
    });
  }
  function stopTilt() {
    if (tilt) { tilt.x.tween.kill(); tilt.y.tween.kill(); tilt = null; }
    cards.forEach(card => {
      const element = card.querySelector<HTMLElement>('.showcase-frame');
      element?.style.removeProperty('--tilt-x'); element?.style.removeProperty('--tilt-y');
    });
    tiltedFrame = null;
  }
  function cancelSwipe() {
    const current = swipe; swipe = null;
    if (current && stage?.hasPointerCapture(current.id)) stage.releasePointerCapture(current.id);
    stage?.style.removeProperty('--shift'); stage?.removeAttribute('data-scrub');
  }
  function resetPointerVisuals() {
    cancelAnimationFrame(frame); frame = 0; pointer = null;
    stopTilt();
    root.removeAttribute('data-fx-spot-active');
    root.style.removeProperty('--mx'); root.style.removeProperty('--my'); root.style.removeProperty('--spot-lit');
    root.querySelectorAll<HTMLElement>('.showcase-screen').forEach(screen => {
      screen.style.removeProperty('--mx'); screen.style.removeProperty('--my');
    });
    const numeral = root.querySelector<HTMLElement>('.showcase-numeral-lit');
    numeral?.style.removeProperty('--mx'); numeral?.style.removeProperty('--my');
  }
  function neutralize() { cancelSwipe(); resetPointerVisuals(); }
  function sync() {
    if (disposed) return;
    const live = seen && enabled && windowFocused && !document.hidden;
    root.dataset.live = String(live); stage.dataset.live = String(live);
    root.dataset.reduced = String(reduced);
    const mode = reduced || posts.length < 2 ? 'full' : rotating() ? 'run' : 'hold';
    root.querySelectorAll<HTMLElement>('.showcase-tab-fill,.showcase-ring-fill').forEach(clock => { clock.dataset.mode = mode; });
    caption.setAttribute('aria-live', rotating() ? 'off' : 'polite');
    const pause = get<HTMLButtonElement>('[data-action="pause"]');
    pause.setAttribute('aria-pressed', String(!playing));
    pause.hidden = reduced || posts.length < 2;
    pause.setAttribute('aria-label', playing ? t('aria.pause') : t('work.play'));
    pause.dataset.paused = String(!playing);
    pause.querySelector('.showcase-pause-icon')!.textContent = playing ? 'Ⅱ' : '▶';
    if (!interactive()) neutralize(); else if (reduced || !fine.matches) resetPointerVisuals();
    if (!live || reduced) stopCaption();
  }
  function animateCaption(ghost?: HTMLElement) {
    if (disposed || reduced || !seen || !enabled || !windowFocused || document.hidden) { ghost?.remove(); return; }
    const generation = captionGeneration;
    if (ghost) {
      ghost.classList.add('showcase-captionGhost'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      get('.showcase-texts').prepend(ghost);
      captions.push(gsap.to(ghost, { opacity: 0, y: -14, filter: 'blur(4px)', duration: 0.26, ease: 'power2.in', onComplete: () => {
        if (generation === captionGeneration) ghost.remove();
      } }));
    }
    const current = currentText();
    const title = SplitText.create(current.querySelector<HTMLElement>('.showcase-title')!, { type: 'chars', mask: 'chars' });
    const summary = SplitText.create(current.querySelector<HTMLElement>('.showcase-summary')!, { type: 'chars' });
    splits.push(title, summary);
    captions.push(gsap.fromTo(title.chars, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.022, clearProps: 'transform,opacity' }));
    captions.push(gsap.fromTo(summary.chars, { y: 10, opacity: 0, filter: 'blur(4px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', stagger: 0.012, delay: 0.16, clearProps: 'transform,opacity,filter' }));
  }
  function hitMarkup(index: number, selected: boolean) {
    const title = pick(posts[index].title);
    if (selected) return `<a class="showcase-hitArea" href="${path(index)}" data-post="${index}" data-cursor="read" draggable="false" aria-label="${esc(t('work.open').replace('{title}', title))}"></a>`;
    return `<button class="showcase-hitArea" type="button" tabindex="-1" data-select="${index}" aria-label="${esc(t('work.select').replace('{title}', title))}"></button>`;
  }
  function paintCards() {
    cards.forEach((card, index) => {
      let offset = (index - active + posts.length) % posts.length;
      if (offset > posts.length / 2) offset -= posts.length;
      const selected = offset === 0, distant = Math.abs(offset) > 1;
      const wasSelected = card.dataset.active === 'true';
      card.style.setProperty('--offset', String(offset));
      card.dataset.active = String(selected); card.dataset.distant = String(distant);
      card.dataset.slot = selected ? 'front' : distant ? 'back' : offset < 0 ? 'prev' : 'next';
      card.setAttribute('aria-hidden', String(distant)); card.inert = distant; card.toggleAttribute('inert', distant);
      if (wasSelected !== selected || !card.querySelector('.showcase-hitArea')) {
        card.querySelector('.showcase-hitArea')?.remove(); card.querySelector('.showcase-frame')!.insertAdjacentHTML('beforeend', hitMarkup(index, selected));
      }
    });
  }
  function updateCaption(animate: boolean) {
    const ghost = animate && !reduced && seen ? currentText().cloneNode(true) as HTMLElement : undefined;
    stopCaption();
    const post = posts[active];
    if (!post) {
      get('.showcase-count').textContent = '00 / 00';
      get('.showcase-meta').textContent = localized('NO PUBLISHED NOTES', '尚无已发布文章');
      currentText().querySelector<HTMLElement>('.showcase-title')!.textContent = localized('The next story starts here.', '下一次探索，从这里开始。');
      currentText().querySelector<HTMLElement>('.showcase-summary')!.textContent = '';
      read.removeAttribute('href'); read.removeAttribute('data-post'); read.hidden = true;
      return;
    }
    read.hidden = false;
    get('.showcase-count').textContent = `${pad2(active + 1)} / ${pad2(posts.length)}`;
    get('.showcase-meta').textContent = `${pad2(active + 1)} / ${pad2(posts.length)} — ${pick(post.category)} — ${post.date}`;
    currentText().querySelector<HTMLElement>('.showcase-title')!.textContent = pick(post.title);
    currentText().querySelector<HTMLElement>('.showcase-summary')!.textContent = pick(post.summary);
    get('.showcase-tags').innerHTML = post.tags.map(tag => `<li>${esc(pick(tag))}</li>`).join('');
    read.href = path(active); read.dataset.post = String(active); read.setAttribute('aria-label', t('work.open').replace('{title}', pick(post.title)));
    read.innerHTML = `<span>${esc(t('work.read'))}</span>${arrow}`;
    get('.showcase-numeral-value').textContent = pad2(active + 1); get('.showcase-numeral-lit').textContent = pad2(active + 1);
    root.querySelectorAll<HTMLElement>('.showcase-tab').forEach((tab, index) => {
      tab.setAttribute('aria-pressed', String(index === active)); tab.dataset.active = String(index === active);
      tab.querySelector('.showcase-tab-fill')?.remove();
      if (index === active) tab.querySelector('.showcase-tab-track')!.innerHTML = '<span class="showcase-tab-fill" data-mode="hold" style="--cycle:6500ms"></span>';
    });
    // Restart the decorative ring with the same slide boundary, never as a second clock.
    get('.showcase-ring-fill').replaceWith(get('.showcase-ring-fill').cloneNode(true));
    if (animate) animateCaption(ghost); else ghost?.remove();
  }
  function select(index: number, refocus = false) {
    if (disposed || !posts.length) return;
    const next = ((index % posts.length) + posts.length) % posts.length;
    if (next === active) { sync(); return; }
    const restoreFocus = canRestoreFocus() && (refocus || focusRole() === 'front');
    active = next; root.dataset.active = String(active); stopTilt(); paintCards(); updateCaption(true);
    // Selected hit areas change from buttons to links. Removing the focused
    // button does not reliably emit focusout, so preserve its role explicitly.
    if (restoreFocus) get<HTMLAnchorElement>('.showcase-card[data-active="true"] a').focus({ preventScroll: true });
    focused = root.contains(document.activeElement); sync();
  }
  function focusRole() {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || !root.contains(element)) return null;
    if (element.classList.contains('showcase-read')) return 'read';
    if (element.closest('.showcase-stage')) return 'front';
    return element.dataset.action ?? (element.classList.contains('showcase-tab') ? `tab-${element.dataset.index}` : null);
  }
  function refresh() {
    if (disposed) return;
    active = Math.min(active, Math.max(0, posts.length - 1));
    const focus = canRestoreFocus() ? focusRole() : null; neutralize(); stopCaption();
    root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', localized('carousel', '轮播'));
    root.setAttribute('aria-label', t('aria.cases')); root.dataset.active = String(active);
    root.innerHTML = `<div class="showcase-backdrop" aria-hidden="true"><div class="showcase-numeral"><span class="showcase-numeral-value">${pad2(active + 1)}</span><span class="showcase-numeral-lit">${pad2(active + 1)}</span></div></div>
      <div class="showcase-stage" id="showcase-stage" data-cursor="drag"><div class="showcase-glow" aria-hidden="true"></div>${posts.map((post, index) => `<div class="showcase-card" data-index="${index}" role="group" aria-roledescription="${localized('slide', '幻灯片')}" aria-label="${esc(`${index + 1} / ${posts.length}：${pick(post.title)}`)}"><div class="showcase-frame"><div class="showcase-chrome" aria-hidden="true"><span class="showcase-dots"><i></i><i></i><i></i></span><span class="showcase-url">${esc(pick(post.title))}</span>${arrow}</div><div class="showcase-screen"><div class="showcase-shot"><img src="${esc(post.cover)}" alt="${esc(pick(post.title))}" loading="lazy" decoding="async" draggable="false"></div><span class="showcase-gloss" aria-hidden="true"></span><span class="showcase-glare" aria-hidden="true"></span></div><span class="showcase-fog" aria-hidden="true"></span></div></div>`).join('')}</div>
      <div class="showcase-caption"><div class="showcase-copy"><p class="showcase-meta"></p><div class="showcase-texts" aria-atomic="true"><div class="showcase-captionText"><h3 class="showcase-title"></h3><p class="showcase-summary"></p></div></div><ul class="showcase-tags"></ul></div><div class="showcase-controls"><a class="showcase-read" data-cursor="read"></a><div class="showcase-buttons"><button class="showcase-control showcase-pause" type="button" data-action="pause" data-cursor="snap"><svg class="showcase-ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="showcase-ring-fill" data-mode="hold" style="--cycle:6500ms" cx="22" cy="22" r="21" pathLength="1"/></svg><span class="showcase-pause-icon" aria-hidden="true">Ⅱ</span></button><button class="showcase-control showcase-prev" type="button" data-action="prev" aria-label="${esc(t('aria.prev'))}" aria-controls="showcase-stage" data-cursor="snap">←</button><span class="showcase-count"></span><button class="showcase-control showcase-next" type="button" data-action="next" aria-label="${esc(t('aria.next'))}" aria-controls="showcase-stage" data-cursor="snap">→</button></div></div></div>
      <div class="showcase-tabs" role="group" aria-label="${esc(t('work.choose'))}">${posts.map((post, index) => `<button class="showcase-tab" type="button" data-index="${index}" data-select="${index}" aria-controls="showcase-stage" aria-label="${esc(t('work.select').replace('{title}', pick(post.title)))}"><span class="showcase-tab-num">${pad2(index + 1)}</span><span class="showcase-tab-title"><span class="roll"><span class="roll-a">${esc(pick(post.title))}</span><span class="roll-b" aria-hidden="true">${esc(pick(post.title))}</span></span></span><span class="showcase-tab-track" aria-hidden="true"></span></button>`).join('')}</div>`;
    stage = get('.showcase-stage'); caption = get('.showcase-texts'); read = get<HTMLAnchorElement>('.showcase-read');
    cards = Array.from(root.querySelectorAll<HTMLElement>('.showcase-card'));
    paintCards(); updateCaption(false); focused = false; sync();
    const selector = focus === 'read' ? '.showcase-read' : focus === 'front' ? '.showcase-card[data-active="true"] a' : focus?.startsWith('tab-') ? `.showcase-tab[data-index="${focus.slice(4)}"]` : focus ? `[data-action="${focus}"]` : null;
    if (selector) root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    root.querySelectorAll<HTMLImageElement>('.showcase-shot img').forEach(sizeShot);
  }
  function onClick(event: MouseEvent) {
    if (disposed || event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-post]');
    if (link && root.contains(link)) {
      const index = Number(link.dataset.post);
      if (link.target || link.hasAttribute('download') || !Number.isInteger(index) || !posts[index] || link.getAttribute('href') !== path(index)) return;
      event.preventDefault(); read.focus({ preventScroll: true }); options.readPost(index); return;
    }
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.select !== undefined) { const index = Number(button.dataset.select); if (Number.isInteger(index) && posts[index]) select(index); }
    else if (button.dataset.action === 'prev') select(active - 1);
    else if (button.dataset.action === 'next') select(active + 1);
    else if (button.dataset.action === 'pause') { playing = !playing; sync(); }
  }
  function clickCapture(event: MouseEvent) {
    if (disposed || !(event.target instanceof Node) || !stage.contains(event.target) || performance.now() >= suppressClickUntil) return;
    event.preventDefault(); event.stopPropagation();
  }
  function onKey(event: KeyboardEvent) {
    if (disposed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element) || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const destination: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: posts.length - 1 };
    if (destination[event.key] === undefined) return;
    event.preventDefault(); select(destination[event.key], stage.contains(event.target));
  }
  function onPointerDown(event: PointerEvent) {
    if (!interactive() || event.isPrimary === false || event.button !== 0 || !(event.target instanceof Node) || !stage.contains(event.target)) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, captured: false, step: 0 }; sync();
  }
  function paintPointer() {
    frame = 0;
    if (!moving() || !pointer) return;
    const rootBox = root.getBoundingClientRect(), stageBox = stage.getBoundingClientRect();
    const numeral = get('.showcase-numeral-lit'), numeralBox = numeral.getBoundingClientRect();
    const screens = cards.map(card => card.querySelector<HTMLElement>('.showcase-screen')!);
    const bounds = screens.map(screen => screen.getBoundingClientRect());
    root.style.setProperty('--mx', `${(pointer.x - rootBox.left).toFixed(1)}px`); root.style.setProperty('--my', `${(pointer.y - rootBox.top).toFixed(1)}px`); root.style.setProperty('--spot-lit', '1'); root.setAttribute('data-fx-spot-active', '');
    numeral.style.setProperty('--mx', `${(pointer.x - numeralBox.left).toFixed(1)}px`); numeral.style.setProperty('--my', `${(pointer.y - numeralBox.top).toFixed(1)}px`);
    screens.forEach((screen, index) => { screen.style.setProperty('--mx', `${(pointer!.x - bounds[index].left).toFixed(1)}px`); screen.style.setProperty('--my', `${(pointer!.y - bounds[index].top).toFixed(1)}px`); });
    if (swipe?.captured) return;
    if (!pointer.tilt) { stopTilt(); return; }
    const target = cards[active].querySelector<HTMLElement>('.showcase-frame')!;
    if (tiltedFrame !== target || !tilt) { stopTilt(); tiltedFrame = target; tilt = { x: gsap.quickTo(target, '--tilt-x', { duration: 0.48, ease: 'power3.out' }), y: gsap.quickTo(target, '--tilt-y', { duration: 0.48, ease: 'power3.out' }) }; }
    tilt.x(-((pointer.y - stageBox.top) / Math.max(1, stageBox.height) - 0.5) * 4); tilt.y(((pointer.x - stageBox.left) / Math.max(1, stageBox.width) - 0.5) * 6);
  }
  function onPointerMove(event: PointerEvent) {
    if (!interactive()) return;
    if (swipe && swipe.id === event.pointerId) {
      const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
      if (!swipe.captured && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        stage.setPointerCapture(event.pointerId); swipe.captured = true;
        if (!reduced) { const step = parseFloat(getComputedStyle(stage).getPropertyValue('--step')) / 100 || 0.67; swipe.step = cards[active].offsetWidth * step; stage.setAttribute('data-scrub', ''); stopTilt(); }
      }
      if (swipe.captured && swipe.step > 0) {
        const shift = clamp(-1, 1, (dx - Math.sign(dx) * 10) / swipe.step);
        cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { frame = 0; if (swipe?.captured && interactive()) stage.style.setProperty('--shift', shift.toFixed(4)); });
      }
      return;
    }
    if (event.pointerType !== 'mouse' || !moving()) return;
    pointer = { x: event.clientX, y: event.clientY, tilt: event.target instanceof Node && stage.contains(event.target) }; if (!frame) frame = requestAnimationFrame(paintPointer);
  }
  function finishSwipe(event: PointerEvent) {
    const start = swipe;
    if (!start || start.id !== event.pointerId) return;
    cancelAnimationFrame(frame); frame = 0; cancelSwipe();
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (event.type === 'pointerup' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { suppressClickUntil = performance.now() + 350; select(active + (dx < 0 ? 1 : -1)); }
    sync();
  }
  function onAnimation(event: AnimationEvent) {
    if (event.animationName !== 'showcase-cycle' || !rotating() || !(event.target instanceof HTMLElement) || event.target !== root.querySelector('.showcase-tab-fill')) return;
    select(active + 1);
  }
  function sizeShot(image: HTMLImageElement) {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const shot = image.closest<HTMLElement>('.showcase-shot'); if (!shot) return;
    const ratio = image.naturalWidth / image.naturalHeight, screen = 16 / 9;
    shot.style.width = ratio >= screen ? '100%' : `${(ratio / screen) * 100}%`;
    shot.style.height = ratio >= screen ? `${(screen / ratio) * 100}%` : '100%';
  }
  function onPreference() { reduced = preference.matches; neutralize(); stopCaption(); sync(); }

  refresh();
  listen<MouseEvent>(root, 'click', clickCapture, true); listen<MouseEvent>(root, 'click', onClick);
  listen<KeyboardEvent>(root, 'keydown', onKey); listen<AnimationEvent>(root, 'animationend', onAnimation);
  listen<PointerEvent>(root, 'pointerdown', onPointerDown); listen<PointerEvent>(root, 'pointermove', onPointerMove);
  listen<PointerEvent>(root, 'pointerup', finishSwipe); listen<PointerEvent>(root, 'pointercancel', finishSwipe);
  listen<PointerEvent>(root, 'lostpointercapture', event => { if (event.target === stage && swipe) { cancelSwipe(); sync(); } });
  listen<PointerEvent>(root, 'pointerleave', event => {
    if (event.target !== stage) return;
    stopTilt(); if (swipe && !stage.hasPointerCapture(swipe.id)) { cancelSwipe(); sync(); }
  }, true);
  listen<PointerEvent>(root, 'pointerenter', () => { hovered = true; sync(); });
  listen<PointerEvent>(root, 'pointerleave', () => { hovered = false; if (swipe && stage.hasPointerCapture(swipe.id)) resetPointerVisuals(); else neutralize(); sync(); });
  listen<FocusEvent>(root, 'focusin', () => { focused = true; sync(); });
  listen<FocusEvent>(root, 'focusout', event => { if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) { focused = false; sync(); } });
  listen<Event>(root, 'dragstart', event => { if (event.target instanceof Node && stage.contains(event.target)) event.preventDefault(); });
  listen<Event>(root, 'load', event => { if (event.target instanceof HTMLImageElement) sizeShot(event.target); }, true);
  listen<Event>(document, 'visibilitychange', () => { if (document.hidden) { neutralize(); stopCaption(); } sync(); });
  listen<Event>(window, 'blur', () => { windowFocused = false; hovered = false; neutralize(); sync(); });
  listen<Event>(window, 'focus', () => { windowFocused = true; sync(); });
  listen<Event>(window, 'scroll', () => { if (pointer && moving() && !frame) frame = requestAnimationFrame(paintPointer); });
  listen<Event>(window, 'resize', () => { if (pointer && moving() && !frame) frame = requestAnimationFrame(paintPointer); });
  listen<Event>(preference, 'change', onPreference); listen<Event>(fine, 'change', () => { neutralize(); sync(); });
  const observer = new IntersectionObserver(entries => {
    if (disposed) return;
    const entry = entries.find(item => item.target === root); if (!entry) return;
    const first = !seen && entry.isIntersecting && entry.intersectionRatio >= 0.2;
    seen ||= first; inView = entry.isIntersecting && entry.intersectionRatio >= 0.35;
    if (!inView) neutralize(); sync(); if (first) animateCaption();
  }, { threshold: [0, 0.2, 0.35] });
  observer.observe(root);
  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; if (!value) { hovered = false; neutralize(); stopCaption(); } sync(); },
    dispose() { if (disposed) return; disposed = true; observer.disconnect(); cleanups.forEach(cleanup => cleanup()); neutralize(); stopCaption(); root.dataset.live = 'false'; stage.dataset.live = 'false'; root.querySelectorAll<HTMLElement>('.showcase-tab-fill,.showcase-ring-fill').forEach(clock => { clock.dataset.mode = 'hold'; }); },
  };
}
