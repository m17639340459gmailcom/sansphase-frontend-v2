import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
// Browser scheduling is tested independently of the real GPU implementation.
// Production keeps its unmodified shaders; the browser visual check covers those.
const result = await build({
  entryPoints: [`${root}src/scene.ts`], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
    name: 'scene-browser-boundary',
    setup(plugin) {
      plugin.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'fake-browser' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fake-browser' }, () => ({ contents: `
        export const NoToneMapping=0,SRGBColorSpace='srgb';
        export const MathUtils={damp:(x,y,rate,dt)=>y+(x-y)*Math.exp(-rate*dt)};
        export class PerspectiveCamera {position={set(){}};aspect=1;updateMatrixWorld(){}updateProjectionMatrix(){}}
        export class Scene {add(){}clear(){}}
        export class WebGLRenderer {
          setPixelRatio(){}setClearColor(){}setSize(){}dispose(){globalThis.__sceneProbe.disposed=true}
          render(){globalThis.__sceneProbe.renders++}
        }
      ` }));
      plugin.onLoad({ filter: /[\\/]vendor[\\/]tdx[\\/]hero-engine\.ts$/ }, () => ({
        contents: `
          import {stepHeroCycle,stepHeroEntrance} from './hero-cycle';
          export class HeroEngine {
            object={scale:{setScalar(value){globalThis.__sceneProbe.scale=value}},updateMatrixWorld(){}};mode='shader';count=14400;
            constructor(atlas,cycle,entrance,type,palette){this.cycle=cycle;this.entrance=entrance;globalThis.__sceneProbe.palette=palette}
            async prepare(){await globalThis.__sceneProbe.preparation}
            setPalette(p){globalThis.__sceneProbe.palette=p}
            frame(renderer,input){
              globalThis.__sceneProbe.frames.push({active:input.active, reduced:input.reduced, dragging:input.interaction.dragging});
              stepHeroEntrance(this.entrance,input.resume?0:input.delta,{active:input.active,reduced:input.reduced,hold:false});
              if(this.entrance.done)return stepHeroCycle(this.cycle,input.resume?0:input.delta,{active:input.active,reduced:input.reduced});
              return null;
            }
            writeTelemetry(target,pointer,running){target.fps=running?60:0}
            shock(x,y){globalThis.__sceneProbe.shocks.push([x,y])}
            restoreContext(){globalThis.__sceneProbe.restores++}dispose(){}
          }
        `, resolveDir: `${root}vendor/tdx`, loader: 'ts',
      }));
      plugin.onLoad({ filter: /[\\/]vendor[\\/]tdx[\\/]hero-shapes\.ts$/ }, () => ({ contents: 'export async function packShapeAtlasAsync(){return {}}' }));
      plugin.onLoad({ filter: /[\\/]src[\\/]scene-shapes\.ts$/ }, () => ({ contents: 'export async function prepareSceneShapes(){}' }));
      plugin.onLoad({ filter: /[\\/]vendor[\\/]tdx[\\/]hero-simulation\.ts$/ }, () => ({ contents: 'export const isSoftwareRenderer=()=>false;export const detectSimulationType=()=>null;' }));
    },
  }],
});
const { mountScene } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

function browser() {
  const names = ['window', 'document', 'navigator', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const pending = new Map();
  let nextId = 0;
  let finishPreparation;
  const preparation = new Promise((resolve) => { finishPreparation = resolve; });
  const probe = { renders: 0, frames: [], preparation, disposed: false, palette: null, shocks: [], restores: 0 };
  globalThis.__sceneProbe = probe;
  const preference = Object.assign(new EventTarget(), { matches: false });
  const windowValue = Object.assign(new EventTarget(), {
    devicePixelRatio: 1, innerHeight: 900,
    matchMedia: (query) => query.includes('reduced-motion') ? preference : Object.assign(new EventTarget(), { matches: false }),
  });
  const documentValue = Object.assign(new EventTarget(), {
    visibilityState: 'visible', documentElement: { dataset: { theme: 'dark' } },
  });
  const values = {
    window: windowValue, document: documentValue, navigator: { hardwareConcurrency: 8 },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { pending.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id) => pending.delete(id),
  };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const canvas = Object.assign(new EventTarget(), {
    dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 600 }), setPointerCapture() {},
  });
  return {
    canvas, probe, pending, preference, document: documentValue,
    async ready() { finishPreparation(); for (let i = 0; i < 12; i++) await Promise.resolve(); },
    frame(time) { const [id, callback] = pending.entries().next().value; pending.delete(id); callback(time); },
    event(name, properties) {
      const event = new Event(name, { cancelable: true });
      Object.assign(event, properties);
      canvas.dispatchEvent(event);
    },
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      delete globalThis.__sceneProbe;
    },
  };
}

test('async ready honors inactive mount, early theme choice, and subsequent activation', async () => {
  const env = browser();
  let handle;
  let synchronousState = false;
  let readyCalled = false;
  try {
    handle = mountScene(env.canvas, {
      onState: () => { if (!handle) synchronousState = true; },
      onReady: () => { readyCalled = true; },
    });
    handle.setActive(false);
    handle.setTheme('light');
    await env.ready();
    assert.equal(synchronousState, true);
    assert.equal(readyCalled, true);
    assert.equal(env.probe.palette.accent, '#354cff', 'early light choice is used when constructing the engine');
    assert.equal(env.probe.scale, .9, 'the thick camera body clears the readable HUD labels and lower controls');
    assert.equal(env.pending.size, 0, 'initializing the GPU must not reactivate an inactive route');
    handle.setActive(true);
    assert.equal(env.pending.size, 1);
    env.frame(100);
    assert.equal(env.probe.frames.at(-1).active, true);
    handle.setActive(false);
    assert.equal(env.pending.size, 0);
  } finally { handle?.dispose(); env.restore(); }
});

test('a separate input surface owns pointer and click events without making drawing headroom interactive', async () => {
  const env = browser();
  const surface = Object.assign(new EventTarget(), { dataset: {}, setPointerCapture() {} });
  let handle;
  const dispatch = (target, type, properties) => {
    const event = new Event(type, { cancelable: true }); Object.assign(event, properties); target.dispatchEvent(event);
  };
  try {
    handle = mountScene(env.canvas, { inputSurface: surface });
    await env.ready();
    env.event('pointermove', { clientX: 700, clientY: 300, pointerType: 'mouse', buttons: 0 });
    env.event('click', { detail: 1 });
    assert.equal(handle.getState().index, 0, 'transparent drawing headroom cannot change forms');
    assert.equal(handle.getState().pointerInside, false);
    dispatch(surface, 'pointermove', { clientX: 525, clientY: 300, pointerType: 'mouse', buttons: 0 });
    assert.equal(handle.getState().pointerInside, true);
    assert.equal(handle.getState().pointerX, .5, 'pointer projection still uses the original drawing surface');
    dispatch(surface, 'click', { detail: 1 });
    assert.equal(handle.getState().index, 1);
    handle.dispose();
    dispatch(surface, 'click', { detail: 1 });
    assert.equal(handle.getState().index, 1, 'disposing detaches the input surface');
  } finally { handle?.dispose(); env.restore(); }
});

test('pause before GPU ready shows settled content and queues no continuous frames', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas);
    handle.setPaused(true);
    await env.ready();
    assert.equal(handle.getState().phase, 'settled');
    assert.equal(handle.getState().manual, false);
    assert.equal(env.pending.size, 0);
    handle.select(2);
    assert.equal(handle.getState().index, 2);
    assert.equal(handle.getState().phase, 'settled');
    assert.equal(env.probe.scale, 1, 'paused selection keeps original projection without an animation');
    assert.equal(env.pending.size, 0, 'selecting while paused draws once and remains paused');
    handle.setPaused(false);
    assert.equal(env.pending.size, 1);
  } finally { handle?.dispose(); env.restore(); }
});

test('knowledge-first adapter reports its actual content shape when ready', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas, { initialIndex: 1 });
    handle.setActive(false);
    await env.ready();
    assert.equal(handle.getState().index, 1);
    assert.equal(handle.getState().shape, 'knowledge');
    assert.equal(handle.getState().manual, false);
    assert.equal(env.probe.scale, .9, 'the thick archive model retains verified clearance from HUD labels and controls');
    assert.equal(env.pending.size, 0);
  } finally { handle?.dispose(); env.restore(); }
});

test('queued manual intent remains visible to the content layer while an older morph finishes', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas);
    await env.ready();
    handle.select(1);
    env.frame(100);
    env.frame(116);
    handle.select(2);
    assert.equal(handle.getState().index, 2, 'content must not revert to the older in-flight shape');
    assert.equal(handle.getState().manual, true);
  } finally { handle?.dispose(); env.restore(); }
});

test('losing pointer capture releases the drag instead of leaving the scene stuck', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas);
    await env.ready();
    const base = { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1 };
    env.event('pointerdown', { ...base, clientX: 200, clientY: 200 });
    env.event('pointermove', { ...base, clientX: 240, clientY: 220 });
    env.frame(100);
    assert.equal(env.probe.frames.at(-1).dragging, true);
    env.event('lostpointercapture', {});
    env.frame(116);
    assert.equal(env.probe.frames.at(-1).dragging, false);
  } finally { handle?.dispose(); env.restore(); }
});

test('click advances with the upstream shock while an orbit drag does not accidentally advance', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas);
    await env.ready();
    const mouse = { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1 };
    env.event('pointerdown', { ...mouse, clientX: 200, clientY: 200 });
    env.event('pointermove', { ...mouse, clientX: 260, clientY: 220 });
    env.event('pointerup', { ...mouse, buttons: 0 });
    env.event('click', { detail: 1 });
    assert.equal(handle.getState().index, 0);
    assert.equal(env.probe.shocks.length, 0);
    env.event('pointerdown', { ...mouse, clientX: 300, clientY: 230 });
    env.event('pointerup', { ...mouse, buttons: 0 });
    env.event('click', { detail: 1 });
    assert.equal(handle.getState().index, 1);
    assert.equal(env.probe.shocks.length, 1);
    assert.notEqual(env.probe.shocks[0][0], 0, 'shock uses actual pointer position');
  } finally { handle?.dispose(); env.restore(); }
});

test('background and context loss suspend rendering; restoration resumes and reseeds once', async () => {
  const env = browser();
  let handle;
  try {
    handle = mountScene(env.canvas);
    await env.ready();
    assert.equal(env.pending.size, 1);
    env.document.visibilityState = 'hidden';
    env.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(env.pending.size, 0);
    assert.equal(handle.getState().fps, 0);
    env.document.visibilityState = 'visible';
    env.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(env.pending.size, 1);
    env.event('webglcontextlost', {});
    assert.equal(env.pending.size, 0);
    env.event('webglcontextrestored', {});
    assert.equal(env.probe.restores, 1);
    assert.equal(env.pending.size, 1);
  } finally { handle?.dispose(); env.restore(); }
});
