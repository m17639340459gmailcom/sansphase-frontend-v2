// Thin adapter around native View Transitions, loaded only for a theme reveal.
export function revealTheme(origin: { x: number; y: number }, commit: () => void, current: () => boolean): () => void {
  type Transition = { ready: Promise<void>; updateCallbackDone?: Promise<void>; finished?: Promise<void>; skipTransition?: () => void };
  let transition: Transition | undefined;
  let skipped = false;
  const cancel = () => {
    skipped = true;
    try { transition?.skipTransition?.(); } catch { /* Optional animation only. */ }
  };
  const fallback = () => { if (current()) { cancel(); commit(); } };
  try {
    const start = (document as Document & { startViewTransition: (callback: () => void) => Transition }).startViewTransition;
    transition = start.call(document, commit);
  } catch { commit(); return cancel; }
  void transition.ready.then(() => {
    if (!current() || skipped) return;
    commit();
    const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 900, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(fallback);
  void transition.updateCallbackDone?.catch(fallback);
  void transition.finished?.catch(fallback);
  return cancel;
}
