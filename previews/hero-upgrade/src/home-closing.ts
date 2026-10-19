/**
 * Native-DOM integration of Dingxin Tao's MIT ContactBanner / BorderBeam /
 * Parallax / SpotlightGroup / FooterWordmark at c73bc4966f0ba808b978e22eccf5a063fc649751.
 * Source paths and byte hashes: SOURCES.json; copyright (c) 2026 Dingxin Tao.
 * License: ../vendor/tdx/LICENSE. Existing GSAP supplies the source's letter
 * entrance and Reveal's .5s / 16px fade-up; the original services, destinations,
 * clock and navigation are owned
 * by main.ts and are deliberately never replaced here.
 */
import gsap from 'gsap';

type ClosingOptions = { reduced: boolean };
type Point = { x: number; y: number };
type Light = { host: HTMLElement; target: HTMLElement; visible: boolean; pointer: Point | null };

export function mountHomeClosing(banner: HTMLElement, footer: HTMLElement, options: ClosingOptions) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let reduced = options.reduced || motion.matches;
  let enabled = true;
  let focused = document.hasFocus();
  let disposed = false;
  let frame = 0;
  let wordmarkVisible = false;
  let wordmarkPlayed = false;
  let bannerReady = false;
  let bannerPlayed = false;
  let bannerEntry: gsap.core.Timeline | null = null;
  let bannerGeneration = 0;
  let entry: gsap.core.Timeline | null = null;
  let generation = 0;
  let parallaxY = 0;
  let parallaxOrigin = 0;
  const wordmark = footer.querySelector<HTMLElement>('#wordmark');
  const base = wordmark?.querySelector<HTMLElement>('.wordmark-base');
  const lit = wordmark?.querySelector<HTMLElement>('.wordmark-lit');
  const artwork = banner.querySelector<HTMLElement>('.banner-art');
  const lights: Light[] = [
    { host: banner, target: banner, visible: false, pointer: null },
    // The gradient belongs to the inset fill layer, not its padded wordmark
    // parent; the source SpotlightGroup also measures the lit layer itself.
    { host: footer, target: lit ?? wordmark ?? footer, visible: false, pointer: null },
  ];
  const cleanups: (() => void)[] = [];
  const available = () => !disposed && enabled && focused && !document.hidden;
  const displayed = (host: HTMLElement) => !host.closest('[hidden],[inert]');
  const tracking = (light: Light) => available() && fine.matches && !reduced && light.visible && displayed(light.host);
  const characters = () => base?.querySelectorAll<HTMLElement>('.closing-wordmark-char') ?? [];

  function listen<T extends Event>(target: EventTarget, type: string, callback: (event: T) => void) {
    target.addEventListener(type, callback as EventListener);
    cleanups.push(() => target.removeEventListener(type, callback as EventListener));
  }
  function decoration(host: HTMLElement, className: string) {
    let element = host.querySelector<HTMLElement>(`:scope > .${className}`);
    if (!element) {
      element = document.createElement('span'); element.className = className;
      element.setAttribute('aria-hidden', 'true'); host.append(element);
    }
    return element;
  }
  function prepare() {
    decoration(banner, 'closing-glow'); decoration(banner, 'closing-beam');
    if (!wordmark || !base) return;
    const text = base.textContent ?? '';
    const probe = decoration(wordmark, 'closing-wordmark-probe');
    const sweep = decoration(wordmark, 'closing-wordmark-sweep');
    probe.textContent = text; sweep.textContent = text;
    if (lit) lit.textContent = text;
    if (!base.querySelector('.closing-wordmark-char')) {
      base.replaceChildren(...Array.from(text, glyph => {
        const unit = document.createElement('span'); unit.className = 'closing-wordmark-char'; unit.textContent = glyph; return unit;
      }));
    }
  }
  function fitWordmark() {
    if (disposed || !wordmark) return;
    const probe = wordmark.querySelector<HTMLElement>('.closing-wordmark-probe');
    if (!probe) return;
    const style = window.getComputedStyle(wordmark);
    const width = wordmark.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const natural = probe.getBoundingClientRect().width;
    if (width <= 0 || natural <= 0) return;
    const size = width / natural * 100;
    wordmark.style.setProperty('--wm-size', `${size}px`);
    // The probe is unsplit while the visible text consists of inline glyphs.
    // Verify their actual envelope after applying the probe's scale, so font
    // fallback/axis rounding cannot leave the final letter beyond the frame.
    const units = Array.from(characters());
    if (!units.length) return;
    const first = units[0].getBoundingClientRect();
    const last = units[units.length - 1].getBoundingClientRect();
    const measured = last.left + last.width - first.left;
    if (measured > width + 0.5) wordmark.style.setProperty('--wm-size', `${size * width / measured}px`);
  }
  function clearLight(light: Light) {
    light.pointer = null;
    delete light.host.dataset.closingSpotActive;
    light.target.style.removeProperty('--mx'); light.target.style.removeProperty('--my');
  }
  function resetDrift() { parallaxY = 0; artwork?.style.setProperty('--closing-y', '0px'); }
  function stopEntrance() {
    generation++; entry?.kill(); entry = null;
    gsap.set(characters(), { clearProps: 'transform,opacity' });
    if (wordmarkPlayed && wordmark) {
      wordmark.dataset.closingState = 'done';
      delete wordmark.dataset.closingSweep;
    }
  }
  function stopBannerEntrance() {
    bannerGeneration++; bannerEntry?.kill(); bannerEntry = null;
    gsap.set(banner, { clearProps: 'transform,opacity' });
    banner.dataset.closingEntrance = bannerPlayed ? 'done' : 'idle';
  }
  function enterBanner() {
    if (bannerPlayed || !bannerReady || !available() || !displayed(banner)) return;
    bannerPlayed = true;
    if (reduced) { banner.dataset.closingEntrance = 'done'; return; }
    banner.dataset.closingEntrance = 'play';
    const current = ++bannerGeneration;
    const timeline = gsap.timeline({ onComplete: () => {
      if (disposed || bannerGeneration !== current) return;
      bannerEntry = null; banner.dataset.closingEntrance = 'done';
      gsap.set(banner, { clearProps: 'transform,opacity' });
    } });
    bannerEntry = timeline;
    timeline.fromTo(banner, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', clearProps: 'transform,opacity' }, 0);
  }
  function enterWordmark() {
    if (!wordmark || !base || wordmarkPlayed || !wordmarkVisible || !available() || !displayed(footer)) return;
    wordmarkPlayed = true;
    if (reduced) { wordmark.dataset.closingState = 'done'; return; }
    wordmark.dataset.closingState = 'play'; wordmark.dataset.closingSweep = 'play';
    const current = ++generation;
    const timeline = gsap.timeline({ onComplete: () => {
      if (disposed || generation !== current) return;
      entry = null; wordmark.dataset.closingState = 'done';
      gsap.set(characters(), { clearProps: 'transform,opacity' });
    } });
    entry = timeline;
    timeline.fromTo(characters(), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.045, ease: 'expo.out', clearProps: 'transform,opacity' }, 0);
  }
  function measureDrift() {
    if (!artwork || disposed) return;
    const rect = artwork.getBoundingClientRect();
    parallaxOrigin = rect.top + window.scrollY - parallaxY + rect.height / 2 - window.innerHeight / 2;
  }
  function paint() {
    frame = 0;
    if (!available()) return;
    const plans = lights.map(light => {
      const point = light.pointer;
      if (!point || !tracking(light)) return { light, point: null, box: null };
      const box = light.host.getBoundingClientRect();
      const hit = document.elementFromPoint(point.x, point.y);
      if (box.width <= 0 || box.height <= 0 || point.x < box.left || point.y < box.top || point.x > box.left + box.width || point.y > box.top + box.height || !hit || !light.host.contains(hit)) return { light, point: null, box: null };
      return { light, point, box: light.target === light.host ? box : light.target.getBoundingClientRect() };
    });
    for (const { light, point, box } of plans) {
      if (!point || !box) { clearLight(light); continue; }
      light.target.style.setProperty('--mx', `${(point.x - box.left).toFixed(1)}px`);
      light.target.style.setProperty('--my', `${(point.y - box.top).toFixed(1)}px`);
      light.host.dataset.closingSpotActive = 'true';
    }
    if (artwork && lights[0].visible && displayed(banner) && !reduced) {
      parallaxY = (window.scrollY - parallaxOrigin) * 0.08;
      artwork.style.setProperty('--closing-y', `${parallaxY.toFixed(2)}px`);
    } else resetDrift();
  }
  function schedule() { if (!disposed && !frame && available()) frame = requestAnimationFrame(paint); }
  function sync() {
    if (disposed) return;
    for (const light of lights) {
      light.host.dataset.closingPaused = String(!available() || reduced || !light.visible || !displayed(light.host));
      light.host.dataset.closingReduced = String(reduced);
      if (!tracking(light)) clearLight(light);
    }
    if (!available() || reduced || !wordmarkVisible) stopEntrance();
    if (!available() || reduced || !bannerReady || !displayed(banner)) stopBannerEntrance();
    if (!available() || reduced || !lights[0].visible || !displayed(banner)) resetDrift();
    if (!available()) { cancelAnimationFrame(frame); frame = 0; }
    enterBanner(); enterWordmark(); schedule();
  }
  function refresh() {
    if (disposed) return;
    cancelAnimationFrame(frame); frame = 0;
    lights.forEach(clearLight); stopEntrance(); stopBannerEntrance(); prepare(); fitWordmark(); measureDrift(); sync();
  }

  prepare(); fitWordmark(); measureDrift();
  for (const light of lights) {
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !tracking(light)) return;
      light.pointer = { x: event.clientX, y: event.clientY }; schedule();
    };
    listen<PointerEvent>(light.host, 'pointerenter', move);
    listen<PointerEvent>(light.host, 'pointermove', move);
    listen<Event>(light.host, 'pointerleave', () => clearLight(light));
  }
  listen<Event>(window, 'scroll', schedule);
  listen<Event>(window, 'resize', () => { fitWordmark(); measureDrift(); schedule(); });
  listen<Event>(window, 'blur', () => { focused = false; sync(); });
  listen<Event>(window, 'focus', () => { focused = true; sync(); });
  listen<Event>(document, 'visibilitychange', sync);
  listen<Event>(motion, 'change', () => { reduced = motion.matches; sync(); });
  listen<Event>(fine, 'change', sync);
  const observer = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const item of entries) {
      for (const light of lights) if (item.target === light.host) light.visible = item.isIntersecting;
      if (item.target === wordmark) wordmarkVisible = item.isIntersecting && item.intersectionRatio >= 0.35;
    }
    sync();
  }, { threshold: [0, 0.35] });
  lights.forEach(light => observer.observe(light.host));
  if (wordmark) observer.observe(wordmark);
  const bannerObserver = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const item of entries) if (item.target === banner) bannerReady = item.isIntersecting && item.intersectionRatio >= 0.2;
    sync();
  }, { threshold: [0, 0.2], rootMargin: '0px 0px -40px 0px' });
  bannerObserver.observe(banner);
  const resize = new ResizeObserver(() => { fitWordmark(); measureDrift(); schedule(); });
  if (wordmark) resize.observe(wordmark);
  resize.observe(document.body);
  document.fonts?.ready.then(() => { if (!disposed) { fitWordmark(); measureDrift(); schedule(); } });
  sync();
  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; observer.disconnect(); bannerObserver.disconnect(); resize.disconnect(); cleanups.forEach(cleanup => cleanup());
      cancelAnimationFrame(frame); frame = 0; lights.forEach(clearLight); resetDrift(); stopEntrance(); stopBannerEntrance();
      lights.forEach(light => { light.host.dataset.closingPaused = 'true'; });
    },
  };
}
