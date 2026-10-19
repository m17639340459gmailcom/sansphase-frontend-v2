/**
 * Native DOM adapter of Dingxin Tao's MIT-licensed cursor, Aurora and hero grid trail.
 * Upstream: DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751
 * Sources: src/components/fx/{cursor,aurora,spotlight}.tsx;
 * src/components/home/hero/{grid-trail,hero-motion}.tsx and the original hero layer markup.
 * Retains the upstream targeting/damping, 64px cell trail and transform-only light mechanisms.
 * Adaptations: no React, cobalt palette, semantic labels, explicit pause and lifecycle cleanup.
 * Per the owner's preference, the pointer's X/Y readout is omitted; semantic labels remain.
 * The upstream crosshair, targeting/snap rules, Aurora drift and grid-cell trail are retained.
 * This module does not create a particle effect.
 * Copyright (c) 2026 Dingxin Tao. License retained in vendor/tdx/LICENSE.
 */

const CELL = 64;
const TRAIL_COUNT = 10;
const QUIET = "a, button, input, textarea, select, summary, [role='button'], [role='tab'], [data-particle-surface]";
const NATIVE = "input, textarea, select, iframe, video[controls], audio[controls], dialog[open], [role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true'], [contenteditable]:not([contenteditable='false']), [data-cursor='native'], [inert]";
const INTERACTIVE = "a[href], button:not(:disabled), [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], [role='switch'], summary, label[for], [data-cursor]";
const MODAL = 'dialog, [role="dialog"], [role="alertdialog"]';

const modalElements = () => Array.from(document.querySelectorAll<HTMLElement>(MODAL));
const changedElements = (record: MutationRecord) => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
  .filter((node): node is Element => node instanceof Element);
function modalChanged(records: MutationRecord[], modals: HTMLElement[]): boolean {
  return records.some((record) => {
    if (record.type === "childList") return changedElements(record).some((node) => node.matches(MODAL) || node.querySelector(MODAL) !== null);
    const target = record.target instanceof Element ? record.target : null;
    return Boolean(target && ((record.attributeName === "role" && target.matches(MODAL)) || modals.some((modal) => target.contains(modal))));
  });
}

type AmbientController = { setPaused(paused: boolean): void; dispose(): void };

/** Decorative atmosphere: content and the particle stage own all actual input. */
export function mountAmbient(root: HTMLElement): AmbientController {
  const existing = root.querySelector<HTMLElement>(".hero-atmosphere");
  const host = existing ?? document.createElement("div");
  const previousHidden = host.getAttribute("aria-hidden");
  const previousSpotActive = root.hasAttribute("data-fx-spot-active");
  if (!existing) {
    host.className = "hero-atmosphere";
    root.prepend(host);
  }
  host.classList.add("u-ambient");
  host.setAttribute("aria-hidden", "true");
  const grid = document.createElement("div");
  grid.className = "u-ambient-grid";
  const glow = document.createElement("div");
  glow.className = "u-ambient-glow";
  const field = document.createElement("div");
  field.className = "u-ambient-field";
  for (const position of ["a", "b", "c"]) {
    const light = document.createElement("span");
    light.className = `u-ambient-light u-ambient-light-${position}`;
    field.append(light);
  }
  const spot = document.createElement("div");
  spot.className = "u-ambient-spot";
  spot.setAttribute("data-fx-spot", "");
  const trail = document.createElement("div");
  trail.className = "u-ambient-trail";
  const cells = Array.from({ length: TRAIL_COUNT }, () => {
    const cell = document.createElement("span");
    cell.className = "u-ambient-cell";
    trail.append(cell);
    return cell;
  });
  host.append(grid, glow, field, spot, trail);

  const fine = matchMedia("(pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = false;
  let inView = true;
  let focused = document.hasFocus();
  let blocked = false;
  let modals = modalElements();
  let disposed = false;
  let frame = 0;
  let pointer: { x: number; y: number; quiet: boolean } | null = null;
  let currentCell = "";
  let nextCell = 0;
  const activeAnimations = new Map<HTMLElement, Animation>();

  const canTrack = () => !disposed && !paused && inView && focused && !blocked && !document.hidden && fine.matches && !reduced.matches;
  const clearTrail = () => {
    for (const animation of activeAnimations.values()) animation.cancel();
    activeAnimations.clear();
    currentCell = "";
  };
  const clearPointer = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    clearTrail();
    root.removeAttribute("data-fx-spot-active");
    host.style.setProperty("--u-px", "0");
    host.style.setProperty("--u-py", "0");
    spot.style.removeProperty("--mx");
    spot.style.removeProperty("--my");
  };
  const updateAvailability = () => {
    blocked = root.closest('[inert], [hidden], [aria-hidden="true"]') !== null || hasVisibleModal(modals);
    const stopped = !canTrack();
    host.toggleAttribute("data-paused", stopped);
    if (stopped) clearPointer();
  };
  const paint = () => {
    frame = 0;
    if (!canTrack() || !pointer) return;
    // Layout and captured-event targets can change without another pointermove.
    // Read the current rectangle and physical hit before writing any light/cell.
    const origin = host.getBoundingClientRect();
    const x = pointer.x - origin.left;
    const y = pointer.y - origin.top;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (!target || !root.contains(target) || origin.width <= 0 || origin.height <= 0 || x < 0 || y < 0 || x >= origin.width || y >= origin.height) {
      clearPointer();
      return;
    }
    host.style.setProperty("--u-px", ((x / Math.max(origin.width, 1)) * 2 - 1).toFixed(3));
    host.style.setProperty("--u-py", ((y / Math.max(origin.height, 1)) * 2 - 1).toFixed(3));
    // The original hero uses useSpotlight independently of its discrete cell trail.
    // Its 18rem grid mask follows every pointer position, even over controls/the model.
    const spotBounds = spot.getBoundingClientRect();
    spot.style.setProperty("--mx", `${(pointer.x - spotBounds.left).toFixed(1)}px`);
    spot.style.setProperty("--my", `${(pointer.y - spotBounds.top).toFixed(1)}px`);
    root.setAttribute("data-fx-spot-active", "");
    // A captured pointer event keeps its original event.target. Quiet zones
    // belong to the physical hit, otherwise dragging onto the model leaks cells.
    if (pointer.quiet || target.closest(QUIET)) {
      currentCell = "";
      return;
    }
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    const key = `${col}:${row}`;
    if (key === currentCell) return;
    currentCell = key;
    const cell = cells[nextCell];
    nextCell = (nextCell + 1) % cells.length;
    activeAnimations.get(cell)?.cancel();
    cell.style.transform = `translate3d(${col * CELL}px,${row * CELL}px,0)`;
    const animation = cell.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: "linear" });
    activeAnimations.set(cell, animation);
    animation.onfinish = () => {
      if (activeAnimations.get(cell) === animation) activeAnimations.delete(cell);
    };
  };
  const schedule = () => {
    if (!frame && canTrack() && pointer) frame = requestAnimationFrame(paint);
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !canTrack()) return;
    pointer = {
      x: event.clientX,
      y: event.clientY,
      quiet: false,
    };
    schedule();
  };
  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !canTrack()) return;
    // Spotlight activates on entry; upstream grid trails start on pointermove.
    // The section's pointerenter target is the section itself, not the surface
    // under the pointer, so it must not emit a false cell inside a quiet zone.
    pointer = { x: event.clientX, y: event.clientY, quiet: true };
    schedule();
  };
  const onLeave = () => clearPointer();
  const invalidate = () => {
    if (pointer) {
      const target = document.elementFromPoint(pointer.x, pointer.y);
      if (!target || !root.contains(target)) { clearPointer(); return; }
      pointer.quiet = Boolean(target?.closest(QUIET));
    }
    schedule();
  };
  const onBlur = () => { focused = false; updateAvailability(); };
  const onFocus = () => { focused = true; updateAvailability(); };
  const modalObserver = new MutationObserver((records) => {
    // A modal can change visibility through a class/style. Ignore our own
    // per-frame style writes so the observer never feeds back into painting.
    const changed = modalChanged(records, modals);
    if (changed) modals = modalElements();
    if (changed || records.some((record) => record.target instanceof Element && record.target.contains(root))) updateAvailability();
  });
  modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "aria-hidden", "aria-modal", "inert", "role", "class", "style"] });
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateAvailability();
  }, { threshold: 0.05 });
  observer.observe(root);
  root.addEventListener("pointermove", onMove, { passive: true });
  root.addEventListener("pointerenter", onEnter, { passive: true });
  root.addEventListener("pointerleave", onLeave);
  window.addEventListener("scroll", invalidate, { passive: true });
  window.addEventListener("resize", invalidate);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", updateAvailability);
  fine.addEventListener("change", updateAvailability);
  reduced.addEventListener("change", updateAvailability);
  updateAvailability();

  return {
    setPaused(value) {
      paused = value;
      updateAvailability();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      clearTrail();
      observer.disconnect();
      modalObserver.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", updateAvailability);
      fine.removeEventListener("change", updateAvailability);
      reduced.removeEventListener("change", updateAvailability);
      if (existing) {
        grid.remove(); glow.remove(); field.remove(); spot.remove(); trail.remove();
        host.classList.remove("u-ambient");
        host.removeAttribute("data-paused");
        if (previousHidden === null) host.removeAttribute("aria-hidden");
        else host.setAttribute("aria-hidden", previousHidden);
        for (const property of ["--u-px", "--u-py"]) host.style.removeProperty(property);
      } else host.remove();
      root.toggleAttribute("data-fx-spot-active", previousSpotActive);
    },
  };
}

type CursorMode = "idle" | "hover" | "label" | "native";
type CursorTarget = { mode: CursorMode; label: string; element: HTMLElement | null; bare?: boolean };

function hasVisibleModal(modals = modalElements()): boolean {
  return modals.some((element) => {
    if (!element.isConnected || !element.matches('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]') || element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
  });
}

function resolveCursor(target: EventTarget | null): CursorTarget {
  const node = target instanceof Element ? target : null;
  if (!node) return { mode: "idle", label: "", element: null };
  if (node.closest(NATIVE) || window.getSelection()?.isCollapsed === false) return { mode: "native", label: "", element: null };
  // Resolve the closest action before an outer surface label: a carousel's
  // DRAG surface must not swallow the READ link or its own next/previous button.
  const interactive = node.closest<HTMLElement>(INTERACTIVE);
  const labelled = node.closest<HTMLElement>("[data-cursor-text]");
  const element = labelled?.dataset.cursorText?.trim() && (!interactive || interactive.contains(labelled)) ? labelled : interactive;
  if (!element || element.closest(':disabled, [aria-disabled="true"]')) return { mode: "idle", label: "", element: null };
  if (element.dataset.cursor === "bare") return { mode: "hover", label: "", element, bare: true };
  if (element.dataset.cursorText?.trim()) return { mode: "label", label: element.dataset.cursorText.trim(), element };
  const english = document.documentElement.dataset.lang === "en";
  const labels: Record<string, string> = english
    ? { drag: "DRAG", explore: "CLICK · DRAG", read: "READ", open: "OPEN", copy: "COPY" }
    : { drag: "拖动", explore: "点击 · 拖动", read: "阅读", open: "打开", copy: "复制" };
  // Keep the source's compact target snap. A wide/tall real link cannot be
  // framed; expose its action instead of leaving only a subtle 30→40px change.
  // Informational cards without a real link/control remain idle.
  let label = labels[element.dataset.cursor ?? ""] || "";
  if (!label && element.matches('a[href]')) {
    const bounds = element.getBoundingClientRect();
    if (bounds.width > 440 || bounds.height > 180) label = labels[element.hasAttribute('data-post') ? 'read' : 'open'];
  }
  return { mode: label ? "label" : "hover", label, element };
}

/** Fine-pointer targeting frame; system cursor remains authoritative for native UI. */
export function mountCursor(): () => void {
  const html = document.documentElement;
  const fine = matchMedia("(pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.createElement("div");
  root.className = "u-cursor";
  root.setAttribute("aria-hidden", "true");
  const box = document.createElement("div");
  box.className = "u-cursor-box";
  for (const corner of ["tl", "tr", "bl", "br"]) {
    const mark = document.createElement("i");
    mark.className = "u-cursor-corner";
    mark.dataset.corner = corner;
    box.append(mark);
  }
  const cross = document.createElement("div");
  cross.className = "u-cursor-cross";
  const mark = document.createElement("span");
  mark.className = "u-cursor-mark";
  mark.append(document.createElement("i"));
  cross.append(mark);
  const chip = document.createElement("div");
  chip.className = "u-cursor-chip";
  root.append(box, cross, chip);
  document.body.append(root);

  const state = { x: -100, y: -100, down: false, mode: "idle" as CursorMode, label: "", element: null as HTMLElement | null };
  const rect = { x: 0, y: 0, width: 30, height: 30 };
  let shown = false;
  let focused = document.hasFocus();
  let modals = modalElements();
  let blocked = hasVisibleModal(modals);
  let disposed = false;
  let frame = 0;
  let refreshFrame = 0;
  let last = 0;
  let chipWidth = 0;
  let clickRefresh = 0;
  let settleRefresh = 0;
  let motionUntil = 0;
  let motionPending = false;
  const allowed = () => !disposed && focused && !blocked && fine.matches && !reduced.matches && !document.hidden;
  const insideViewport = () => state.x >= 0 && state.y >= 0 && state.x < innerWidth && state.y < innerHeight;
  const hide = () => {
    shown = false;
    state.down = false;
    root.removeAttribute("data-visible");
    root.removeAttribute("data-pressed");
    delete html.dataset.uCursor;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(refreshFrame);
    frame = 0;
    refreshFrame = 0;
    state.element = null;
    state.mode = "idle";
    state.label = "";
    root.dataset.mode = "idle";
    root.removeAttribute("data-bare");
    if (chip.textContent) chip.textContent = "";
    chipWidth = 0;
    rect.width = rect.height = 30;
    box.style.width = box.style.height = "30px";
    motionPending = false;
    motionUntil = 0;
  };
  const schedulePaint = () => {
    if (shown && state.mode !== "native" && !frame) frame = requestAnimationFrame(paint);
  };
  const apply = (next: CursorTarget, repaint = true) => {
    const changed = state.mode !== next.mode || state.label !== next.label;
    state.mode = next.mode;
    state.element = next.element;
    root.dataset.mode = next.mode;
    root.toggleAttribute("data-bare", Boolean(next.bare));
    state.label = next.label;
    if (changed) {
      chip.textContent = next.mode === "label" ? next.label : "";
      chipWidth = chip.textContent ? chip.offsetWidth : 0;
    }
    if (shown) html.dataset.uCursor = state.mode === "native" ? "native" : "on";
    if (next.mode === "native") { cancelAnimationFrame(frame); frame = 0; }
    else if (repaint) schedulePaint();
  };
  const refresh = () => {
    refreshFrame = 0;
    if (!allowed() || !insideViewport()) { hide(); return; }
    if (shown) apply(resolveCursor(document.elementFromPoint(state.x, state.y)));
  };
  const scheduleRefresh = () => {
    if (shown && !refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  };
  const paint = (now: number) => {
    frame = 0;
    if (!shown || !allowed() || !insideViewport()) { hide(); return; }
    if (state.mode === "native") return;
    if (motionPending) { motionUntil = now + 800; motionPending = false; }
    const delta = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
    last = now;
    let x = state.x;
    let y = state.y;
    let width = state.down ? 22 : 30;
    let height = width;
    let snapped = false;
    if ((state.mode === "hover" || state.mode === "label") && state.element) {
      let target = state.element.getBoundingClientRect();
      // The existing target rectangle is already needed for damping. Only a
      // lost/moving target needs another hit test; idle frames do no DOM query.
      if (!state.element.isConnected || target.width <= 0 || target.height <= 0
        || state.x < target.left || state.x > target.right || state.y < target.top || state.y > target.bottom) {
        const next = resolveCursor(document.elementFromPoint(state.x, state.y));
        apply(next, false);
        if (next.mode === "native") return;
        target = state.element?.getBoundingClientRect() ?? target;
      }
      if (state.element?.isConnected && target.width > 0 && target.width <= 440 && target.height > 0 && target.height <= 180
        && state.x >= target.left && state.x <= target.right && state.y >= target.top && state.y <= target.bottom) {
        const cx = target.left + target.width / 2;
        const cy = target.top + target.height / 2;
        x = cx + (state.x - cx) * 0.08;
        y = cy + (state.y - cy) * 0.08;
        width = target.width + 12 - (state.down ? 8 : 0);
        height = target.height + 12 - (state.down ? 8 : 0);
        snapped = true;
      } else if (state.mode === "hover" || state.mode === "label") {
        const size = state.mode === "label" ? 46 : 40;
        width = height = state.down ? size - 8 : size;
      }
    }
    const damping = 1 - Math.exp(-delta * (snapped ? 16 : 24));
    rect.x += (x - rect.x) * damping;
    rect.y += (y - rect.y) * damping;
    rect.width += (width - rect.width) * damping;
    rect.height += (height - rect.height) * damping;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.style.transform = `translate3d(${rect.x}px,${rect.y}px,0) translate(-50%,-50%)`;
    cross.style.transform = `translate3d(${state.x}px,${state.y}px,0) translate(-50%,-50%)`;
    const flipX = state.x + chipWidth + 22 > innerWidth - 8;
    const flipY = state.y + 46 > innerHeight - 8;
    chip.style.transform = `translate3d(${flipX ? state.x - chipWidth - 18 : state.x + 18}px,${flipY ? state.y - 32 : state.y + 22}px,0)`;
    // The source damping only needs frames while a pointer/target is moving.
    // Scroll gets a bounded settling window for a transformed header; a resting
    // cursor and native text entry must not keep a permanent render loop alive.
    const unsettled = Math.abs(rect.x - x) > 0.05 || Math.abs(rect.y - y) > 0.05
      || Math.abs(rect.width - width) > 0.05 || Math.abs(rect.height - height) > 0.05;
    if (unsettled || now < motionUntil) schedulePaint();
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (!allowed()) { hide(); return; }
    state.x = event.clientX;
    state.y = event.clientY;
    if (!insideViewport()) { hide(); return; }
    const capture = event.target instanceof Element && event.target.hasPointerCapture?.(event.pointerId);
    apply(resolveCursor(capture ? document.elementFromPoint(state.x, state.y) : event.target));
    if (!shown) {
      shown = true;
      rect.x = state.x;
      rect.y = state.y;
      root.setAttribute("data-visible", "");
      html.dataset.uCursor = state.mode === "native" ? "native" : "on";
      last = performance.now();
      schedulePaint();
    }
  };
  const onOver = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && allowed()) apply(resolveCursor(event.target));
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !shown) return;
    state.down = true;
    root.setAttribute("data-pressed", "");
    schedulePaint();
  };
  const onUp = () => {
    state.down = false;
    root.removeAttribute("data-pressed");
    scheduleRefresh();
  };
  const onOut = (event: MouseEvent) => { if (!event.relatedTarget) hide(); };
  const onKey = () => hide();
  const onAvailability = () => { blocked = hasVisibleModal(modals); if (!allowed()) hide(); };
  const onBlur = () => { focused = false; hide(); };
  const onWindowFocus = () => { focused = true; };
  const onClick = () => {
    clearTimeout(clickRefresh);
    clearTimeout(settleRefresh);
    clickRefresh = window.setTimeout(refresh, 120);
    settleRefresh = window.setTimeout(refresh, 650);
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Element && event.target.closest(NATIVE)) apply({ mode: "native", label: "", element: null });
  };
  const onSelection = () => {
    if (!shown) return;
    if (window.getSelection()?.isCollapsed === false) apply({ mode: "native", label: "", element: null });
    else scheduleRefresh();
  };
  const onLayout = () => {
    if (!shown) return;
    motionPending = true;
    scheduleRefresh(); schedulePaint();
  };
  const onTransition = (event: TransitionEvent) => {
    // Only motion of the current target or an ancestor can move its frame.
    // Ignore decorative transitions, particularly this overlay's own styles.
    if (state.element && event.target instanceof Element && event.target.contains(state.element)) onLayout();
  };
  const modalObserver = new MutationObserver((records) => {
    const changed = modalChanged(records, modals);
    if (changed) { modals = modalElements(); onAvailability(); }
    if (changed || records.some((record) => {
      if (record.type === "childList") return changedElements(record).length > 0;
      return (record.attributeName !== "style" && record.attributeName !== "class")
        || (record.target instanceof Element && state.element && record.target.contains(state.element));
    })) scheduleRefresh();
  });
  modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "aria-hidden", "aria-modal", "inert", "disabled", "aria-disabled", "data-cursor", "data-cursor-text", "role", "class", "style"] });
  const languageObserver = new MutationObserver(scheduleRefresh);
  languageObserver.observe(html, { attributes: true, attributeFilter: ["data-lang"] });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerover", onOver, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("click", onClick, { passive: true });
  window.addEventListener("scroll", onLayout, { passive: true });
  window.addEventListener("resize", onLayout);
  document.addEventListener("transitionrun", onTransition);
  document.addEventListener("transitionend", onTransition);
  document.addEventListener("transitioncancel", onTransition);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("keydown", onKey);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("selectionchange", onSelection);
  document.addEventListener("visibilitychange", onAvailability);
  fine.addEventListener("change", onAvailability);
  reduced.addEventListener("change", onAvailability);

  return () => {
    if (disposed) return;
    disposed = true;
    hide();
    cancelAnimationFrame(refreshFrame);
    clearTimeout(clickRefresh);
    clearTimeout(settleRefresh);
    modalObserver.disconnect();
    languageObserver.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerover", onOver);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("click", onClick);
    window.removeEventListener("scroll", onLayout);
    window.removeEventListener("resize", onLayout);
    document.removeEventListener("transitionrun", onTransition);
    document.removeEventListener("transitionend", onTransition);
    document.removeEventListener("transitioncancel", onTransition);
    document.removeEventListener("mouseout", onOut);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("selectionchange", onSelection);
    document.removeEventListener("visibilitychange", onAvailability);
    fine.removeEventListener("change", onAvailability);
    reduced.removeEventListener("change", onAvailability);
    root.remove();
  };
}
