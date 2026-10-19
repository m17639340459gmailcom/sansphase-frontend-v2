import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace, NoColorSpace } from 'three';
import { makeCanvas, averageColor, normalMapFromHeight, insideDistanceField } from './procedural.js';

/**
 * Cover atlas.
 *
 * The shell's UVs run along the section's perimeter: u = 0 is the front
 * trimmed edge, u = 1 the back one. Walking the book in that direction, the
 * three panels read right to left, so each panel has to be drawn mirrored on
 * the canvas to appear right-way-round on the model.
 *
 * The same drawing pass produces two canvases: the color one and the emboss
 * mask (white = stamped areas). With `inkless`, the text ends up only in the
 * mask: the board keeps the impression, with no ink.
 */
export function buildCoverAtlas({
  uMarks,
  heightMm,
  outerSpanMm,
  pxPerMm = 6,
  maxSize = 4096,
  design,
  images = {},
  showText = true,
  emboss = { mode: 'none', depth: 0.6, source: 'text', inkless: false },
  // Fraction of outerSpanMm taken up by each flap (0 with no flaps). With
  // flaps, uStart/uEnd span the whole printed unfold — flap included — so
  // the three-panel "front/back panel" (front | spine | back) would include
  // the flap in the same panel as the real board: text generated there would
  // center on that doubled-up space, spilling off the visible board. It's
  // subtracted here, not in the image path (drawWrap covers the whole unfold
  // on its own regardless).
  flapFrac = 0,
  // Spine cloth color for the Bodoni binding, or null. The band isn't
  // measured here: its bounds are the clothFront/clothBack marks the profile
  // already planted where the cloth ends on the board, so they arrive in
  // uMarks as u coordinates — groove included, without redoing the arc
  // length by hand.
  clothColor = null,
}) {
  const scale = Math.min(pxPerMm, maxSize / outerSpanMm, maxSize / heightMm);
  const w = Math.max(512, Math.round(outerSpanMm * scale));
  const h = Math.max(512, Math.round(heightMm * scale));
  const flapPx = Math.max(0, Math.min(flapFrac * w, w * 0.45));

  const s0 = (uMarks.spineStart ?? 0.45) * w;
  const s1 = (uMarks.spineEnd ?? 0.55) * w;
  const spineCenter = ((uMarks.spineStart ?? 0.45) + (uMarks.spineEnd ?? 0.55)) / 2;

  const cloth = clothColor && uMarks.clothFront != null && uMarks.clothBack != null
    ? { c0: uMarks.clothFront * w, c1: uMarks.clothBack * w, color: clothColor }
    : null;
  // text generated for the front/back panels centers on the paper, not on
  // paper+cloth — same reason the flaps get subtracted (see flapFrac)
  const frontEnd = cloth ? cloth.c0 : s0;
  const backStart = cloth ? cloth.c1 : s1;

  const panels = {
    front: images.front && { image: images.front, fit: 'cover' },
    spine: images.spine && { image: images.spine, fit: 'cover' },
    back: images.back && { image: images.back, fit: 'cover' },
  };

  const embossOn = emboss.mode && emboss.mode !== 'none';
  // without an emboss, "inkless" would just erase the text
  const inkless = Boolean(emboss.inkless) && embossOn;

  const paint = (target) => {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = target === 'emboss' ? '#000000' : design.background;
    ctx.fillRect(0, 0, w, h);

    const style = target === 'emboss'
      ? { ...design, background: '#000000', ink: '#ffffff', spineBackground: '#000000' }
      // on the spine the cloth is the background: a different spineBackground
      // here would split the same cloth band into two
      : (cloth ? { ...design, spineBackground: cloth.color } : design);
    // in blind mode the text exists only in the emboss mask
    const inked = showText && (target === 'emboss' || !inkless);
    const opts = {
      target,
      solid: target === 'emboss',
      // 'artwork' as the emboss source excludes text from the mask
      embossImages: emboss.source === 'image',
      keepBackground: Boolean(images.wrap),
    };
    const perPanel = (flag) => ({
      ...opts,
      showText: inked && design[flag] !== false
        && !(target === 'emboss' && emboss.source === 'image'),
    });

    if (images.wrap && (target === 'color' || opts.embossImages)) {
      drawWrap(ctx, images.wrap, {
        w, h, spineCenter,
        order: design.wrapOrder,
        asLuminance: target === 'emboss',
      });
    }

    // the cloth sits above any wrap artwork — it's a physical covering, not
    // graphics — but below the panels, which print the title on top of it
    if (cloth && target === 'color') {
      ctx.fillStyle = cloth.color;
      ctx.fillRect(cloth.c0, 0, cloth.c1 - cloth.c0, h);
    }

    // the spine always runs between spineStart and spineEnd, flaps or not;
    // front/back shrink to the real board, skipping the flap on each one's
    // outer side and the cloth on its inner side (see the flapFrac and
    // clothColor comments)
    panel(ctx, flapPx, frontEnd, h, (c, pw, ph) => paintFront(c, pw, ph, style, panels.front, perPanel('frontText')));
    panel(ctx, s0, s1, h, (c, pw, ph) => paintSpine(c, pw, ph, style, panels.spine, perPanel('spineText')));
    panel(ctx, backStart, w - flapPx, h, (c, pw, ph) => paintBack(c, pw, ph, style, panels.back, perPanel('backText')));

    // the seam: on a real book the paper overlaps the cloth by a couple of
    // millimeters, and that thread of shadow is what makes the transition read
    if (cloth && target === 'color') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const t = Math.max(1, Math.round(0.3 * scale));
      ctx.fillRect(cloth.c0 - t, 0, t, h);
      ctx.fillRect(cloth.c1, 0, t, h);
    }
    return canvas;
  };

  const canvas = paint('color');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 16;

  return {
    canvas,
    texture,
    embossTexture: embossOn ? buildEmbossNormal(paint('emboss'), emboss, scale) : null,
    // board-edge color: the paper, never the cloth — the edge that gets
    // colored is the front one, which the cloth never reaches
    frontAverage: averageColor(canvas, { x: 0, y: 0, w: Math.max(1, frontEnd), h }),
  };
}

/**
 * From mask to normal map.
 *
 * The height doesn't come from a blur but from the distance to the stroke's
 * edge (see insideDistanceField): that distance is what gives the emboss a
 * real cross-section. `bevel` is the shoulder's width in millimeters — at 0
 * the wall is vertical and the floor flat (rectangular cross-section);
 * widening it, strokes narrower than twice the shoulder have their two
 * slopes meet before reaching the floor and become ridges (triangular
 * cross-section), like under a die with a draft angle. `softness` rounds off
 * the shoulder: 0 is straight and faceted, 1 is rounded.
 *
 * `deboss` flips the sign, so the title sinks into the board instead of
 * rising out of it.
 */
function buildEmbossNormal(mask, emboss, scale) {
  const long = Math.max(mask.width, mask.height);
  // Measured trade-off: the shoulder is under a millimeter, so below ~1600 px
  // there aren't enough pixels to describe its slope; above that, the
  // distance field and Sobel pass cost more than they're worth (at 2000 px
  // the emboss step goes from 120 to 185 ms, on a rebuild that otherwise
  // takes 44 ms without it).
  const factor = Math.min(1, 1600 / long);
  const w = Math.max(64, Math.round(mask.width * factor));
  const h = Math.max(64, Math.round(mask.height * factor));

  const small = makeCanvas(w, h);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.fillStyle = '#000000';
  sctx.fillRect(0, 0, w, h);
  sctx.drawImage(mask, 0, 0, w, h);

  const { data: dist } = insideDistanceField(small);
  // below one pixel there's no slope left to describe: the edge stays sharp
  const bevelPx = Math.max(0.75, (emboss.bevel ?? 0.6) * scale * factor);
  const softness = Math.min(1, Math.max(0, emboss.softness ?? 0.55));
  const deboss = emboss.mode === 'deboss';

  const height = makeCanvas(w, h);
  const hctx = height.getContext('2d');
  const img = hctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, dist[i] / bevelPx);
    const shaped = t * t * (3 - 2 * t);
    const level = t + (shaped - t) * softness;
    const v = ((deboss ? 1 - level : level) * 255) | 0;
    const j = i * 4;
    d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(normalMapFromHeight(height, 3.2 * (emboss.depth ?? 0.6)));
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The flattened wrap (back | spine | front, flaps or not) drawn as a single
 * piece, centered on the spine.
 *
 * It isn't sliced into the three panels — that would stretch the spine. But
 * it also isn't scaled to match the expected physical width (2·width + spine,
 * flaps included): that scale would be *non-uniform* any time the loaded
 * file doesn't exactly match the book's current dimensions — which happens
 * often, since those can be tweaked *after* the image is loaded — and a
 * non-uniform scale means a stretched image.
 *
 * Instead it scales uniformly: the image's height is matched to the book's
 * height (the same assumption the automatic flap-width calculation in
 * main.js makes), and the width follows from that. If the proportions don't
 * line up exactly, the result is that the image runs short or long at the
 * edges — never that it looks distorted.
 */
function drawWrap(ctx, image, o) {
  const scale = o.h / image.height;    // uniform: never a distorted image
  const renderW = image.width * scale;
  const centerX = (1 - o.spineCenter) * o.w;   // u increases leftward: canvas is mirrored
  ctx.save();
  if (o.asLuminance) ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.translate(o.w, 0);
  ctx.scale(-1, 1);
  if (o.order === 'front-spine-back') {
    ctx.translate(o.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, o.w - centerX - renderW / 2, 0, renderW, o.h);
  } else {
    ctx.drawImage(image, centerX - renderW / 2, 0, renderW, o.h);
  }
  ctx.restore();
}

/** Sets up a mirrored local context for a panel. */
function panel(ctx, x0, x1, h, draw) {
  const w = x1 - x0;
  if (w <= 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, h);
  ctx.clip();
  ctx.translate(x1, 0);
  ctx.scale(-1, 1);
  draw(ctx, w, h);
  ctx.restore();
}

function background(ctx, w, h, color, source, opts) {
  if (!opts.keepBackground) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }
  if (!source) return;
  if (opts.target === 'color') drawSource(ctx, source, w, h);
  else if (opts.embossImages) drawSource(ctx, source, w, h, true);
}

/** Optional rectangular frame. */
function frame(ctx, w, h, design, opts) {
  if (!design.frame) return 0;
  const pad = Math.min(w, h) * 0.085;
  ctx.strokeStyle = design.ink;
  ctx.globalAlpha = opts.solid ? 1 : 0.5;
  ctx.lineWidth = Math.max(1.5, h * 0.0022);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.globalAlpha = 1;
  return pad;
}

/** Front cover: title, subtitle, author. */
function paintFront(ctx, w, h, design, source, opts) {
  background(ctx, w, h, design.background, source, opts);
  if (!opts.showText) return;
  const pad = frame(ctx, w, h, design, opts) || Math.min(w, h) * 0.085;

  // The panel is drawn mirrored (see panel()), but the double flip — mirror
  // here, UV winding direction there — means "left" here is the left you see
  // on the book. No inversion left to compensate for.
  const align = design.frontAlign === 'left' ? 'left' : 'center';
  const inset = pad * 1.2;
  const tx = align === 'left' ? inset : w / 2;
  const maxW = align === 'left' ? w - inset * 2 : w - pad * 3;

  ctx.fillStyle = design.ink;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';

  ctx.font = `${h * 0.072}px ${design.titleFont}`;
  const titleEnd = wrapText(ctx, design.title, tx, h * 0.3, maxW, h * 0.082);

  if (design.subtitle) {
    ctx.font = `${h * 0.036}px ${design.titleFont}`;
    ctx.globalAlpha = opts.solid ? 1 : 0.88;
    wrapText(ctx, design.subtitle, tx, titleEnd + h * 0.05, maxW, h * 0.046);
    ctx.globalAlpha = 1;
  }

  if (design.author) {
    // baseline-aligned to the foot: the first line backs up as many lines as needed
    const size = h * 0.034;
    const lineHeight = h * 0.044;
    ctx.font = `italic ${size}px ${design.titleFont}`;
    const lines = countLines(ctx, design.author, maxW);
    const lastBaseline = h - pad * 1.7;
    ctx.globalAlpha = opts.solid ? 1 : 0.82;
    wrapText(ctx, design.author, tx, lastBaseline - (lines - 1) * lineHeight, maxW, lineHeight);
    ctx.globalAlpha = 1;
  }
}

/**
 * Splits text into lines ready for drawing. Explicit line breaks (the author
 * and blurb fields are now <textarea>s, no longer single-line) stay as their
 * own separate lines — they're no longer just whitespace inside the
 * width-driven flow, which used to ignore them; each resulting paragraph
 * still wraps by width per maxWidth, as before. A blank line between two
 * paragraphs (two newlines in a row) is preserved.
 */
function layoutLines(ctx, text, maxWidth) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  const lines = [];
  for (const paragraph of raw.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = `${line}${word} `;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line.trim());
        line = '';
      }
      line = `${line}${word} `;
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

/** How many lines the text will take, without drawing it. */
function countLines(ctx, text, maxWidth) {
  return layoutLines(ctx, text, maxWidth).length;
}

/** Back cover: just the blurb text. */
function paintBack(ctx, w, h, design, source, opts) {
  background(ctx, w, h, design.background, source, opts);
  if (!opts.showText) return;
  const pad = frame(ctx, w, h, design, opts) || Math.min(w, h) * 0.085;

  // the back cover defaults to left-aligned: it's running text, not a title
  // page — centering it by default would change books already saved
  const align = design.backAlign === 'center' ? 'center' : 'left';
  const inset = pad * 1.9;
  ctx.fillStyle = design.ink;
  ctx.textAlign = align;
  ctx.globalAlpha = opts.solid ? 1 : 0.62;
  ctx.font = `${h * 0.026}px ${design.bodyFont}`;
  wrapText(ctx, design.blurb, align === 'center' ? w / 2 : inset, pad * 2.6, w - inset * 2, h * 0.042);
  ctx.globalAlpha = 1;
}

/** Spine: two texts, one at the head and one at the tail, read from the top down. */
function paintSpine(ctx, w, h, design, source, opts) {
  background(ctx, w, h, design.spineBackground ?? design.background, source, opts);
  if (!opts.showText) return;

  const size = Math.min(w * 0.42, h * 0.03);
  const draw = (text, atTop) => {
    if (!text) return;
    ctx.save();
    ctx.translate(w / 2, atTop ? h * 0.07 : h * 0.93);
    ctx.rotate(Math.PI / 2);          // the text runs from head to tail
    ctx.fillStyle = design.ink;
    ctx.textAlign = atTop ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px ${design.titleFont}`;
    ctx.fillText(String(text).replace(/\s+/g, ' ').trim(), 0, 0);
    ctx.restore();
  };
  draw(design.spineTop, true);
  draw(design.spineBottom, false);
}

/** Draws an image panel: 'cover' crop, or an exact rectangle. */
function drawSource(ctx, source, w, h, asLuminance = false) {
  const { image } = source;
  let sx = source.sx ?? 0;
  let sy = source.sy ?? 0;
  let sw = source.sw ?? image.width;
  let sh = source.sh ?? image.height;

  if (source.fit === 'cover') {
    const ir = sw / sh;
    const pr = w / h;
    if (ir > pr) {
      const next = sh * pr;
      sx += (sw - next) / 2;
      sw = next;
    } else {
      const next = sw / pr;
      sy += (sh - next) / 2;
      sh = next;
    }
  }
  ctx.save();
  if (asLuminance) ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
}

/**
 * Wraps text respecting explicit line breaks in addition to the max width,
 * and returns the y of the last line drawn. Exported: firstPage.js uses it
 * for the same reason (placeholder title page) — no point duplicating the
 * logic there.
 */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = layoutLines(ctx, text, maxWidth);
  if (!lines.length) return y;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + (lines.length - 1) * lineHeight;
}

export const DEFAULT_DESIGN = {
  // front cover
  title: 'Sample Title',
  subtitle: 'A subtitle goes here',
  author: 'Author Name',
  // back cover
  blurb: 'A three.js 3D book viewer and editor: extruded profile geometry, real bevels, and procedural textures.',
  // spine
  spineTop: 'Sample Title',
  spineBottom: '',
  // last line on the placeholder title page (see firstPage.js) — its own
  // field, not reused from spineBottom: it has nothing to do with the spine,
  // and borrowing another field made it a text that would show up without
  // anyone having chosen it for that purpose. Empty by default: no text
  // until it's explicitly set.
  frontispieceNote: '',
  // which panels use the editor's text instead of just the image
  frontText: true,
  spineText: true,
  backText: true,
  // graphic options
  frame: true,
  background: '#2f1d16',
  spineBackground: '#2a1913',
  ink: '#e8d9c2',
  titleFont: 'Georgia, "Times New Roman", serif',
  bodyFont: 'Georgia, "Times New Roman", serif',
  frontAlign: 'center',      // 'center' | 'left' — title/subtitle/author
  backAlign: 'left',         // 'center' | 'left' — back-cover blurb
  wrapOrder: 'back-spine-front',
};
