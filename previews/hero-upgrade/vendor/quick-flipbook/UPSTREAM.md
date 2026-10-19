# Fixed third-party page-turning kernel

This is an isolated source adaptation of `quick_flipbook`; it is not a new
page-deformation algorithm. The existing irma-book hardcover renderer remains
separate. No React, R3F, PDF parser, network reader, or obsolete build framework
is added to the host application's dependency manifest.

## Sources and licenses

- `quick_flipbook` 1.1.3, BSD-2-Clause, copyright 2024 bandinopla:
  https://github.com/bandinopla/quick_flipbook/tree/2c62c76b7dd91861f9e71259d8e37157018ba16e
- `three.modifiers` 2.5.7, README-declared BSD-3-Clause:
  https://github.com/drawcall/threejs-mesh-modifiers/tree/f0d795e620409e2644ae0e3d8e809d88f0f3e0f2
  The dependency has no separate LICENSE file; its original declaration is
  preserved in `third-party/three-modifiers/README.md` and documented in
  `third-party/three-modifiers/LICENSE-SOURCE.md`.
- `SOURCE-MANIFEST.json` records original quick source SHA256 hashes, npm
  package integrity, source versions, and commit identities before adaptation.

## Maintenance limits

Checked 2026-10-18: quick_flipbook has 17 GitHub commits; its latest commit and
npm release are 2024-02-20. three.modifiers 2.5.7 was released 2021-06-10.
Neither inspected repository states that it is discontinued, but neither is
claimed here to be actively maintained or production proven. Pinning and local
Three 0.186 validation do not substitute for future maintenance and review.

The runtime uses the host's pinned Three 0.186.0. The dependency's historical
Three 0.160.1, webpack, Vite and development scripts are not installed or run.

## Narrow host adaptations

- `autoCenter: false` disables the upstream movement of the book container
  along X, so a surrounding hardcover's hinge can remain fixed.
- `isAnimating` exposes the existing `_stepSize` state for the host scheduler.
- Active and pooled page geometries are released on an idempotent `dispose`;
  generated materials are tracked and released. Materials and textures supplied
  by the host remain host owned; dispose host-created textures separately.
- CPU-deformed paper recalculates normals and bounds for PBR illumination,
  raycasting and frustum tests. Bend, Twist and PageCurve math is unchanged.
- Imported text has trailing spaces normalized. Manifest hashes identify the
  original upstream bytes before adaptation, not a claim of local byte identity.
- Dead objects do not begin new page changes. The URL loading path is retained
  upstream functionality but is not the supported host path: pass already
  created `THREE.Material` objects, and own their textures explicitly.

The upstream singleton decorative AO texture remains module cached if the
upstream blank/Texture/URL conversion paths are used. The host Material path
avoids that allocation and avoids asynchronous URL ownership races.

`index.d.ts` documents the public subset used by the host. `index.js` is the
reproducible ESM bundle of the preserved source and modifiers, externalizing
Three. Rebuild it with the existing local runtime:

```text
node vendor/quick-flipbook/build.mjs
```

## Geometry contract

Each paper is two merged 1x1 planes: X is from hinge 0 to fore-edge 1; Z is
page height -0.5 to +0.5; Y is thickness/stack elevation. Rotation around local
Z turns a sheet from +X toward -X, lifting through +Y. A parent rotation of
+PI/2 around X maps that plane into irma-book's XY page plane and lift into
+Z. Set width and height on the parent scale, leaving the kernel's X scale at
1 when `autoCenter` is false.

`setPages` groups sources into pairs (front/back) and pads an odd array by
mutating it; pass a copied array. `progress` measures physical sheets from 0
to `totalPages/2`. `currentPage` and `totalPages` count faces. `nextPage` and
`previousPage` move one physical sheet, changing the face index by 2.

The paper has no edge-wall volume. Apparent stack thickness comes from
`yBetweenPages`. A surrounding solid page block cannot remain across the
opened spread: the host must hide it or provide left/right support stacks.
The open-cover angle and spread camera must be coordinated by the host so
paper can settle without intersecting the original boards.
