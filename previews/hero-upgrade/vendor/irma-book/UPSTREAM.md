# irma-book: isolated book viewer source

- Upstream: https://github.com/fabiosantaniellobruun/irma-book
- Fixed commit: `32e8c1a1e22f96059612a89d0c21d46c76ca7374`
- License: MIT; the original license is retained in `LICENSE`.
- Imported scope: the complete upstream `src/book3d/` directory only.
- Not imported: the configurator, GUI, PDF import, GIF encoder, export application,
  package manifest, or upstream build dependencies.
- The host uses its existing, pinned Three.js `0.186.0`; upstream declared
  `^0.185.1`. Shader injection anchors were checked against the local Three source;
  real browser rendering remains part of host acceptance.

This is a small experimental project, not a mature component library. At review it
had two commits and no GitHub release. Its license permits this adaptation, but
its maintenance history and test coverage do not establish production stability.
The presence of upstream `CLAUDE.md` also means we cannot assert that its author
used no AI assistance. No AI image or video is imported by this adaptation.

## Host changes to BookViewer.js

- Disable `preserveDrawingBuffer`; the embedded viewer does not export captures.
- Use a 1024² shadow map with an 8-pixel VSM blur radius for the compact embedded stage.
- Dispose the temporary RoomEnvironment and the directional light's shadow
  render targets, and explicitly release the WebGL context on teardown.
- Make teardown idempotent and make exposed mutation methods inert after it.
- Reject unsupported image slots and ignore superseded or disposed image loads.
- Dispose the viewer if the initial resize / geometry build throws.
- Stop animation-frame scheduling when out of view, when the document is hidden,
  or when the host calls `setActive(false)`; resume by invalidating one frame.
- Add an optional host `readingMode`: the book starts upright and front-facing,
  then the case is laid flat with coordinated cover/camera motion. The host
  attaches a separate multi-sheet layer, suspends OrbitControls during reading,
  and restores the closed pose on reset.
- Expose `attachPageLayer`, page bounds/hinge location, reading progress and a
  raycast hit test. The existing page-block geometry is reused for right/left
  support stacks; their heights follow the external paper layer. The left stack
  excludes the top visible sheet so a solid support does not cover its text.
- In reading mode, rotate the front case around the book's mid-thickness plane
  (`hingeZ = 0`) so the front board can settle beside the paper at 180 degrees.
  The original hinge Z remains the default outside reading mode.

## Controlled host change to hinge.js

`hinge.js` is no longer an unchanged upstream module. It adds a
`bookHingeMaskShift` uniform, defaulting to zero. Reading mode sets it to
`-hingeBlend`, moving the flexing mask from
`[hingeX - blend, hingeX + blend]` to `[hingeX - 2 * blend, hingeX]` while
leaving the X rotation axis unchanged. The whole front board and inner lining
at `x >= hingeX` then complete the opening rotation; only the spine-side groove
flexes. Without this shift, the inner lining's hinge-edge vertices rotate only
halfway and the resulting diagonal face occludes the turned page. The same
factor is shared by position, normal and depth-shader injection.

This is a controlled adaptation of the upstream hinge, not a claim that all
original motion algorithms are untouched.

## Source identity after adaptation

SHA-256 comparisons against the fixed upstream snapshot on 2026-10-18 found
11 imported JavaScript modules: two changed (`BookViewer.js`, `hinge.js`) and
nine byte-identical modules:

- `firstPage.js`, `headband.js`, `materials.js`
- `geometry/profiles.js`, `geometry/sweptProfile.js`
- `textures/coverArt.js`, `textures/pageEdge.js`, `textures/procedural.js`,
  `textures/surfaces.js`

`BookViewer.d.ts` is a host-written narrow declaration, not an upstream file.
The original case geometry, material construction and procedural surface/page
textures remain in those unchanged modules.

## Third-party multi-sheet composition

`src/library-book-viewer.ts` composes this physical case with
`vendor/quick-flipbook/index.js`. The paper-turning source is
[`quick_flipbook` 1.1.3](https://github.com/bandinopla/quick_flipbook/tree/2c62c76b7dd91861f9e71259d8e37157018ba16e),
fixed commit `2c62c76b7dd91861f9e71259d8e37157018ba16e`, BSD-2-Clause. Its
`three.modifiers` 2.5.7 dependency is fixed to source commit
`f0d795e620409e2644ae0e3d8e809d88f0f3e0f2`; the original README declares
BSD-3-Clause but the package has no standalone LICENSE file. Those sources,
license declarations, hashes and host hardening are recorded in
`vendor/quick-flipbook/UPSTREAM.md` and `SOURCE-MANIFEST.json`.

The wrapper supplies localized typographic preview faces, converts millimeters
to the page engine's coordinate system, owns page textures/materials, and
coordinates cover opening with next/previous paper turns. It does not replace
the paper engine's Bend, Twist or PageCurve algorithms. The fixed source is
bundled against the host's existing Three 0.186.0, without installing old Three,
React, upstream webpack/Vite, or editor/export dependencies.

Maintenance is limited: quick_flipbook's latest inspected commit/release is
2024-02-20 and three.modifiers 2.5.7 was published 2021-06-10. Neither inspected
repository declares itself discontinued; this does not establish active
maintenance. These are isolated, pinned source adaptations, not components
claimed to be actively maintained or production proven.

## Integration boundaries

The viewer is an interactive reading-room preview with six double-sided sheets
of trusted site labels. These faces are not catalog inventory or uploaded book
chapters. It does not provide a catalog record, an authenticated reading session,
account access, a full book reader, or a production book cover. The existing
main-site Reader and its access decisions remain the entry for actual books.
The host supplies next/previous buttons, keyboard alternatives and a hit-tested
wheel interaction; outside the book or at its page limits, normal document
scrolling remains available. Reduced motion, fallback rendering, inactive-page
suspension and disposal remain host responsibilities.

Known upstream limitations retained: image loading is not network-abortable;
surface bases are held in a module-level cache; changes to `headbandColors` alone
do not trigger a material rebuild; camera azimuth/elevation changes through
`update()` require `resetCamera()` to take effect. The host uses fixed trusted
configuration, no remote images, and a single viewer instance.
