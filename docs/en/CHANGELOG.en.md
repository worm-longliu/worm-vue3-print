# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

- `@worm-vue3-print/core`: added the print pipeline module (driver contract + shared DOM host runtime + three drivers).
  Browser preview, render service and desktop client now share one implementation of measurement, pagination,
  continuous-paper probe, code rendering and PDF target spec; added the IIFE executor artifact and the
  `@worm-vue3-print/core/node` entry (`loadExecutorBundle`).
- `@worm-vue3-print/render`: **behavior change** ① continuous-paper height is now derived from content
  (previously a fixed `80×297mm`); ② barcode/QR rendering switches from `bwip-js` to `jsbarcode`/`qrcode`
  (matching browser preview); ③ readiness waits on `domcontentloaded` + 5s instead of `networkidle`.
- `print-client`: **behavior change** measurement readiness wait is 5s now; the renderer worker and IPC bridge
  were removed in favor of the core pipeline plus an Electron driver (protocol and printing behavior unchanged).
- Known gap (not implemented here): the protocol accepts `color` and `pageRanges`, but the PDF→system-print path never applied them.
- `@worm-vue3-print/core`: **Behavior change** Templates that already stored a `fontFamily`
  on table cells had that field silently dropped at render time (it was missing from the
  data-binder field map). Cell fonts now take effect, so **the output of such existing
  templates will change**. Also fixed `font-family` output missing quotes and the fallback
  stack (family names containing spaces, e.g. `Microsoft YaHei`, did not apply before).
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`: added the `fonts` prop
  (`PrintFontDeclaration[]`) to `PrintDesigner` — **template-level font declarations**. The designer
  injects `@font-face`, lists them in the font picker, and writes them into the template JSON `fonts`
  field on save/preview/screenshot so the
  render service and desktop client print with the same files instead of whatever their OS happens
  to have. A `url` starting with `/` is resolved against each end's `baseUrl` (same rule as relative
  image paths); absolute URLs are used as-is.
- `@worm-vue3-print/core`: generated HTML now carries `@font-face` rules for the template-declared
  fonts (`font-display: block`), injected in both the measurement pass and the final output; the DOM
  executor explicitly loads declared fonts during readiness instead of only awaiting `fonts.ready`
  (which can resolve early, measuring fallback metrics and breaking pagination).
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: font declarations accept an optional `label`
  (the business name, e.g. "马善政毛笔楷书"). The font input and picker show the label first and add
  the real family name in parentheses (e.g. "马善政毛笔楷书（Ma Shan Zheng）"), and the search matches both
  label and family. What gets written into the template and `@font-face`
  is always the `family`; submitting a label maps back to the family so a display name can never be
  stored by accident and silently lose the font.
- Font base URL is now decoupled from the image base URL (**fixes custom fonts only working on the
  design canvas**): relative font URLs used to be prefixed with the image `baseUrl` (e.g. a business
  OSS host) and thus 404'd on every rendering end, silently falling back to system fonts. The
  signature is now `bindData(template, data, baseUrl, fontBaseUrl)` — `fontBaseUrl` is independent,
  defaults to `baseUrl`, and an empty string means "do not prefix" (browser resolves against the
  document origin, which is the default). Supported by `PrintJob`, the render service request body
  plus its `FONT_BASE_URL` env var, SDK `print(..., { fontBaseUrl })`, client validation/rendering
  and `PrintHtmlPreview`. In addition, the font host/CDN **must return `Access-Control-Allow-Origin`**:
  rendering ends load the template HTML with a `null`/app-protocol origin, and without CORS the font
  is blocked just the same.
- `@worm-vue3-print/canvas`: the font picker for text elements and table cells now lists **only the
  template-declared fonts** (showing `label` when present; a current value outside the declarations is
  kept and marked "(unknown)"). Family names outside the declarations can still be typed freely and
  are never silently cleared.
- **Breaking change: removed font querying (server and desktop client)** — the two ends' system font
  lists are no longer fetched. Removed `PrintDesigner`'s `serverFonts` / `clientFonts` / `loadFonts`
  props, the "Query fonts" button and the offline/missing-font hints; removed the render service's
  `GET /fonts` and `X-Font-Warnings` header, the client SDK's `fonts.list` protocol message and
  `PrintClient.listFonts()`, the desktop client's pre-print missing-font `warn` log, and core's
  `readSystemFonts` / `mergeFontSources` / `findMissingFonts` helpers. Font availability is now
  decided solely by the template's `fonts` declarations and their `@font-face` rules.

### Added

- Print client: New "keep generated PDFs" troubleshooting switch (config window checkbox; `keepGeneratedPdf` / `pdfOutputDir` in `config.json`, defaulting to `userData/pdf`). Each printed job's generated PDF is kept, the job history shows its absolute path, and the settings page offers an "open folder" button — useful for telling whether a color/orientation problem comes from PDF generation or from the printer/driver.
- `@worm-vue3-print/client`: Added a browser-prerendered submission channel — protocol message `print.submitHtml` and the SDK method `PrintClient.printHtml(rendered, options, templateName)`. Host pages run the two-pass `renderHtmlPages` from `@worm-vue3-print/core/browser` in the browser and submit the final HTML (paper size/orientation/margins/continuous height baked in) directly for silent printing; the client no longer executes template rendering on this path. The legacy `print` (client-side rendering) channel remains supported.
- Print client: Inbound validation for `print.submitHtml` (non-empty HTML, ≤20MB, positive `paperMm` in millimeters, typed `continuous`/`pageCount`); paper/orientation/margin overrides are rejected with `INVALID_REQUEST`. The print engine was refactored into a shared "prepare (render or take prerendered HTML) → print" flow.
- demo: "Client silent print" now renders in the browser and submits via `printHtml` (new wrapper `src/browser-render.ts`).

- `@worm-vue3-print/core`: Added an isomorphic watermark module (`render/watermark.ts`) — `generateHtml` now emits a `.watermark-layer` at the bottom of every page (explicit vector tiles, one `<svg class="watermark-tile">` per tile), keeping the watermark identical across the designer canvas, browser preview, server-side PDF, and silent print client.
- `@worm-vue3-print/core`: `WatermarkOptions` gained `tileWidth`/`tileHeight` (tile size controlling watermark density, default 260×180). New exports: `WATERMARK_DEFAULTS`, `WATERMARK_DENSITY_PRESETS`, `PX_PER_MM`, `MM_PER_PX`, `isWatermarkVisible`, `resolveWatermarkText`, `formatTimestamp`, `resolveWatermarkLayout`, `renderWatermarkTileSvg`, `renderWatermarkLayerHtml`.
- `@worm-vue3-print/core`: Watermark expressions now support the system variables `{printDate}` (YYYY-MM-DD), `{printTime}` (HH:mm:ss), `{pageIndex}`, and `{totalPages}`, matching the expression editor's "variables" tab. `injectSystemVariables` also substitutes `{printTime}`, and `resolveSystemVariables` is exported so the designer preview and the renderer share one source of values.
- `@worm-vue3-print/canvas`: The watermark panel now uses a single "watermark expression" input — plain text is a static watermark (`mode=fixed`), while `{field}`, function calls (`CONCAT(...)`) or field paths (`order.no`) are evaluated as expressions (`mode=binding`), so no manual mode switch is needed. Expressions are edited through the expression dialog (button or double-click on the input), where fields and print date/time variables can be picked directly. The preset field dropdown and the timestamp switch were removed (use `{printDate}`/`{printTime}` in the expression instead); the test value row only shows in expression mode; density (dense/medium/loose/custom tile size) and the other settings remain.
- `@worm-vue3-print/canvas`: `WatermarkConfig` and `CanvasPaper` reuse the core watermark module, so design, preview, and print render identically.

### Changed

- Merged the rendering microservice `worm-vue3-print-render` into this monorepo as the private service package `services/print-render` (package name `@worm-vue3-print/render` unchanged, not published to npm). It now depends on `@worm-vue3-print/core` via a local npm workspace symlink instead of the npm registry.
- Added a `services/*` workspace layer; `npm run build` now also builds render, while the root `npm test` still covers core/canvas only. Browser-based render integration tests run in a dedicated CI job.
- Added a root `.npmrc` so Playwright browsers are not downloaded during dependency installation; install Chromium on demand via `npx playwright install chromium` locally/in CI (the Docker image uses the Chromium bundled in the base image). The Docker build context is now the repository root (`docker build -f services/print-render/Dockerfile .`).
- demo (`demo/`): Added server-side PDF printing. The top bar shows render-service health, and the "Server PDF" button calls the render microservice through the Vite dev proxy (`/render-api/*`, with `X-Render-Key` injected at the proxy layer), sending the current canvas JSON plus demo data for two-pass server rendering and opening the PDF in a new tab.
- `@worm-vue3-print/canvas`: **breaking change** removed the built-in "Load default layout" toolbar button and the `load-default-template` prop — loading/resetting a template is host business. The host renders its own entry point and assigns a new `TemplateData` to `initial-template` to reload the canvas (the designer watches the reference and records one history entry, so undo works). Hosts that still pass `load-default-template` will have it ignored and must migrate to the above.

### Fixed

- Print client: Fixed the silent-print failure chain "PDF generation timeout → every later job returns BUSY". `webContents.printToPDF` no longer accepts a callback (the callback never fires and the returned promise rejection is swallowed), and `PrintToPDFOptions.pageSize` is in **inches**, not microns (passing microns produced a 210000×297000 inch page, which Electron 44 refuses to generate). The client now uses the promise form with a timeout guard (`src/main/pdf-generator.ts`), converts microns to inches, sets explicit zero margins and `printBackground: true`, and reports generation failures/timeouts as `PRINT_FAILED` while always releasing the serial gate. Printed output now matches the server-side PDF in paper size and watermark rendering.
- Print client: Documentation now describes the "HTML → printToPDF → system print command" pipeline (`clients/print-client/README.md`, Chinese silent-print guide, silent-print skill reference).
- `@worm-vue3-print/core`: Fixed watermarks being magnified ~3x, offset, and tiled incorrectly when printing to paper. The watermark used to be a CSS tile-repeated background (`background-image` + `background-repeat`), which Chromium compiles into a PDF tiling pattern; PDF viewers render it correctly, but the print path RIP ignores the pattern matrix (the enclosing form had a CTM of 3.125 = 300dpi÷96px, matching the measured magnification). Watermarks are now explicit vector tiles: `resolveWatermarkLayout` computes the tile grid for the final paper size (including the probed continuous-paper height) and emits one inline `<svg>` per tile, restoring the designed geometry on paper (68.8mm × 47.6mm at default A4 density). `buildWatermarkSvgDataUrl` was removed to prevent regressions back to the tile-repeated background approach.
- Print client: Fixed the printed page orientation not matching the browser/server preview (landscape pages came out portrait). The print command did not declare a paper size, so CUPS used the queue default sheet (usually portrait A4) and `pdftopdf` rotated landscape pages by 90° (the resulting PDF carried `/Rotate 90`). The client now sends an explicit `-o media=…` (host-provided driver paper form → matched standard size → `Custom.<width>x<height>` in points). Verified: the same landscape A4 page went from `/Rotate 90` back to `/Rotate 0`, and portrait pages are unaffected.

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
