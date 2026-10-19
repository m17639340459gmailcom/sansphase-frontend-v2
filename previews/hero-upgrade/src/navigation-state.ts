/** History and readiness adapters for the existing path router and Lenis.
 * No second router, content cache, frame loop, or reader scroll owner. */
type PageRoute = { page: string; id?: string; slug?: string };
export const samePageRoute = (left: PageRoute | null, right: PageRoute) =>
  left !== null && left.page === right.page && left.id === right.id && left.slug === right.slug;

const STATE_KEY = '__sansphaseScroll';
type ScrollEntry = { key: string; top: number };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function entry(value: unknown): ScrollEntry | null {
  const record = object(value) ? value[STATE_KEY] : null;
  return object(record) && typeof record.key === 'string' && typeof record.top === 'number' && Number.isFinite(record.top) && record.top >= 0
    ? { key: record.key, top: record.top } : null;
}

export function createHistoryPositions(win: Window, readTop: () => number) {
  const positions = new Map<string, number>();
  let serial = 0, pending = false;
  const key = () => `${Date.now().toString(36)}-${++serial}`;
  const initial = entry(win.history.state);
  let current = initial?.key ?? key();
  const top = () => Math.max(0, Number.isFinite(readTop()) ? readTop() : 0);
  const state = (value: unknown, saved: ScrollEntry) => ({ ...(object(value) ? value : {}), [STATE_KEY]: saved });
  positions.set(current, initial?.top ?? top());
  win.history.replaceState(state(win.history.state, { key: current, top: positions.get(current)! }), '');
  function remember() {
    if (pending) return;
    const saved = { key: current, top: top() };
    positions.set(current, saved.top);
    // During popstate the browser already owns the destination entry. Never
    // accidentally write the departing page's position onto that entry.
    if (entry(win.history.state)?.key === current) win.history.replaceState(state(win.history.state, saved), '');
  }
  return {
    initialTop: initial?.top,
    navigate(path: string, replace = false) {
      const url = new URL(path, win.location.href);
      if (url.href === win.location.href) return false;
      const fromApp = !replace || object(win.history.state) && win.history.state.fromApp === true;
      remember(); current = key(); positions.set(current, 0); pending = true;
      win.history[replace ? 'replaceState' : 'pushState']({ ...(replace && object(win.history.state) ? win.history.state : {}), fromApp, [STATE_KEY]: { key: current, top: 0 } }, '', url.pathname + url.search + url.hash);
      return true;
    },
    pop() {
      remember();
      const saved = entry(win.history.state);
      current = saved?.key ?? key();
      const destination = positions.get(current) ?? saved?.top ?? 0;
      positions.set(current, destination); pending = true;
      if (!saved) win.history.replaceState(state(win.history.state, { key: current, top: destination }), '');
      return destination;
    },
    complete() { pending = false; remember(); },
    remember,
    dispose: remember,
  };
}

type RestoreTask = { action(): void; top?: number; stableLimit?: number; resolve(value: boolean): void; timer: number; frame: number };
export function mountNavigationRestore(root: HTMLElement, options: { ready(): boolean; unavailable?(): boolean; limit(): number; scrollTo(top: number): void; timeout?: number }) {
  const win = root.ownerDocument.defaultView!;
  let current: RestoreTask | null = null, disposed = false, intentVersion = 0;
  function finish(completed: boolean) {
    const task = current; if (!task) return;
    current = null; win.clearTimeout(task.timer); win.cancelAnimationFrame(task.frame);
    if (completed) task.action();
    task.resolve(completed);
  }
  const cancel = () => finish(false);
  function check() {
    if (!current || current.frame) return;
    current.frame = win.requestAnimationFrame(() => {
      const task = current; if (!task) return;
      task.frame = 0;
      if (options.unavailable?.()) { finish(false); return; }
      if (!options.ready()) { task.stableLimit = undefined; return; }
      const limit = options.limit();
      if (task.top !== undefined && limit + 1 < task.top) {
        // A completed collection may contain fewer records than the history
        // entry. Two consecutive layout frames distinguish a settled, shorter
        // page from a document still expanding; no second time-based delay.
        if (task.stableLimit === undefined || Math.abs(task.stableLimit - limit) > 1) {
          task.stableLimit = limit; check(); return;
        }
      }
      finish(true);
    });
  }
  const intent = (event: Event) => {
    if (event.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes((event as KeyboardEvent).key)) return;
    intentVersion++;
    cancel();
  };
  const events = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
  events.forEach(type => root.ownerDocument.addEventListener(type, intent, { passive: true, capture: true }));
  root.addEventListener('page:content', check);
  const observer = win.ResizeObserver ? new win.ResizeObserver(check) : null;
  observer?.observe(root);
  function run(action: () => void, top?: number): Promise<boolean> {
    cancel(); if (disposed) return Promise.resolve(false);
    return new Promise(resolve => {
      const task: RestoreTask = { action, top, resolve, timer: 0, frame: 0 };
      current = task;
      // A stalled request must not retain permission to move a later document.
      // Ready, shorter pages already clamp after two measured layout frames.
      task.timer = win.setTimeout(() => { if (current === task) finish(options.ready() && !options.unavailable?.()); }, options.timeout ?? 12000);
      check();
    });
  }
  return {
    get intentVersion() { return intentVersion; },
    run,
    to(top: number) { return run(() => options.scrollTo(top), top); },
    cancel,
    dispose() {
      if (disposed) return; disposed = true; cancel(); observer?.disconnect();
      root.removeEventListener('page:content', check);
      events.forEach(type => root.ownerDocument.removeEventListener(type, intent, { capture: true }));
    },
  };
}
