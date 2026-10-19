import {
  Color,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  ShaderChunk,
  Vector2,
} from 'three';
import { hingeVertexShader } from './hinge.js';
import { getSurface, tileMaps } from './textures/surfaces.js';
import { buildPageEdgeTextures } from './textures/pageEdge.js';
import { buildCoverAtlas } from './textures/coverArt.js';

/**
 * Builds the material slots for the cover, page block and dust jacket.
 * The indices match the ones used in the profiles (geometry/profiles.js):
 * 0 printed outer · 1 inner · 2 head and tail · 3 trimmed edges.
 */
export function createBookMaterials({ params, coverGeometry, jacketGeometry, images, spec, hingeUniforms }) {
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  const printedGeometry = jacketGeometry ?? coverGeometry;
  const outerSpanMm = Math.abs(printedGeometry.userData.uSpan);
  const atlas = buildCoverAtlas({
    uMarks: printedGeometry.userData.uMarks,
    heightMm: jacketGeometry ? params.height - 1 : params.height,
    outerSpanMm,
    // with printed flaps, uStart/uEnd span the whole printed unfold: the
    // text generated for front/back must stay out of that band, otherwise it
    // centers on flap+board together instead of on the board alone
    flapFrac: jacketGeometry && params.jacketFlapArt ? (params.flapWidth ?? 0) / outerSpanMm : 0,
    pxPerMm: params.textureDensity ?? 6,
    // the spine background follows the same cover color as the boards by
    // default — only a Bodoni binding's spine cloth (clothColor below) is a
    // genuinely different material, and buildCoverAtlas overrides this value
    // with the cloth's own color for that case
    design: { ...params.design, background: params.coverColor, spineBackground: params.coverColor, ink: params.inkColor },
    images,
    showText: params.showText !== false,
    // the dust jacket is a single sheet: the cloth lives on the case
    // underneath, which isn't even printed while a jacket is present
    clothColor: !jacketGeometry && spec.meta.spineCloth > 0 ? params.spineClothColor : null,
    emboss: {
      mode: params.embossMode ?? 'none',
      depth: params.embossDepth ?? 0.6,
      source: params.embossSource ?? 'text',
      inkless: params.embossInkless ?? false,
      bevel: params.embossBevel ?? 0.6,
      softness: params.embossSoftness ?? 0.55,
    },
  });
  track(atlas.texture);
  if (atlas.embossTexture) track(atlas.embossTexture);

  const edgeColor = new Color(atlas.frontAverage.r, atlas.frontAverage.g, atlas.frontAverage.b)
    .convertSRGBToLinear();

  // --- cover skin ---
  const surface = getSurface(params.coverSurface, params.surfaceSeed ?? 11);
  const preset = surface.preset;
  const coverMaps = cloneMaps(surface, track, {
    uSpanMm: Math.abs(coverGeometry.userData.uSpan),
    heightMm: params.height,
    tileMm: preset.tileMm,
  });
  const grain = new Vector2(params.grain ?? 1, params.grain ?? 1);

  // with a dust jacket the print sits on top: the cover itself stays bare cloth
  const caseIsPrinted = !jacketGeometry;
  const coverOuter = track(new MeshPhysicalMaterial({
    map: caseIsPrinted ? atlas.texture : null,
    color: caseIsPrinted ? new Color(0xffffff) : new Color(params.coverColor),
    normalMap: coverMaps.normalMap,
    normalScale: grain,
    roughnessMap: coverMaps.roughnessMap,
    roughness: preset.roughness,
    metalness: 0,
    sheen: preset.sheen,
    sheenRoughness: 0.85,
    sheenColor: new Color(params.coverColor).convertSRGBToLinear().lerp(new Color(1, 1, 1), 0.25),
    clearcoat: preset.clearcoat ?? 0,
    clearcoatRoughness: preset.clearcoatRoughness ?? 0.3,
    envMapIntensity: 1,
  }));
  if (caseIsPrinted) applyEmboss(coverOuter, atlas.embossTexture, params.embossDepth ?? 0.6);

  const lining = track(new MeshStandardMaterial({
    color: new Color(params.endpaperColor),
    roughness: 0.95,
    metalness: 0,
    normalMap: coverMaps.lining,
    normalScale: new Vector2(0.4, 0.4),
    envMapIntensity: 0.6,
  }));

  const coverEdge = track(new MeshPhysicalMaterial({
    color: caseIsPrinted ? edgeColor : new Color(params.coverColor),
    normalMap: coverMaps.edge,
    normalScale: grain,
    roughness: preset.roughness,
    metalness: 0,
    sheen: preset.sheen,
    sheenRoughness: 0.85,
    clearcoat: preset.clearcoat ?? 0,
    clearcoatRoughness: preset.clearcoatRoughness ?? 0.3,
    envMapIntensity: 1,
  }));

  // a paperback's raw board edge shows its pale core
  const tip = spec.meta.binding === 'paperback'
    ? track(new MeshStandardMaterial({ color: new Color('#e9e2d6'), roughness: 0.9 }))
    : coverEdge;

  // --- spine cloth (Bodoni binding) ---
  // Its own slot, not a color band in the atlas: what distinguishes cloth
  // from paper is the surface — weave, roughness, sheen — and that doesn't
  // live in the color map. The atlas map is applied to it anyway, so the
  // spine title still prints onto the cloth like it would on a real book.
  const clothMaterial = spec.meta.spineCloth > 0 ? (() => {
    const clothSurface = getSurface(params.spineClothSurface ?? 'cloth', (params.surfaceSeed ?? 11) + 7);
    const clothPreset = clothSurface.preset;
    const clothMaps = cloneMaps(clothSurface, track, {
      uSpanMm: Math.abs(coverGeometry.userData.uSpan),
      heightMm: params.height,
      tileMm: clothPreset.tileMm,
    });
    const material = track(new MeshPhysicalMaterial({
      map: caseIsPrinted ? atlas.texture : null,
      color: caseIsPrinted ? new Color(0xffffff) : new Color(params.spineClothColor),
      normalMap: clothMaps.normalMap,
      normalScale: grain,
      roughnessMap: clothMaps.roughnessMap,
      roughness: clothPreset.roughness,
      metalness: 0,
      sheen: clothPreset.sheen,
      sheenRoughness: 0.85,
      sheenColor: new Color(params.spineClothColor).convertSRGBToLinear().lerp(new Color(1, 1, 1), 0.25),
      clearcoat: clothPreset.clearcoat ?? 0,
      clearcoatRoughness: clothPreset.clearcoatRoughness ?? 0.3,
      envMapIntensity: 1,
    }));
    if (caseIsPrinted) applyEmboss(material, atlas.embossTexture, params.embossDepth ?? 0.6);
    return material;
  })() : null;

  // --- dust jacket ---
  let jacket = null;
  if (jacketGeometry) {
    const jSurface = getSurface(params.jacketSurface ?? 'coatedMatte', (params.surfaceSeed ?? 11) + 4);
    const jMaps = cloneMaps(jSurface, track, {
      uSpanMm: Math.abs(jacketGeometry.userData.uSpan),
      heightMm: params.height,
      tileMm: jSurface.preset.tileMm,
    });
    const printed = track(new MeshPhysicalMaterial({
      map: atlas.texture,
      normalMap: jMaps.normalMap,
      normalScale: new Vector2(0.6, 0.6),
      roughness: jSurface.preset.roughness,
      metalness: 0,
      clearcoat: jSurface.preset.clearcoat ?? 0,
      clearcoatRoughness: jSurface.preset.clearcoatRoughness ?? 0.3,
      envMapIntensity: 1,
    }));
    applyEmboss(printed, atlas.embossTexture, params.embossDepth ?? 0.6);

    const paper = track(new MeshStandardMaterial({
      color: new Color('#efe9de'),
      roughness: 0.92,
      metalness: 0,
      normalMap: jMaps.lining,
      normalScale: new Vector2(0.35, 0.35),
      envMapIntensity: 0.7,
    }));
    jacket = [printed, paper, paper, paper];
  }

  // --- page block ---
  const pageMaps = buildPageEdgeTextures({
    thicknessMm: spec.meta.blockT,
    pageThicknessMm: params.pageThickness ?? 0.105,
    tint: params.pageColor,
    seed: params.surfaceSeed ?? 5,
  });
  for (const t of Object.values(pageMaps)) track(t);

  const pageSide = track(new MeshStandardMaterial({
    map: pageMaps.side, bumpMap: pageMaps.sideBump, bumpScale: 0.35,
    roughness: 0.88, metalness: 0, envMapIntensity: 0.75,
  }));
  const pageCap = track(new MeshStandardMaterial({
    map: pageMaps.cap, bumpMap: pageMaps.capBump, bumpScale: 0.35,
    roughness: 0.88, metalness: 0, envMapIntensity: 0.75,
  }));
  const pageFace = track(new MeshStandardMaterial({
    color: new Color(params.pageColor).multiplyScalar(0.86), roughness: 0.95, metalness: 0,
  }));
  const pageSpine = track(new MeshStandardMaterial({
    color: new Color(params.pageColor).multiplyScalar(0.62), roughness: 1, metalness: 0,
  }));

  const cover = clothMaterial
    ? [coverOuter, lining, coverEdge, tip, clothMaterial]
    : [coverOuter, lining, coverEdge, tip];
  if (hingeUniforms) {
    // any slot can contain vertices belonging to the board that opens
    for (const m of new Set([...cover, ...(jacket ?? [])])) patchMaterial(m, { hingeUniforms });
  }
  const depthMaterial = hingeUniforms ? track(createHingedDepthMaterial(hingeUniforms)) : null;

  return {
    atlas,
    cover,
    pages: [pageSide, pageFace, pageCap, pageSpine],
    jacket,
    depthMaterial,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

/**
 * The depth pass uses its own shader: without the same injection, the
 * shadow would stay the closed-book shape while the board opens.
 */
function createHingedDepthMaterial(hingeUniforms) {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, hingeUniforms);
    shader.vertexShader = hingeVertexShader(shader.vertexShader);
  };
  material.customProgramCacheKey = () => 'book3d:depth-hinge';
  return material;
}

/** Independent copies of the grain maps, scaled to the surface's format. */
function cloneMaps(surface, track, tiling) {
  const normalMap = track(surface.normalMap.clone());
  const roughnessMap = track(surface.roughnessMap.clone());
  const edge = track(surface.normalMap.clone());
  const lining = track(surface.normalMap.clone());
  for (const m of [normalMap, roughnessMap, edge, lining]) m.needsUpdate = true;
  tileMaps([normalMap, roughnessMap, edge, lining], tiling);
  return { normalMap, roughnessMap, edge, lining };
}

/** Adds the emboss's slope to the grain's, in tangent space. */
const EMBOSS_BLEND = `
	#ifdef USE_MAP
	{
		vec3 embN = texture2D( embossMap, vMapUv ).xyz * 2.0 - 1.0;
		embN.xy *= embossScale;
		mapN = normalize( vec3( mapN.xy + embN.xy, mapN.z * embN.z ) );
	}
	#endif
`;

/**
 * three's normal chunk, rewritten with the emboss injection.
 *
 * `onBeforeCompile` receives the shader before its `#include`s are resolved,
 * so the chunk's code can't be replaced directly: the directive itself is
 * replaced, inlining the original source with the modification.
 */
function embossedNormalChunk() {
  const src = ShaderChunk.normal_fragment_maps;
  const anchor = 'mapN.xy *= normalScale;';
  if (!src.includes(anchor)) {
    console.warn('book3d: normal_fragment_maps changed upstream, emboss not injected');
    return src;
  }
  return src.replace(anchor, anchor + EMBOSS_BLEND);
}

/**
 * Debossing/embossing.
 *
 * three treats bumpMap and normalMap as alternatives (`#elif`), so assigning
 * both isn't enough: the emboss's normal has to be combined by hand with the
 * grain's, which lives in a different UV space because it's tiled.
 */
function applyEmboss(material, embossTexture, depth) {
  if (!embossTexture) return;
  patchMaterial(material, {
    emboss: {
      embossMap: { value: embossTexture },
      embossScale: { value: new Vector2(depth, depth) },
    },
  });
}

/**
 * Injections into three's shaders. They accumulate on the same material — a
 * board can carry both the emboss and the hinge at once — and the program
 * cache key records which ones are active, otherwise different variants
 * would reuse the same compiled program.
 */
function patchMaterial(material, { emboss, hingeUniforms }) {
  const state = material.userData.book3d ?? { uniforms: {}, flags: new Set() };
  material.userData.book3d = state;
  if (emboss) {
    Object.assign(state.uniforms, emboss);
    state.flags.add('emboss');
  }
  if (hingeUniforms) {
    Object.assign(state.uniforms, hingeUniforms);
    state.flags.add('hinge');
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, state.uniforms);
    if (state.flags.has('emboss')) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform sampler2D embossMap;\nuniform vec2 embossScale;\nvoid main() {'
        )
        .replace('#include <normal_fragment_maps>', embossedNormalChunk());
    }
    if (state.flags.has('hinge')) {
      shader.vertexShader = hingeVertexShader(shader.vertexShader);
    }
  };
  const key = `book3d:${[...state.flags].sort().join('+')}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}
