/**
 * Thin DOM adapter of TDX SpotlightGroup / PostCardFrame / Reveal at
 * c73bc4966f0ba808b978e22eccf5a063fc649751 (MIT), copyright (c) 2026 Dingxin Tao.
 * See SOURCES.json and vendor/tdx/LICENSE. Existing GSAP supplies Reveal's
 * .5s / 16px fade-up. Cards keep their authored content, links and tab order;
 * ambient and magnetic retain ownership of the pointer and magnetic motion.
 */
import gsap from 'gsap';
import { clamp } from './util';

type Point = { x: number; y: number };
type StyleValue = { value: string; priority: string };
type Card = { element: HTMLElement; visible: boolean; light: HTMLElement; ownedLight: boolean; cover: boolean; styles: Map<string, StyleValue> };
type Group = { host: HTMLElement; cards: Card[] };
type Reveal = { element: HTMLElement; visible: boolean; timeline: gsap.core.Timeline | null; generation: number; styles: Map<string, StyleValue> };

const pointerProperties = ['--page-mx', '--page-my', '--page-px', '--page-py'];
function remember(element: HTMLElement, properties: string[]) {
  return new Map(properties.map(property => [property, { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }]));
}
function restore(element: HTMLElement, styles: Map<string, StyleValue>) {
  for (const [property, { value, priority }] of styles) {
    if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
  }
  if (!element.getAttribute('style')) element.removeAttribute('style');
}

export function mountPageExperience(root: HTMLElement, options: { reduced: boolean }) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let reduced = options.reduced || motion.matches;
  let enabled = true, focused = document.hasFocus(), disposed = false, frame = 0;
  let cards: Card[] = [], groups: Group[] = [], reveals: Reveal[] = [];
  let active: Group | null = null, point: Point | null = null;
  const seen = new WeakSet<HTMLElement>(), cleanups: (() => void)[] = [];
  const displayed = (element: HTMLElement) => element.isConnected && root.contains(element) && !element.closest('[hidden],[inert],[aria-hidden="true"]');
  const available = () => !disposed && enabled && focused && !document.hidden && displayed(root);
  const animated = () => available() && !reduced && fine.matches;

  function listen<T extends Event>(target: EventTarget, type: string, callback: (event: T) => void) {
    target.addEventListener(type, callback as EventListener);
    cleanups.push(() => target.removeEventListener(type, callback as EventListener));
  }
  function resetPointer() {
    cancelAnimationFrame(frame); frame = 0; active = null; point = null;
    for (const card of cards) {
      delete card.element.dataset.pageSpotActive; delete card.element.dataset.pageTilt;
      restore(card.element, card.styles);
    }
  }
  function settle(reveal: Reveal, consume = true) {
    reveal.generation++; reveal.timeline?.kill(); reveal.timeline = null;
    restore(reveal.element, reveal.styles);
    if (consume) seen.add(reveal.element);
    reveal.element.dataset.pageState = seen.has(reveal.element) ? 'done' : 'pending';
  }
  function enter(reveal: Reveal) {
    if (seen.has(reveal.element) || !reveal.visible || !animated() || !displayed(reveal.element)) return;
    seen.add(reveal.element); reveal.element.dataset.pageState = 'play';
    const generation = ++reveal.generation;
    const timeline = gsap.timeline({ onComplete: () => {
      if (disposed || reveal.generation !== generation || !reveals.includes(reveal)) return;
      reveal.timeline = null; restore(reveal.element, reveal.styles); reveal.element.dataset.pageState = 'done';
    } });
    reveal.timeline = timeline;
    timeline.fromTo(reveal.element, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .5, ease: 'expo.out' }, 0);
  }
  function revealFocus() {
    const focusedElement = document.activeElement;
    if (!available() || !(focusedElement instanceof Element)) return;
    // Focus stays on its native action. Settle every containing group so a
    // pending parent cannot conceal a keyboard-focused child or its ring.
    for (const reveal of reveals) if (reveal.element.contains(focusedElement)) settle(reveal);
  }
  function sync() {
    if (disposed) return;
    root.toggleAttribute('data-page-live', animated());
    if (!animated()) resetPointer();
    for (const reveal of reveals) {
      if (reduced || !fine.matches) settle(reveal);
      else if (reveal.timeline && (!available() || !reveal.visible || !displayed(reveal.element))) settle(reveal);
    }
    revealFocus();
    for (const reveal of reveals) enter(reveal);
  }
  function paint() {
    frame = 0;
    if (!animated()) { sync(); return; }
    if (!active || !point) return;
    const visible = active.cards.filter(card => card.visible && displayed(card.element));
    if (!visible.length) return;
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !active.host.contains(hit)) { resetPointer(); return; }
    // SpotlightGroup reads all boxes before any write. This adapter moves only
    // the cover, avoiding transform feedback in the card's local coordinates.
    const plans = visible.map(card => ({ card, box: card.element.getBoundingClientRect() }));
    const hovered = hit.closest<HTMLElement>('[data-page-card]');
    const tilt = plans.find(({ card }) => card.element === hovered);
    if (tilt && (tilt.box.width <= 0 || tilt.box.height <= 0 || point.x < tilt.box.left || point.x > tilt.box.left + tilt.box.width || point.y < tilt.box.top || point.y > tilt.box.top + tilt.box.height)) { resetPointer(); return; }
    for (const { card, box } of plans) {
      card.element.style.setProperty('--page-mx', (point.x - box.left).toFixed(1) + 'px');
      card.element.style.setProperty('--page-my', (point.y - box.top).toFixed(1) + 'px');
      card.element.dataset.pageSpotActive = '';
      if (card === tilt?.card && card.cover) {
        card.element.style.setProperty('--page-px', clamp(-.5, .5, (point.x - box.left) / box.width - .5).toFixed(3));
        card.element.style.setProperty('--page-py', clamp(-.5, .5, (point.y - box.top) / box.height - .5).toFixed(3));
        card.element.dataset.pageTilt = '';
      } else {
        delete card.element.dataset.pageTilt;
        for (const property of ['--page-px', '--page-py']) {
          const saved = card.styles.get(property)!;
          if (saved.value) card.element.style.setProperty(property, saved.value, saved.priority); else card.element.style.removeProperty(property);
        }
      }
    }
  }
  function schedule() { if (!frame && point && animated()) frame = requestAnimationFrame(paint); }
  const observer = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const entry of entries) {
      const card = cards.find(item => item.element === entry.target);
      if (card) {
        card.visible = entry.isIntersecting;
        card.element.toggleAttribute('data-page-visible', card.visible);
        if (!card.visible && active?.cards.includes(card)) resetPointer();
      }
      const reveal = reveals.find(item => item.element === entry.target);
      if (reveal) reveal.visible = entry.isIntersecting && entry.intersectionRatio >= .2;
    }
    sync(); schedule();
  }, { threshold: [0, .2], rootMargin: '0px 0px -40px 0px' });

  function clearContent() {
    resetPointer(); observer.disconnect();
    for (const reveal of reveals) { settle(reveal, !!reveal.timeline || seen.has(reveal.element)); delete reveal.element.dataset.pageState; }
    for (const card of cards) { delete card.element.dataset.pageCover; delete card.element.dataset.pageVisible; if (card.ownedLight) card.light.remove(); }
    cards = []; groups = []; reveals = [];
  }
  function refresh() {
    if (disposed) return;
    clearContent();
    cards = Array.from(root.querySelectorAll<HTMLElement>('[data-page-card]'), element => {
      let light = element.querySelector<HTMLElement>(':scope > .page-card-light');
      const ownedLight = !light;
      if (!light) { light = document.createElement('span'); light.className = 'page-card-light'; light.setAttribute('aria-hidden', 'true'); element.append(light); }
      const cover = !!element.querySelector('.post-media img,.feature-media img');
      element.toggleAttribute('data-page-cover', cover);
      return { element, visible: false, light, ownedLight, cover, styles: remember(element, pointerProperties) };
    });
    for (const card of cards) {
      const host = card.element.closest<HTMLElement>('[data-page-reveal]') ?? card.element;
      let group = groups.find(item => item.host === host);
      if (!group) { group = { host, cards: [] }; groups.push(group); }
      group.cards.push(card); observer.observe(card.element);
    }
    reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-page-reveal]'), element => {
      element.dataset.pageState = seen.has(element) ? 'done' : 'pending'; observer.observe(element);
      return { element, visible: false, timeline: null, generation: 0, styles: remember(element, ['transform', 'opacity']) };
    });
    sync();
  }

  listen<PointerEvent>(root, 'pointermove', event => {
    if (event.pointerType !== 'mouse' || !animated()) return;
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest<HTMLElement>('[data-page-card]');
    const next = groups.find(group => card ? group.cards.some(item => item.element === card) : group.host.contains(target)) ?? null;
    if (next !== active) resetPointer();
    active = next;
    if (active) { point = { x: event.clientX, y: event.clientY }; schedule(); }
  });
  listen<Event>(root, 'pointerleave', resetPointer);
  listen<Event>(root, 'pointercancel', resetPointer);
  listen<FocusEvent>(root, 'focusin', revealFocus);
  listen<Event>(root, 'page:content', refresh);
  listen<Event>(window, 'scroll', resetPointer);
  listen<Event>(window, 'resize', resetPointer);
  listen<Event>(window, 'blur', () => { focused = false; sync(); });
  listen<Event>(window, 'focus', () => { focused = true; sync(); });
  listen<Event>(document, 'visibilitychange', sync);
  listen<Event>(motion, 'change', () => { reduced = motion.matches; sync(); });
  listen<Event>(fine, 'change', sync);
  const visibility = new MutationObserver(() => {
    if (!available() || cards.some(card => card.element.hasAttribute('data-page-spot-active') && !displayed(card.element))) resetPointer();
    sync();
  });
  visibility.observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden'] });
  refresh();
  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; visibility.disconnect(); cleanups.forEach(cleanup => cleanup()); clearContent(); root.removeAttribute('data-page-live');
    },
  };
}
