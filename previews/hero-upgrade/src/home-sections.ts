/**
 * Native DOM adapter of TDX SpotlightGroup / PostCardFrame / LatestPosts and
 * ProjectIndexList at c73bc4966f0ba808b978e22eccf5a063fc649751 (MIT).
 * Copyright (c) 2026 Dingxin Tao. See vendor/tdx/LICENSE and SOURCES.json.
 * Keeps the existing community, publishing dates, three posts and six routes.
 * Date inspection and lifecycle gates are integration code, not new content.
 */
import { clamp } from './util';

type Group = { host: HTMLElement; targets: HTMLElement[]; inView: boolean };
type Point = { x: number; y: number };
export function mountHomeSections(root: HTMLElement, options: { reduced: boolean }) {
  const fine = matchMedia('(pointer: fine)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = options.reduced || motion.matches;
  let enabled = true, focused = document.hasFocus(), disposed = false, frame = 0;
  let groups: Group[] = [], active: Group | null = null, point: Point | null = null;
  let tilted: HTMLElement | null = null, restingBox: DOMRect | null = null;
  let marquee: HTMLElement | null = null, marqueePoint: Point | null = null;
  let days: HTMLButtonElement[] = [], readout: HTMLOutputElement | null = null;
  const cleanups: (() => void)[] = [], groupCleanups: (() => void)[] = [], seen = new Set<string>(), visible = new Set<HTMLElement>();
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
  const available = () => !disposed && enabled && focused && !document.hidden;
  const tracking = () => available() && fine.matches && !reduced;
  const observer = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const entry of entries) {
      if (!root.contains(entry.target)) continue;
      const group = groups.find(item => item.host === entry.target);
      if (group) { group.inView = entry.isIntersecting; if (!group.inView && active === group) resetPointer(); }
      const element = entry.target as HTMLElement;
      if (entry.isIntersecting && entry.intersectionRatio >= .15) visible.add(element); else visible.delete(element);
      if (visible.has(element) && element.dataset.tailKey && available()) {
        seen.add(element.dataset.tailKey); element.dataset.tailEntered = '';
      }
    }
    if (active?.inView && point) schedule();
  }, { threshold: [0, .15] });

  function listen<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void) {
    target.addEventListener(type, handler as EventListener);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener));
  }
  function clearTilt() {
    if (tilted) {
      delete tilted.dataset.tilt;
      tilted.style.removeProperty('--px'); tilted.style.removeProperty('--py');
    }
    tilted = null; restingBox = null;
  }
  function resetPointer() {
    cancelAnimationFrame(frame); frame = 0; active = null; point = null; clearTilt();
    for (const group of groups) {
      delete group.host.dataset.homeSpotActive;
      for (const target of group.targets) { target.style.removeProperty('--mx'); target.style.removeProperty('--my'); }
    }
    highlightRow(focusedRow());
  }
  function resetMarquee() {
    marqueePoint = null;
    query('#marquee-giant .giant-word,#marquee-giant .giant-word .f').forEach(word => { word.style.removeProperty('--mx'); word.style.removeProperty('--my'); });
  }
  function reset() { resetPointer(); resetMarquee(); if (readout) { readout.textContent = ''; readout.hidden = true; } }
  function sync() {
    if (disposed) return;
    root.toggleAttribute('data-tail-live', available() && !reduced);
    if (available()) for (const element of visible) if (element.dataset.tailKey) {
      seen.add(element.dataset.tailKey); element.dataset.tailEntered = '';
    }
    if (!tracking()) reset();
    restoreFocusFeedback();
  }
  function paint() {
    frame = 0;
    if (!tracking() || !active || !point || !active.inView) return;
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !active.host.contains(hit)) { resetPointer(); return; }
    const boxes = active.targets.map(target => target.getBoundingClientRect());
    active.targets.forEach((target,index) => {
      target.style.setProperty('--mx', (point!.x - boxes[index].left).toFixed(1) + 'px');
      target.style.setProperty('--my', (point!.y - boxes[index].top).toFixed(1) + 'px');
    });
    active.host.dataset.homeSpotActive = '';
    const link = hit.closest<HTMLElement>('#posts a');
    if (link !== tilted) { clearTilt(); if (link) { tilted = link; restingBox = link.getBoundingClientRect(); } }
    if (tilted && restingBox && restingBox.width > 0 && restingBox.height > 0) {
      tilted.style.setProperty('--px', clamp(-.5,.5,(point.x-restingBox.left)/restingBox.width-.5).toFixed(3));
      tilted.style.setProperty('--py', clamp(-.5,.5,(point.y-restingBox.top)/restingBox.height-.5).toFixed(3));
      tilted.dataset.tilt = '';
    }
    highlightRow(hit.closest<HTMLElement>('#archive-list a') ?? focusedRow());
  }
  function schedule() { if (!frame && point && tracking()) frame = requestAnimationFrame(paint); }
  function highlightRow(row: HTMLElement | null) {
    query('#archive-map i').forEach((tile,index) => tile.classList.toggle('is-hot', row?.dataset.i === String(index)));
  }
  function focusedRow() {
    const element = document.activeElement;
    return available() && element instanceof Element && root.contains(element) ? element.closest<HTMLElement>('#archive-list a') : null;
  }
  function restoreFocusFeedback() {
    if (!available()) return;
    highlightRow(focusedRow()); showDay(null);
  }
  function showDay(day: HTMLButtonElement | null, fallback = true) {
    if (!readout) return;
    const selected = day ?? (fallback && document.activeElement instanceof HTMLButtonElement && days.includes(document.activeElement) ? document.activeElement : null);
    readout.textContent = selected?.getAttribute('aria-label') ?? '';
    readout.hidden = !selected;
  }
  function daySelect(day: HTMLButtonElement) { for (const item of days) item.tabIndex = item === day ? 0 : -1; showDay(day); }
  function refresh() {
    if (disposed) return;
    reset(); observer.disconnect(); visible.clear(); groupCleanups.splice(0).forEach(fn => fn());
    query('#posts a').forEach(link => {
      link.classList.add('home-post-frame'); link.dataset.cursor = 'read';
      if (!link.querySelector('.home-post-glare')) {
        const glare = document.createElement('span'); glare.className = 'home-post-glare'; glare.setAttribute('aria-hidden','true'); link.append(glare);
      }
    });
    query('#archive-list a').forEach(link => { link.dataset.cursor = 'open'; });
    const grid = root.querySelector<HTMLElement>('#log-grid');
    if (grid) {
      const oldIndex = days.findIndex(day => day.tabIndex === 0);
      grid.removeAttribute('tabindex');
      const currentDays = query<HTMLElement>('.log-day');
      const selectedIndex = clamp(0, Math.max(0, currentDays.length - 1), Math.max(0, oldIndex));
      currentDays.forEach((day,index) => {
        const button = day instanceof HTMLButtonElement ? day : document.createElement('button');
        if (button !== day) {
          button.className = day.className; button.style.cssText = day.style.cssText;
          button.type = 'button'; button.setAttribute('aria-label',day.title); day.replaceWith(button);
        }
        button.tabIndex = index === selectedIndex ? 0 : -1;
      });
      days = query<HTMLButtonElement>('.log-day');
      if (!grid.parentElement?.querySelector('.log-readout')) {
        readout = document.createElement('output'); readout.className = 'log-readout'; readout.setAttribute('aria-hidden','true'); readout.hidden = true; grid.after(readout);
      } else readout = grid.parentElement.querySelector<HTMLOutputElement>('.log-readout');
    } else { days = []; readout = null; }
    groups = [['.community-grid','.club,.board'],['#log','#log'],['#posts','#posts a'],['.archive','.archive-side,#archive-list a']].flatMap(([selector,targets]) => {
      const host = root.querySelector<HTMLElement>(selector);
      return host ? [{ host, targets: query(targets), inView: false }] : [];
    });
    query('.club,.board,#log,#posts a,.archive-side').forEach(target => target.classList.add('home-spot-target'));
    marquee = root.querySelector('#marquee-giant');
    groups.forEach(group => {
      observer.observe(group.host);
      const leave = () => { if (active === group) resetPointer(); showDay(null); };
      group.host.addEventListener('pointerleave',leave);
      groupCleanups.push(() => group.host.removeEventListener('pointerleave',leave));
    });
    query('.club,.board,#log,#posts .post,.archive').forEach((element,index) => {
      element.classList.add('home-tail-reveal'); element.dataset.tailKey = String(index);
      element.style.setProperty('--tail-delay', ((element.matches('#posts .post') ? index % 3 : index % 5) * .12).toFixed(2) + 's');
      element.toggleAttribute('data-tail-entered', seen.has(String(index)));
      observer.observe(element);
    });
    sync();
  }
  listen<PointerEvent>(root,'pointermove',event => {
    if (event.pointerType !== 'mouse' || !available()) return;
    const target = event.target instanceof Element ? event.target : null;
    showDay(target?.closest<HTMLButtonElement>('.log-day') ?? null);
    if (!tracking()) return;
    if (marquee?.contains(target)) marqueePoint = {x:event.clientX,y:event.clientY}; else resetMarquee();
    const next = groups.find(group => group.host.contains(target)) ?? null;
    if (next !== active) resetPointer();
    active = next;
    if (active) { point = {x:event.clientX,y:event.clientY}; schedule(); }
  });
  const releasePointer = () => { reset(); restoreFocusFeedback(); };
  listen<Event>(root,'pointerleave',releasePointer);
  listen<Event>(root,'pointercancel',releasePointer);
  listen<FocusEvent>(root,'focusin',event => {
    if (!available()) return;
    const target = event.target instanceof Element ? event.target : null;
    highlightRow(target?.closest('#archive-list a') ?? null);
    const day = target?.closest<HTMLButtonElement>('.log-day'); if (day) daySelect(day);
  });
  listen<FocusEvent>(root,'focusout',event => {
    if (!available()) return;
    const target = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (!target?.closest('#archive-list')) highlightRow(null);
    if (!target?.closest('#log-grid')) showDay(null, false);
  });
  listen<KeyboardEvent>(root,'keydown',event => {
    if (!available() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = days.indexOf(event.target as HTMLButtonElement); if (index < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length-1 :
      event.key === 'ArrowRight' ? index+7 : event.key === 'ArrowLeft' ? index-7 :
      event.key === 'ArrowDown' ? index+1 : event.key === 'ArrowUp' ? index-1 : null;
    if (next === null) return;
    event.preventDefault(); const day = days[clamp(0,days.length-1,next)]; daySelect(day); day.focus();
  });
  listen<MouseEvent>(root,'click',event => { if (!available()) return; const day = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.log-day') : null; if (day) daySelect(day); });
  const onLayout = () => { reset(); restoreFocusFeedback(); };
  listen<Event>(window,'scroll',onLayout);
  listen<Event>(window,'resize',onLayout);
  listen<Event>(window,'blur',() => { focused = false; reset(); sync(); });
  listen<Event>(window,'focus',() => { focused = true; sync(); });
  listen<Event>(document,'visibilitychange',sync);
  listen<Event>(fine,'change',sync);
  listen<Event>(motion,'change',() => { reduced = motion.matches; sync(); });
  refresh();
  return {
    refresh,
    tick() {
      if (!tracking() || !marquee || !marqueePoint) return;
      const hit = document.elementFromPoint(marqueePoint.x,marqueePoint.y);
      if (!hit || !marquee.contains(hit)) { resetMarquee(); return; }
      // The colored mask is offset inside its word (and may change with CSS).
      // Measure/write on that layer itself so its local origin follows reality.
      const words = query('#marquee-giant .giant-word .f'), boxes = words.map(word => word.getBoundingClientRect());
      words.forEach((word,index) => {
        word.style.setProperty('--mx',(marqueePoint!.x-boxes[index].left).toFixed(1)+'px');
        word.style.setProperty('--my',(marqueePoint!.y-boxes[index].top).toFixed(1)+'px');
      });
    },
    setActive(value:boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    dispose() { if (disposed) return; disposed = true; reset(); observer.disconnect(); cleanups.forEach(fn => fn()); groupCleanups.splice(0).forEach(fn => fn()); root.removeAttribute('data-tail-live'); }
  };
}
