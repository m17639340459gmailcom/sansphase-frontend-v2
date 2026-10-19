import { BufferGeometry, BufferAttribute, ShapeUtils, Vector2 } from 'three';

/**
 * A point of the book's cross-section (world XZ plane).
 * @typedef {Object} ProfilePoint
 * @property {number} x        position along the width (spine negative, fore edge positive)
 * @property {number} y        position along the thickness
 * @property {boolean} [smooth] normals shared with the previous segment (default true)
 * @property {number} [mat]    material slot of the segment starting at this point (default 0)
 * @property {string} [mark]   label: comes back in userData.uMarks as a u coordinate
 */

const EPS = 1e-6;

/**
 * Extrudes a closed profile along the Y axis with a toroidal bevel on the
 * top and bottom edges.
 *
 * UVs are built by arc length: `u` runs along the section's perimeter
 * (normalized between the two given marks), `v` runs along the height,
 * including the bevel's own unrolled length. Cover artwork mapped onto these
 * UVs wraps around the book exactly like a real dust jacket.
 *
 * @param {Object} opts
 * @param {ProfilePoint[]} opts.profile  closed outline (don't repeat the first point)
 * @param {number} opts.height           extrusion height
 * @param {number} [opts.bevel]          bevel radius at the head and tail
 * @param {number} [opts.bevelSegments]  bevel subdivisions
 * @param {number} [opts.capMaterial]    material slot for the top/bottom faces
 * @param {string} [opts.uStart]         mark where u = 0 starts
 * @param {string} [opts.uEnd]           mark where u = 1
 * @returns {BufferGeometry}
 */
export function sweptProfileGeometry({
  profile,
  height,
  bevel = 0,
  bevelSegments = 4,
  capMaterial = 2,
  uStart = 'uStart',
  uEnd = 'uEnd',
}) {
  const pts = dedupe(profile);
  const n = pts.length;
  if (n < 3) throw new Error('sweptProfileGeometry: needs at least 3 points');

  ensureCounterClockwise(pts);

  const h2 = height / 2;
  const B = bevel > EPS ? Math.max(1, bevelSegments) : 0;
  const r = B > 0 ? Math.min(bevel, h2 * 0.9) : 0;

  // --- 2D profile geometry: segment normals, miter, arc lengths ---
  const segNormal = [];
  const arc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || EPS;
    // left normal = toward the inside of the material (counter-clockwise outline)
    segNormal.push(new Vector2(-dy / len, dx / len));
    arc[i + 1] = arc[i] + len;
  }
  const perimeter = arc[n];

  // per-vertex miter offset: keeps the bevel's thickness consistent at corners
  const miter = [];
  for (let i = 0; i < n; i++) {
    const nPrev = segNormal[(i - 1 + n) % n];
    const nNext = segNormal[i];
    const m = new Vector2().addVectors(nPrev, nNext);
    if (m.lengthSq() < EPS) m.copy(nNext);
    m.normalize();
    const scale = 1 / Math.max(m.dot(nNext), 0.28); // clamp: avoids infinite spikes
    miter.push(m.multiplyScalar(scale));
  }

  // --- normalizing u between the two marks ---
  const marks = {};
  for (let i = 0; i < n; i++) if (pts[i].mark) marks[pts[i].mark] = arc[i];
  const sA = marks[uStart] ?? 0;
  const sB = marks[uEnd] ?? perimeter;
  const span = Math.abs(sB - sA) > EPS ? sB - sA : perimeter;
  const uOf = (s) => (s - sA) / span;

  // --- vertex ring: duplicated at hard edges for crisp normals ---
  const ring = []; // { pi, u }
  const shared = new Int32Array(n).fill(-1);
  const pushVert = (pi, u) => ring.push({ pi, u }) - 1;
  const sharedVert = (pi) => {
    if (shared[pi] < 0) shared[pi] = pushVert(pi, uOf(arc[pi]));
    return shared[pi];
  };
  const segments = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = pts[i].smooth === false ? pushVert(i, uOf(arc[i])) : sharedVert(i);
    // closing the ring repeats point 0 with the end-of-loop u
    const b = j === 0
      ? pushVert(0, uOf(perimeter))
      : (pts[j].smooth === false ? pushVert(j, uOf(arc[j])) : sharedVert(j));
    segments.push({ a, b, mat: pts[i].mat ?? 0 });
  }
  const ringLen = ring.length;

  // --- rings along the height (bottom bevel -> wall -> top bevel) ---
  const rings = [];
  if (B > 0) {
    for (let k = B; k >= 0; k--) {
      const t = (k / B) * (Math.PI / 2);
      rings.push({ off: r - r * Math.cos(t), y: -h2 + r - r * Math.sin(t) });
    }
    for (let k = 0; k <= B; k++) {
      const t = (k / B) * (Math.PI / 2);
      rings.push({ off: r - r * Math.cos(t), y: h2 - r + r * Math.sin(t) });
    }
  } else {
    rings.push({ off: 0, y: -h2 }, { off: 0, y: h2 });
  }

  // v proportional to the surface's actual unrolled length (bevel included)
  let sweep = 0;
  const vs = [0];
  for (let i = 1; i < rings.length; i++) {
    sweep += Math.hypot(rings[i].off - rings[i - 1].off, rings[i].y - rings[i - 1].y);
    vs.push(sweep);
  }
  for (let i = 0; i < vs.length; i++) vs[i] /= sweep || 1;

  // --- vertices ---
  const vertCount = rings.length * ringLen;
  const position = [];
  const uv = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const { off, y } = rings[ri];
    for (let vi = 0; vi < ringLen; vi++) {
      const { pi, u } = ring[vi];
      const p = pts[pi];
      const m = miter[pi];
      position.push(p.x + m.x * off, y, p.y + m.y * off);
      uv.push(u, vs[ri]);
    }
  }

  // --- side faces, grouped by material slot ---
  const index = [];
  const groups = [];
  const addGroup = (start, count, mat) => {
    const last = groups[groups.length - 1];
    if (last && last.materialIndex === mat && last.start + last.count === start) last.count += count;
    else groups.push({ start, count, materialIndex: mat });
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const base = ri * ringLen;
    const next = base + ringLen;
    for (const seg of segments) {
      const start = index.length;
      const a = base + seg.a;
      const b = base + seg.b;
      const a2 = next + seg.a;
      const b2 = next + seg.b;
      index.push(a, a2, b2, a, b2, b);
      addGroup(start, 6, seg.mat);
    }
  }

  // --- head and tail faces ---
  const capContour = pts.map((p, i) => new Vector2(p.x + miter[i].x * r, p.y + miter[i].y * r));
  const capTris = ShapeUtils.triangulateShape(capContour, []);
  const bbox = capContour.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  const spanX = bbox.maxX - bbox.minX || 1;
  const spanY = bbox.maxY - bbox.minY || 1;

  for (const dir of [1, -1]) {
    const base = position.length / 3;
    const y = dir > 0 ? h2 : -h2;
    for (const p of capContour) {
      position.push(p.x, y, p.y);
      uv.push((p.x - bbox.minX) / spanX, (p.y - bbox.minY) / spanY);
    }
    const start = index.length;
    for (const tri of capTris) {
      // winding flips when looking at the XZ plane from above: the
      // counter-clockwise 2D outline must be reversed for the top face
      if (dir > 0) index.push(base + tri[0], base + tri[2], base + tri[1]);
      else index.push(base + tri[0], base + tri[1], base + tri[2]);
    }
    addGroup(start, index.length - start, capMaterial);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(index);
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  geometry.computeVertexNormals();

  geometry.userData.uMarks = Object.fromEntries(
    Object.entries(marks).map(([k, s]) => [k, uOf(s)])
  );
  geometry.userData.perimeter = perimeter;
  geometry.userData.uSpan = span;
  geometry.userData.vertexCount = vertCount;
  return geometry;
}

function dedupe(profile) {
  const out = [];
  for (const p of profile) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) {
      // keep the discarded point's mark/mat if the previous one lacks it
      if (p.mark && !last.mark) last.mark = p.mark;
      if (p.smooth === false) last.smooth = false;
      continue;
    }
    out.push({ ...p });
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.abs(first.x - last.x) < EPS && Math.abs(first.y - last.y) < EPS) out.pop();
  return out;
}

function ensureCounterClockwise(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area >= 0) return;
  const mats = pts.map((p) => p.mat);
  pts.reverse();
  // the material belongs to the outgoing segment: after reversing it shifts by one
  const flipped = mats.reverse();
  for (let i = 0; i < pts.length; i++) pts[i].mat = flipped[(i + 1) % pts.length];
}
