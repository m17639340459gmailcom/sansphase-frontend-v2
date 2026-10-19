import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

/**
 * Thin DOM adapter of TDX's route lift / bottom-up reveal (MIT).
 * DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751:
 * src/app/globals.css:602-604,747-783 and components/providers/page-transition.tsx.
 * GSAP already owns this preview's animation clock; theme ViewTransitions stay
 * independent. The source deliberately clips with 100vh rather than page height.
 * Copyright (c) 2026 Dingxin Tao. See vendor/tdx/LICENSE and SOURCES.json.
 */
gsap.registerPlugin(CustomEase);
const EXIT_EASE = CustomEase.create('sansphase-page-out', '0.5,0,0.75,0');
const ENTER_EASE = CustomEase.create('sansphase-page-in', '0.16,1,0.3,1');

export interface PageTransition {
  readonly pending: boolean;
  /** Only the latest navigation may update the page. Canceled runs resolve false. */
  run(update: () => void, animate: boolean): Promise<boolean>;
  /** Cancel pending work, keep the currently committed content, and reveal it. */
  settle(): void;
  dispose(): void;
}

type TransitionRun = {
  tween: gsap.core.Tween | null;
  resolve(value: boolean): void;
  reject(reason: unknown): void;
};

export function mountPageTransition(main: HTMLElement, options: { reduced(): boolean }): PageTransition {
  let current: TransitionRun | null = null;
  let disposed = false;
  const reveal = () => gsap.set(main, { clearProps: 'transform,opacity,clipPath,willChange' });

  function finish(task: TransitionRun, completed: boolean): void {
    if (current !== task) return;
    current = null;
    task.tween = null;
    reveal();
    task.resolve(completed);
  }

  function settle(): void {
    const task = current;
    if (!task) return;
    // Invalidate before kill(): GSAP may call onInterrupt synchronously. Resolve
    // explicitly rather than awaiting a killed Tween's then(), which can hang.
    current = null;
    task.tween?.kill();
    task.tween = null;
    reveal();
    task.resolve(false);
  }

  return {
    get pending() { return current !== null; },
    run(update, animate) {
      settle();
      if (disposed) return Promise.resolve(false);
      return new Promise<boolean>((resolve, reject) => {
        const task: TransitionRun = { tween: null, resolve, reject };
        current = task;
        const interrupt = () => finish(task, false);
        const enter = () => {
          if (current !== task) return;
          task.tween = null;
          try {
            update();
            // An update may itself navigate; never resume its superseded run.
            if (current !== task) return;
            if (!animate || options.reduced()) { finish(task, true); return; }
            task.tween = gsap.fromTo(main,
              { opacity: 1, scale: 1, y: '3.5rem', clipPath: 'inset(100vh 0 0 0)' },
              { opacity: 1, scale: 1, y: 0, clipPath: 'inset(0 0 0 0)', duration: .6,
                delay: .04, ease: ENTER_EASE, onComplete: () => finish(task, true), onInterrupt: interrupt },
            );
          } catch (error: unknown) {
            if (current === task) { current = null; reveal(); }
            task.reject(error);
          }
        };
        if (!animate || options.reduced()) { enter(); return; }
        gsap.set(main, { willChange: 'transform, opacity, clip-path' });
        task.tween = gsap.to(main, { opacity: 0, y: '-2.5rem', scale: .985, duration: .26,
          ease: EXIT_EASE, onComplete: enter, onInterrupt: interrupt });
      });
    },
    settle,
    dispose() { if (disposed) return; disposed = true; settle(); },
  };
}
