// Geometry/lifecycle verification against the host's Three; no browser or WebGL required.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { MeshStandardMaterial, REVISION } from 'three';
import { FlipBook } from './index.js';

const material = new MeshStandardMaterial();
let materialDisposals = 0;
material.addEventListener('dispose', () => materialDisposals++);
const book = new FlipBook({
  flipDuration: 0.5,
  yBetweenPages: 0.001,
  pageSubdivisions: 20,
  autoCenter: false,
});
book.setPages(Array.from({ length: 6 }, () => material));
await new Promise(resolve => setImmediate(resolve));
assert.equal(book.totalPages, 6);
assert.equal(book.position.x, 0);
const leaves = [...book];
assert.equal(leaves.length, 3);
let geometryDisposals = 0;
for (const leaf of leaves) leaf.page.geometry.addEventListener('dispose', () => geometryDisposals++);

book.nextPage();
assert.equal(book.isAnimating, true);
book.animate(0.25);
assert.equal(book.progress, 0.5);
assert.equal(book.position.x, 0);
let maxNormalDifference = 0;
for (const leaf of leaves) {
  const geometry = leaf.page.geometry;
  const positions = geometry.getAttribute('position').array;
  assert.ok(Array.from(positions).every(Number.isFinite));
  assert.ok(geometry.boundingBox && geometry.boundingSphere);
  assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  const expected = geometry.clone();
  expected.computeVertexNormals();
  const actualNormals = geometry.getAttribute('normal').array;
  const expectedNormals = expected.getAttribute('normal').array;
  for (let index = 0; index < actualNormals.length; index++) {
    maxNormalDifference = Math.max(maxNormalDifference, Math.abs(actualNormals[index] - expectedNormals[index]));
  }
  expected.dispose();
}
assert.ok(maxNormalDifference < 0.00001);
book.animate(0.3);
assert.equal(book.progress, 1);
assert.equal(book.isAnimating, false);
book.previousPage();
book.animate(0.6);
assert.equal(book.progress, 0);
assert.equal(book.isAnimating, false);

const started = performance.now();
for (let frame = 0; frame <= 120; frame++) book.progress = (frame / 120) * 3;
const cpuMilliseconds = performance.now() - started;
assert.equal(book.progress, 3);
book.dispose();
book.dispose();
book.nextPage();
book.animate(0.5);
assert.equal(book.isAnimating, false);
assert.equal(geometryDisposals, 3);
assert.equal(materialDisposals, 0, 'Host-supplied material ownership must remain with the host');
material.dispose();
console.log(JSON.stringify({ threeRevision: REVISION, sheets: leaves.length, frames: 121, cpuMilliseconds: Math.round(cpuMilliseconds * 100) / 100, maxNormalDifference, geometryDisposals, result: 'passed' }, null, 2));
