/** Canvas texture-generation utilities: periodic noise, fBm, normal maps. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Periodic value noise: the grid wraps onto itself, so the texture stays
 * continuous when tiled.
 */
export function periodicValueNoise(period, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/** Periodic fBm over [0,1]²: each octave doubles the frequency while staying tileable. */
export function fbm(size, { octaves = 4, base = 8, gain = 0.5, seed = 1 } = {}) {
  const layers = [];
  let freq = base;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ noise: periodicValueNoise(freq, seed + o * 977), freq, amp });
    norm += amp;
    freq *= 2;
    amp *= gain;
  }
  return (u, v) => {
    let sum = 0;
    for (const l of layers) sum += l.noise(u * l.freq, v * l.freq) * l.amp;
    return sum / norm;
  };
}

/** Fills a single-channel grayscale canvas from a height function (u,v)->[0,1]. */
export function heightCanvas(size, fn) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = Math.max(0, Math.min(1, fn(x / size, y / size, x, y)));
      const v = (h * 255) | 0;
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const EDT_INF = 1e20;

/**
 * 1D squared distance as the lower envelope of parabolas
 * (Felzenszwalb–Huttenlocher): exact and linear, instead of the checkerboard
 * approximation of chamfer distance, which on a curved letter would leave
 * octagonal facets right where the slope matters.
 */
function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared Euclidean distance of every pixel to the nearest lit seed. */
function edt2d(seed, w, h) {
  const long = Math.max(w, h);
  const f = new Float64Array(long);
  const d = new Float64Array(long);
  const v = new Int32Array(long);
  const z = new Float64Array(long + 1);
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = seed[i] ? 0 : EDT_INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

/**
 * Distance in pixels of every point from the stroke's edge, inside a
 * white-on-black mask; zero outside the stroke.
 *
 * This gives the emboss a real cross-section instead of a bell curve: since
 * height becomes a function of distance from the edge, a stroke wider than
 * twice the bevel keeps a flat floor (rectangular cross-section), while a
 * narrower one has the two slopes meet before reaching the floor (triangular
 * cross-section) — exactly what a die with a draft angle does. A blur can't
 * tell the two cases apart.
 *
 * Inside only: outside the stroke the emboss profile is flat anyway, so the
 * distance from the other side of the edge would never be used — and
 * computing it costs as much as everything else combined.
 */
export function insideDistanceField(mask, threshold = 128) {
  const w = mask.width;
  const h = mask.height;
  const src = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = src[i * 4] >= threshold ? 0 : 1;
  const squared = edt2d(outside, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(squared[i]);
  return { data: out, width: w, height: h };
}

/**
 * Converts a height map into a tangent-space normal map with a Sobel filter.
 * Accepts rectangular canvases; sampling wraps around so it doesn't break
 * the grain's tileability.
 */
export function normalMapFromHeight(heightSrc, strength = 1) {
  const w = heightSrc.width;
  const h = heightSrc.height;
  const src = heightSrc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      d[i] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Grayscale canvas from a function, used for roughness maps. */
export function grayscaleCanvas(size, fn) {
  return heightCanvas(size, fn);
}

export function averageColor(canvas, rect) {
  const { x = 0, y = 0, w = canvas.width, h = canvas.height } = rect ?? {};
  const small = makeCanvas(8, 8);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, x, y, w, h, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2];
  }
  const n = d.length / 4;
  return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
}
