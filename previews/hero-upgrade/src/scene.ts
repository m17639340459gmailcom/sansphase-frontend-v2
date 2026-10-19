import * as THREE from 'three';
import { HeroEngine, type HeroFrame } from '../vendor/tdx/hero-engine';
import {
  createHeroTelemetry, scrollScatter, type HeroInteraction, type HeroSimulationMode,
} from '../vendor/tdx/hero-interaction';
import { ENTRANCE_DURATION, MORPH_DURATION } from '../vendor/tdx/hero-cycle';
import { packShapeAtlasAsync } from '../vendor/tdx/hero-shapes';
import { detectSimulationType, isSoftwareRenderer } from '../vendor/tdx/hero-simulation';
import type { ScenePalette } from '../vendor/tdx/palette';
import { prepareSceneShapes } from './scene-shapes';
import {
  createSceneControl, isSceneIndex, prepareSceneFrame, sceneIndex, SCENE_SHAPES, selectScene, settleScene, type SceneIndex,
} from './scene-control';

export type SceneTheme = 'light' | 'dark';
export type ScenePhase = 'loading' | 'entrance' | 'morphing' | 'settled' | 'error';
export interface SceneState {
  index: SceneIndex;
  shape: 'storyboard' | 'knowledge' | 'identity';
  phase: ScenePhase;
  progress: number;
  paused: boolean;
  manual: boolean;
  reduced: boolean;
  mode: HeroSimulationMode;
  particleCount: number;
  fps: number;
  pointerX: number;
  pointerY: number;
  pointerInside: boolean;
  holdProgress: number;
  scatter: number;
  running: boolean;
}
export interface SceneOptions {
  /** Separate the visible interaction target from the enlarged drawing headroom. */
  inputSurface?: HTMLElement;
  initialIndex?: SceneIndex;
  onState?: (state: Readonly<SceneState>) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}
export interface SceneHandle {
  select(index: number): void;
  setPaused(paused: boolean): void;
  setTheme(theme: SceneTheme): void;
  setActive(active: boolean): void;
  resize(): void;
  dispose(): void;
  getState(): Readonly<SceneState>;
}

/** Brand palette only; rendering and physics remain upstream MIT code. */
const PALETTES: Record<SceneTheme, ScenePalette> = {
  light: {
    accent: '#354cff', accentStrong: '#2230a7', amber: '#778aff', cool: '#87b6f0',
    wire: '#354cff', point: '#202b40', pointOpacity: .58, additive: false,
  },
  dark: {
    accent: '#9aaaff', accentStrong: '#c0cbff', amber: '#c2d9ff', cool: '#9dc7ef',
    wire: '#a3b4ff', point: '#dce6f7', pointOpacity: .56, additive: true,
  },
};
const SHAPE_NAMES = ['storyboard', 'knowledge', 'identity'] as const;
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** Camera remains upstream's 38° / distance-7; targets fit inside the HUD. */
const PRESENTATION_SCALE: Readonly<Record<number, number>> = { 4: .9, 5: .9, 6: 1 };

/** Native-TS adapter for TDX's HeroEngine. No R3F/React lifecycle is required. */
export function mountScene(canvas: HTMLCanvasElement, options: SceneOptions = {}): SceneHandle {
  const inputSurface = options.inputSurface ?? canvas;
  const motionPreference = window.matchMedia(REDUCED_QUERY);
  let reduced = motionPreference.matches;
  let paused = false;
  let active = true;
  let onscreen = true;
  let disposed = false;
  let failed = false;
  let ready = false;
  let contextLost = false;
  let theme: SceneTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  let renderer: THREE.WebGLRenderer | null = null;
  let engine: HeroEngine | null = null;
  let frameId = 0;
  let lastTime = 0;
  let lastReport = 0;
  let lastSignature = '';
  let width = 1;
  let height = 1;
  let scroll = 0;
  let resume = true;
  let gesture: { x: number; y: number; moved: boolean; mouse: boolean } | null = null;
  let desiredIndex: SceneIndex | null = null;
  const initialIndex = options.initialIndex !== undefined && isSceneIndex(options.initialIndex) ? options.initialIndex : 0;
  let presentationScale = PRESENTATION_SCALE[SCENE_SHAPES[initialIndex]];
  const control = createSceneControl(reduced, initialIndex);
  const pointer: HeroInteraction = { x: 0, y: 0, inside: false, dragging: false, dragX: 0, dragY: 0 };
  const telemetry = createHeroTelemetry();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, 0, 7);
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const frame: HeroFrame = {
    delta: 0, resume: true, active: true, reduced, holdEntrance: false,
    interaction: pointer, camera, width, height, pixelRatio: dpr, scroll: 0,
  };

  const running = (): boolean => ready && !disposed && !failed && !contextLost && active && onscreen
    && document.visibilityState === 'visible' && !paused && !reduced;

  function state(): Readonly<SceneState> {
    const index = desiredIndex ?? sceneIndex(control.cycle.to);
    const phase: ScenePhase = failed ? 'error' : !ready ? 'loading' : !control.entrance.done ? 'entrance'
      : control.cycle.elapsed < MORPH_DURATION ? 'morphing' : 'settled';
    return {
      index, shape: SHAPE_NAMES[index], phase,
      progress: phase === 'entrance' ? control.entrance.elapsed / ENTRANCE_DURATION
        : phase === 'morphing' ? control.cycle.elapsed / MORPH_DURATION : 1,
      paused, manual: control.manual, reduced, mode: reduced ? 'static' : engine?.mode ?? 'shader',
      particleCount: engine?.count ?? 0,
      fps: running() ? telemetry.fps : 0,
      pointerX: pointer.x, pointerY: pointer.y, pointerInside: pointer.inside,
      holdProgress: telemetry.holdProgress, scatter: telemetry.scatter, running: running(),
    };
  }

  function report(force = false): void {
    const value = state();
    const signature = `${value.index}:${value.phase}:${value.paused}:${value.manual}:${value.reduced}:${value.mode}`;
    const now = performance.now();
    if (force || signature !== lastSignature || now - lastReport > 100) {
      lastSignature = signature;
      lastReport = now;
      options.onState?.(value);
    }
  }

  function fail(reason: unknown): void {
    if (disposed || failed) return;
    failed = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    canvas.dataset.sceneReady = 'false';
    report(true);
    options.onError?.(reason instanceof Error ? reason : new Error(String(reason)));
  }

  function draw(delta = 0, instant = false): void {
    if (!engine || !renderer || disposed || failed || contextLost) return;
    prepareSceneFrame(control);
    // A paused/reduced selection draws a settled frame without starting a loop.
    const effectiveReduced = reduced || instant;
    if (effectiveReduced) control.cycle.reduced = true;
    const targetScale = PRESENTATION_SCALE[control.cycle.to] ?? 1;
    presentationScale = effectiveReduced ? targetScale
      : THREE.MathUtils.damp(presentationScale, targetScale, 5, Math.max(0, Math.min(delta, .05)));
    engine.object.scale.setScalar(presentationScale);
    // HeroEngine projects pointer rays through points.matrixWorld during frame().
    // Update the parent transform first so interaction uses the presented scale.
    engine.object.updateMatrixWorld(true);
    frame.delta = delta;
    frame.resume = resume;
    frame.active = active && onscreen && document.visibilityState === 'visible';
    frame.reduced = effectiveReduced;
    frame.width = width;
    frame.height = height;
    frame.scroll = scroll;
    engine.frame(renderer, frame);
    resume = false;
    renderer.render(scene, camera);
    engine.writeTelemetry(telemetry, pointer, running(), effectiveReduced);
    report();
  }

  function loop(time: number): void {
    frameId = 0;
    if (!running()) return;
    try {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0;
      lastTime = time;
      draw(delta);
      frameId = requestAnimationFrame(loop);
    } catch (error: unknown) { fail(error); }
  }

  function schedule(): void {
    if (!running()) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastTime = 0;
      resume = true;
      return;
    }
    if (!frameId) {
      lastTime = 0;
      resume = true;
      frameId = requestAnimationFrame(loop);
    }
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
    scroll = scrollScatter(rect.top, rect.height, window.innerHeight);
    if (ready) {
      if (paused) renderer?.render(scene, camera);
      else draw(0, reduced);
    }
  }

  function choose(index: number, x = 0, y = 0): void {
    if (!isSceneIndex(index) || disposed) return;
    desiredIndex = index;
    selectScene(control, index, paused || reduced);
    if (ready) {
      if (!paused && !reduced) engine?.shock(x, y, camera, false);
      draw(0, paused || reduced);
      schedule();
    }
    report(true);
  }

  function updatePointer(event: PointerEvent): void {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.moved = true;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, 1 - (event.clientY - rect.top) / rect.height * 2));
    if (gesture?.mouse && (event.buttons & 1) === 1) {
      pointer.dragging = gesture.moved;
      pointer.dragX = (pointer.dragX ?? 0) + x - pointer.x;
      pointer.dragY = (pointer.dragY ?? 0) + y - pointer.y;
      inputSurface.dataset.dragging = gesture.moved ? 'true' : 'false';
    }
    pointer.x = x;
    pointer.y = y;
    pointer.inside = event.pointerType !== 'touch';
  }

  function leavePointer(): void {
    pointer.inside = false;
    pointer.dragging = false;
    pointer.dragX = pointer.dragY = 0;
    inputSurface.dataset.dragging = 'false';
  }

  function down(event: PointerEvent): void {
    if (event.button !== 0) return;
    gesture = { x: event.clientX, y: event.clientY, moved: false, mouse: event.pointerType === 'mouse' };
    if (gesture.mouse) inputSurface.setPointerCapture(event.pointerId);
    updatePointer(event);
  }
  function up(): void { pointer.dragging = false; inputSurface.dataset.dragging = 'false'; }
  function cancel(): void { gesture = null; leavePointer(); }
  function click(event: MouseEvent): void {
    const dragged = event.detail !== 0 && gesture?.moved;
    gesture = null;
    pointer.dragging = false;
    if (dragged) return;
    choose(((desiredIndex ?? sceneIndex(control.cycle.to)) + 1) % SCENE_SHAPES.length, event.detail ? pointer.x : 0, event.detail ? pointer.y : 0);
  }
  function key(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(((desiredIndex ?? sceneIndex(control.cycle.to)) + 1) % SCENE_SHAPES.length);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      choose(((desiredIndex ?? sceneIndex(control.cycle.to)) + (event.key === 'ArrowRight' ? 1 : 2)) % SCENE_SHAPES.length);
    }
  }
  function onScroll(): void {
    const rect = canvas.getBoundingClientRect();
    scroll = scrollScatter(rect.top, rect.height, window.innerHeight);
  }
  function visibility(): void {
    if (document.visibilityState !== 'visible') cancel();
    schedule();
  }
  function preference(): void {
    reduced = motionPreference.matches;
    if (reduced) {
      settleScene(control, desiredIndex ?? sceneIndex(control.cycle.to));
      control.cycle.reduced = true;
      draw(0, true);
    }
    schedule();
    report(true);
  }
  function lost(event: Event): void { event.preventDefault(); contextLost = true; schedule(); }
  function restored(): void {
    contextLost = false;
    engine?.restoreContext();
    resize();
    schedule();
  }

  inputSurface.addEventListener('pointerenter', updatePointer);
  inputSurface.addEventListener('pointermove', updatePointer);
  inputSurface.addEventListener('pointerleave', leavePointer);
  inputSurface.addEventListener('pointerdown', down);
  inputSurface.addEventListener('pointerup', up);
  inputSurface.addEventListener('lostpointercapture', up);
  inputSurface.addEventListener('pointercancel', cancel);
  inputSurface.addEventListener('click', click);
  inputSurface.addEventListener('keydown', key);
  inputSurface.addEventListener('blur', leavePointer);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);
  motionPreference.addEventListener('change', preference);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer = new IntersectionObserver((entries) => {
    onscreen = entries[0]?.isIntersecting ?? false;
    schedule();
  }, { threshold: .1 });
  observer.observe(canvas);

  // Renderer creation is deferred so the handle exists even if WebGL is unavailable.
  void (async () => {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      resize();
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (memory !== undefined && memory <= 4)
        || window.matchMedia('(pointer: coarse)').matches || isSoftwareRenderer(renderer);
      const count = weak ? 120 ** 2 : 256 ** 2;
      await prepareSceneShapes();
      if (disposed) return;
      const atlas = await packShapeAtlasAsync(SCENE_SHAPES, count);
      if (disposed) return;
      const candidate = new HeroEngine(atlas, control.cycle, control.entrance, detectSimulationType(renderer), PALETTES[theme], reduced);
      engine = candidate;
      await candidate.prepare(renderer, camera);
      if (disposed) return;
      scene.add(candidate.object);
      ready = true;
      canvas.dataset.sceneReady = 'true';
      // Pausing during async GPU setup should reveal a complete, useful form,
      // rather than permanently freezing the nearly invisible entrance dust.
      if (paused) settleScene(control, desiredIndex ?? sceneIndex(control.cycle.to));
      draw(0, reduced || paused);
      options.onReady?.();
      report(true);
      schedule();
    } catch (error: unknown) { fail(error); }
  })();

  report(true);
  return {
    select: (index) => choose(index),
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      leavePointer();
      schedule();
      report(true);
    },
    setTheme(value) {
      theme = value;
      engine?.setPalette(PALETTES[theme]);
      if (ready && renderer) renderer.render(scene, camera);
    },
    setActive(value) { if (active !== value) { active = value; schedule(); } },
    resize,
    getState: state,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      resizeObserver.disconnect();
      inputSurface.removeEventListener('pointerenter', updatePointer);
      inputSurface.removeEventListener('pointermove', updatePointer);
      inputSurface.removeEventListener('pointerleave', leavePointer);
      inputSurface.removeEventListener('pointerdown', down);
      inputSurface.removeEventListener('pointerup', up);
      inputSurface.removeEventListener('lostpointercapture', up);
      inputSurface.removeEventListener('pointercancel', cancel);
      inputSurface.removeEventListener('click', click);
      inputSurface.removeEventListener('keydown', key);
      inputSurface.removeEventListener('blur', leavePointer);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      motionPreference.removeEventListener('change', preference);
      engine?.dispose();
      renderer?.dispose();
      scene.clear();
      engine = null;
      renderer = null;
    },
  };
}
