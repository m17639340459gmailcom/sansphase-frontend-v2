// Thin single-image adapter for PhotoSwipe 5.4.4. Image URLs and text come
// exclusively from the already-sanitized Reader DOM; no HTML is accepted here.
import type PhotoSwipe from 'photoswipe';
import { lang } from './i18n';

interface ArticleImageOptions {
  active: () => boolean;
  reduced: () => boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

interface ImageBinding {
  image: HTMLImageElement;
  button: HTMLButtonElement | null;
  media: HTMLElement;
  load: () => void;
  error: () => void;
  click: (event: MouseEvent) => void;
}

interface ImageSession {
  viewer: PhotoSwipe;
  binding: ImageBinding;
  source: string;
  scroll: number;
  inert: boolean;
  inertAttribute: boolean;
  returnFocus: boolean;
}

const interactive = 'a[href], button, summary, input, select, textarea, [role="button"], [contenteditable]:not([contenteditable="false"])';
const copy = (en: string, zh: string) => lang() === 'en' ? en : zh;

export function mountArticleImages(root: HTMLElement, options: ArticleImageOptions, load: () => Promise<{ default: typeof PhotoSwipe }> = () => import('photoswipe')) {
  const doc = root.ownerDocument;
  const bindings = new Map<HTMLImageElement, ImageBinding>();
  let session: ImageSession | null = null;
  let disposed = false;
  let core: typeof PhotoSwipe | null = null;
  let coreRequest: Promise<void> | null = null;
  let opening = 0;
  let pending: HTMLButtonElement | null = null;

  function preload(): Promise<void> {
    if (core) return Promise.resolve();
    if (coreRequest) return coreRequest;
    coreRequest = load().then(module => { core = module.default; });
    void coreRequest.catch(() => { coreRequest = null; });
    return coreRequest;
  }

  const usable = (image: HTMLImageElement) => root.contains(image) && !image.hidden
    && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    && Boolean(image.currentSrc || image.getAttribute('src'));

  function release(record: ImageSession) {
    // A previous viewer's delayed destroy must never release a newer dialog.
    if (session !== record) return;
    session = null;
    root.inert = record.inert;
    if (record.inertAttribute) root.setAttribute('inert', ''); else root.removeAttribute('inert');
    root.scrollTop = record.scroll;
    if (record.returnFocus && options.active()) {
      (record.binding.button?.isConnected ? record.binding.button : root).focus({ preventScroll: true });
    }
    if (!disposed) options.onClose?.();
  }

  function hide(record: ImageSession) {
    // Core's zero-duration close still finalizes on its next timer. Hide that
    // closing DOM immediately so it cannot cover the restored Reader.
    if (record.viewer.element) {
      record.viewer.element.style.display = 'none';
      record.viewer.element.setAttribute('aria-hidden', 'true');
    }
  }

  function close(returnFocus = true) {
    opening++;
    pending?.removeAttribute('aria-busy'); pending = null;
    const record = session;
    if (!record) return;
    record.returnFocus = returnFocus;
    if (!record.viewer.isDestroying) record.viewer.destroy();
    hide(record);
    // destroy() removes core input listeners synchronously before its opener
    // finishes; restoring focus after it returns avoids core's focus trap.
    release(record);
  }

  function label(binding: ImageBinding) {
    const button = binding.button;
    if (!button) return;
    const title = binding.image.alt.trim();
    button.lang = lang() === 'en' ? 'en' : 'zh-CN';
    button.setAttribute('aria-label', `${copy('Enlarge image', '放大图片')}${title ? `: ${title}` : ''}`);
    if (button.classList.contains('reader-image-open')) button.textContent = copy('Enlarge image ↗', '放大图片 ↗');
  }

  async function open(binding: ImageBinding, event: MouseEvent) {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || disposed || session || !options.active() || root.inert || root.closest('[inert]') || !usable(binding.image)) return;
    event.preventDefault();
    const request = ++opening;
    const originalSource = binding.image.currentSrc || binding.image.src;
    if (!core) {
      pending?.removeAttribute('aria-busy');
      pending = binding.button;
      pending?.setAttribute('aria-busy', 'true');
      try { await preload(); }
      catch {
        if (!disposed && request === opening && binding.button?.isConnected) {
          binding.button.setAttribute('aria-label', copy('Image viewer could not load. Click to retry.', '图片查看器加载失败，点击重试。'));
        }
        return;
      } finally {
        if (request === opening) { pending?.removeAttribute('aria-busy'); pending = null; }
      }
    }
    if (!core || disposed || request !== opening || session || !options.active() || root.inert || root.closest('[inert]') || !usable(binding.image)
      || originalSource !== (binding.image.currentSrc || binding.image.src)) return;
    label(binding);
    options.onOpen?.();
    const image = binding.image;
    const source = image.currentSrc || image.src;
    const caption = image.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || image.alt.trim();
    const viewer = new core({
      dataSource: [{ src: source, width: image.naturalWidth, height: image.naturalHeight, alt: image.alt }],
      mainClass: 'reader-image-viewer',
      // No route/thumbnail transition. Synchronous opening also permits an
      // immediate article switch while retaining official zoom/pan gestures.
      showHideAnimationType: 'none', showAnimationDuration: 0, hideAnimationDuration: 0,
      zoomAnimationDuration: options.reduced() ? 0 : 200,
      loop: false, arrowPrev: false, arrowNext: false, counter: false, arrowKeys: false,
      escKey: false, trapFocus: true, returnFocus: false,
      closeTitle: copy('Close image (Esc)', '关闭图片（Esc）'),
      zoomTitle: copy('Zoom image', '缩放图片'),
      errorMsg: copy('The image could not be loaded.', '图片暂时无法加载。'),
      padding: { top: 64, bottom: caption ? 96 : 32, left: 20, right: 20 },
    });
    const record: ImageSession = {
      viewer, binding, source, scroll: root.scrollTop, inert: Boolean(root.inert),
      inertAttribute: root.hasAttribute('inert'), returnFocus: true,
    };
    session = record;
    root.inert = true; root.setAttribute('inert', '');
    viewer.on('initialLayout', () => {
      viewer.element?.setAttribute('aria-modal', 'true');
      viewer.element?.setAttribute('aria-label', copy('Article image', '文章图片'));
      if (viewer.element) { viewer.element.lang = lang() === 'en' ? 'en' : 'zh-CN'; viewer.element.dataset.cursor = 'native'; }
    });
    if (caption) viewer.on('uiRegister', () => viewer.ui?.registerElement({
      name: 'reader-caption', className: 'reader-image-caption', appendTo: 'root',
      onInit(element) { element.textContent = caption; element.lang = image.closest('[lang]')?.getAttribute('lang') || doc.documentElement.lang; },
    }));
    viewer.addFilter('contentErrorElement', () => {
      const error = doc.createElement('div'); error.className = 'reader-image-viewer-error';
      const message = doc.createElement('p'); message.textContent = copy('The image could not be loaded.', '图片暂时无法加载。');
      const link = doc.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = copy('Open original image ↗', '打开原图 ↗');
      error.append(message, link); return error;
    });
    viewer.on('close', () => {
      hide(record);
      // The close event precedes core.events.removeAll(). Yield until its
      // document focus handler is gone when the official close button is used.
      queueMicrotask(() => release(record));
    });
    viewer.on('destroy', () => release(record));
    if (!viewer.init()) release(record);
  }

  function removeButton(binding: ImageBinding) {
    const button = binding.button;
    if (!button) return;
    button.removeEventListener('click', binding.click);
    if (button.classList.contains('reader-image-zoom') && button.contains(binding.media)) button.replaceWith(binding.media);
    else button.remove();
    binding.button = null;
  }

  function invalidate(image: HTMLImageElement) {
    const binding = bindings.get(image);
    if (!binding) return;
    if (pending && pending === binding.button) close(false);
    const focused = binding.button === doc.activeElement || session?.binding === binding;
    if (session?.binding === binding) close(false);
    removeButton(binding);
    if (focused && options.active()) root.focus({ preventScroll: true });
  }

  function enable(binding: ImageBinding) {
    if (!usable(binding.image)) { invalidate(binding.image); return; }
    if (session?.binding === binding && session.source !== (binding.image.currentSrc || binding.image.src)) close();
    if (!binding.button) {
      const button = doc.createElement('button'); button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
      const owner = binding.media.closest<HTMLElement>(interactive);
      if (owner) { button.className = 'reader-image-open'; owner.after(button); }
      else { button.className = 'reader-image-zoom'; binding.media.before(button); button.append(binding.media); }
      binding.button = button; button.addEventListener('click', binding.click);
    }
    label(binding);
  }

  function refresh() {
    if (disposed) return;
    if (session && !options.active()) close(false);
    else if (session && !root.contains(session.binding.image)) close();
    const images = new Set(root.querySelectorAll<HTMLImageElement>('#reader-img, #reader-body img'));
    for (const [image, binding] of bindings) if (!images.has(image)) {
      invalidate(image); image.removeEventListener('load', binding.load); image.removeEventListener('error', binding.error); bindings.delete(image);
    }
    for (const image of images) {
      let binding = bindings.get(image);
      if (!binding) {
        const next: ImageBinding = {
          image, media: image.closest('picture') || image, button: null,
          load: () => enable(next), error: () => invalidate(image), click: (event) => { void open(next, event); },
        };
        binding = next; bindings.set(image, binding);
        image.addEventListener('load', binding.load); image.addEventListener('error', binding.error);
      }
      enable(binding);
    }
  }

  const escape = (event: KeyboardEvent) => {
    if ((!session && !pending) || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); close();
  };
  doc.addEventListener('keydown', escape, { capture: true });

  return {
    get open() { return session !== null; },
    refresh, invalidate, close, preload,
    dispose() {
      if (disposed) return;
      disposed = true; close(false);
      doc.removeEventListener('keydown', escape, { capture: true });
      for (const [image, binding] of bindings) {
        removeButton(binding); image.removeEventListener('load', binding.load); image.removeEventListener('error', binding.error);
      }
      bindings.clear();
    },
  };
}
