/**
 * The existing homepage marquee, extracted without changing its motion.
 * Visibility follows TDX VelocityMarquee/useInViewport's repeatable observer
 * gate. Observe the stationary wrapper, never the translating content row.
 * The caller supplies reduced motion, focus and page visibility via setActive.
 */
import { clamp } from './util';

export class Marquee {
  x = 0;
  third = 1;
  skew = 0;
  slow = 1;
  private visible = false;
  private active: boolean | null = null;
  private needsMeasure = true;
  private disposed = false;
  private ownsTransform = false;
  private observer: IntersectionObserver | null = null;
  private readonly originalTransform: string;
  private readonly originalPriority: string;
  private readonly onEnter = () => { if (this.visible && this.active !== false && !this.disposed) this.slow = 0.15; };
  private readonly onLeave = () => { this.slow = 1; };

  constructor(
    readonly el: HTMLElement,
    readonly dir: number,
    readonly base: number,
  ) {
    this.originalTransform = el.style.getPropertyValue('transform');
    this.originalPriority = el.style.getPropertyPriority('transform');
    const Observer = el.ownerDocument.defaultView?.IntersectionObserver;
    const wrapper = el.parentElement;
    // Older clients retain the existing animation rather than using layout
    // polling. Supported clients wait for their first intersection report.
    this.visible = !Observer;
    if (Observer && wrapper) {
      this.observer = new Observer(entries => {
        if (this.disposed) return;
        for (const entry of entries) {
          if (entry.target !== wrapper) continue;
          this.visible = entry.isIntersecting;
          if (!this.visible) this.slow = 1;
          else if (this.needsMeasure && this.active !== false) this.measure();
        }
      }, { threshold: 0 });
      this.observer.observe(wrapper);
    }
    el.addEventListener('pointerenter', this.onEnter);
    el.addEventListener('pointerleave', this.onLeave);
  }

  measure() {
    if (this.disposed) return;
    const width = this.el.scrollWidth;
    // Font readiness, resize and language rebuilding also run on inner pages.
    // A display:none homepage has no measurable cycle; caching 1px makes both
    // rows appear stationary after returning even though update still runs.
    this.needsMeasure = width <= 0;
    if (this.needsMeasure) return;
    this.third = Math.max(1, width / 3);
    if (this.x < -this.third || this.x > 0) this.x = -(((-this.x % this.third) + this.third) % this.third);
  }

  setActive(next: boolean) {
    if (this.disposed || this.active === next) return;
    this.active = next;
    this.slow = 1;
    // Resume measures once after the view is shown. It also works when the
    // browser coalesced route intersections or has no IntersectionObserver.
    if (next) this.measure();
  }

  update(dt: number, velocity: number) {
    if (this.disposed || this.active === false || !this.visible || this.needsMeasure) return;
    const speed = (this.base + Math.abs(velocity) * 4) * this.slow;
    this.x += this.dir * speed * dt;
    if (this.x <= -this.third) this.x += this.third;
    if (this.x > 0) this.x -= this.third;
    this.skew += (clamp(-7, 7, velocity * 0.25 * this.dir) - this.skew) * Math.min(1, dt * 6);
    this.el.style.transform = `translate3d(${this.x.toFixed(2)}px,0,0) skewX(${this.skew.toFixed(2)}deg)`;
    this.ownsTransform = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.visible = false;
    this.active = false;
    this.slow = 1;
    this.observer?.disconnect();
    this.observer = null;
    this.el.removeEventListener('pointerenter', this.onEnter);
    this.el.removeEventListener('pointerleave', this.onLeave);
    if (this.ownsTransform) {
      if (this.originalTransform) this.el.style.setProperty('transform', this.originalTransform, this.originalPriority);
      else this.el.style.removeProperty('transform');
    }
  }
}
