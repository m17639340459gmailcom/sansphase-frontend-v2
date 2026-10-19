import {
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Group,
} from 'three';
import { makeCanvas } from './textures/procedural.js';

/**
 * Headband: the striped cord glued at the head and tail between the case's
 * spine and the page block. Only exists on hardcover bindings, and it's the
 * detail that makes the hollow back read as real.
 */
export function createHeadbands({ spec, params, pagesBounds }) {
  if (spec.meta.binding !== 'hardcover') return null;

  const xCaseSpine = -params.width / 2 + spec.meta.spineT;
  const xBlockSpine = pagesBounds.min.x;
  const gap = xBlockSpine - xCaseSpine;
  if (gap < 0.9) return null;

  const radius = Math.min(gap * 0.42, spec.meta.blockT * 0.12, 1.9);
  const length = spec.meta.blockT * 0.98;
  const centerX = xCaseSpine + gap * 0.5;
  const topY = spec.pages.height / 2;

  const geometry = new CylinderGeometry(radius, radius, length, 20, 1, false);
  geometry.rotateX(Math.PI / 2);

  const material = new MeshStandardMaterial({
    map: stripeTexture(params.headbandColors ?? ['#8d2f28', '#efe4cc'], length, radius),
    roughness: 0.72,
    metalness: 0,
  });

  const group = new Group();
  for (const sign of [1, -1]) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(centerX, sign * (topY - radius * 0.15), 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.dispose = () => {
    geometry.dispose();
    material.map?.dispose();
    material.dispose();
  };
  return group;
}

/** Alternating stripes along the cord's axis. */
function stripeTexture(colors, lengthMm, radius) {
  const canvas = makeCanvas(8, 64);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(0, i * 8, 8, 8);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  // stripe pitch follows the cord's diameter
  tex.repeat.set(1, Math.min(10, Math.max(1, Math.round(lengthMm / 10.4))));
  return tex;
}
