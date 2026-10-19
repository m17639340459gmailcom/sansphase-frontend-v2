/**
 * TDX About's HoloCard / Story / EducationTimeline / Publications, MIT,
 * copyright (c) 2026 Dingxin Tao, fixed c73bc4966f0ba808b978e22eccf5a063fc649751.
 * See vendor/tdx/LICENSE. Existing GSAP/ScrollTrigger replace Motion; the
 * source ±10° tilt, 85/55 reading zone, sticky index and 70/60 timeline remain.
 * This controller owns only data-journal-* nodes. PageExperience owns none of
 * these transforms; the existing blog catalog keeps its own adapter and binding.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp } from './util';
import { mountAmbient } from './ambient';

gsap.registerPlugin(ScrollTrigger);
type SavedStyle = Map<string, { value: string; priority: string }>;
type Entrance = { element: HTMLElement; tween: gsap.core.Tween | null; generation: number };
type Visibility = { visible: boolean; ratio: number };
type Trigger = { value: ScrollTrigger | null };
const properties = ['opacity','transform','clip-path','--journal-rx','--journal-ry','--journal-hx','--journal-hy','--journal-reading','--journal-story-progress','--journal-progress','--journal-index','--journal-hero-progress'];
const attributes = ['data-journal-live','data-journal-pointer','data-journal-inview','data-journal-materialize','data-journal-enter-state','data-journal-reading-live','data-journal-timeline-live','data-journal-reached'];

export function mountJournalExperience(root: HTMLElement, options: { reduced: boolean }) {
  const view = root.ownerDocument.defaultView ?? window;
  const doc = root.ownerDocument;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let reduced = options.reduced || motion.matches, enabled = true, focused = doc.hasFocus(), disposed = false;
  let page: HTMLElement | null = null, feature: HTMLElement | null = null, lead: HTMLElement | null = null;
  let story: HTMLElement | null = null, timeline: HTMLElement | null = null, counter: HTMLElement | null = null, hero: HTMLElement | null = null;
  let viewport: IntersectionObserver | null = null, paragraphs: IntersectionObserver | null = null, size: ResizeObserver | null = null;
  let ambientHost: HTMLElement | null = null, ambient: ReturnType<typeof mountAmbient> | null = null;
  let entrances: Entrance[] = [], milestones: HTMLElement[] = [], stops: number[] = [], generation = 0;
  let paragraphIndex = '0';
  let frame = 0, pointerGeneration = 0, point: { x: number; y: number } | null = null;
  const visible = new Map<HTMLElement, Visibility>(), originals = new Map<HTMLElement, SavedStyle>();
  const seen = new WeakSet<HTMLElement>(), reached = new WeakSet<HTMLElement>(), triggers = new Map<HTMLElement, Trigger>();
  const cleanups: (() => void)[] = [];
  const displayed = (element: HTMLElement) => element.isConnected && root.contains(element) && !element.closest('[hidden],[inert],[aria-hidden="true"]');
  const available = () => !disposed && enabled && focused && !doc.hidden && !!page && displayed(page);
  const animated = () => available() && !reduced && fine.matches && typeof IntersectionObserver !== 'undefined';
  const inView = (element: HTMLElement | null) => !!element && visible.get(element)?.visible === true && displayed(element);

  function listen(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback); cleanups.push(() => target.removeEventListener(type, callback));
  }
  function remember(element: HTMLElement) {
    if (originals.has(element)) return;
    originals.set(element, new Map(properties.map(property => [property, { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }])));
  }
  function restore(element: HTMLElement, selected = properties) {
    const saved = originals.get(element);
    for (const property of selected) {
      const original = saved?.get(property);
      if (original?.value) element.style.setProperty(property, original.value, original.priority); else element.style.removeProperty(property);
    }
    if (!element.getAttribute('style')) element.removeAttribute('style');
  }
  function resetPointer() {
    pointerGeneration++; cancelAnimationFrame(frame); frame = 0; point = null;
    if (feature) { feature.removeAttribute('data-journal-pointer'); restore(feature, ['--journal-rx','--journal-ry','--journal-hx','--journal-hy']); }
  }
  function paint() {
    const current = pointerGeneration;
    frame = requestAnimationFrame(() => {
      if (disposed || current !== pointerGeneration) return;
      frame = 0;
      if (!animated() || !feature || !inView(feature) || !point) { resetPointer(); return; }
      const box = feature.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || point.x < box.left || point.x > box.left + box.width || point.y < box.top || point.y > box.top + box.height) { resetPointer(); return; }
      const x = clamp(0, 1, (point.x - box.left) / box.width), y = clamp(0, 1, (point.y - box.top) / box.height);
      feature.style.setProperty('--journal-rx', `${(-(y - .5) * 20).toFixed(3)}deg`);
      feature.style.setProperty('--journal-ry', `${((x - .5) * 20).toFixed(3)}deg`);
      feature.style.setProperty('--journal-hx', `${(x * 100).toFixed(2)}%`);
      feature.style.setProperty('--journal-hy', `${(y * 100).toFixed(2)}%`);
      feature.setAttribute('data-journal-pointer', '');
    });
  }
  function settle(entrance: Entrance, consume: boolean) {
    entrance.generation++; entrance.tween?.kill(); entrance.tween = null;
    if (consume) seen.add(entrance.element);
    restore(entrance.element, ['opacity','transform','clip-path']);
    entrance.element.removeAttribute('data-journal-materialize');
    entrance.element.dataset.journalEnterState = seen.has(entrance.element) ? 'done' : 'pending';
  }
  function enter(entrance: Entrance) {
    if (seen.has(entrance.element) || entrance.tween || !animated() || !inView(entrance.element) || (visible.get(entrance.element)?.ratio ?? 0) < .2) return;
    seen.add(entrance.element); entrance.element.dataset.journalEnterState = 'play';
    const current = ++entrance.generation, materialize = entrance.element === feature;
    if (materialize) entrance.element.setAttribute('data-journal-materialize', '');
    entrance.tween = gsap.fromTo(entrance.element,
      materialize ? { opacity: 1 } : { opacity: 0, y: 16 },
      { ...(materialize ? { opacity: 1 } : { opacity: 1, y: 0 }), duration: materialize ? 1.85 : .5, ease: 'expo.out', onComplete: () => {
        if (disposed || entrance.generation !== current || !entrances.includes(entrance)) return;
        entrance.tween = null; restore(entrance.element, ['opacity','transform','clip-path']);
        entrance.element.removeAttribute('data-journal-materialize'); entrance.element.dataset.journalEnterState = 'done';
      } });
  }
  function markReached(element: HTMLElement) { reached.add(element); element.setAttribute('data-journal-reached', ''); }
  function focusReveal() {
    const active = doc.activeElement;
    if (!available() || !(active instanceof Element) || !root.contains(active)) return;
    for (const entrance of entrances) if (entrance.element.contains(active)) settle(entrance, true);
    for (const milestone of milestones) if (milestone.contains(active)) markReached(milestone);
  }
  function measure() {
    if (!timeline || !displayed(timeline)) return;
    const box = timeline.getBoundingClientRect();
    stops = milestones.map(element => clamp(0, 1, (element.getBoundingClientRect().top + 52 - box.top) / Math.max(1, box.height)));
  }
  function kill(target: HTMLElement) { triggers.get(target)?.value?.kill(); triggers.delete(target); }
  function scrolling(target: HTMLElement | null, start: string, end: string, update: (progress: number) => void) {
    if (!target) return;
    if (!animated() || !inView(target)) { kill(target); return; }
    if (triggers.has(target)) return;
    const current = generation, record: Trigger = { value: null }; triggers.set(target, record);
    const apply = (self: ScrollTrigger) => {
      if (disposed || generation !== current || triggers.get(target) !== record || !animated() || !inView(target)) return;
      update(clamp(0, 1, Number.isFinite(self.progress) ? self.progress : 1));
    };
    record.value = ScrollTrigger.create({ trigger: target, start, end, scrub: true, onUpdate: apply, onRefresh: self => { if (target === timeline) measure(); apply(self); } });
    apply(record.value);
  }
  function observeParagraphs() {
    paragraphs?.disconnect(); paragraphs = null;
    if (!page || !counter || typeof IntersectionObserver === 'undefined') return;
    const current = generation, height = Math.max(1, view.innerHeight);
    // IO percentage margins resolve against root width. Pixels keep the
    // intended 45–50% reading band tied to viewport height on every resize.
    const observer: IntersectionObserver = new IntersectionObserver(entries => {
      if (disposed || current !== generation || paragraphs !== observer || !counter) return;
      for (const entry of entries) if (entry.isIntersecting && page?.contains(entry.target)) {
        paragraphIndex = (entry.target as HTMLElement).dataset.journalParagraph ?? '0';
      }
      // Overlays can pause painting while IO reports a new paragraph. Retain
      // that state so resuming does not require another intersection change.
      if (animated()) counter.style.setProperty('--journal-index', paragraphIndex);
    }, { rootMargin: `${-height * .45}px 0px ${-height * .5}px 0px` });
    paragraphs = observer;
    page.querySelectorAll('[data-journal-paragraph]').forEach(element => observer.observe(element));
  }
  function sync() {
    if (disposed || !page) { ambient?.setPaused(true); return; }
    const run = animated(); page.toggleAttribute('data-journal-live', run);
    ambient?.setPaused(!run);
    feature?.toggleAttribute('data-journal-inview', run && inView(feature));
    if (!run || !inView(feature)) resetPointer();
    for (const entrance of entrances) {
      if (!run || !inView(entrance.element)) {
        if (entrance.tween || !run) settle(entrance, !!entrance.tween || (!run && inView(entrance.element)));
      } else enter(entrance);
    }
    if (!run) {
      for (const target of [...triggers.keys()]) kill(target);
      lead?.removeAttribute('data-journal-reading-live'); timeline?.removeAttribute('data-journal-timeline-live');
      if (lead) lead.style.setProperty('--journal-reading', '1');
      if (timeline) timeline.style.setProperty('--journal-progress', '1');
      if (hero) hero.style.setProperty('--journal-hero-progress', '0');
      for (const milestone of milestones) if (inView(milestone)) markReached(milestone);
      return;
    }
    counter?.style.setProperty('--journal-index', paragraphIndex);
    lead?.toggleAttribute('data-journal-reading-live', inView(lead));
    timeline?.toggleAttribute('data-journal-timeline-live', inView(timeline));
    scrolling(lead, 'top 85%', 'bottom 55%', value => lead?.style.setProperty('--journal-reading', value.toFixed(4)));
    scrolling(story, 'top 70%', 'bottom 60%', value => story?.style.setProperty('--journal-story-progress', value.toFixed(4)));
    scrolling(hero, 'top top', 'bottom top', value => hero?.style.setProperty('--journal-hero-progress', value.toFixed(4)));
    scrolling(timeline, 'top 70%', 'bottom 60%', value => {
      timeline?.style.setProperty('--journal-progress', value.toFixed(4));
      milestones.forEach((element, index) => { if (value >= stops[index]) markReached(element); });
    });
    focusReveal();
  }
  function clearContent() {
    generation++; resetPointer(); viewport?.disconnect(); paragraphs?.disconnect(); size?.disconnect();
    viewport = null; paragraphs = null; size = null;
    for (const target of [...triggers.keys()]) kill(target);
    for (const entrance of entrances) settle(entrance, !!entrance.tween || seen.has(entrance.element));
    for (const element of originals.keys()) { restore(element); attributes.forEach(attribute => element.removeAttribute(attribute)); }
    originals.clear(); visible.clear(); entrances = []; milestones = []; stops = []; paragraphIndex = '0';
    page = null; feature = null; lead = null; story = null; timeline = null; counter = null; hero = null;
  }
  function refresh() {
    if (disposed) return;
    // Search only replaces Publications rows. Keep a live hero's background
    // instance; language/route replacement owns a new host and releases the old.
    const nextAmbientHost = root.querySelector<HTMLElement>('[data-journal-ambient]');
    if (nextAmbientHost !== ambientHost) {
      ambient?.dispose(); ambient = null; ambientHost = nextAmbientHost;
      if (ambientHost) ambient = mountAmbient(ambientHost);
    }
    clearContent(); page = root.querySelector<HTMLElement>('[data-journal-page]'); if (!page) return;
    feature = page.querySelector('[data-journal-feature]'); lead = page.querySelector('[data-journal-story-lead]'); story = page.querySelector('[data-journal-story]');
    timeline = page.querySelector('[data-journal-timeline]'); counter = page.querySelector('[data-journal-current]'); hero = page.querySelector('[data-journal-hero-copy]');
    entrances = Array.from(page.querySelectorAll<HTMLElement>('[data-journal-enter]'), element => ({ element, tween: null, generation: 0 }));
    milestones = [...page.querySelectorAll<HTMLElement>('[data-journal-milestone]')];
    const targets = new Set([page,feature,lead,story,timeline,counter,hero,...entrances.map(item => item.element),...milestones].filter((element): element is HTMLElement => !!element));
    targets.forEach(element => { remember(element); visible.set(element, { visible: false, ratio: 0 }); });
    for (const entrance of entrances) entrance.element.dataset.journalEnterState = seen.has(entrance.element) ? 'done' : 'pending';
    for (const milestone of milestones) if (reached.has(milestone)) markReached(milestone);
    const current = generation;
    if (typeof IntersectionObserver !== 'undefined') {
      viewport = new IntersectionObserver(entries => {
        if (disposed || current !== generation) return;
        for (const entry of entries) {
          const element = entry.target as HTMLElement; if (!visible.has(element)) continue;
          visible.set(element, { visible: entry.isIntersecting, ratio: entry.intersectionRatio });
          if (milestones.includes(element) && entry.isIntersecting && entry.intersectionRatio >= .9 && available()) markReached(element);
        }
        sync();
      }, { threshold: [0,.2,.9] });
      targets.forEach(element => viewport?.observe(element));
      observeParagraphs();
    }
    if (typeof ResizeObserver !== 'undefined') {
      size = new ResizeObserver(() => { if (disposed || current !== generation || !available()) return; resetPointer(); measure(); for (const record of triggers.values()) record.value?.refresh(); });
      size.observe(page);
    }
    measure(); sync();
  }

  listen(root, 'pointermove', event => {
    const input = event as PointerEvent;
    if (input.pointerType !== 'mouse' || !animated() || !feature || !inView(feature) || !(input.target instanceof Element) || !feature.contains(input.target)) return;
    point = { x: input.clientX, y: input.clientY }; if (!frame) paint();
  });
  listen(root, 'pointerleave', resetPointer); listen(root, 'pointercancel', resetPointer);
  listen(root, 'pointerout', event => {
    const input = event as PointerEvent;
    if (feature && input.target instanceof Element && feature.contains(input.target)
      && (!(input.relatedTarget instanceof Node) || !feature.contains(input.relatedTarget))) resetPointer();
  });
  listen(root, 'focusin', focusReveal); listen(root, 'page:content', refresh);
  listen(view, 'scroll', resetPointer); listen(view, 'resize', () => { resetPointer(); measure(); observeParagraphs(); });
  listen(view, 'blur', () => { focused = false; sync(); }); listen(view, 'focus', () => { focused = true; sync(); });
  listen(doc, 'visibilitychange', sync); listen(motion, 'change', () => { reduced = motion.matches; sync(); }); listen(fine, 'change', sync);
  const visibility = new MutationObserver(sync);
  visibility.observe(root, { attributes: true, subtree: true, attributeFilter: ['hidden','inert','aria-hidden'] });
  for (let parent = root.parentElement; parent; parent = parent.parentElement) visibility.observe(parent, { attributes: true, attributeFilter: ['hidden','inert','aria-hidden'] });
  refresh();
  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    setReduced(value: boolean) { if (disposed || reduced === (value || motion.matches)) return; reduced = value || motion.matches; sync(); },
    dispose() { if (disposed) return; disposed = true; visibility.disconnect(); cleanups.forEach(cleanup => cleanup()); clearContent(); ambient?.dispose(); ambient = null; ambientHost = null; },
  };
}
