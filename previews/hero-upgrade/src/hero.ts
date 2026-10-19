import { lang, pick } from './i18n';
import { theme } from './theme';
import type { SceneHandle, SceneState } from './scene';
import { heroSources, postForHeroSource } from './hero-sources';
import { mountAmbient, mountCursor } from './ambient';
import { HOLD, MORPH_DURATION } from '../vendor/tdx/hero-cycle';
import { isSceneIndex } from './scene-control';

/** DOM adapter for the reference first screen. The particle engine owns motion;
 * this module connects its real state to the HUD, content and keyboard UI. */
export function mountHero() {
  const hero = document.querySelector<HTMLElement>('#top')!;
  const stage = hero.querySelector<HTMLElement>('#hero-stage')!;
  const canvas = hero.querySelector<HTMLCanvasElement>('#hero-canvas')!;
  const input = hero.querySelector<HTMLButtonElement>('#hero-input')!;
  const hud = hero.querySelector<HTMLElement>('#hero-hud-inner')!;
  const fallback = hero.querySelector<HTMLElement>('.hero-fallback')!;
  const fallbackImage = hero.querySelector<HTMLImageElement>('#hero-fallback-image')!;
  const status = hero.querySelector<HTMLElement>('#hero-art-status')!;
  const ambient = mountAmbient(hero);
  const removeCursor = mountCursor();
  const events = new AbortController();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let selected: SceneState['index'] = 0;
  let entered = false;
  let active = false;
  let disposed = false;
  let paused = false;
  let failed = false;
  let state: Readonly<SceneState> | null = null;
  let scene: SceneHandle | null = null;
  let sceneTask: Promise<void> | null = null;
  let selectionPending = false;
  const phrase = (zh: string, en: string) => lang() === 'zh' ? zh : en;
  const text = (selector: string, value: string) => { hero.querySelector(selector)!.textContent = value; };

  function renderMotion() {
    const reduced = state?.reduced ?? motionPreference.matches;
    const unavailable = failed || reduced;
    stage.dataset.playing = String(active && !paused && !unavailable);
    input.title = unavailable ? phrase('静态浏览 · 点击切换形态', 'Static view · Click to change form') : phrase('点击切换形态，拖动旋转；P 暂停或继续', 'Click to morph, drag to rotate; P to pause or resume');
    text('#hero-interaction-tip', failed ? phrase('选择主题 · 阅读记录', 'Choose a topic · Read the story') : phrase('点击切换形态 · 拖动旋转', 'Click to morph · Drag to rotate'));
    ambient.setPaused(!active || paused || unavailable);
  }

  function renderTelemetry() {
    text('#hero-count', state && state.particleCount > 0 && !failed ? new Intl.NumberFormat('en-US').format(state.particleCount) : '—');
    text('#hero-fps', state && active && !paused && !state.reduced && !failed && state.fps > 0 ? String(Math.round(state.fps)) : '—');
    text('#hero-mode', failed ? 'STATIC' : state && state.phase !== 'loading' ? state.mode.toUpperCase() : '—');
    const phase = failed ? phrase('静态浏览', 'Static view') : state?.reduced ? phrase('静态', 'Static') : paused ? phrase('已暂停', 'Paused') : state?.phase === 'entrance' ? phrase('聚合', 'Assembling') : state?.phase === 'morphing' ? phrase('变形', 'Morphing') : state?.phase === 'settled' ? phrase('稳定', 'Stable') : phrase('准备成相', 'Preparing');
    text('#hero-phase', phase);
    const progress = failed || !state ? 0 : state.phase === 'entrance' ? state.progress
      : state.phase === 'morphing' ? state.progress * MORPH_DURATION / (MORPH_DURATION + HOLD)
      : state.phase === 'settled' ? (MORPH_DURATION + state.holdProgress * HOLD) / (MORPH_DURATION + HOLD) : 0;
    hero.querySelector<HTMLElement>('#hero-progress')!.style.setProperty('--hero-progress', String(Math.max(0, Math.min(1, progress))));
    const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`;
    text('#hero-x', signed(state?.pointerX ?? 0));
    text('#hero-y', signed(state?.pointerY ?? 0));
  }

  function render() {
    const post = postForHeroSource(selected);
    hero.setAttribute('aria-label', phrase('無相的探索与创作', 'SANSPHASE: exploration and creative work'));
    text('#hero-index', `${String(selected + 1).padStart(2, '0')} / 03`);
    text('#hero-shape', pick(heroSources[selected].label));
    text('#hero-shape-label', phrase('形态', 'Form'));
    status.textContent = failed
      ? phrase('动效暂时不可用，仍可以切换静态形态或阅读博客。', 'Motion is unavailable. You can change static forms or read the journal.')
      : `${pick(heroSources[selected].label)}${phrase('：点击切换形态，拖动旋转。也可以使用方向键和回车，P 暂停或继续。', ': click to morph, drag to rotate, or use the arrow keys and Enter. P pauses or resumes motion.')}`;
    input.setAttribute('aria-label', `${pick(heroSources[selected].label)}${phrase('粒子。点击或回车切换，拖动旋转，左右方向键选择形态，P 暂停或继续。', ' particles. Click or press Enter to morph. Drag to rotate, arrow keys select a form, P pauses or resumes motion.')}`);
    stage.classList.toggle('has-record', Boolean(post));
    if (post) {
      if (fallbackImage.getAttribute('src') !== post.cover) fallbackImage.src = post.cover;
    } else fallbackImage.removeAttribute('src');
    renderMotion();
    renderTelemetry();
  }

  function showStatic() {
    if (disposed) return;
    failed = true;
    stage.classList.add('is-static');
    stage.classList.remove('is-ready');
    fallback.hidden = false;
    stage.setAttribute('aria-busy', 'false');
    renderMotion();
    renderTelemetry();
    status.textContent = phrase('动效暂时不可用，仍可以切换静态形态或阅读博客。', 'Motion is unavailable. You can change static forms or read the journal.');
  }

  function change(index: number) {
    if (disposed || !isSceneIndex(index) || !heroSources[index]) return;
    selected = index;
    selectionPending = !scene;
    render();
    status.textContent = `${phrase('当前形态', 'Current form')}: ${pick(heroSources[index].label)}`;
    scene?.select(index);
  }

  input.addEventListener('click', event => {
    if (scene && !failed) return;
    event.stopImmediatePropagation();
    change((selected + 1) % heroSources.length);
  }, { signal: events.signal });
  fallbackImage.addEventListener('error', () => stage.classList.add('image-unavailable'), { signal: events.signal });
  input.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'p') {
      if (event.repeat || failed || (state?.reduced ?? motionPreference.matches)) return;
      event.preventDefault();
      paused = !paused; scene?.setPaused(paused); renderMotion(); renderTelemetry();
      status.textContent = paused ? phrase('主视觉动效已暂停。', 'Visual motion paused.') : phrase('主视觉动效已继续。', 'Visual motion resumed.');
    } else if (!scene || failed) {
      const step = event.key === 'ArrowLeft' ? heroSources.length - 1 : ['ArrowRight', 'Enter', ' '].includes(event.key) ? 1 : 0;
      if (!step) return;
      event.preventDefault(); event.stopImmediatePropagation();
      change((selected + step) % heroSources.length);
    }
  }, { signal: events.signal });
  // Original HUD markers project the real pointer onto the frame's rulers.
  input.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    hud.dataset.tracking = '';
    hud.toggleAttribute('data-outside', x < 0 || x > 1 || y < 0 || y > 1);
    hud.style.setProperty('--hud-x', x.toFixed(4));
    hud.style.setProperty('--hud-y', y.toFixed(4));
  }, { signal: events.signal });
  input.addEventListener('pointerleave', () => { delete hud.dataset.tracking; }, { signal: events.signal });
  motionPreference.addEventListener('change', renderMotion, { signal: events.signal });

  // The DOM, real content links and cursor are usable before the optional GPU
  // runtime downloads. Inner routes never request Three.js through this hero.
  async function prepareScene() {
    if (disposed || scene || sceneTask || failed || !active) return;
    stage.setAttribute('aria-busy', 'true');
    sceneTask = (async () => {
      try {
        if (new URLSearchParams(location.search).has('static')) throw new Error('Static preview requested');
        const { mountScene } = await import('./scene');
        if (disposed || !active) return;
        const requestedIndex = selectionPending ? selected : null;
        scene = mountScene(canvas, {
      initialIndex: selected,
      inputSurface: input,
      onReady() {
        if (disposed || failed) return;
        fallback.hidden = true;
        failed = false; stage.classList.remove('is-static'); stage.classList.add('is-ready'); render();
      },
      onState(next) {
        if (disposed || failed) return;
        state = next;
        stage.dataset.phase = next.phase;
        stage.setAttribute('aria-busy', String(next.phase === 'loading' || next.phase === 'entrance' || next.phase === 'morphing'));
        if (next.phase === 'error') { showStatic(); return; }
        if (next.index !== selected) { selected = next.index; render(); }
        else { renderMotion(); renderTelemetry(); }
      },
      onError: showStatic,
        });
        scene.setTheme(theme());
        scene.setPaused(paused);
        if (requestedIndex !== null) { scene.select(requestedIndex); selectionPending = false; }
        scene.setActive(active);
      } catch { if (!disposed) showStatic(); }
    })();
    try { await sceneTask; } finally { sceneTask = null; }
  }
  const observer = new MutationObserver(() => scene?.setTheme(theme()));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  render();

  return {
    refresh() { if (!disposed) render(); },
    select: change,
    enter() {
      if (disposed) return;
      entered = true; active = true; hero.classList.add('is-entered');
      scene?.setPaused(paused); scene?.setActive(true); renderMotion();
      return prepareScene();
    },
    setActive(next: boolean) {
      const enabled = next && entered && !disposed;
      if (active === enabled) return;
      active = enabled; scene?.setActive(enabled); if (enabled) void prepareScene(); renderMotion(); renderTelemetry();
    },
    resize() { scene?.resize(); },
    dispose() {
      if (disposed) return;
      disposed = true; events.abort(); observer.disconnect(); scene?.dispose(); ambient.dispose(); removeCursor();
    },
  };
}
