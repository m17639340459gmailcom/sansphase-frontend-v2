import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace, NoColorSpace } from 'three';
import { makeCanvas, mulberry32, periodicValueNoise } from './procedural.js';

/**
 * Page block trim: one line per sheet, with per-page brightness variation,
 * signature groupings, waviness along the height, and occlusion toward the
 * two outer faces.
 *
 * The texture is generated with the thickness along the canvas's X axis; for
 * the head and tail it's rotated 90°, so the striations stay perpendicular
 * to the sheets on all three visible faces.
 */
const W = 2048;
const H = 320;

export function buildPageEdgeCanvas({
  thicknessMm = 26,
  pageThicknessMm = 0.105,
  tint = '#efe7d6',
  seed = 5,
  contrast = 1,
} = {}) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  const d = img.data;

  const base = hexToRgb(tint);
  const rnd = mulberry32(seed);
  const pageCount = Math.max(24, thicknessMm / pageThicknessMm);
  const period = W / pageCount;                 // width of one page, in pixels
  const wobble = periodicValueNoise(16, seed + 3);
  const blot = periodicValueNoise(32, seed + 91);

  // per-sheet brightness, constant along the height
  const sheet = new Float32Array(Math.ceil(pageCount) + 2);
  for (let i = 0; i < sheet.length; i++) {
    const signature = i % 16 === 0 ? -0.055 : 0;   // every signature stands out a little
    sheet[i] = 1 + (rnd() - 0.5) * 0.1 + signature;
  }

  for (let y = 0; y < H; y++) {
    const v = y / H;
    // pages aren't perfectly aligned: nudge the rows slightly
    const shift = (wobble(v * 16, 0.5) - 0.5) * period * 1.1;
    for (let x = 0; x < W; x++) {
      const t = (x + shift) / period;
      const idx = Math.floor(t);
      const f = t - idx;

      // gap between two sheets: dark and narrow
      const gap = Math.exp(-Math.pow(Math.min(f, 1 - f) / 0.17, 2));
      let lum = sheet[((idx % sheet.length) + sheet.length) % sheet.length];
      lum *= 1 - gap * 0.42 * contrast;
      lum *= 0.97 + blot(x / W * 12, v * 6) * 0.06;

      // occlusion toward the outer faces (under the cover's square)
      const edge = Math.min(x, W - 1 - x) / W;
      lum *= 0.72 + 0.28 * Math.min(1, edge / 0.035);
      // slight shadow toward the tail
      lum *= 1 - 0.05 * Math.pow(1 - v, 2);

      const i = (y * W + x) * 4;
      d[i] = clamp255(base.r * lum);
      d[i + 1] = clamp255(base.g * lum);
      d[i + 2] = clamp255(base.b * lum);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Rotates the edge-trim canvas 90° for the head and tail. */
export function rotateCanvas(src) {
  const out = makeCanvas(src.height, src.width);
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function buildPageEdgeTextures(opts) {
  const flat = buildPageEdgeCanvas(opts);
  const turned = rotateCanvas(flat);
  return {
    side: makeTexture(flat, SRGBColorSpace),
    sideBump: makeTexture(flat, NoColorSpace),
    cap: makeTexture(turned, SRGBColorSpace),
    capBump: makeTexture(turned, NoColorSpace),
  };
}

function makeTexture(canvas, colorSpace) {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));
