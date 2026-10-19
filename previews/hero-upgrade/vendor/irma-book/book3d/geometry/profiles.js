/**
 * Cross-sections of the book, in millimeters.
 *
 * The book is modeled as two solids extruded along its height:
 *  - the cover (hardcover case or paperback wrap), a closed shell that wraps
 *    the spine and shows its inner surface below the square;
 *  - the page block.
 *
 * Material slots used in the profiles:
 *  0 = printed outer surface        2 = head and tail (extrusion end caps)
 *  1 = inner surface / endpapers    3 = trimmed edges, exposed spine glue
 */

class Profile {
  constructor() {
    this.pts = [];
    this.mat = 0;
  }
  /** Material for segments added from here on. */
  use(mat) {
    this.mat = mat;
    return this;
  }
  /**
   * Switches material starting at the point already added.
   *
   * The material belongs to the segment that *starts* at a point, so a
   * `use()` called after adding the transition point would leave the
   * outgoing segment on the previous material — that's how the back board's
   * endpaper used to end up painted as a trimmed edge.
   */
  turn(mat) {
    this.mat = mat;
    if (this.pts.length) this.pts[this.pts.length - 1].mat = mat;
    return this;
  }
  add(x, y, opts = {}) {
    this.pts.push({
      x, y,
      mat: opts.mat ?? this.mat,
      smooth: opts.smooth !== false,
      mark: opts.mark,
    });
    return this;
  }
  corner(x, y, opts = {}) {
    return this.add(x, y, { ...opts, smooth: false });
  }
  /** Samples a parametric curve over t in [0,1]. The mark lands on the first emitted point. */
  curve(fn, samples, opts = {}) {
    const start = opts.skipFirst ? 1 : 0;
    for (let i = start; i <= samples; i++) {
      const [x, y] = fn(i / samples);
      this.add(x, y, { ...opts, mark: i === start ? opts.mark : undefined, smooth: opts.smooth });
    }
    return this;
  }
  arc(cx, cy, r, a0, a1, samples, opts = {}) {
    return this.curve((t) => {
      const a = a0 + (a1 - a0) * t;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }, samples, opts);
  }
  markLast(name) {
    this.pts[this.pts.length - 1].mark = name;
    return this;
  }
  build() {
    return this.pts;
  }
}

/** Spine-curve exponent: 2 = fully round, ~10 = flat with rounded corners. */
const roundExp = (roundness) => 10 - 8 * clamp01(roundness);

/**
 * Spine curve x(z) = xEdge + (xApex - xEdge) * (1 - |z/half|^p),
 * sampled with a cosine step to pack more points near the corners.
 */
function spineCurve(xEdge, xApex, half, roundness, fromTop = true) {
  const p = roundExp(roundness);
  const depth = xApex - xEdge;
  return (t) => {
    const z = Math.cos((fromTop ? t : 1 - t) * Math.PI) * half;
    return [xEdge + depth * (1 - Math.pow(Math.abs(z / half), p)), z];
  };
}

function sample(fn, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(fn(i / n));
  return out;
}

/** Offsets a polyline along its left normal (positive = toward the inside of the book). */
function offsetCurve(points, distance) {
  return points.map((pt, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return [pt[0] - (dy / len) * distance, pt[1] + (dx / len) * distance];
  });
}

/**
 * Hardcover binding: boards with a square overhang, a recessed French groove,
 * a rounded spine, and a hollow back between the spine and the page block.
 */
/** Derived hardcover dimensions, shared between the cover and the dust jacket. */
export function hardcoverDims(p) {
  const { height: H, width: W, spine: S } = p;
  // the board can't exceed half the spine thickness — constrains very thin formats
  const board = Math.min(p.board ?? 2.7, Math.max(0.8, (S - 1.2) / 2 - 0.3));
  const hw = W / 2;
  const hs = S / 2;
  const grooveHalf = p.grooveWidth ?? 2.4;       // groove half-width
  const hingeX = -hw + clamp(S * 0.22, 4.5, 9);  // groove axis
  return {
    H, W, S, hw, hs, board, grooveHalf, hingeX,
    square: p.square ?? 3.0,                     // square: how far the boards overhang the block
    grooveDepth: p.grooveDepth ?? 0.9,           // groove depth
    spineT: p.spineThickness ?? Math.max(1.2, board - (p.grooveDepth ?? 0.9)),
    round: clamp01(p.spineRound ?? 0.75),
    xs: hingeX - grooveHalf,                     // where the spine detaches from the board
    rTip: board / 2,
    xTip: hw - board / 2,
  };
}

export function hardcoverSpec(p) {
  const {
    H, W, S, hw, hs, board, square, grooveDepth, grooveHalf, spineT, round, hingeX, xs, rTip, xTip,
  } = hardcoverDims(p);

  // t in [-1,1] crosses the groove; the cosine curve is tangent to the boards at both ends
  const grooveZ = (t) => hs - grooveDepth * (1 + Math.cos(Math.PI * t)) * 0.5;
  const grooveOuter = (side) => (t) => [hingeX + grooveHalf * t, side * grooveZ(t)];
  const grooveInner = (side) => (t) => [hingeX + grooveHalf * t, side * (grooveZ(t) - spineT)];

  const xGroove = hingeX + grooveHalf;

  const spineOuter = sample(spineCurve(xs, -hw, hs, round), 44);
  const spineInner = offsetCurve(spineOuter, spineT).slice(1, -1).reverse();

  const path = new Profile();

  // --- outside: front board -> spine -> back board ---
  path.use(0);
  path.add(xTip, hs, { mark: 'uStart' });
  path.add(xGroove, hs);
  path.curve((u) => grooveOuter(1)(1 - 2 * u), 12, { skipFirst: true });
  path.corner(xs, hs).markLast('spineStart');
  for (let i = 1; i < spineOuter.length; i++) {
    const [x, z] = spineOuter[i];
    path.add(x, z, { smooth: i !== spineOuter.length - 1 });
  }
  path.markLast('spineEnd');
  path.curve((u) => grooveOuter(-1)(-1 + 2 * u), 12, { skipFirst: true });
  path.add(xTip, -hs, { mark: 'uEnd' });

  // --- rounded trim of the back board ---
  path.turn(3);
  path.arc(xTip, -hs + rTip, rTip, -Math.PI / 2, Math.PI / 2, 10, { skipFirst: true });

  // --- inside: back endpaper -> hollow back -> front endpaper ---
  path.turn(1);
  path.add(hingeX, -hs + board);
  path.corner(hingeX, -(hs - grooveDepth - spineT));
  path.curve((u) => grooveInner(-1)(-u), 7, { skipFirst: true });
  for (const [x, z] of spineInner) path.add(x, z);
  path.curve((u) => grooveInner(1)(-1 + u), 7, { skipFirst: true });
  path.corner(hingeX, hs - grooveDepth - spineT);
  path.corner(hingeX, hs - board);
  path.add(xTip, hs - board);

  // --- front board trim: closes the loop back at the starting point ---
  path.turn(3);
  path.arc(xTip, hs - rTip, rTip, -Math.PI / 2, Math.PI / 2, 10, { skipFirst: true });

  // --- page block: rounded spine, concave fore-edge mirroring it ---
  const blockT = Math.max(1, S - 2 * board - 0.6);
  const halfT = blockT / 2;
  const xBlockSpine = hingeX + 0.4;
  const xBlockFore = hw - square;
  const bulge = round * S * 0.085;
  const hollow = round * S * 0.03;

  const pages = new Profile();
  pages.use(1);
  pages.add(xBlockFore, halfT);
  pages.corner(xBlockSpine, halfT);
  pages.turn(3);
  pages.curve(spineCurve(xBlockSpine, xBlockSpine - bulge, halfT, round), 34, { skipFirst: true });
  pages.turn(1);
  pages.corner(xBlockFore, -halfT);
  pages.turn(0);
  pages.curve(spineCurve(xBlockFore, xBlockFore - hollow, halfT, 0.9, false), 24, {
    skipFirst: true,
    mark: 'uStart',
  });
  pages.markLast('uEnd');

  return {
    cover: { profile: path.build(), height: H, bevel: Math.min(0.5, board * 0.2), bevelSegments: 4 },
    pages: { profile: pages.build(), height: H - 2 * square, bevel: 0.3, bevelSegments: 3 },
    meta: {
      board, square, hingeX, blockT, spineT, xBlockSpine, grooveDepth, hs,
      binding: 'hardcover',
      spineCloth: 0,
      // the French groove flexes over a band as wide as itself
      hingeBlend: grooveHalf * 1.15,
      hingeZ: hs - grooveDepth,
    },
  };
}

/**
 * Bradel-style (Bodoni) binding.
 *
 * This isn't a hardcover with a different covering — it's a different
 * construction. The boards are two sheets of board laid *on top of* a
 * continuous strip of cloth and set back from the spine, so the board ends
 * in a raw trimmed edge while the cloth stays exposed further down, by its
 * full thickness. That step is what you recognize at a glance at the head
 * and tail of a Bodoni binding, and it can't be faked with a texture — it's
 * two planes at different heights.
 *
 * It's also why a Bodoni binding opens flat: there's no groove recessed
 * into the board between the boards — just the cloth flexing — which is why
 * none of the French-groove dimensions show up here.
 */
export function bodoniSpec(p) {
  const { H, W, S, hw, hs, board, square, round, xs, rTip, xTip } = hardcoverDims(p);

  // Cloth thickness in the model: thicker than real life (0.3–0.5 mm) because
  // the extrusion bevel can't exceed half the wall thickness — below half a
  // millimeter the exposed cloth band would pinch into itself at the head and
  // tail. The step is still board − clothT, i.e. ~2 mm on a 2.7 mm board:
  // what matters is that it reads.
  const clothT = 0.7;
  const hsCloth = hs - board + clothT;   // height of the exposed cloth
  const inner = hs - board;              // inner face: board and cloth flush
  // the cloth never reaches the fore edge — under 6 mm of remaining board
  // it stops reading as a Bodoni binding
  const clothBand = clamp(p.spineClothWidth ?? 10, 1, Math.max(1, xTip - xs - 6));
  const xBoard = xs + clothBand;         // where the board ends

  const spineOuter = sample(spineCurve(xs, -hw, hsCloth, round), 44);
  const spineInner = offsetCurve(spineOuter, clothT).slice(1, -1).reverse();

  const path = new Profile();

  // --- outside: front board -> step -> cloth -> spine -> mirrored ---
  path.use(0);
  path.add(xTip, hs, { mark: 'uStart' });
  path.corner(xBoard, hs, { mark: 'clothFront' });
  path.turn(3);                                   // the board's raw trimmed edge
  path.corner(xBoard, hsCloth);
  path.turn(4);                                   // cloth
  path.corner(xs, hsCloth).markLast('spineStart');
  for (let i = 1; i < spineOuter.length; i++) {
    const [x, z] = spineOuter[i];
    path.add(x, z, { smooth: i !== spineOuter.length - 1 });
  }
  path.markLast('spineEnd');
  path.corner(xBoard, -hsCloth);
  path.turn(3);
  path.corner(xBoard, -hs, { mark: 'clothBack' });
  path.turn(0);
  path.add(xTip, -hs, { mark: 'uEnd' });

  // --- rounded trim of the back board ---
  path.turn(3);
  path.arc(xTip, -hs + rTip, rTip, -Math.PI / 2, Math.PI / 2, 10, { skipFirst: true });

  // --- inside: the cloth runs under the boards, so the inner face is one
  // continuous height from the trim to the spine, with no steps ---
  path.turn(1);
  for (const [x, z] of spineInner) path.add(x, z);
  path.add(xTip, inner);

  // --- front board trim: closes the loop back at the starting point ---
  path.turn(3);
  path.arc(xTip, hs - rTip, rTip, -Math.PI / 2, Math.PI / 2, 10, { skipFirst: true });

  // --- page block: like the hardcover, but the spine stays inside the cloth ---
  const blockT = Math.max(1, S - 2 * board - 0.6);
  const halfT = blockT / 2;
  const xBlockSpine = xs + 0.6;
  const xBlockFore = hw - square;
  const bulge = round * S * 0.085;
  const hollow = round * S * 0.03;

  const pages = new Profile();
  pages.use(1);
  pages.add(xBlockFore, halfT);
  pages.corner(xBlockSpine, halfT);
  pages.turn(3);
  pages.curve(spineCurve(xBlockSpine, xBlockSpine - bulge, halfT, round), 34, { skipFirst: true });
  pages.turn(1);
  pages.corner(xBlockFore, -halfT);
  pages.turn(0);
  pages.curve(spineCurve(xBlockFore, xBlockFore - hollow, halfT, 0.9, false), 24, {
    skipFirst: true,
    mark: 'uStart',
  });
  pages.markLast('uEnd');

  return {
    // the bevel can't exceed half the cloth thickness, or the exposed band
    // self-intersects on the head/tail faces
    cover: { profile: path.build(), height: H, bevel: Math.min(0.28, clothT * 0.4), bevelSegments: 4 },
    pages: { profile: pages.build(), height: H - 2 * square, bevel: 0.3, bevelSegments: 3 },
    meta: {
      board, square, blockT, xBlockSpine, hs,
      spineT: clothT,
      grooveDepth: 0,
      // for the rest of the engine (dust jacket, headband) it's a hardcover
      binding: 'hardcover',
      spineCloth: clothBand,
      // the board rotates around its own trimmed edge, resting on the cloth:
      // it's the cloth that flexes, over a band as narrow as its own thickness
      hingeX: xBoard,
      hingeBlend: Math.max(1.2, clothT * 2),
      hingeZ: hsCloth,
    },
  };
}

/** Paperback: a thin cover glued flush to the block, square spine. */
export function paperbackSpec(p) {
  const { height: H, width: W, spine: S } = p;
  const t = p.coverThickness ?? 0.32;
  const round = clamp01(p.spineRound ?? 0) * 0.45;
  const hw = W / 2;
  const hs = S / 2;
  const foldR = p.foldRadius ?? 1.1;
  const xs = -hw + foldR;

  const path = new Profile();
  path.use(0);
  path.corner(hw, hs, { mark: 'uStart' });
  path.add(xs + foldR, hs);
  path.curve(spineCurve(xs, -hw, hs, round), 32, { skipFirst: true, mark: 'spineStart' });
  path.markLast('spineEnd');
  path.add(xs + foldR, -hs);
  path.corner(hw, -hs, { mark: 'uEnd' });

  path.turn(3);
  path.corner(hw, -hs + t);

  path.turn(1);
  path.add(xs + foldR + t, -hs + t);
  path.curve(spineCurve(xs + t, -hw + t, hs - t, round, false), 32, { skipFirst: true });
  path.add(xs + foldR + t, hs - t);
  path.corner(hw, hs - t);
  path.turn(3);

  const blockT = Math.max(0.8, S - 2 * t - 0.08);
  const halfT = blockT / 2;
  const xBlockFore = hw - 0.12;
  const xBlockSpine = xs + t + 0.3;

  const pages = new Profile();
  pages.use(1);
  pages.add(xBlockFore, halfT);
  pages.corner(xBlockSpine, halfT);
  pages.turn(3);
  pages.corner(xBlockSpine, -halfT);
  pages.turn(1);
  pages.corner(xBlockFore, -halfT);
  pages.turn(0);
  pages.curve(spineCurve(xBlockFore, xBlockFore - S * 0.01, halfT, 0.85, false), 18, {
    skipFirst: true,
    mark: 'uStart',
  });
  pages.markLast('uEnd');

  return {
    cover: { profile: path.build(), height: H, bevel: Math.min(0.12, t * 0.35), bevelSegments: 2 },
    pages: { profile: pages.build(), height: H - 0.5, bevel: 0.2, bevelSegments: 3 },
    meta: {
      board: t, square: 0, blockT, xBlockSpine, binding: 'paperback', hs,
      // the glued-on cover has no groove: it flexes along the spine fold,
      // over a wider band because the thin card curves instead of hinging
      hingeX: xs + t + foldR,
      hingeZ: hs - t,
      hingeBlend: Math.max(4, foldR * 4),
    },
  };
}

/**
 * Dust jacket: a thin sheet that wraps the cover with an air gap, folds
 * around the board edges, and tucks in with the two flaps.
 *
 * The sheet is a closed shell: walk the printed face from the front flap to
 * the back flap, cross the thickness, and come back along the inner face.
 * The artwork uses the same markers as the cover, so one atlas serves both.
 */
export function jacketSpec(p) {
  const {
    W, hw, hs, board, grooveDepth, grooveHalf, spineT, round, hingeX, xs, rTip, xTip,
  } = hardcoverDims(p);
  const gap = p.jacketGap ?? 0.28;              // air gap between cover and jacket
  const t = p.jacketThickness ?? 0.18;
  const flapW = Math.min(p.flapWidth ?? 95, W - 15);
  const xFlap = xTip - flapW;
  const grooveFactor = 0.45;                    // the sheet doesn't follow the full groove depth

  const grooveZ = (tt) => hs - grooveDepth * grooveFactor * (1 + Math.cos(Math.PI * tt)) * 0.5;
  const spineOuter = sample(spineCurve(xs, -hw, hs, round), 40);

  // with printed flaps, the artwork starts at the flap tip instead of the fold
  const flapArt = Boolean(p.jacketFlapArt);

  /** One face of the sheet, from the front flap to the back flap. */
  const leg = (o, printed) => {
    const path = new Profile();
    const art = printed ? 0 : 1;
    const flap = printed && flapArt ? 0 : 1;
    path.use(flap);
    path.corner(xFlap, hs - board - o, printed && flapArt ? { mark: 'uStart' } : {});
    path.corner(xTip, hs - board - o);
    path.turn(art);
    path.arc(xTip, hs - rTip, rTip + o, -Math.PI / 2, Math.PI / 2, 12, { skipFirst: true });
    if (printed && !flapArt) path.markLast('uStart');
    path.add(hingeX + grooveHalf, hs + o);
    path.curve((u) => {
      const tt = 1 - 2 * u;
      return [hingeX + grooveHalf * tt, grooveZ(tt) + o];
    }, 10, { skipFirst: true });
    path.corner(xs, hs + o);
    if (printed) path.markLast('spineStart');
    for (const [x, z] of offsetCurve(spineOuter, -o).slice(1, -1)) path.add(x, z);
    path.corner(xs, -(hs + o));
    if (printed) path.markLast('spineEnd');
    path.curve((u) => {
      const tt = -1 + 2 * u;
      return [hingeX + grooveHalf * tt, -(grooveZ(tt) + o)];
    }, 10, { skipFirst: true });
    path.add(xTip, -(hs + o));
    if (printed && !flapArt) path.markLast('uEnd');
    path.arc(xTip, -hs + rTip, rTip + o, -Math.PI / 2, Math.PI / 2, 12, { skipFirst: true });
    path.turn(flap);
    path.corner(xFlap, -hs + board + o);
    if (printed && flapArt) path.markLast('uEnd');
    return path.build();
  };

  const outer = leg(gap + t, true);
  const inner = leg(gap, false).reverse();
  for (const pt of inner) pt.mat = 1;
  outer[outer.length - 1].mat = 3;              // thickness at the back flap
  inner[inner.length - 1].mat = 3;              // and at the front flap
  inner[inner.length - 1].smooth = false;
  outer[outer.length - 1].smooth = false;

  return {
    profile: [...outer, ...inner],
    height: p.height - 1,                       // the boards stick out by half a millimeter
    bevel: t * 0.34,
    bevelSegments: 2,
    meta: { gap, thickness: t, flapWidth: flapW, flapArt },
  };
}

export function bookSpec(params) {
  if (params.binding === 'paperback') return paperbackSpec(params);
  if (params.binding === 'bodoni') return bodoniSpec(params);
  return hardcoverSpec(params);
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
