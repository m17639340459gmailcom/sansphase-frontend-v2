# Active TDX particle engine

The current preview directly reuses Dingxin Tao's MIT-licensed first-screen
particle engine from
[tdx-portfolio](https://github.com/DingxinTao0417/tdx-portfolio/tree/c73bc4966f0ba808b978e22eccf5a063fc649751),
fixed commit `c73bc4966f0ba808b978e22eccf5a063fc649751`.
The MIT notice is retained in `LICENSE`.

The original engine, shaders, GPGPU simulation, interaction, shape registry,
mask sampler, mathematics and source shapes are retained byte-for-byte.
The source shapes remain dependencies of the generic registry/engine, but are
not included in the active shape atlas or playback.

Only two configuration constants in `hero-cycle.ts` differ from upstream:
the playback target IDs are `4, 5, 6` instead of `2, 1, 3`, and the reduced-motion
default is `4` instead of `1`. The untouched cycle is `hero-cycle.upstream.ts`.
There are no changes to timing, physics, shader code or gesture logic in the
vendored modules. `provenance.json` records the original paths, fixed revision,
SHA-256 hashes and the explicit two-constant adaptation.

`src/scene.ts` is a native TypeScript lifecycle adapter replacing the original
React / R3F wrapper. It adapts pause, visibility, theme and disposal to the
existing preview application. It does not implement a second particle effect.

`src/scene-shapes.ts` supplies SANSPHASE resting targets through the documented
`registerHeroShape` extension point: film frames for the existing AI video
workflow, open pages for the personal knowledge records, and the author's
“無相” identity through TDX's existing rasterizer / sampler. The first two
targets use Three.js 0.186.0's official `ExtrudeGeometry` and
`MeshSurfaceSampler` to sample mesh surfaces. Shape coordinates and brand
palette are local adaptations; the motion mechanisms are the source engine.
The film target uses a static presentation scale of `0.85` and a small model
centering offset so its projected outline stays within the frame. The open
knowledge book uses a static presentation scale of `0.86` for HUD clearance.
The camera
retains the source engine's 38-degree field of view and distance of 7 units.

The surrounding HUD, ambient background and coordinate cursor adapters have
their individual source paths recorded by the preview's `SOURCES.json`.
