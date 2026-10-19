# Catalog book binding

- Upstream: https://github.com/scastiel/book-cover-3d
- Fixed source commit: `0304f59006705ac9d681505eabd9d70c1252bfb4`.
- Source: `src/index.tsx`, retained unmodified as `index.source.tsx` for inspection.
- License: MIT; original notice retained in `LICENSE` and the shipped third-party notices.
- Reviewed 2026-10-19: repository is not archived; latest default-branch commit is 2020-12-02, package version 1.1.2, no GitHub releases, public repository security-advisories endpoint returned an empty array. This is **not** represented as an actively maintained dependency or a comprehensive security assessment.

The upstream README expressly supports extracting HTML/CSS without React. We reuse only the reviewed `getCssForSettings` front-cover / paper fore-edge / rear-cover CSS geometry. `book.css` replaces interpolated settings with custom properties. It does not import or execute React, the generator, the old development toolchain, scripts, network code or third-party runtime dependencies. The retained TSX file is an inert source record and is not bundled.

Host adaptation in `src/library-page.css`: shelf surface, binding crease, top and bottom paper edges, spine, theme tokens, keyboard-equivalent hover and reduced-motion behavior. The DOM adapter uses existing catalog cover URLs and native reading links. No new images, author names, page counts, progress or other book data are generated. Paper lines describe a visual binding, not an actual page count.

The catalog has no animation loop, canvas, WebGL context, extra image copy or per-card pointer listener. This avoids multiplying the separate existing hero book viewer's rendering cost. Missing images retain the existing title-cover fallback. Layout changes reuse the same links and do not refetch content.
