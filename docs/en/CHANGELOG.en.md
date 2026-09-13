# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `@worm-vue3-print/client`: Added a browser-prerendered submission channel — protocol message `print.submitHtml` and the SDK method `PrintClient.printHtml(rendered, options, templateName)`. Host pages run the two-pass `renderHtmlPages` from `@worm-vue3-print/core/browser` in the browser and submit the final HTML (paper size/orientation/margins/continuous height baked in) directly for silent printing; the client no longer executes template rendering on this path. The legacy `print` (client-side rendering) channel remains supported.
- Print client: Inbound validation for `print.submitHtml` (non-empty HTML, ≤20MB, positive `paperMm` in millimeters, typed `continuous`/`pageCount`); paper/orientation/margin overrides are rejected with `INVALID_REQUEST`. The print engine was refactored into a shared "prepare (render or take prerendered HTML) → print" flow.
- demo: "Client silent print" now renders in the browser and submits via `printHtml` (new wrapper `src/browser-render.ts`).

- `@worm-vue3-print/core`: Added an isomorphic watermark module (`render/watermark.ts`) — `generateHtml` now emits a `.watermark-layer` at the bottom of every page (explicit vector tiles, one `<svg class="watermark-tile">` per tile), keeping the watermark identical across the designer canvas, browser preview, server-side PDF, and silent print client.
- `@worm-vue3-print/core`: `WatermarkOptions` gained `tileWidth`/`tileHeight` (tile size controlling watermark density, default 260×180). New exports: `WATERMARK_DEFAULTS`, `WATERMARK_DENSITY_PRESETS`, `PX_PER_MM`, `MM_PER_PX`, `isWatermarkVisible`, `resolveWatermarkText`, `formatTimestamp`, `resolveWatermarkLayout`, `renderWatermarkTileSvg`, `renderWatermarkLayerHtml`.
- `@worm-vue3-print/canvas`: Watermark bindings now support full paths and expressions (`order.no`, `{order.no}`, `CONCAT/DATE(...)`), falling back to a test value when unresolved. The config panel gained the "custom expression", "time format", and "density (dense/medium/loose/custom)" inputs.
- `@worm-vue3-print/canvas`: `WatermarkConfig` and `CanvasPaper` reuse the core watermark module, so design, preview, and print render identically.

### Changed

- Merged the rendering microservice `worm-vue3-print-render` into this monorepo as the private service package `services/print-render` (package name `@worm-vue3-print/render` unchanged, not published to npm). It now depends on `@worm-vue3-print/core` via a local npm workspace symlink instead of the npm registry.
- Added a `services/*` workspace layer; `npm run build` now also builds render, while the root `npm test` still covers core/canvas only. Browser-based render integration tests run in a dedicated CI job.
- Added a root `.npmrc` so Playwright browsers are not downloaded during dependency installation; install Chromium on demand via `npx playwright install chromium` locally/in CI (the Docker image uses the Chromium bundled in the base image). The Docker build context is now the repository root (`docker build -f services/print-render/Dockerfile .`).
- demo (`demo/`): Added server-side PDF printing. The top bar shows render-service health, and the "Server PDF" button calls the render microservice through the Vite dev proxy (`/render-api/*`, with `X-Render-Key` injected at the proxy layer), sending the current canvas JSON plus demo data for two-pass server rendering and opening the PDF in a new tab.

### Fixed

- Print client: Fixed the silent-print failure chain "PDF generation timeout → every later job returns BUSY". `webContents.printToPDF` no longer accepts a callback (the callback never fires and the returned promise rejection is swallowed), and `PrintToPDFOptions.pageSize` is in **inches**, not microns (passing microns produced a 210000×297000 inch page, which Electron 44 refuses to generate). The client now uses the promise form with a timeout guard (`src/main/pdf-generator.ts`), converts microns to inches, sets explicit zero margins and `printBackground: true`, and reports generation failures/timeouts as `PRINT_FAILED` while always releasing the serial gate. Printed output now matches the server-side PDF in paper size and watermark rendering.
- Print client: Documentation now describes the "HTML → printToPDF → system print command" pipeline (`clients/print-client/README.md`, Chinese silent-print guide, silent-print skill reference).
- `@worm-vue3-print/core`: Fixed watermarks being magnified ~3x, offset, and tiled incorrectly when printing to paper. The watermark used to be a CSS tile-repeated background (`background-image` + `background-repeat`), which Chromium compiles into a PDF tiling pattern; PDF viewers render it correctly, but the print path RIP ignores the pattern matrix (the enclosing form had a CTM of 3.125 = 300dpi÷96px, matching the measured magnification). Watermarks are now explicit vector tiles: `resolveWatermarkLayout` computes the tile grid for the final paper size (including the probed continuous-paper height) and emits one inline `<svg>` per tile, restoring the designed geometry on paper (68.8mm × 47.6mm at default A4 density). `buildWatermarkSvgDataUrl` was removed to prevent regressions back to the tile-repeated background approach.

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
