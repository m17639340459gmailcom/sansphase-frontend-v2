/**
 * Native DOM adaptation of Dingxin Tao's MIT Facts / FactValue / Odometer and
 * SpotlightGroup at c73bc4966f0ba808b978e22eccf5a063fc649751.
 * Source: src/components/home/facts.tsx, home/hero/fact-value.tsx,
 * home/hero/facts.module.css and fx/{odometer,spotlight}.tsx.
 * Copyright (c) 2026 Dingxin Tao. License: ../vendor/tdx/LICENSE.
 * The existing GSAP replaces React FxTrigger and the source CSS counter clock;
 * the source's 70 ms cell cadence, 20-row digit columns, full turn, 1.4 s
 * duration and shared local light coordinates are preserved. The four values
 * are the site's verified public snapshot, not the upstream author's facts.
 */
import gsap from 'gsap';
import { numbers } from './content';
import { t } from './i18n';
import { esc, pad2 } from './util';

type FactsOptions = { reduced: boolean };
const rows = Array.from({ length: 20 }, (_, index) => `<span>${index % 10}</span>`).join('');

/** FactValue's reading-order composition: digit runs roll, punctuation rises. */
function valueMarkup(value: string): string {
  let clock = 0;
  const visual = value.split(/(\d+)/).map(run => {
    if (!run) return '';
    if (!/^\d+$/.test(run)) {
      const glyphs = Array.from(run).map((glyph, index) => `<span class="odo-static" data-delay="${clock + index * 0.035}">${esc(glyph)}</span>`).join('');
      clock += Array.from(run).length * 0.035;
      return glyphs;
    }
    const digits = Array.from(run).map((digit, column) => `<span class="odo-digit" style="--n:${10 + Number(digit)};--i:${column}"><span class="odo-placeholder">${digit}</span><span class="odo-column" data-digit="${digit}" data-delay="${clock + column * 0.08}">${rows}</span></span>`).join('');
    clock += 0.2;
    return digits;
  }).join('');
  return `<span class="visually-hidden">${esc(value)}</span><span class="odometer" aria-hidden="true">${visual}</span>`;
}

export function mountFacts(root: HTMLElement, options: FactsOptions) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let reduced = options.reduced || motion.matches;
  let enabled = true;
  let windowFocused = true;
  let inView = false;
  const played = new Set<number>();
  const visible = new Set<number>();
  let disposed = false;
  let generation = 0;
  const timelines = new Map<number, { timeline: gsap.core.Timeline; generation: number }>();
  let observer: IntersectionObserver | null = null;
  let frame = 0;
  let pointer: { x: number; y: number } | null = null;
  let cells: HTMLElement[] = [];
  const cleanups: (() => void)[] = [];
  const query = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));
  const available = () => !disposed && enabled && windowFocused && !document.hidden;
  const tracking = () => available() && inView && fine.matches && !reduced;

  function listen<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void) {
    target.addEventListener(type, handler as EventListener);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener));
  }
  function resetLight() {
    cancelAnimationFrame(frame); frame = 0; pointer = null;
    delete root.dataset.spotActive;
    root.style.removeProperty('--facts-x'); root.style.removeProperty('--facts-y');
    [...cells, ...query('.fact-index-lit')].forEach(element => {
      element.style.removeProperty('--spot-x'); element.style.removeProperty('--spot-y');
    });
  }
  function finalCell(index: number) {
    const cell = cells[index]; if (!cell) return;
    gsap.set(cell.querySelectorAll('.fact-label,.fact-index-char,.odo-static'), { clearProps: 'transform,opacity' });
    cell.querySelectorAll<HTMLElement>('.odo-column').forEach(column => gsap.set(column, { yPercent: -(10 + Number(column.dataset.digit)) * 5 }));
    cell.dataset.fxState = played.has(index) ? 'done' : 'idle';
  }
  function finalVisuals() { cells.forEach((_, index) => finalCell(index)); }
  function stopEntrance(index: number) {
    timelines.get(index)?.timeline.kill(); timelines.delete(index);
    finalCell(index);
  }
  function stopEntrances() {
    generation++;
    for (const index of timelines.keys()) stopEntrance(index);
    finalVisuals();
  }
  function playEntrance(index: number) {
    if (played.has(index) || !available() || !visible.has(index)) return;
    played.add(index);
    if (reduced) { finalCell(index); return; }
    const cell = cells[index];
    const current = ++generation;
    cell.dataset.fxState = 'play';
    const timeline = gsap.timeline({ onComplete: () => {
      if (disposed || timelines.get(index)?.generation !== current) return;
      timelines.delete(index); finalCell(index);
    } });
    timelines.set(index, { timeline, generation: current });
    const delay = index * 0.07;
    for (const copy of cell.querySelectorAll<HTMLElement>('.fact-index-base,.fact-index-lit')) {
      timeline.fromTo(copy.querySelectorAll('.fact-index-char'), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' }, delay);
    }
    timeline.fromTo(cell.querySelector('.fact-label'), { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', clearProps: 'transform,opacity' }, delay + 0.35);
    cell.querySelectorAll<HTMLElement>('.odo-column').forEach(column => {
      timeline.fromTo(column, { yPercent: 0 }, { yPercent: -(10 + Number(column.dataset.digit)) * 5, duration: 1.4, ease: 'expo.out' }, delay + 0.12 + Number(column.dataset.delay));
    });
    cell.querySelectorAll<HTMLElement>('.odo-static').forEach(glyph => {
      timeline.fromTo(glyph, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', clearProps: 'transform,opacity' }, delay + 0.12 + Number(glyph.dataset.delay));
    });
  }
  function sync() {
    if (disposed) return;
    root.dataset.active = String(tracking());
    root.dataset.reduced = String(reduced);
    if (!tracking()) resetLight();
    if (!available() || reduced) stopEntrances();
    else for (const index of timelines.keys()) if (!visible.has(index)) stopEntrance(index);
    cells.forEach((_, index) => playEntrance(index));
  }
  function refresh() {
    if (disposed) return;
    resetLight(); stopEntrances(); visible.clear();
    const entries = [
      { value: pad2(numbers.posts), key: 'numbers.posts' },
      { value: pad2(numbers.tags), key: 'numbers.tags' },
      { value: pad2(numbers.sections), key: 'numbers.sections' },
      { value: numbers.latest, key: 'numbers.latest' },
    ];
    root.innerHTML = entries.map((entry, index) => {
      const glyphs = Array.from(pad2(index + 1)).map(glyph => `<span class="fact-index-char">${glyph}</span>`).join('');
      return `<div class="fact" data-fx-state="${played.has(index) ? 'done' : 'idle'}" style="--delay:${index * 0.07}s"><span class="fact-sweep" aria-hidden="true"></span><span class="fact-index" aria-hidden="true"><span class="fact-index-base">${glyphs}</span><span class="fact-index-lit">${glyphs}</span></span><div class="fact-body"><div class="fact-value">${valueMarkup(entry.value)}</div><span class="fact-label">${esc(t(entry.key))}</span></div></div>`;
    }).join('');
    cells = query('.fact'); finalVisuals(); sync();
    if (observer) { observer.disconnect(); observer.observe(root); cells.forEach(cell => observer!.observe(cell)); }
  }
  function paint() {
    frame = 0;
    if (!tracking() || !pointer) return;
    const position = pointer;
    // Read every box before writing any style; the numeral mask uses its own
    // position rather than inheriting the wider cell's coordinate origin.
    const rootBox = root.getBoundingClientRect();
    const cellBoxes = cells.map(cell => cell.getBoundingClientRect());
    const indices = cells.map(cell => cell.querySelector<HTMLElement>('.fact-index')!);
    const indexBoxes = indices.map(index => index.getBoundingClientRect());
    root.style.setProperty('--facts-x', `${(position.x - rootBox.left).toFixed(1)}px`);
    root.style.setProperty('--facts-y', `${(position.y - rootBox.top).toFixed(1)}px`);
    cells.forEach((cell, index) => {
      cell.style.setProperty('--spot-x', `${(position.x - cellBoxes[index].left).toFixed(1)}px`);
      cell.style.setProperty('--spot-y', `${(position.y - cellBoxes[index].top).toFixed(1)}px`);
      const lit = cell.querySelector<HTMLElement>('.fact-index-lit')!;
      lit.style.setProperty('--spot-x', `${(position.x - indexBoxes[index].left).toFixed(1)}px`);
      lit.style.setProperty('--spot-y', `${(position.y - indexBoxes[index].top).toFixed(1)}px`);
    });
    root.dataset.spotActive = 'true';
  }
  function schedule() { if (!frame && pointer && tracking()) frame = requestAnimationFrame(paint); }
  function onMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !tracking()) return;
    pointer = { x: event.clientX, y: event.clientY }; schedule();
  }

  refresh();
  listen<PointerEvent>(root, 'pointermove', onMove);
  listen<PointerEvent>(root, 'pointerleave', resetLight);
  listen<Event>(window, 'scroll', schedule);
  listen<Event>(window, 'resize', schedule);
  listen<Event>(window, 'blur', () => { windowFocused = false; sync(); });
  listen<Event>(window, 'focus', () => { windowFocused = true; sync(); });
  listen<Event>(document, 'visibilitychange', sync);
  listen<Event>(motion, 'change', () => { reduced = motion.matches; sync(); });
  listen<Event>(fine, 'change', sync);
  observer = new IntersectionObserver(entries => {
    if (disposed) return;
    const rootEntry = entries.find(item => item.target === root);
    if (rootEntry) { inView = rootEntry.isIntersecting; if (!inView) visible.clear(); }
    for (const entry of entries) {
      const index = cells.indexOf(entry.target as HTMLElement); if (index < 0) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.2) visible.add(index); else visible.delete(index);
    }
    sync();
  }, { threshold: [0, 0.2] });
  observer.observe(root); cells.forEach(cell => observer!.observe(cell));
  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; observer?.disconnect(); cleanups.forEach(cleanup => cleanup());
      resetLight(); stopEntrances(); root.dataset.active = 'false';
    },
  };
}
