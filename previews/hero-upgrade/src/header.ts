/**
 * Native DOM adapter for TDX's use-header-scroll.ts, navbar.tsx and
 * locale-switcher.tsx at c73bc4966f0ba808b978e22eccf5a063fc649751 (MIT).
 * Keeps the source's directional travel and 32/132px top-edge preview gates.
 * Lenis remains the scroll owner; the caller forwards its current position.
 */
import type { Lang } from './content';

type HeaderOptions = {
  reduced: boolean;
  getLanguage(): Lang;
  setLanguage(value: Lang): void;
};

type HeaderController = {
  scroll(y: number): void;
  setMenuOpen(value: boolean): void;
  setReduced(value: boolean): void;
  refreshLanguage(): void;
  dispose(): void;
};

const CONDENSE_AT = 24;
const HIDE_AFTER = 160;
const HIDE_TRAVEL = 14;
const SHOW_TRAVEL = 8;
const PEEK_ENTER = 32;
const PEEK_LEAVE = 132;
const LANGUAGE_BUTTONS = '#lang button[data-l], #menu-lang button[data-l]';

export function mountHeader(root: HTMLElement, options: HeaderOptions): HeaderController {
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('The header must belong to a window.');
  const fine = view.matchMedia('(pointer: fine)');
  const initialDocked = root.classList.contains('is-docked');
  const initialHidden = root.classList.contains('is-hidden');
  let reduced = options.reduced;
  let lastY = Math.max(0, view.scrollY);
  let travel = 0;
  let tucked = false;
  let peek = false;
  let menuOpen = false;
  let focusInside = false;
  let pointerY = 0;
  let frame = 0;
  let disposed = false;
  const cleanups: (() => void)[] = [];

  function listen<T extends Event>(node: EventTarget, type: string, handler: (event: T) => void) {
    node.addEventListener(type, handler as EventListener);
    cleanups.push(() => node.removeEventListener(type, handler as EventListener));
  }

  function paint() {
    root.classList.toggle('is-docked', lastY > CONDENSE_AT);
    root.classList.toggle('is-hidden', tucked && !menuOpen && !focusInside && !peek);
  }

  function cancelPointer() {
    if (frame) view!.cancelAnimationFrame(frame);
    frame = 0;
  }

  function resetPeek() {
    cancelPointer();
    peek = false;
    paint();
  }

  function scroll(y: number) {
    if (disposed || !Number.isFinite(y)) return;
    const next = Math.max(0, y);
    const delta = next - lastY;
    lastY = next;
    travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
    if (reduced || next < HIDE_AFTER) tucked = false;
    else if (travel > HIDE_TRAVEL) tucked = true;
    else if (travel < -SHOW_TRAVEL) tucked = false;
    if (!tucked) { peek = false; cancelPointer(); }
    paint();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !fine.matches || reduced || !tucked) return;
    pointerY = event.clientY;
    if (frame) return;
    frame = view!.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || reduced || !tucked || !fine.matches) return;
      peek = pointerY < (peek ? PEEK_LEAVE : PEEK_ENTER);
      paint();
    });
  }

  function onFocus(event: FocusEvent) {
    if (event.target instanceof view!.Element && event.target.matches(':focus-visible')) {
      focusInside = true;
      paint();
    }
  }

  function onBlur(event: FocusEvent) {
    if (event.relatedTarget instanceof view!.Node && root.contains(event.relatedTarget)) return;
    focusInside = false;
    paint();
  }

  function refreshLanguage() {
    if (disposed) return;
    const language = options.getLanguage();
    document.querySelectorAll<HTMLButtonElement>(LANGUAGE_BUTTONS).forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.l === language));
    });
  }

  function onLanguage(event: MouseEvent) {
    if (disposed || event.defaultPrevented || !(event.target instanceof view!.Element)) return;
    const button = event.target.closest<HTMLButtonElement>(LANGUAGE_BUTTONS);
    if (!button || button.disabled || button.closest('[inert], [hidden], [aria-hidden="true"]')) return;
    const next = button.dataset.l;
    if ((next !== 'en' && next !== 'zh') || next === options.getLanguage()) return;
    options.setLanguage(next);
    refreshLanguage();
  }

  listen<PointerEvent>(view, 'pointermove', onPointerMove);
  listen<Event>(view, 'pointercancel', resetPeek);
  listen<Event>(view, 'blur', resetPeek);
  listen<Event>(fine, 'change', resetPeek);
  listen<Event>(document, 'visibilitychange', resetPeek);
  listen<FocusEvent>(root, 'focusin', onFocus);
  listen<FocusEvent>(root, 'focusout', onBlur);
  listen<MouseEvent>(document, 'click', onLanguage);
  paint();
  refreshLanguage();

  return {
    scroll,
    setMenuOpen(value) {
      if (disposed) return;
      menuOpen = value;
      paint();
    },
    setReduced(value) {
      if (disposed || reduced === value) return;
      reduced = value;
      travel = 0;
      tucked = false;
      resetPeek();
    },
    refreshLanguage,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPointer();
      cleanups.forEach(cleanup => cleanup());
      root.classList.toggle('is-docked', initialDocked);
      root.classList.toggle('is-hidden', initialHidden);
    },
  };
}
