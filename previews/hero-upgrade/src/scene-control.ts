import {
  createHeroCycle, createHeroEntrance, ENTRANCE_DURATION, MORPH_DURATION, PLAYBACK_ORDER, requestNext,
  type HeroCycle, type HeroEntrance,
} from '../vendor/tdx/hero-cycle';

/** Registered content targets; upstream playback timing and physics are intact. */
export const SCENE_SHAPES = [4, 5, 6] as const;
export type SceneIndex = 0 | 1 | 2;

export interface SceneControl {
  cycle: HeroCycle;
  entrance: HeroEntrance;
  manual: boolean;
  queued: SceneIndex | null;
}

export function isSceneIndex(index: number): index is SceneIndex {
  return Number.isInteger(index) && index >= 0 && index < SCENE_SHAPES.length;
}

export function sceneIndex(shape: number): SceneIndex {
  const index = SCENE_SHAPES.findIndex((candidate) => candidate === shape);
  return isSceneIndex(index) ? index : 0;
}

export function createSceneControl(reduced: boolean, initialIndex: SceneIndex = 0): SceneControl {
  const cycle = createHeroCycle(reduced);
  cycle.index = PLAYBACK_ORDER.indexOf(SCENE_SHAPES[initialIndex]);
  cycle.from = cycle.to = SCENE_SHAPES[initialIndex];
  return { cycle, entrance: createHeroEntrance(reduced), manual: false, queued: null };
}

/** A static presentation must show a complete shape without fabricating manual intent. */
export function settleScene(control: SceneControl, index: SceneIndex): void {
  const shape = SCENE_SHAPES[index];
  control.entrance.elapsed = ENTRANCE_DURATION;
  control.entrance.done = true;
  control.cycle.index = PLAYBACK_ORDER.indexOf(shape);
  control.cycle.from = control.cycle.to = shape;
  control.cycle.elapsed = MORPH_DURATION;
  control.cycle.hold = 0;
  control.cycle.pending = false;
  control.queued = null;
}

/** Latest intent wins, but an in-flight source is never used as a new origin. */
export function selectScene(control: SceneControl, index: SceneIndex, instant: boolean): void {
  control.manual = true;
  control.entrance.elapsed = ENTRANCE_DURATION;
  control.entrance.done = true;
  if (instant) {
    settleScene(control, index);
  } else {
    control.queued = index;
  }
}

/** Called before the unchanged upstream engine advances its cycle. */
export function prepareSceneFrame(control: SceneControl): void {
  const cycle = control.cycle;
  // Manual content choice must not be replaced by a later autoplay deadline.
  if (control.manual) cycle.hold = 0;
  if (control.queued === null || cycle.elapsed < MORPH_DURATION) return;
  const target = SCENE_SHAPES[control.queued];
  control.queued = null;
  if (cycle.to === target) return;
  const targetIndex = PLAYBACK_ORDER.indexOf(target);
  cycle.index = (targetIndex + PLAYBACK_ORDER.length - 1) % PLAYBACK_ORDER.length;
  requestNext(cycle);
}
