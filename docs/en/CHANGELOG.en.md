# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Merged the rendering microservice `worm-vue3-print-render` into this monorepo as the private service package `services/print-render` (package name `@worm-vue3-print/render` unchanged, not published to npm). It now depends on `@worm-vue3-print/core` via a local npm workspace symlink instead of the npm registry.
- Added a `services/*` workspace layer; `npm run build` now also builds render, while the root `npm test` still covers core/canvas only. Browser-based render integration tests run in a dedicated CI job.
- Added a root `.npmrc` so Playwright browsers are not downloaded during dependency installation; install Chromium on demand via `npx playwright install chromium` locally/in CI (the Docker image uses the Chromium bundled in the base image). The Docker build context is now the repository root (`docker build -f services/print-render/Dockerfile .`).
- demo (`demo/`): Added server-side PDF printing. The top bar shows render-service health, and the "Server PDF" button calls the render microservice through the Vite dev proxy (`/render-api/*`, with `X-Render-Key` injected at the proxy layer), sending the current canvas JSON plus demo data for two-pass server rendering and opening the PDF in a new tab.

## [1.2.2] - 2026-09-11

### Changed

- `@worm-vue3-print/core`: Added the `@worm-vue3-print/core/designer` subpath export — a framework-agnostic designer core containing the full template model types, common utilities (element factory, table matrix, unit conversion, template migration, ruler, etc.) and pure interaction logic (align, group, keyboard, resize, adsorb calculation) with no Vue/React dependency.
- `@worm-vue3-print/core`: Added the `@worm-vue3-print/core/browser` subpath export — browser-side render adapters (`renderHtmlPages` two-pass paginated rendering, `browserCodeRenderer` for barcode/QR code).
- `@worm-vue3-print/canvas`: Designer models, utilities, and pure logic moved down into the core subpaths; canvas now only keeps the Vue adapter layer. Public exports remain unchanged, and the core main entry still has zero runtime dependencies.

### Fixed

- `@worm-vue3-print/canvas`: Fixed the toolbar zoom in/out buttons mutating the scale linearly without scroll-anchor correction, which caused the viewport content to drift. Button zoom now uses the same multiplicative stepping as Ctrl+wheel and is anchored at the viewport center (same pipeline as "Fit to window").

## [1.2.1] - 2026-09-11

### Changed

- `@worm-vue3-print/canvas`: Icon buttons in the toolbar edit/layer/view groups now use unified `data-tip` custom tooltips; added missing tooltips for "Grid" and "Snap"; raised tooltip stacking so they are no longer hidden behind the canvas ruler.
- `@worm-vue3-print/canvas`: Optimized "Fit to window" — it now zooms to the target scale in one step anchored at the viewport center (same scaling pipeline as Ctrl+wheel) with a smooth transition; it may go below the interactive zoom floor (down to 5%) so oversized paper fits entirely, and the paper is centered both horizontally and vertically in the canvas viewport.
- `@worm-vue3-print/canvas`: Added a `showHelp` option controlling the help entry (help button and help modal), enabled by default, pass `false` to hide it.

### Fixed

- `@worm-vue3-print/canvas`: Fixed toolbar tooltips being hidden behind the viewport-fixed canvas ruler.
- `@worm-vue3-print/canvas`: Fixed "Fit to window" leaving residual scrollbars for oversized paper and the paper not being centered (vertically offset upward) in the canvas viewport.

### Docs

- Added a print designer workbench layout wireframe document (`docs/中文/打印设计工作台-布局线框图.md`) labeling each area's name, function, and component file for easier future layout adjustments.

## [1.2.0] - 2026-09-10

### Added

- `@worm-vue3-print/canvas`: Help modal (HelpModal) with feature guide, keyboard shortcuts, and FAQ.
- `@worm-vue3-print/canvas`: Enhanced ruler guides — drag to add guides, double-click to edit, delete, with real-time snap alignment display.
- `@worm-vue3-print/canvas`: Table column width drag now renders a right-edge handle on the last column, allowing direct resize of the last column, clamped by `maxTableWidth`.

### Changed

- `@worm-vue3-print/canvas`: Optimized zoom logic — removed zoom-in limit, scroll-wheel multiplicative step zooming, fixed zoom anchor drift.
- `@worm-vue3-print/canvas`: Removed the fx binding badge tooltip at the top-left corner of elements in design mode.

### Docs

- Added `AGENTS.md` at the repository root, specifying mandatory requirements for AI agents working in this repo: language, expert attitude, and collaboration conventions.
- Added `worm-vue3-print` integration support skill (`skills/worm-vue3-print-integration/`), including installation guide, integration API, and troubleshooting references.

### Fixed

- `@worm-vue3-print/canvas`: Fixed multiple issues in table column width drag — left edge of internal column boundaries did not follow the cursor when dragging left (left column width was unchanged), missing px→mm unit conversion caused ~3.78x drag distance deviation, and under `table-layout:fixed` the table CSS `width(100%)` mismatched the sum of column widths during drag, causing the browser to stretch columns proportionally so the boundary line and right-side content drifted from the cursor; also removed a leftover `document.title` debug statement in `onColResizeStart`.

## [1.1.0] - 2026-09-06

### Added

- `@worm-vue3-print/canvas`: Table column width drag — hover and drag column borders in design mode to resize columns, clamped by print width and minimum column width (5mm), counted as one undo history entry.
- `@worm-vue3-print/canvas`: Table cell image type support — cells can be switched to image type with fit/maxWidth/maxHeight properties, fully rendered in preview and print output.
- `@worm-vue3-print/canvas`: Barcode and qrcode cell support for fit/maxWidth/maxHeight properties.
- `@worm-vue3-print/canvas`: Position and size properties now use StepperInput controls with button-based value stepping; StepperInput supports optional value lists and decimal step increments.
- `@worm-vue3-print/canvas`: Unified color picker and refactored property panel field grouping.
- `@worm-vue3-print/canvas`: Page (paper) background color `pageBackground` support, consistent across preview and print/PDF output.
- `@worm-vue3-print/canvas`: Canvas library mode build and npm publishing support.

### Fixed

- `@worm-vue3-print/canvas`: Print/export PDF preserves element background colors (`print-color-adjust: exact`).
- `@worm-vue3-print/canvas`: Print preview preserves element overlap; elements below tables use absolute positioning with z-index.
- `@worm-vue3-print/canvas`: Print header/footer areas now stick to page bottom; fixed page margin not taking effect.
- `@worm-vue3-print/canvas`: Barcode rendering missing `object-fit: contain`.
- `@worm-vue3-print/canvas`: Fixed `localStorage` not defined in canvas tests under vitest v4 + happy-dom environment, added mock to make tests compatible.

## [1.0.0] - 2026-09-02

### Added

- First open source release.
- `@worm-vue3-print/core`: template expression engine and isomorphic rendering pipeline (HTML generation / pagination / data binding).
- `@worm-vue3-print/canvas`: Vue 3 visual print template designer canvas.
- Rendering microservice split into a separate repository `worm-vue3-print-render` (Docker deployment only, not published to npm).
