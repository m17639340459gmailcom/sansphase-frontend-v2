import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { fbm, heightCanvas, normalMapFromHeight, makeCanvas } from './procedural.js';

/**
 * Cover covering materials. Each surface declares its own physical scale
 * (`tileMm`), so the grain stays consistent as the book's format changes
 * instead of stretching with the UVs.
 */
const SIZE = 512;
const cache = new Map();

/** Bookbinding cloth: plain weave, alternating warp and weft. */
function clothHeight(seed) {
  const fine = fbm(SIZE, { octaves: 4, base: 32, seed });
  const blotch = fbm(SIZE, { octaves: 3, base: 4, seed: seed + 7 });
  const threads = 26;
  return (u, v) => {
    const tu = u * threads;
    const tv = v * threads;
    const cu = Math.floor(tu);
    const cv = Math.floor(tv);
    const warpOnTop = (cu + cv) % 2 === 0;
    const fu = tu - cu;
    const fv = tv - cv;
    // thread cross-section: half a sine wave, tallest at the thread's center
    const thread = warpOnTop ? Math.sin(Math.PI * fu) : Math.sin(Math.PI * fv);
    const cross = warpOnTop ? Math.sin(Math.PI * fv) : Math.sin(Math.PI * fu);
    const h = 0.30 + 0.46 * Math.pow(thread, 0.7) + 0.10 * cross;
    return h + (fine(u, v) - 0.5) * 0.20 + (blotch(u, v) - 0.5) * 0.06;
  };
}

/** Uncoated paper: short fibers, lightly oriented. */
function uncoatedHeight(seed) {
  const fibers = fbm(SIZE, { octaves: 5, base: 48, seed });
  const stretch = fbm(SIZE, { octaves: 4, base: 16, seed: seed + 31 });
  return (u, v) => 0.5 + (fibers(u * 0.55, v * 1.6) - 0.5) * 0.75 + (stretch(u, v) - 0.5) * 0.3;
}

/** Coated / laminated paper: barely perceptible micro-grain. */
function coatedHeight(seed) {
  const micro = fbm(SIZE, { octaves: 3, base: 64, seed });
  const waves = fbm(SIZE, { octaves: 2, base: 6, seed: seed + 3 });
  return (u, v) => 0.5 + (micro(u, v) - 0.5) * 0.28 + (waves(u, v) - 0.5) * 0.22;
}

/** Laid / handmade paper: stronger, more irregular grain. */
function laidHeight(seed) {
  const grain = fbm(SIZE, { octaves: 4, base: 24, seed });
  return (u, v) => {
    const lines = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 55);
    return 0.42 + lines * 0.16 + (grain(u, v) - 0.5) * 0.6;
  };
}

const SURFACES = {
  cloth: { height: clothHeight, tileMm: 11, normalStrength: 1.45, roughness: 0.82, sheen: 0.16, clearcoat: 0 },
  uncoated: { height: uncoatedHeight, tileMm: 26, normalStrength: 1.0, roughness: 0.85, sheen: 0.12, clearcoat: 0 },
  coatedMatte: { height: coatedHeight, tileMm: 34, normalStrength: 0.55, roughness: 0.55, sheen: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.42 },
  coatedGloss: { height: coatedHeight, tileMm: 34, normalStrength: 0.55, roughness: 0.32, sheen: 0, clearcoat: 0.9, clearcoatRoughness: 0.08 },
  laid: { height: laidHeight, tileMm: 20, normalStrength: 1.25, roughness: 0.88, sheen: 0.14, clearcoat: 0 },
};

export const SURFACE_NAMES = Object.keys(SURFACES);

/**
 * @param {keyof SURFACES} kind
 * @returns {{normalMap: CanvasTexture, roughnessMap: CanvasTexture, preset: object}}
 */
export function getSurface(kind = 'cloth', seed = 11) {
  const key = `${kind}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const preset = SURFACES[kind] ?? SURFACES.cloth;

  const height = heightCanvas(SIZE, preset.height(seed));
  const normalMap = new CanvasTexture(normalMapFromHeight(height, preset.normalStrength));
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping;

  // the same height map modulates roughness: raised fibers scatter more light
  const roughCanvas = makeCanvas(SIZE, SIZE);
  const rctx = roughCanvas.getContext('2d');
  rctx.filter = 'blur(1.5px) contrast(0.3) brightness(1.15)';
  rctx.drawImage(height, 0, 0);
  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = RepeatWrapping;

  const result = { normalMap, roughnessMap, preset, heightCanvas: height };
  cache.set(key, result);
  return result;
}

/** Fits the maps' repeat to the surface's physical dimensions. */
export function tileMaps(maps, { uSpanMm, heightMm, tileMm }) {
  const rx = Math.max(1, uSpanMm / tileMm);
  const ry = Math.max(1, heightMm / tileMm);
  for (const map of maps) {
    if (!map) continue;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(rx, ry);
    map.needsUpdate = true;
  }
}

export { SRGBColorSpace };
