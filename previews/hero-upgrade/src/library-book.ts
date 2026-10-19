// Thin lifecycle/theme adapter for irma-book 32e8c1a (MIT). Geometry, cloth,
// paper and the opening shader are vendored upstream, not a local book engine.
import type { BookViewer, BookOptions } from '../vendor/irma-book/book3d/BookViewer.js';
type BookModule = { createBookViewer(container: HTMLElement, options: BookOptions): BookViewer };
export function mountLibraryBook(root: HTMLElement, load: () => Promise<BookModule> = () => import('./library-book-viewer')) {
  const candidate = root.querySelector<HTMLElement>('[data-library-book]');
  const doc = root.ownerDocument, win = doc.defaultView;
  if (!candidate || !win?.IntersectionObserver || !win.ResizeObserver || !win.matchMedia) return { dispose() {} };
  const host = candidate;
  const surface = host.querySelector<HTMLElement>('[data-library-book-canvas]')!;
  const fallback = host.querySelector<HTMLElement>('[data-library-book-fallback]')!;
  const status = host.querySelector<HTMLElement>('[data-library-book-status]')!;
  const english = host.dataset.bookLanguage === 'en';
  const text = (zh: string, en: string) => english ? en : zh;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = win.matchMedia('(pointer: fine)');
  const events = new win.AbortController();
  let viewer: BookViewer | null = null, disposed = false, loading = false;
  let wheelAmount = 0, lastWheelAt = 0, wheelCooldown = 0;
  const clearWheel = () => { wheelAmount = 0;lastWheelAt = 0; };
  const usable = () => !disposed && host.isConnected && !doc.hidden && !host.closest('[hidden],[inert],[aria-hidden="true"]');
  const motion = () => ({ autoRotate: false, idleSway: !reduced.matches, pointerParallax: !reduced.matches && fine.matches, openSpeed: reduced.matches ? Infinity : 5.5 });
  function sync() {
    if (!viewer || disposed) return;
    const open = viewer.isOpen;
    surface.setAttribute('aria-pressed', String(open));
    host.dataset.bookOpen = String(open);
    const label = text(open ? `书本已打开，已翻 ${viewer.currentPage} / ${viewer.pageCount}` : '书本已合上', open ? `Book open, ${viewer.currentPage} / ${viewer.pageCount} leaves turned` : 'Book closed');
    if (status.textContent !== label) status.textContent = label;
    surface.setAttribute('aria-label',text(open ? '3D 书本：悬停书页滚轮翻页，左右键翻页，回车合上，Home 归位' : '3D 书本：点击或按回车打开，拖动转看，Home 归位',open ? '3D book: hover the pages and scroll, use arrow keys to turn, Enter to close, Home to reset' : '3D book: click or press Enter to open, drag to inspect, Home to reset'));
    if (!open) clearWheel();
  }
  function activity() { const active = usable();if (!active) clearWheel();viewer?.setActive(active); }
  function preferences() {
    viewer?.update({ ...motion(), exposure: doc.documentElement.dataset.theme === 'dark' ? 1.4 : 1.1 });
    activity();
  }
  const observer = new win.IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void start();
  }, { rootMargin: '160px' });
  const mutation = new win.MutationObserver(() => { activity(); });
  for (let node: HTMLElement | null = host; node; node = node.parentElement) mutation.observe(node, { attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden'] });
  const theme = new win.MutationObserver(preferences);
  theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  async function start() {
    if (disposed || loading || viewer || !host?.isConnected) return;
    loading = true;host.dataset.bookState = 'loading';
    try {
      const engine = await load();
      if (disposed || !host.isConnected) return;
      viewer = engine.createBookViewer(surface, {
        height: 240, width: 168, spine: 31, binding: 'hardcover', spineRound: .8,
        coverSurface: 'cloth', coverColor: '#182d61', inkColor: '#f3eddb',
        pageColor: '#f1ecdf', endpaperColor: '#dee3ef', headbandColors: ['#314eaa','#eee7d6'],
        textureDensity: 4, grain: .42, embossMode: 'deboss', embossDepth: .25,
        embossBevel: .45, embossSoftness: .65, openAngle: 180, openOnClick: true,
        cameraAzimuth: 0, cameraElevation: 0, zoom: .82, fov: 26, readingMode: true, onStateChange: sync,
        shadowOpacity: .12, ...motion(), exposure: doc.documentElement.dataset.theme === 'dark' ? 1.4 : 1.1,
        design: {
          title: 'THE\nREADING\nROOM', subtitle: text('藏书与阅读','WORDS. IDEAS. DISCOVERIES.'),
          author: 'SANSPHASE / 無相', spineTop: 'THE READING ROOM', spineBottom: 'SANSPHASE',
          blurb: text('收藏成册的文字与插图。\n\n从一本书开始，\n读到你想停留的地方。','Books, words and illustrations.\n\nOpen a book and find\na place to stay.'),
          frontispieceNote: 'SANSPHASE / THE READING ROOM',
          titleFont: 'Georgia, "Noto Sans SC Variable", serif',
          bodyFont: '"Inter Variable", "Noto Sans SC Variable", sans-serif', frame: true, frontAlign: 'left',
        },
      });
      if (disposed) { viewer.dispose();viewer = null;return; }
      host.dataset.bookState = 'ready';fallback.hidden = true;
      surface.tabIndex = 0;surface.setAttribute('role','button');
      // Zoom stays off: only an open book hit by the pointer owns wheel input.
      if (viewer.controls) viewer.controls.enableZoom = false;
      sync();activity();observer.disconnect();
    } catch {
      viewer?.dispose();viewer = null;surface.replaceChildren();
      if (!disposed) { host.dataset.bookState = 'fallback';fallback.hidden = false; }
    }
  }
  function turn(direction: number) {
    if (!viewer || !usable() || !viewer.isOpen || viewer.isTurning) return;
    if (direction > 0) viewer.nextPage();else viewer.previousPage();
    sync();
  }
  surface.addEventListener('wheel',event => {
    if (!viewer || !usable() || !viewer.isOpen || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY || !viewer.hitTest(event.clientX,event.clientY)) { clearWheel();return; }
    const direction = Math.sign(event.deltaY);
    if (!viewer.isTurning && (direction < 0 ? viewer.currentPage <= 0 : viewer.currentPage >= viewer.pageCount)) { clearWheel();return; }
    event.preventDefault();event.stopPropagation();
    const now = win.performance.now();
    if (viewer.isTurning || now < wheelCooldown) { clearWheel();return; }
    if (now-lastWheelAt > 200 || Math.sign(wheelAmount) !== direction) wheelAmount = 0;
    lastWheelAt = now;
    wheelAmount += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
    if (Math.abs(wheelAmount) < 48) return;
    clearWheel();
    const changed = direction > 0 ? viewer.nextPage() : viewer.previousPage();
    if (changed) wheelCooldown = now+450;
    sync();
  },{passive:false,signal:events.signal});
  surface.addEventListener('pointerleave',clearWheel,{signal:events.signal});
  // Upstream registers its tap/raycast handler after lazy construction. Read
  // the state after all handlers, including that later registration, have run.
  surface.addEventListener('pointerup',() => win.queueMicrotask(sync),{signal:events.signal});
  surface.addEventListener('keydown',event => {
    if (!viewer || !usable()) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();viewer.toggleOpen();sync(); }
    else if (event.key === 'Home') { event.preventDefault();viewer.setOpen(false);viewer.resetCamera();sync(); }
    else if (viewer.isOpen && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault();turn(event.key === 'ArrowRight' ? 1 : -1); }
  },{signal:events.signal});
  doc.addEventListener('visibilitychange',activity,{signal:events.signal});
  reduced.addEventListener('change',preferences);fine.addEventListener('change',preferences);
  observer.observe(host);
  return { dispose() {
    if (disposed) return;
    disposed = true;events.abort();observer.disconnect();mutation.disconnect();theme.disconnect();
    reduced.removeEventListener('change',preferences);fine.removeEventListener('change',preferences);
    viewer?.dispose();viewer = null;
  } };
}
