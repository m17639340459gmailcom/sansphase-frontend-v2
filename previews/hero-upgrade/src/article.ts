// Real public article bodies use the existing authorized proxy. Reading-root
// progress, the 30% active-heading line, bottom correction and narrow-screen
// disclosure adapt TDX table-of-contents.tsx at c73bc4966f0ba808b978e22eccf5a063fc649751.
import gsap from 'gsap';
import { posts } from './content';
import { lang, pick, t } from './i18n';
import { mountArticleImages } from './article-images';
import { isSiteIntegration } from './integration-context';
import { esc } from './util';
import { clearIntegratedArticle, readIntegratedArticle } from './integration-article-source';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const bodies = new Map<string, Promise<string>>();
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const copy = (en: string, zh: string) => lang() === 'en' ? en : zh;

function fetchBody(slug: string): Promise<string> {
  if (isSiteIntegration()) return readIntegratedArticle(slug)
    .then(value => {
      if (!value || typeof value !== 'object' || !('item' in value) || !value.item || typeof value.item !== 'object' || !('bodyHTML' in value.item) || typeof value.item.bodyHTML !== 'string') throw new Error('Invalid article detail');
      const attachments = 'attachments' in value.item && Array.isArray(value.item.attachments) ? value.item.attachments : [];
      const links = attachments.slice(0,100).flatMap((file: unknown) => {
        if (!file || typeof file !== 'object' || !('url' in file) || typeof file.url !== 'string' || !/^\/api\/media\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\?download=1$/i.test(file.url)) return [];
        const name = 'name' in file && typeof file.name === 'string' ? file.name : '下载附件';
        return [`<li><a href="${esc(file.url)}" download>${esc(name)} ↧</a></li>`];
      }).join('');
      return value.item.bodyHTML + (links ? `<section class="reader-attachments"><h2>文章附件</h2><ul>${links}</ul></section>` : '');
    });
  const cached = bodies.get(slug);
  if (cached) return cached;
  const request = fetch(`/api/article/${slug}`)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<unknown>;
    })
    .then((data) => {
      if (!data || typeof data !== 'object' || !('bodyHTML' in data) || typeof data.bodyHTML !== 'string') {
        throw new Error('Invalid article response');
      }
      return data.bodyHTML;
    });
  bodies.set(slug, request);
  // A transient network error must not become a permanent cached error.
  void request.catch(() => { if (bodies.get(slug) === request) bodies.delete(slug); });
  return request;
}

export class Reader {
  readonly root = $('reader');
  readonly heroImg = $<HTMLImageElement>('reader-img');
  index = -1;
  open = false;
  private headings: HTMLElement[] = [];
  private tocLinks: HTMLAnchorElement[][] = [];
  private generation = 0;
  private loadedSlug = '';
  private minutes = 0;
  private frame: number | null = null;
  private frameGeneration = 0;
  private observer: ResizeObserver | null = null;
  private readonly view = this.root.ownerDocument.defaultView;
  private readonly motion = this.view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  private entrances: gsap.core.Tween[] = [];
  private mobile: HTMLDetailsElement | null = null;
  private jumpTarget: { element: HTMLElement; destination: number; images: Set<HTMLImageElement> } | null = null;
  private readonly imageViewer = mountArticleImages(this.root, {
    active: () => this.open, reduced: () => this.motionReduced(),
    onOpen: () => this.cancelJump(), onClose: () => this.queueReading(),
  });
  get imageOpen() { return this.imageViewer.open; }
  private readonly jumpInput = (event: Event) => {
    if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab', 'Escape']
      .includes((event as KeyboardEvent).key)) return;
    this.cancelJump();
  };
  private readonly jumpScrollEnd = () => {
    const jump = this.jumpTarget;
    if (jump && Math.abs(this.jumpDestination(jump.element) - jump.destination) <= 1
      && Math.abs(this.root.scrollTop - jump.destination) > 1) this.cancelJump();
    this.queueReading();
  };
  private readonly queueReading = () => {
    if (!this.open) return;
    if (this.root.inert || this.root.closest('[inert]')) { this.cancelJump(); return; }
    if (this.frame !== null) return;
    if (!this.view?.requestAnimationFrame) { this.correctJump(); this.updateReading(); return; }
    const generation = this.frameGeneration;
    this.frame = this.view.requestAnimationFrame(() => {
      if (generation !== this.frameGeneration) return;
      this.frame = null;
      if (this.open && !this.root.inert && !this.root.closest('[inert]')) {
        this.correctJump();
        this.updateReading();
      }
    });
  };
  private readonly onMotion = () => {
    if (this.motionReduced()) {
      this.imageViewer.close();
      this.settleEntrance();
      // Finish the chosen jump at its current element position when motion is
      // disabled, rather than leaving a canceled smooth scroll halfway there.
      if (this.jumpTarget) this.jumpTarget.destination = this.jumpDestination(this.jumpTarget.element);
      this.root.scrollTo?.({ top: this.jumpTarget?.destination ?? this.root.scrollTop, behavior: 'auto' });
      this.queueReading();
    }
  };
  private readonly bodyAnchor = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href^="#"]');
    const href = anchor?.getAttribute('href');
    if (!href || href === '#') return;
    let id: string;
    try { id = decodeURIComponent(href.slice(1)); } catch { return; }
    const heading = Array.from($('reader-body').querySelectorAll<HTMLElement>('[id]')).find((node) => node.id === id);
    if (heading) this.jump(event, heading);
  };
  // Search makes the reader inert; a concealed reader yields keyboard ownership.
  private readonly trapTab = (event: KeyboardEvent) => {
    if (!this.open || this.root.inert || this.root.closest('[inert]') || event.key !== 'Tab'
      || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const controls = Array.from(this.root.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable]:not([contenteditable="false"])',
    )).filter((element) => {
      const editable = element.matches('[contenteditable]:not([contenteditable="false"])') && !element.hasAttribute('tabindex');
      return (element.tabIndex >= 0 || editable) && !element.matches(':disabled')
        && !element.closest('[hidden], [inert], [aria-hidden="true"]')
        && element.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(element).visibility);
    }).sort((a, b) => {
      const orderA = a.tabIndex > 0 ? a.tabIndex : Number.MAX_SAFE_INTEGER;
      const orderB = b.tabIndex > 0 ? b.tabIndex : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!first || active === this.root || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
      if (!first) this.root.focus();
    }
  };

  constructor(private readonly onNext: (index: number) => void, private readonly reduced = false) {
    this.root.addEventListener('scroll', this.queueReading, { passive: true });
    $('reader-next').addEventListener('click', () => {
      if (posts.length > 1 && posts[this.index]) this.onNext((this.index + 1) % posts.length);
    });
    $('reader-body')?.addEventListener('click', this.bodyAnchor);
    this.heroImg.addEventListener('error', () => this.coverUnavailable());
    this.heroImg.addEventListener('load', () => {
      this.heroImg.hidden = false;
      this.heroImg.closest('.reader-hero')?.classList.remove('is-unavailable');
      this.heroImg.closest('.reader-hero')?.querySelector('.reader-cover-fallback')?.remove();
      this.queueReading();
    });
    if (typeof ResizeObserver !== 'undefined') this.observer = new ResizeObserver(this.queueReading);
    const progress = this.root.querySelector('.reader-progress');
    progress?.setAttribute('role', 'progressbar');
    progress?.setAttribute('aria-valuemin', '0');
    progress?.setAttribute('aria-valuemax', '100');
    this.setProgress(0);
  }

  prefetch(index: number) {
    if (isSiteIntegration()) return;
    const post = posts[index];
    if (post) void fetchBody(post.slug).catch(() => undefined);
  }

  // Keeps the public prepare/reveal split used by the hero morph and route guard.
  prepare(index: number) {
    if (!posts[index]) return;
    // PhotoSwipe is optional reading enhancement; never part of the entry JS.
    void this.imageViewer.preload().catch(() => undefined);
    this.imageViewer.close(false);
    this.index = index;
    this.fill();
    this.root.scrollTop = 0;
    this.root.classList.add('is-active');
    this.root.setAttribute('aria-hidden', 'false');
  }

  fill() {
    const post = posts[this.index];
    if (!post) return;
    this.imageViewer.close();
    this.cancelJump();
    const generation = ++this.generation;
    const english = lang() === 'en';
    $('reader-title').textContent = pick(post.title);
    $('reader-subtitle').textContent = english ? post.title.zh : '';
    $('reader-subtitle').hidden = !english;
    $('reader-lead').textContent = pick(post.summary);
    $('reader-only').textContent = t('article.only');
    $('reader-only').hidden = !english;
    $('reader-tags').replaceChildren(...post.tags.map((tag) => {
      const li = document.createElement('li'); li.textContent = pick(tag); return li;
    }));
    const nextPost = posts.length > 1 ? posts[(this.index + 1) % posts.length] : null;
    const nextButton = $<HTMLButtonElement>('reader-next');
    nextButton.hidden = !nextPost;
    nextButton.disabled = !nextPost;
    $('reader-next-title').textContent = nextPost ? pick(nextPost.title) : '';
    $<HTMLAnchorElement>('reader-original').href = post.url;
    this.heroImg.alt = pick(post.title);
    if (this.heroImg.getAttribute('src') !== post.cover) {
      this.imageViewer.invalidate(this.heroImg);
      this.heroImg.hidden = false;
      this.heroImg.closest('.reader-hero')?.classList.remove('is-unavailable');
      this.heroImg.closest('.reader-hero')?.querySelector('.reader-cover-fallback')?.remove();
      this.heroImg.src = post.cover;
    }
    const body = $('reader-body');
    // Bodies are real Chinese originals; a chrome-language toggle is not a translation.
    body.lang = 'zh-CN';
    if (!isSiteIntegration() && this.loadedSlug === post.slug) {
      this.updateLabels();
      this.updateMeta();
      this.imageViewer.refresh();
      this.queueReading();
      return;
    }
    this.loadedSlug = '';
    this.minutes = 0;
    this.updateMeta();
    this.headings = [];
    this.tocLinks = [];
    this.setProgress(0);
    $('reader-toc').replaceChildren();
    this.mobile?.removeAttribute('open');
    this.mobile?.querySelector('ol')?.replaceChildren();
    body.setAttribute('aria-busy', 'true');
    const loading = document.createElement('p');
    loading.className = 'reader-loading'; loading.setAttribute('role', 'status');
    loading.lang = english ? 'en' : 'zh-CN';
    loading.textContent = copy('Loading article…', '正在加载正文…');
    body.replaceChildren(loading);
    this.imageViewer.refresh();
    this.updateLabels();
    void fetchBody(post.slug).then((html) => {
      if (generation !== this.generation || posts[this.index] !== post) return;
      body.innerHTML = html;
      body.setAttribute('aria-busy', 'false');
      this.loadedSlug = post.slug;
      // Estimate from the original text, before controls and fallback chrome are added.
      this.minutes = Math.max(1, Math.round((body.textContent ?? '').length / 400));
      this.decorate(body);
      this.updateMeta();
    }).catch(() => {
      if (generation !== this.generation || posts[this.index] !== post) return;
      body.setAttribute('aria-busy', 'false');
      const error = document.createElement('div');
      error.className = 'reader-error'; error.lang = lang() === 'en' ? 'en' : 'zh-CN';
      error.setAttribute('role', 'status');
      const message = document.createElement('p');
      message.textContent = copy('The article could not be loaded here.', '正文暂时无法在这里加载。');
      const retry = document.createElement('button'); retry.type = 'button';
      retry.textContent = copy('Try again', '重新加载'); retry.addEventListener('click', () => this.fill());
      const original = this.originalLink();
      error.append(message, retry, original); body.replaceChildren(error);
      this.queueReading();
    });
  }

  private updateMeta() {
    const post = posts[this.index];
    if (post) $('reader-meta').textContent = `${pick(post.category)} — ${post.date}${this.minutes ? ` — ${this.minutes} ${t('article.minutes')}` : ''}`;
  }

  private originalLink() {
    const link = document.createElement('a');
    link.href = posts[this.index].url; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = `${t('article.original')} ↗`;
    return link;
  }

  private imageFallback(image: HTMLImageElement) {
    this.imageViewer.invalidate(image);
    const owner = image.closest('a[href]') || image;
    if (!image.isConnected || !this.root.contains(image) || owner.nextElementSibling?.classList.contains('reader-image-fallback')) return;
    const fallback = document.createElement('div');
    fallback.className = 'reader-image-fallback';
    fallback.dataset.alt = image.alt;
    image.hidden = true; owner.after(fallback);
    // An author-linked image keeps its own destination. Its error UI belongs
    // beside that anchor so our original-article link never becomes nested.
    if (owner !== image && !owner.textContent?.trim() && !owner.querySelector('img:not([hidden])')) {
      const label = document.createElement('span'); label.className = 'reader-image-link-label'; label.dataset.alt = image.alt;
      label.textContent = image.alt || copy('Linked image', '图片链接');
      owner.append(label);
    }
    this.renderImageFallback(fallback);
    this.queueReading();
  }

  private renderImageFallback(fallback: HTMLElement) {
    fallback.lang = lang() === 'en' ? 'en' : 'zh-CN';
    const message = document.createElement('p');
    message.textContent = copy('Image unavailable.', '图片暂时无法加载。');
    const alt = document.createElement('p'); alt.className = 'reader-image-alt'; alt.lang = 'zh-CN';
    alt.textContent = fallback.dataset.alt ?? '';
    fallback.replaceChildren(message, ...(alt.textContent ? [alt] : []), this.originalLink());
  }

  private coverUnavailable() {
    this.imageViewer.invalidate(this.heroImg);
    const figure = this.heroImg.closest('.reader-hero');
    if (!figure || !posts[this.index]) return;
    this.heroImg.hidden = true; figure.classList.add('is-unavailable');
    let fallback = figure.querySelector<HTMLElement>('.reader-cover-fallback');
    if (!fallback) { fallback = document.createElement('figcaption'); fallback.className = 'reader-cover-fallback'; figure.append(fallback); }
    fallback.lang = lang() === 'en' ? 'en' : 'zh-CN';
    fallback.textContent = copy('Cover image unavailable', '封面图片暂时无法加载');
  }

  private decorate(body: HTMLElement) {
    body.querySelectorAll('img').forEach((image) => {
      image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('load', () => {
        if (this.root.contains(image) && image.naturalWidth > 0) {
          image.hidden = false;
          const owner = image.closest('a[href]') || image;
          if (owner.nextElementSibling?.classList.contains('reader-image-fallback')) owner.nextElementSibling.remove();
          owner.querySelector('.reader-image-link-label')?.remove();
        }
        this.imageSettled(image);
      });
      image.addEventListener('error', () => { this.imageFallback(image); this.imageSettled(image); });
      if (image.complete && image.naturalWidth === 0 && image.getAttribute('src')) this.imageFallback(image);
    });
    body.querySelectorAll('table').forEach((table) => {
      const region = document.createElement('div');
      region.className = 'reader-table-scroll'; region.tabIndex = 0; region.setAttribute('role', 'region');
      table.before(region); region.append(table);
    });
    this.headings = Array.from(body.querySelectorAll<HTMLElement>('h2, h3'));
    const ids = new Set(Array.from(this.root.ownerDocument.querySelectorAll<HTMLElement>('[id]')).map((node) => node.id));
    const used = new Set<string>();
    this.headings.forEach((heading, index) => {
      // Keep author anchors intact; supply IDs only where the original has none.
      if (!heading.id || used.has(heading.id)) {
        let id = `reader-section-${index + 1}`;
        while (ids.has(id)) id += '-';
        heading.id = id; ids.add(id);
      }
      used.add(heading.id);
    });
    this.buildContents();
    this.updateLabels();
    this.imageViewer.refresh();
    this.queueReading();
  }

  private buildContents() {
    const toc = $('reader-toc');
    const aside = toc.closest<HTMLElement>('.reader-toc');
    aside?.setAttribute('role', 'navigation');
    if (!this.mobile) {
      this.mobile = document.createElement('details'); this.mobile.className = 'reader-toc-mobile';
      const summary = document.createElement('summary');
      const label = document.createElement('span'); label.className = 'reader-toc-label';
      const count = document.createElement('span'); count.className = 'reader-toc-count';
      summary.append(label, count);
      const nav = document.createElement('nav'); const list = document.createElement('ol'); nav.append(list);
      this.mobile.append(summary, nav); $('reader-body').before(this.mobile);
    }
    let progress = aside?.querySelector('.reader-toc-progress');
    if (!progress && aside) {
      progress = document.createElement('div'); progress.className = 'reader-toc-progress';
      const label = document.createElement('span'); label.className = 'reader-progress-label';
      const value = document.createElement('span'); value.className = 'reader-progress-value'; value.setAttribute('aria-hidden', 'true');
      progress.append(label, value); aside.querySelector('p')?.after(progress);
    }
    const mobileList = this.mobile.querySelector('ol')!;
    toc.replaceChildren(); mobileList.replaceChildren();
    this.tocLinks = this.headings.map((heading) => [toc, mobileList].map((list) => {
      const item = document.createElement('li'); item.className = heading.tagName === 'H3' ? 'is-sub' : '';
      const link = document.createElement('a'); link.href = `#${encodeURIComponent(heading.id)}`; link.textContent = heading.textContent ?? '';
      link.lang = $('reader-body').lang;
      link.addEventListener('click', (event) => this.jump(event, heading));
      item.append(link); list.append(item); return link;
    }));
  }

  private updateLabels() {
    const contents = t('article.contents');
    const aside = $('reader-toc')?.closest<HTMLElement>('.reader-toc');
    if (aside) { aside.hidden = !this.headings.length; aside.setAttribute('aria-label', contents); }
    if (this.mobile) {
      this.mobile.hidden = !this.headings.length;
      this.mobile.querySelector('.reader-toc-label')!.textContent = contents;
      this.mobile.querySelector('.reader-toc-count')!.textContent = copy(`${this.headings.length} sections`, `${this.headings.length} 节`);
      this.mobile.querySelector('nav')!.setAttribute('aria-label', contents);
    }
    const reading = copy('Reading progress', '阅读进度');
    this.root.querySelector('.reader-progress')?.setAttribute('aria-label', reading);
    this.root.querySelectorAll('.reader-progress-label').forEach((label) => { label.textContent = reading; });
    this.root.querySelectorAll<HTMLElement>('.reader-image-fallback').forEach((fallback) => this.renderImageFallback(fallback));
    this.root.querySelectorAll<HTMLElement>('.reader-image-link-label').forEach((label) => {
      label.textContent = label.dataset.alt || copy('Linked image', '图片链接');
    });
    if (this.heroImg.closest('.reader-hero')?.classList.contains('is-unavailable')) this.coverUnavailable();
    this.root.querySelectorAll<HTMLElement>('.reader-table-scroll').forEach((region) => {
      region.setAttribute('aria-label', region.querySelector('caption')?.textContent?.trim() || copy('Article table: scroll horizontally', '正文表格：可横向滚动'));
    });
  }

  private motionReduced() { return this.motion?.matches ?? this.reduced; }

  private imageSettled(image: HTMLImageElement) {
    if (!this.root.contains(image)) return;
    this.jumpTarget?.images.delete(image);
    this.queueReading();
  }

  private jumpDestination(target: HTMLElement) {
    const top = target.getBoundingClientRect().top - this.root.getBoundingClientRect().top + this.root.scrollTop - 96;
    return Math.min(Math.max(0, this.root.scrollHeight - this.root.clientHeight), Math.max(0, top));
  }

  private cancelJump() {
    if (!this.jumpTarget) return;
    this.jumpTarget = null;
    // Native smooth scrolling has no cancel handle. An immediate scroll to its
    // current position releases it before the user's wheel/key/touch takes over.
    this.root.scrollTo({ top: this.root.scrollTop, behavior: 'auto' });
  }

  private correctJump() {
    const jump = this.jumpTarget;
    if (!jump) return;
    if (!this.root.contains(jump.element)) { this.cancelJump(); return; }
    const destination = this.jumpDestination(jump.element);
    if (Math.abs(destination - jump.destination) > 1) {
      jump.destination = destination;
      this.root.scrollTo({ top: destination, behavior: this.motionReduced() ? 'auto' : 'smooth' });
    }
    if (!jump.images.size && Math.abs(this.root.scrollTop - destination) <= 1) this.jumpTarget = null;
  }

  private jump(event: MouseEvent, target: HTMLElement) {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    this.cancelJump();
    this.mobile?.removeAttribute('open');
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    // Public bodies may contain unsized lazy images, unlike the fixed source's
    // dimensioned BlogImage. Keep this one user-chosen target through their
    // load/error reflows; scroll/resize/image events share the existing rAF.
    const destination = this.jumpDestination(target);
    const images = new Set(Array.from($('reader-body').querySelectorAll('img')).filter((image) =>
      !image.complete && !image.hidden && Boolean(image.compareDocumentPosition(target) & 4 /* DOCUMENT_POSITION_FOLLOWING */)));
    this.jumpTarget = { element: target, destination, images };
    this.root.scrollTo({ top: destination, behavior: this.motionReduced() ? 'auto' : 'smooth' });
    this.queueReading();
  }

  reveal() {
    this.open = true;
    this.imageViewer.refresh();
    this.root.addEventListener('keydown', this.trapTab, { capture: true });
    this.root.addEventListener('keydown', this.jumpInput, { capture: true });
    this.root.addEventListener('wheel', this.jumpInput, { passive: true });
    this.root.addEventListener('touchstart', this.jumpInput, { passive: true });
    this.root.addEventListener('pointerdown', this.jumpInput, { passive: true });
    this.root.addEventListener('scrollend', this.jumpScrollEnd);
    this.view?.addEventListener('resize', this.queueReading);
    this.motion?.addEventListener('change', this.onMotion);
    this.observer?.observe(this.root);
    const body = $('reader-body'); if (body) this.observer?.observe(body);
    this.root.classList.add('is-open');
    this.settleEntrance();
    this.queueReading();
    if (this.motionReduced()) return;
    const content = gsap.fromTo(this.root.querySelectorAll('.reader-head > *, .reader-layout'),
      { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.05 });
    const close = gsap.fromTo('#reader-close', { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out', delay: 0.15 });
    if (content) this.entrances.push(content);
    if (close) this.entrances.push(close);
  }

  private settleEntrance() {
    this.entrances.forEach((tween) => tween.kill()); this.entrances = [];
    this.root.querySelectorAll<HTMLElement>('.reader-head > *, .reader-layout, #reader-close').forEach((element) => {
      element.style.removeProperty('transform'); element.style.removeProperty('opacity');
    });
  }

  conceal() {
    this.imageViewer.close(false);
    this.cancelJump();
    this.open = false;
    ++this.generation;
    ++this.frameGeneration;
    if (this.frame !== null) this.view?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.observer?.disconnect();
    this.settleEntrance();
    this.view?.removeEventListener('resize', this.queueReading);
    this.motion?.removeEventListener('change', this.onMotion);
    this.root.removeEventListener('keydown', this.trapTab, { capture: true });
    this.root.removeEventListener('keydown', this.jumpInput, { capture: true });
    this.root.removeEventListener('wheel', this.jumpInput);
    this.root.removeEventListener('touchstart', this.jumpInput);
    this.root.removeEventListener('pointerdown', this.jumpInput);
    this.root.removeEventListener('scrollend', this.jumpScrollEnd);
    this.root.classList.remove('is-open', 'is-active');
    this.root.setAttribute('aria-hidden', 'true');
    if (isSiteIntegration()) {
      clearIntegratedArticle();
      this.loadedSlug = ''; this.headings = []; this.tocLinks = [];
      $('reader-body').replaceChildren();
    }
  }

  private updateReading() {
    const body = $('reader-body');
    if (!body || !this.loadedSlug) return;
    const rootTop = this.root.getBoundingClientRect().top;
    const rect = body.getBoundingClientRect();
    const top = rect.top - rootTop;
    const span = rect.height - this.root.clientHeight;
    const bottom = this.root.scrollTop + this.root.clientHeight >= this.root.scrollHeight - 2;
    // A short body can finish below the fixed close control without ever
    // reaching the viewport top; the reader's real bottom still means done.
    const progress = bottom ? 1 : span <= 0 ? (top <= 0 ? 1 : 0) : clamp(-top / span);
    // Read all layout before writing progress and current-section styles.
    let active = -1;
    if (bottom) active = this.headings.length - 1;
    else for (let index = 0; index < this.headings.length; index++) {
      if (this.headings[index].getBoundingClientRect().top - rootTop > this.root.clientHeight * 0.3) break;
      active = index;
    }
    this.setProgress(progress);
    this.tocLinks.forEach((links, index) => links.forEach((link) => {
      link.classList.toggle('is-active', index === active);
      if (index === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      link.dataset.state = active < 0 || index > active ? 'next' : index === active ? 'active' : 'past';
    }));
  }

  private setProgress(progress: number) {
    const percent = String(Math.round(progress * 100));
    const bar = $('reader-bar'); if (bar) bar.style.transform = `scaleX(${progress})`;
    this.root.querySelector('.reader-progress')?.setAttribute('aria-valuenow', percent);
    this.root.querySelectorAll('.reader-progress-value').forEach((value) => { value.textContent = `${percent}%`; });
  }
}
