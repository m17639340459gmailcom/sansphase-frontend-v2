import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PerspectiveCamera, Vector3 } from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  entryPoints: [`${root}src/scene-shapes.ts`], bundle: true,
  platform: 'node', format: 'esm', target: 'node24', write: false,
});
const { buildFilmCamera, buildKnowledgeArchive } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);

for (const [name, buildShape] of [['physical film camera', buildFilmCamera], ['knowledge archive model', buildKnowledgeArchive]]) {
  test(`${name} supplies complete, repeatable spatial targets within the unchanged engine's sweep bounds`, () => {
    const count = 4096;
    const first = buildShape(count);
    const second = buildShape(count);
    assert.equal(first.positions.length, count * 3);
    assert.equal(first.styles.length, count * 3);
    assert.deepEqual(first.positions, second.positions);
    let minZ = Infinity, maxZ = -Infinity;
    let accented = 0;
    for (let index = 0; index < count; index++) {
      const [x, y, z] = first.positions.subarray(index * 3, index * 3 + 3);
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(Math.abs(x) <= 2.35 && Math.abs(y) <= 1.85 && Math.abs(z) <= 1.8);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      const [accent, opacity, size] = first.styles.subarray(index * 3, index * 3 + 3);
      assert.ok(accent >= 0 && accent <= 1 && opacity > 0 && opacity <= 1 && size > 0);
      if (accent > 0) accented++;
    }
    assert.ok(maxZ - minZ > .5, 'a real three-dimensional form is required, not a flat cover mask');
    assert.ok(accented > count * .03 && accented < count * .6, 'accent remains a deliberate minority');
  });

  test(`${name} has a solid interior silhouette, depth across its main mass and directional surface shading`, () => {
    const { positions, styles } = buildShape(16384);
    const depth = [];
    let central = 0, minOpacity = 1, maxOpacity = 0;
    for (let index = 0; index < positions.length / 3; index++) {
      const [x, y, z] = positions.subarray(index * 3, index * 3 + 3);
      if (Math.abs(x) < .7 && Math.abs(y) < .5) central++;
      depth.push(z);
      minOpacity = Math.min(minOpacity, styles[index * 3 + 1]);
      maxOpacity = Math.max(maxOpacity, styles[index * 3 + 1]);
    }
    depth.sort((a, b) => a - b);
    assert.ok(central > depth.length * .1, 'thin outlines must not substitute for a solid model');
    assert.ok(depth[Math.floor(depth.length * .8)] - depth[Math.floor(depth.length * .2)] > .55,
      'depth must be present across the body, not just one isolated protrusion');
    assert.ok(maxOpacity - minOpacity > .45, 'front, side and rear surfaces must not collapse into the same noisy plane');
  });

  test(`${name} fits both real renderer quality levels without invalid coordinates`, () => {
    for (const count of [14400, 65536]) {
      const result = buildShape(count);
      assert.equal(result.positions.length, count * 3);
      assert.equal(result.styles.length, count * 3);
      for (let index = 0; index < count; index++) {
        const [x, y, z] = result.positions.subarray(index * 3, index * 3 + 3);
        assert.ok(Number.isFinite(x) && Math.abs(x) <= 2.35);
        assert.ok(Number.isFinite(y) && Math.abs(y) <= 1.85);
        assert.ok(Number.isFinite(z) && Math.abs(z) <= 1.8);
      }
    }
  });

  test(`${name} stays below readable HUD labels and inside the real input bounds at its presentation scale`, () => {
    const scale = .9;
    const camera = new PerspectiveCamera(38, 6 / 5, .1, 100);
    camera.position.set(0, 0, 7);
    camera.updateMatrixWorld();
    const { positions } = buildShape(65536);
    const point = new Vector3();
    const canvasWidth = 1.586, canvasHeight = canvasWidth * 5 / 6;
    for (let index = 0; index < positions.length; index += 3) {
      point.fromArray(positions, index).multiplyScalar(scale).project(camera);
      const x = .5 + point.x * canvasWidth / 2;
      const y = .5 - point.y * canvasHeight / 2;
      assert.ok(x >= .06 && x <= .94 && y >= .2 && y <= .88,
        `point ${index / 3} must clear the top readouts and bottom controls: ${x}, ${y}`);
    }
  });
}
