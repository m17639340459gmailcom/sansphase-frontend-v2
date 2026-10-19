import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  stdin: {
    contents: "export * from './src/scene-control'; export {stepHeroCycle,HOLD,MORPH_DURATION} from './vendor/tdx/hero-cycle';",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false,
});
const {
  createSceneControl, isSceneIndex, prepareSceneFrame, selectScene, settleScene, sceneIndex,
  stepHeroCycle, HOLD, MORPH_DURATION,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

function tick(control, seconds, reduced = false) {
  for (let elapsed = 0; elapsed < seconds; elapsed += .025) {
    prepareSceneFrame(control);
    stepHeroCycle(control.cycle, .025, { active: true, reduced });
  }
}

test('the first public direction and reduced-motion initial direction both use film storyboard', () => {
  for (const reduced of [false, true]) {
    const control = createSceneControl(reduced);
    assert.equal(control.cycle.to, 4);
    assert.equal(sceneIndex(control.cycle.to), 0);
  }
});

test('untouched autoplay follows content order film, knowledge, identity', () => {
  const control = createSceneControl(false);
  tick(control, HOLD + .025);
  assert.equal(control.cycle.to, 5);
  tick(control, MORPH_DURATION + HOLD + .025);
  assert.equal(control.cycle.to, 6);
});

test('a knowledge-first presentation cycles knowledge, identity, then film without manual locking', () => {
  const control = createSceneControl(false, 1);
  assert.equal(sceneIndex(control.cycle.to), 1);
  assert.equal(control.cycle.to, 5);
  assert.equal(control.manual, false);
  tick(control, HOLD + .025);
  assert.equal(control.cycle.to, 6);
  tick(control, MORPH_DURATION + HOLD + .025);
  assert.equal(control.cycle.to, 4);
});

test('manual content selection stays selected well beyond the autoplay deadline', () => {
  const control = createSceneControl(false);
  selectScene(control, 2, false);
  tick(control, MORPH_DURATION + 100);
  assert.equal(control.cycle.to, 6);
  assert.equal(control.manual, true);
  assert.equal(control.cycle.pending, false);
});

test('rapid new selection waits for the in-flight target and keeps only the latest request', () => {
  const control = createSceneControl(false);
  selectScene(control, 1, false);
  tick(control, .5);
  assert.equal(control.cycle.from, 4);
  assert.equal(control.cycle.to, 5);
  selectScene(control, 2, false);
  selectScene(control, 0, false);
  tick(control, .5);
  assert.equal(control.cycle.to, 5, 'an in-flight shape must not become the new source');
  tick(control, MORPH_DURATION);
  assert.equal(control.cycle.from, 5);
  assert.equal(control.cycle.to, 4, 'last requested content wins after the current landing');
  tick(control, MORPH_DURATION + HOLD * 2);
  assert.equal(control.cycle.to, 4);
});

test('paused/reduced selection settles immediately and does not need animation frames', () => {
  const control = createSceneControl(false);
  selectScene(control, 2, true);
  assert.equal(control.cycle.from, 6);
  assert.equal(control.cycle.to, 6);
  assert.equal(control.cycle.elapsed, MORPH_DURATION);
  assert.equal(control.entrance.done, true);
  assert.equal(control.queued, null);
});

test('pausing before asynchronous setup finishes reveals a settled form without locking autoplay', () => {
  const control = createSceneControl(false);
  settleScene(control, 0);
  assert.equal(control.entrance.done, true);
  assert.equal(control.cycle.from, 4);
  assert.equal(control.cycle.to, 4);
  assert.equal(control.manual, false);
  tick(control, HOLD + .025);
  assert.equal(control.cycle.to, 5, 'resume can continue untouched autoplay');
});

test('invalid public indices are rejected, including fractional and nonfinite input', () => {
  for (const value of [-1, 3, 1.5, Infinity, NaN]) assert.equal(isSceneIndex(value), false);
  for (const value of [0, 1, 2]) assert.equal(isSceneIndex(value), true);
});

test('all vendored source files match fixed-SHA provenance and the cycle changes only target IDs', async () => {
  const provenance = JSON.parse(await readFile(resolve(root, 'vendor/tdx/provenance.json'), 'utf8'));
  assert.equal(provenance.commit, 'c73bc4966f0ba808b978e22eccf5a063fc649751');
  for (const item of provenance.files) {
    const bytes = await readFile(resolve(root, 'vendor/tdx', item.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file);
  }
  const original = await readFile(resolve(root, 'vendor/tdx/hero-cycle.upstream.ts'), 'utf8');
  const adapted = await readFile(resolve(root, 'vendor/tdx/hero-cycle.ts'), 'utf8');
  assert.equal(adapted, original
    .replace('export const PLAYBACK_ORDER = [2, 1, 3] as const;', 'export const PLAYBACK_ORDER = [4, 5, 6] as const;')
    .replace('export const REDUCED_PHASE = 1;', 'export const REDUCED_PHASE = 4;'));
});
