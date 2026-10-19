import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, ExtrudeGeometry,
  Matrix4, Mesh, MeshBasicMaterial, Path, Shape, TorusGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assertParticleCount, hash, localityOrder, reorder } from '../vendor/tdx/hero-math';
import { defineSampledShape, rasterizeText } from '../vendor/tdx/hero-sampler';
import { registerHeroShape, STILL_MOTION, type ShapeBuild } from '../vendor/tdx/hero-shapes';

// @types/three 0.186 omits this official method; verified against the pinned
// three 0.186.0 addon source, including its chainable return value.
declare module 'three/addons/math/MeshSurfaceSampler.js' {
  interface MeshSurfaceSampler { setRandomGenerator(randomFunction: () => number): this; }
}

/**
 * Content targets only. Surface sampling, locality ordering and every animation
 * remain the third-party implementations. These meshes are never rendered:
 * they supply resting coordinates through TDX's documented shape registry.
 */
type Part = { geometry: BufferGeometry; accent?: boolean };

function extrude(shape: Shape, depth: number): BufferGeometry {
  return new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 1, steps: 1,
    bevelSize: .012, bevelThickness: .012, curveSegments: 6,
  }).translate(0, 0, -depth / 2);
}

/** Transform a group as a unit without any animation or particle logic. */
function transform(parts: Part[], rotation: Euler, position: Vector3): Part[] {
  const matrix = new Matrix4().makeRotationFromEuler(rotation).setPosition(position);
  for (const part of parts) part.geometry.applyMatrix4(matrix);
  return parts;
}

function sampleParts(parts: Part[], count: number, salt: number): ShapeBuild {
  assertParticleCount(count);
  const geometries = parts.map(({ geometry, accent }) => {
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    const colors = new Float32Array(normalized.getAttribute('position').count * 3);
    if (accent) colors.fill(1);
    normalized.setAttribute('color', new BufferAttribute(colors, 3));
    const normals = normalized.getAttribute('normal');
    const weights = new Float32Array(normals.count);
    for (let index = 0; index < normals.count; index++) {
      weights[index] = .08 + Math.max(0, normals.getZ(index)) * .92;
    }
    normalized.setAttribute('sampleWeight', new BufferAttribute(weights, 1));
    return normalized;
  });
  const merged = mergeGeometries(geometries);
  if (!merged) throw new Error('The content target surfaces could not be merged.');
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(merged, material);
  let sampleIndex = 0;
  const sampler = new MeshSurfaceSampler(mesh).setWeightAttribute('sampleWeight')
    .setRandomGenerator(() => hash(sampleIndex++, salt)).build();
  const point = new Vector3(), normal = new Vector3(), color = new Color();
  const positions = new Float32Array(count * 3), styles = new Float32Array(count * 3);
  try {
    for (let index = 0; index < count; index++) {
      sampler.sample(point, normal, color);
      positions.set([point.x, point.y, point.z], index * 3);
      const accent = color.r > .5 || hash(index, salt + 1) > .955 ? 1 : 0;
      // Model normals are already in the presentation pose. The official sampler
      // supplies these normals: subdued rear surfaces keep solid objects legible
      // instead of layering every face into one equally dark noisy rectangle.
      const facing = Math.pow(Math.max(0, normal.z), .45);
      styles.set([accent, accent ? .94 : .035 + facing * .89, accent ? 1.05 : .68 + facing * .1], index * 3);
    }
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const part of parts) if (!geometries.includes(part.geometry)) part.geometry.dispose();
    merged.dispose(); material.dispose();
  }
  const order = localityOrder(positions);
  return { positions: reorder(positions, 3, order), styles: reorder(styles, 3, order) };
}

/** Three.js surfaces, not a second particle system or an image-generated model. */
function roundedBox(width: number, height: number, depth: number, radius = .08): BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, radius);
}

function reel(): BufferGeometry {
  const outline = new Shape();
  outline.absarc(0, 0, .56, 0, Math.PI * 2, false);
  const hub = new Path();
  hub.absarc(0, 0, .12, 0, Math.PI * 2, true);
  outline.holes.push(hub);
  for (let index = 0; index < 5; index++) {
    const angle = index / 5 * Math.PI * 2;
    const opening = new Path();
    opening.absarc(Math.cos(angle) * .335, Math.sin(angle) * .335, .115, 0, Math.PI * 2, true);
    outline.holes.push(opening);
  }
  return extrude(outline, .26);
}

/** A thick camera body, perforated film reels and a projecting optical barrel. */
export function buildFilmCamera(count: number): ShapeBuild {
  const parts: Part[] = [
    { geometry: roundedBox(2.02, 1.25, .94, .14).translate(0, -.29, 0) },
    { geometry: roundedBox(.88, .13, 1.02, .04).translate(-.03, -.98, -.03) },
    { geometry: roundedBox(.5, .24, .48, .05).translate(-.52, .43, -.14) },
    { geometry: roundedBox(1.4, .055, .035, .014).translate(-.1, .11, .49), accent: true },
    { geometry: reel().translate(-.59, .83, -.11) },
    { geometry: reel().translate(.61, .83, -.11) },
    { geometry: new TorusGeometry(.465, .035, 6, 48).translate(-.59, .83, .045), accent: true },
    { geometry: new TorusGeometry(.465, .035, 6, 48).translate(.61, .83, .045), accent: true },
    { geometry: new CylinderGeometry(.405, .48, .69, 48, 1, false)
      .rotateX(Math.PI / 2).translate(.43, -.31, .78) },
    { geometry: new TorusGeometry(.405, .043, 8, 48).translate(.43, -.31, 1.14), accent: true },
    { geometry: new CylinderGeometry(.285, .285, .035, 48, 1, false)
      .rotateX(Math.PI / 2).translate(.43, -.31, 1.17) },
  ];
  transform(parts, new Euler(.14, -.48, -.055), new Vector3(.04, -.24, -.12));
  return sampleParts(parts, count, 1739);
}

/** An open archive with actual drawer bodies: capture, index and retrieve. */
export function buildKnowledgeArchive(count: number): ShapeBuild {
  const width = 2.3, height = 1.97, depth = 1.48;
  const parts: Part[] = [
    { geometry: roundedBox(.12, height, depth, .035).translate(-width / 2, 0, -.12) },
    { geometry: roundedBox(.12, height, depth, .035).translate(width / 2, 0, -.12) },
    { geometry: roundedBox(width, .12, depth, .035).translate(0, -height / 2, -.12) },
    { geometry: roundedBox(width, .12, depth, .035).translate(0, height / 2, -.12) },
  ];
  for (let drawer = 0; drawer < 3; drawer++) {
    const y = .66 - drawer * .66;
    const front = .55 + drawer * .29;
    parts.push(
      { geometry: roundedBox(2.05, .42, 1.32, .045).translate(0, y, front - .66) },
      { geometry: roundedBox(.63, .15, .04, .02).translate(-.37, y + .04, front + .025), accent: drawer === 1 },
      { geometry: roundedBox(.46, .06, .14, .025).translate(.57, y - .04, front + .085), accent: true },
      { geometry: new BoxGeometry(2.01, .021, .025).translate(0, y + .19, front + .015), accent: true },
      { geometry: new BoxGeometry(2.01, .021, .025).translate(0, y - .19, front + .015), accent: true },
    );
  }
  transform(parts, new Euler(.25, -.49, -.055), new Vector3(.03, -.03, -.18));
  return sampleParts(parts, count, 2633);
}

let registration: Promise<void> | undefined;

/** The registry is module-scoped; reuse it on subsequent route mounts. */
export function prepareSceneShapes(): Promise<void> {
  registration ??= (async () => {
    const font = '700 180px "Noto Sans SC Variable", sans-serif';
    await document.fonts?.load(font, '無相');
    const identityMask = rasterizeText('無相', { font, padding: 16 });
    registerHeroShape({
      id: 4, key: 'storyboard', effect: 'plain',
      motion: { ...STILL_MOTION, sway: { amplitude: .075, speed: .2 } }, build: buildFilmCamera,
    });
    registerHeroShape({
      id: 5, key: 'knowledge', effect: 'plain',
      motion: { ...STILL_MOTION, sway: { amplitude: .095, speed: .19 } }, build: buildKnowledgeArchive,
    });
    registerHeroShape(defineSampledShape({
      id: 6, key: 'identity', mask: identityMask,
      motion: { ...STILL_MOTION, sway: { amplitude: .1, speed: .2 } },
      sample: { width: 3.8, height: 2.2, depth: .56, edgeWeight: 1.8, salt: 3253 },
    }));
  })();
  return registration;
}
