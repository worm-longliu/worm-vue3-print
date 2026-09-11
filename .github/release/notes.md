## v1.2.2 (2026-09-11)

### Changed

- `@worm-vue3-print/core` now ships a new **`@worm-vue3-print/core/designer`** subpath export: a framework-agnostic designer core containing the full template model types, common utilities (element factory, table matrix, unit conversion, template migration, ruler, etc.) and pure interaction logic (align, group, keyboard, resize, adsorb calculation) — with no Vue/React dependency.
- New **`@worm-vue3-print/core/browser`** subpath export: browser-side render adapters (`renderHtmlPages` two-pass paginated rendering, `browserCodeRenderer` for barcode/QR code).
- Designer models, utilities and pure logic in `@worm-vue3-print/canvas` were moved into the core subpaths; canvas now only keeps the Vue adapter layer. **Public API is unchanged**, and the core main entry still has zero runtime dependencies — laying the groundwork for future Vue 2 / React / Lit adapters.

### Fixed

- Toolbar zoom in/out buttons previously changed the scale linearly without scroll-anchor correction, causing viewport drift. Button zoom now uses the same multiplicative stepping as Ctrl+wheel and is anchored at the viewport center (same pipeline as "Fit to window").

### Tests

- All 374 core and 139 canvas unit tests pass; core/canvas/demo builds and type checks pass.
