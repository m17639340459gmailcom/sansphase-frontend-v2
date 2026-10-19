import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { makeCanvas } from './textures/procedural.js';
import { wrapText } from './textures/coverArt.js';

/**
 * First page, visible when the front board opens.
 *
 * It's a plane resting against the page block's front face: that face is a
 * wall of the extrusion, with arc-length UVs, so it wouldn't be usable for
 * artwork on its own. A dedicated plane gives it clean UVs.
 */
export function createFirstPage({ pagesBounds, params, image }) {
  const w = pagesBounds.max.x - pagesBounds.min.x;
  const h = pagesBounds.max.y - pagesBounds.min.y;
  if (w <= 0 || h <= 0) return null;

  const texture = new CanvasTexture(
    image ? fromImage(image, w, h) : procedural(w, h, params)
  );
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0,
      side: DoubleSide,
      envMapIntensity: 0.7,
    })
  );
  mesh.position.set(
    (pagesBounds.min.x + pagesBounds.max.x) / 2,
    (pagesBounds.min.y + pagesBounds.max.y) / 2,
    pagesBounds.max.z + 0.04
  );
  mesh.receiveShadow = true;
  mesh.userData.dispose = () => {
    mesh.geometry.dispose();
    texture.dispose();
    mesh.material.dispose();
  };
  return mesh;
}

function canvasFor(wMm, hMm) {
  const px = Math.min(4, 2048 / Math.max(wMm, hMm));
  return makeCanvas(Math.round(wMm * px), Math.round(hMm * px));
}

function fromImage(image, wMm, hMm) {
  const canvas = canvasFor(wMm, hMm);
  const ctx = canvas.getContext('2d');
  const ir = image.width / image.height;
  const pr = canvas.width / canvas.height;
  let sw = image.width;
  let sh = image.height;
  let sx = 0;
  let sy = 0;
  if (ir > pr) { sw = image.height * pr; sx = (image.width - sw) / 2; }
  else { sh = image.width / pr; sy = (image.height - sh) / 2; }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Placeholder title page, shown until a real first page image is set. */
function procedural(wMm, hMm, params) {
  const canvas = canvasFor(wMm, hMm);
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const design = params.design ?? {};

  ctx.fillStyle = params.pageColor ?? '#efe7d6';
  ctx.fillRect(0, 0, w, h);

  // shadow of the fold toward the spine
  const shade = ctx.createLinearGradient(0, 0, w * 0.18, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.16)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w * 0.18, h);

  // Same as paintFront in coverArt.js: wrapText respects explicit line
  // breaks in addition to the max width — a direct fillText (this
  // function's version before that fix) silently ignores them, collapsing
  // everything onto one line. That's the bug where a multi-line author in
  // the panel looked correct on the front cover but got flattened here, on
  // the title page: two different drawing paths, only one fixed.
  const maxW = w * 0.72;
  const cx = w * 0.54;
  ctx.fillStyle = '#2b2622';
  ctx.textAlign = 'center';

  ctx.font = `${h * 0.045}px ${design.titleFont ?? 'Georgia, serif'}`;
  let y = wrapText(ctx, design.title, cx, h * 0.33, maxW, h * 0.05);

  if (design.subtitle) {
    ctx.font = `italic ${h * 0.026}px ${design.titleFont ?? 'Georgia, serif'}`;
    ctx.globalAlpha = 0.75;
    y = wrapText(ctx, design.subtitle, cx, y + h * 0.06, maxW, h * 0.032);
    ctx.globalAlpha = 1;
  }
  if (design.author) {
    ctx.font = `${h * 0.024}px ${design.titleFont ?? 'Georgia, serif'}`;
    wrapText(ctx, design.author, cx, y + h * 0.09, maxW, h * 0.03);
  }
  if (design.frontispieceNote) {
    ctx.globalAlpha = 0.6;
    ctx.font = `${h * 0.018}px ${design.bodyFont ?? 'Georgia, serif'}`;
    wrapText(ctx, design.frontispieceNote, cx, h * 0.86, maxW, h * 0.022);
    ctx.globalAlpha = 1;
  }
  return canvas;
}
