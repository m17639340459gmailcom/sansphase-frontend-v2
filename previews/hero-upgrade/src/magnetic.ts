/**
 * Lifecycle adapter for the preview's existing magnetic buttons. The TDX-based
 * preview keeps its entry-point fill and 0.22 / 0.30 pointer pull; the existing
 * CSS translate transition owns interpolation. No new effect or input surface.
 */
type MagneticOptions = { reduced: boolean };
type MagneticController = { refresh(): void; setActive(value: boolean): void; dispose(): void };
type Box = { left: number; top: number; width: number; height: number };
type SavedProperty = { name: string; value: string; priority: string };
type Target = { element: HTMLElement; box: Box; saved: SavedProperty[] };

const SELECTOR = '[data-magnetic]';
const UNAVAILABLE = '[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"], :disabled';
const PROPERTIES = ['translate', '--bx', '--by'];
const limit = (value: number, maximum: number) => Math.max(-maximum, Math.min(maximum, value));

export function mountMagnetic(root: HTMLElement, options: MagneticOptions): MagneticController {
  const fine = matchMedia('(pointer: fine)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = options.reduced || motion.matches;
  let enabled = true;
  let focused = document.hasFocus();
  let disposed = false;
  let target: Target | null = null;
  const cleanups: (() => void)[] = [];
  const available = () => !disposed && enabled && focused && !document.hidden && fine.matches && !reduced;

  function listen<T extends Event>(node: EventTarget, type: string, handler: (event: T) => void, capture = false) {
    node.addEventListener(type, handler as EventListener, { passive: true, capture });
    cleanups.push(() => node.removeEventListener(type, handler as EventListener, capture));
  }

  function reset() {
    if (!target) return;
    const previous = target;
    target = null;
    previous.saved.forEach(property => {
      if (property.value) previous.element.style.setProperty(property.name, property.value, property.priority);
      else previous.element.style.removeProperty(property.name);
    });
  }

  function eligible(element: HTMLElement | null): element is HTMLElement {
    return Boolean(element?.isConnected && root.contains(element) && element.matches(SELECTOR) && !element.closest(UNAVAILABLE));
  }

  function begin(element: HTMLElement): Target | null {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    // Individual translate is the only motion owned by these existing buttons.
    // CSS may still be settling after a leave; subtract that rendered offset
    // once rather than reading an already-moved rectangle on every mouse move.
    const visual = window.getComputedStyle(element).translate.trim().split(/\s+/);
    const x = visual[0]?.endsWith('px') ? Number.parseFloat(visual[0]) : 0;
    const y = visual[1]?.endsWith('px') ? Number.parseFloat(visual[1]) : 0;
    return {
      element,
      box: { left: rect.left - (Number.isFinite(x) ? x : 0), top: rect.top - (Number.isFinite(y) ? y : 0), width: rect.width, height: rect.height },
      saved: PROPERTIES.map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) })),
    };
  }

  function onMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    if (!available()) { reset(); return; }
    const captured = event.target instanceof Element && event.target.hasPointerCapture?.(event.pointerId);
    const hit = captured ? document.elementFromPoint(event.clientX, event.clientY) : event.target;
    const element = hit instanceof Element ? hit.closest<HTMLElement>(SELECTOR) : null;
    if (!eligible(element)) { reset(); return; }
    if (target?.element !== element) { reset(); target = begin(element); }
    if (!target) return;
    const { box } = target;
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    // Captured/stale targets cannot pull a button after leaving its layout box.
    if (x < 0 || y < 0 || x > box.width || y > box.height) { reset(); return; }
    element.style.setProperty('--bx', `${Number(x.toFixed(1))}px`);
    element.style.setProperty('--by', `${Number(y.toFixed(1))}px`);
    element.style.translate = `${limit((x - box.width / 2) * 0.22, 14).toFixed(1)}px ${limit((y - box.height / 2) * 0.30, 8).toFixed(1)}px`;
  }

  function onOut(event: PointerEvent) {
    if (!target) return;
    if (!(event.relatedTarget instanceof Node) || !target.element.contains(event.relatedTarget)) reset();
  }
  const onBlur = () => { focused = false; reset(); };
  const onFocus = () => { focused = true; };
  const onMotion = () => { reduced = motion.matches; reset(); };
  const onPreference = () => reset();
  const observer = new MutationObserver(() => {
    if (target && !eligible(target.element)) reset();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'aria-disabled', 'disabled', 'inert', 'data-magnetic'] });
  listen<PointerEvent>(root, 'pointermove', onMove);
  listen<PointerEvent>(root, 'pointerout', onOut);
  listen<PointerEvent>(root, 'pointerleave', reset);
  listen<PointerEvent>(window, 'pointercancel', reset);
  // Scrolling invalidates both the layout rectangle and the original entry.
  // A new mouse move acquires a current target; no stale pointer is replayed.
  listen<Event>(window, 'scroll', reset, true);
  listen<Event>(window, 'resize', reset);
  listen<Event>(window, 'blur', onBlur);
  listen<Event>(window, 'focus', onFocus);
  listen<Event>(document, 'visibilitychange', reset);
  listen<KeyboardEvent>(document, 'keydown', reset);
  listen<Event>(fine, 'change', onPreference);
  listen<Event>(motion, 'change', onMotion);

  return {
    refresh() { if (!disposed) reset(); },
    setActive(value) { if (disposed || enabled === value) return; enabled = value; if (!value) reset(); },
    dispose() {
      if (disposed) return;
      disposed = true; reset(); observer.disconnect(); cleanups.forEach(cleanup => cleanup());
    },
  };
}
