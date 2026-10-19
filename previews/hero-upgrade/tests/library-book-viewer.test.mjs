import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { Box3, Group, Material, Texture, Vector3 } from 'three';
import { fileURLToPath } from 'node:url';
import { createHingeUniforms, hingeVertexShader } from '../vendor/irma-book/book3d/hinge.js';

test('the optional reading hinge moves its flex zone without moving the rotation axis', () => {
  const uniforms = createHingeUniforms();
  assert.equal(uniforms.bookHingeMaskShift?.value, 0, 'normal upstream cover behavior is the default');
  const shader = hingeVertexShader('void main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}');
  assert.match(shader, /bookHingeCenter\.x\s*\+\s*bookHingeMaskShift/);
  assert.match(shader, /transformed\.x - bookHingeCenter\.x/);
  assert.match(shader, /objectNormal = vec3/);
});

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
// Keep the real sheet implementation and one shared Three instance. Only the
// renderer-owning hardcover is injected so these checks do not require WebGL.
const bundle = await build({
  stdin: { contents: `export { createBookViewer } from './src/library-book-viewer';`, resolveDir: sourceRoot },
  bundle: true, platform: 'node', format: 'esm', write: false, packages: 'external',
  plugins: [{ name: 'shared-three', setup(api) {
    api.onResolve({ filter: /^three(?:\/|$)/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const { createBookViewer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

function fixture(options = {}, failCanvasAt = Infinity) {
  const dom = new JSDOM('<figure data-book-language="zh"><div id="book"></div></figure>');
  const container = dom.window.document.getElementById('book');
  let canvases = 0, layer, caseOptions, disposeCalls = 0, invalidations = 0, dead = false;
  dom.window.HTMLCanvasElement.prototype.getContext = () => {
    if (++canvases === failCanvasAt) return null;
    return { fillRect() {}, fillText() {}, measureText(text) { return { width: text.length * 30 }; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  };
  const object = new Group();
  const hardcover = {
    isOpen: false, isTurning: false, openProgress: 0, canOpen: true,
    currentPage: 0, pageCount: 0, controls: { enableZoom: false },
    pageBounds: new Box3(new Vector3(-77, -117, -12.5), new Vector3(81, 117, 12.5)), pageHingeX: -77,
    attachPageLayer(value) { layer = value;object.add(value.object); },
    invalidate() { invalidations++; }, hitTest() { return true; },
    nextPage() { return false; }, previousPage() { return false; },
    update(patch) { Object.assign(caseOptions, patch); },
    setOpen(open) { hardcover.isOpen = open;hardcover.openProgress = Number(open);if (!open) layer?.reset();caseOptions.onStateChange?.(); },
    toggleOpen() { hardcover.setOpen(!hardcover.isOpen); }, resetCamera() {}, setActive() {},
    dispose() { if (dead) return;dead = true;disposeCalls++;layer?.dispose();object.clear(); },
  };
  const factory = (_host, settings) => { caseOptions = settings;return hardcover; };
  return {
    dom, container, hardcover, object,
    create() { return createBookViewer(container, options, factory); },
    get layer() { return layer; }, get caseOptions() { return caseOptions; },
    get disposeCalls() { return disposeCalls; }, get invalidations() { return invalidations; },
    settle() { layer.advance(1); },
    async materialsReady() { await new Promise(resolve => setTimeout(resolve, 0)); },
    close() { hardcover.dispose();dom.window.close(); },
  };
}

test('the physical sheets wait for an open and settled hardcover without accessing data APIs', async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests++;throw new Error('A hero book must not access data APIs'); };
  const f = fixture();
  try {
    const viewer = f.create();await f.materialsReady();
    assert.equal(f.caseOptions.readingMode, true);
    assert.equal(f.caseOptions.cameraAzimuth, 0);
    assert.equal(f.caseOptions.cameraElevation, 0);
    assert.equal(viewer.pageCount, 6);
    assert.equal(viewer.nextPage(), false);
    assert.equal(viewer.previousPage(), false);
    viewer.setOpen(true);f.hardcover.isTurning = true;
    assert.equal(viewer.nextPage(), false);
    f.hardcover.isTurning = false;
    assert.equal(viewer.nextPage(), true);f.settle();
    assert.equal(viewer.currentPage, 1);
    assert.equal(requests, 0);
    assert.ok(f.layer.object instanceof Group);
  } finally { f.close();globalThis.fetch = previousFetch; }
});

test('real sheet turns settle individually, reject queued turns and stop at both ends', () => {
  const f = fixture();
  try {
    const viewer = f.create();viewer.setOpen(true);
    for (let page = 1;page <= viewer.pageCount;page++) {
      assert.equal(viewer.nextPage(), true);
      assert.equal(viewer.isTurning, true);
      assert.equal(viewer.currentPage, page - 1);
      assert.equal(viewer.nextPage(), false);
      assert.equal(viewer.previousPage(), false);
      f.layer.advance(.2);
      assert.equal(viewer.isTurning, true);
      f.settle();
      assert.equal(viewer.isTurning, false);
      assert.equal(viewer.currentPage, page);
    }
    assert.equal(viewer.nextPage(), false);
    for (let page = viewer.pageCount - 1;page >= 0;page--) {
      assert.equal(viewer.previousPage(), true);f.settle();assert.equal(viewer.currentPage, page);
    }
    assert.equal(viewer.previousPage(), false);
    assert.equal(f.layer.advance(.1), false);
  } finally { f.close(); }
});

test('closing the case resets a partially turning sheet and reopening starts from the front', () => {
  const f = fixture();
  try {
    const viewer = f.create();viewer.setOpen(true);viewer.nextPage();f.settle();viewer.nextPage();f.layer.advance(.3);
    assert.equal(viewer.isTurning, true);viewer.setOpen(false);
    assert.equal(viewer.currentPage, 0);assert.equal(viewer.isTurning, false);assert.equal(f.layer.progress, 0);
    assert.equal(viewer.nextPage(), false);
    viewer.setOpen(true);assert.equal(viewer.nextPage(), true);f.settle();assert.equal(viewer.currentPage, 1);
  } finally { f.close(); }
});

test('reduced motion turns immediately and settles an in-flight page when preferences change', () => {
  const f = fixture();
  try {
    const viewer = f.create();viewer.setOpen(true);viewer.nextPage();f.layer.advance(.2);
    viewer.update({ openSpeed: Infinity });
    assert.equal(viewer.isTurning, false);assert.equal(viewer.currentPage, 1);
    assert.equal(viewer.nextPage(), true);assert.equal(viewer.currentPage, 2);assert.equal(viewer.isTurning, false);
    assert.equal(viewer.previousPage(), true);assert.equal(viewer.currentPage, 1);
    viewer.update({ openSpeed: 5.5 });viewer.nextPage();assert.equal(viewer.isTurning, true);
  } finally { f.close(); }
});

test('disposing the page layer releases its real paper geometry, printed materials and textures once', async () => {
  const f = fixture();
  try {
    const viewer = f.create();await f.materialsReady();
    const geometry = new Set(), materials = new Set(), textures = new Set();
    f.layer.object.traverse(node => {
      if (node.geometry?.attributes.position) geometry.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        if (material.map) { materials.add(material);textures.add(material.map); }
      }
    });
    assert.equal(geometry.size, 6);assert.equal(materials.size, 12);assert.equal(textures.size, 12);
    const released = new Map();
    for (const resource of [...geometry, ...materials, ...textures]) resource.addEventListener('dispose', () => released.set(resource, (released.get(resource) ?? 0) + 1));
    viewer.dispose();viewer.dispose();f.layer.dispose();
    assert.equal(f.disposeCalls, 1);
    assert.equal(released.size, geometry.size + materials.size + textures.size);
    assert.ok([...released.values()].every(count => count === 1));
    assert.equal(f.layer.object.children.length, 0);
    assert.equal(viewer.nextPage(), false);
  } finally { f.close(); }
});

test('partial typography initialization failure releases already-created maps, materials and hardcover', () => {
  const f = fixture({}, 3), materialDispose = Material.prototype.dispose, textureDispose = Texture.prototype.dispose;
  let materials = 0, textures = 0;
  Material.prototype.dispose = function () { materials++;return materialDispose.call(this); };
  Texture.prototype.dispose = function () { textures++;return textureDispose.call(this); };
  try {
    assert.throws(() => f.create(), /canvas context/);
    assert.equal(f.disposeCalls, 1);assert.equal(materials, 2);assert.equal(textures, 2);
    assert.equal(f.layer, undefined);
  } finally { Material.prototype.dispose = materialDispose;Texture.prototype.dispose = textureDispose;f.close(); }
});
