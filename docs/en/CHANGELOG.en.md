# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [1.3.2] - 2026-09-26

### Added

- demo: new **"pagination stress test" multi-page sample** (groups + tables in an extreme layout, used to reproduce and verify element placement after page breaks), registered in the sample library; `SampleThumb` thumbnails now support multi-page template wrappers.

### Changed

- `@worm-vue3-print/canvas`: designer icons fully migrated to **on-demand lucide imports** (17 icons across the toolbar / layer panel, tooltips completed); group / ungroup now use the dedicated `Group` / `Ungroup` icons.
- `@worm-vue3-print/canvas`: **grouping & multi-select interaction fixes**: ① the ungroup entry shows whenever any selected element belongs to a group (the old "single selection only" check was a dead branch for whole-group selections); ② drag start on an element no longer re-emits `select`, so Ctrl/⌘ click-to-add works — multi-select is now available on both the canvas and the layer panel; ③ the layer panel gained its own bottom row with group / ungroup buttons and supports Ctrl/⌘ add-select; ④ the (previously non-functional) "编组/取消编组" items were removed from the canvas context menu — grouping entries are now exactly: toolbar button, layer-panel bottom buttons, `Ctrl+G` / `Ctrl+Shift+G`; ⑤ the in-app help documents the marquee rules (drag from empty space: top-left → bottom-right = intersect hit, bottom-right → top-left = full-enclose hit), the whole-group-on-one-page rule and the over-height clipping warning; all user-facing wording standardized to "组合 / 取消组合".

### Fixed

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: **the print gap below a table was stretched for following elements**. The table design bottom (`tableDesignBottom`) used to be the sum of `tableRows` heights only (min-height semantics), ignoring the measured `options.height` written back by the designer — when row content grew the table taller, followers got an extra phantom gap of "measured height − row-height sum" (up to 3.77 mm on a real template). It is now `top + max(options.height, Σ row heights)`: anchored at the visual bottom seen on the canvas, with the row-height sum kept as a physical lower bound so dirty data cannot push followers back onto the table. **Behavior change**: existing templates whose tables grow taller than their row-height sum get the follower spacing pulled back to what the designer shows; templates saved in the designer are pure fixes. Identical across browser preview, server-side PDF and the desktop client.
- `@worm-vue3-print/core`: **blocks all anchored at 0 after a page break, so last-page groups overlapped the table**. The table continuation slice, groups and plain elements each used to start at the top of the new page instead of flowing after one another. Placement now follows a streaming cursor (`pageCursorTop`), and the table slice start is captured before row-group budgeting, so followers re-flow correctly after a continuation; regression tests for the extreme pagination cases (indivisible groups, stacked blocks) were added.
- demo: removed a wrong global import of `@worm-vue3-print/canvas/native-controls.css` (the file no longer exists).

### Maintenance

- `@worm-vue3-print/canvas`: fixed intermittent `localStorage is not defined` in tests via a global vitest setup fallback.
- Repo scripts: removed the leftover reference to the deleted `@worm-vue3-print/client` workspace from the root `package.json`.
- Docs: recorded the build convention that the Electron client consumes core's **dist subpath** (`@worm-vue3-print/core/client`) — core's dist must be rebuilt whenever a subpath entry is added or changed.

## [1.3.1] - 2026-09-21

### Added

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: **numeric arithmetic and rounding in expressions**.
  ① Arithmetic functions `ADD(a,b,…)`, `SUB(a,b,…)`, `MUL(a,b,…)`, `DIV(a,b)` sharing one numeric semantics with the `+ - * / %` operators.
  ② Rounding functions: `ROUND(n,d)` half-up, `ROUNDUP` / `CEIL` away from zero, `ROUNDDOWN` / `FLOOR` toward zero, `ROUNDBANK` half-to-even (GB/T 8170). `d` defaults to 2; a negative `d` rounds to tens/hundreds (`-2` → hundreds). Rounding is decided on the exact decimal string, so the `toFixed` float traps do not apply; `ROUND` and `ROUNDBANK` differ only on an exact half (round up vs. round to even).
  ③ Operators gained proper numeric semantics: numeric strings are treated as numbers, binary float noise is removed, division by zero and blanks fall back to `0`. See Changed below.
  ④ The expression editor gained a **Numeric** function group (double-click to insert); the in-app help function table was updated.
- `@worm-vue3-print/core`: new `numeric.ts` shared by functions and operators; the main entry now exports `addNumbers` / `subtractNumbers` / `multiplyNumbers` / `divideNumbers` / `round` / `roundUp` / `roundDown` / `roundHalfEven` for host-side reuse.
- demo: new **comprehensive showcase sample template** (A4 landscape, multi-level table header, images / barcodes / QR codes rendered inside table cells), registered in the sample library and in the `print-template-json` skill assets; the toolbar button "load default layout" became "load sample" and the showcase template loads automatically on mount.
- demo: new **custom fields & data dialog** — add or remove print-data fields and edit the data of several copies right on the page; batch printing follows the same data.
- demo: **static hosting for the online preview** — added `edgeone.json` (EdgeOne Pages) and `.github/workflows/pages.yml` (GitHub Pages; builds and deploys on every push to master, see README for the URL). Font base URL and sample image paths now use `import.meta.env.BASE_URL` / the current site origin instead of a hardcoded `localhost`, so sub-path deployments work.

### Changed

- **The silent-print browser SDK was merged into core and is no longer published separately**: the former standalone package `@worm-vue3-print/client` (`0.1.0`, never published to npm) is now a subpath export `@worm-vue3-print/core/client`; change `import { PrintClient } from '@worm-vue3-print/client'` to `from '@worm-vue3-print/core/client'`. The SDK has zero runtime dependencies (browser WebSocket only), so core gains no new dependency; all exports and capabilities (`PrintClient`, `WsTransport`, `WormPrintError`, `MESSAGE_TYPES`, etc.) remain unchanged. The `packages/print-client-sdk` directory was removed; the Electron desktop client now imports it from core.
- `@worm-vue3-print/core`: **behavior change** arithmetic operators (binary and unary `+` / `-`) now use numeric semantics; existing templates may render differently in these cases (all moving toward what users expect):
  ① both sides numeric (or numeric strings) are added numerically — `'3' + 4` was `'34'`, now `7`;
  ② binary float noise is removed — `0.1 + 0.2` was `0.30000000000000004`, now `0.3`; `12.5 * 3 * 1.13` was `42.37499999999999`, now `42.375`;
  ③ division by zero (or an unparsable divisor) returns `0` instead of `Infinity` / `NaN`; `null` / empty string count as `0` in arithmetic and as `''` when concatenating (previously `null` was printed);
  ④ `+` still concatenates when either side is not numeric (`name + ' Ltd.'` unchanged).
- demo: the print preview dialog is now **full-screen** (content fills the viewport); click-outside-to-close was removed and Esc now closes it.

### Fixed

- `ROUND(n, d)` was implemented with `Number.toFixed`, producing wrong results on float boundaries: `ROUND(1.005, 2)` returned `1` (should be `1.01`) and `ROUND(2.675, 2)` returned `2.67` (should be `2.68`). Rounding is now exact in decimal.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: system variables could not be used **inside** an expression — `{pageIndex + 1}`, `{ADD(pageIndex,1)}` and `{DATE(printDate,'YYYY')}` failed to evaluate and were printed verbatim (the template fallback for failed evaluation); only a bare `{pageIndex}` worked, via a text substitution applied after rendering. Cause: the binding-time expression context contained business data only, and page numbers are unknown until pagination. Now: ① `printDate` / `printTime` are merged into the binding context (business data of the same name wins); ② expressions referencing `pageIndex` / `totalPages` keep their source text at binding time (measurement pass measures the raw text) and are re-evaluated per page during final rendering — consistently for elements, header/footer, first-page overlay and table cells, and identically across browser preview, server-side PDF and the desktop client. **Output for existing templates is unchanged**: templates without any raw formatter take a fast path with no re-evaluation.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: **multi-level table headers lost every level below the first on continuation pages**. The rows of a multi-level header form a single structure through `rowspan` / `colspan`, but "repeat on every page" was decided per row: with only the first header row checked, continuation pages repeated just that row and dropped all levels below it, and the row-spanning master cell could overrun and swallow the position of the data rows. Now: ① if any row in the header zone (the consecutive header rows starting at row 0) is checked, the **whole header zone** repeats; ② the repeat count is aligned to the nearest `rowspan`-closed boundary, and a master cell overrunning the header zone is clamped during continuation rendering so it can no longer swallow data rows; ③ inserting a header row or changing a row type to header inherits the neighbouring header row's setting, so a missed checkbox cannot break the structure; ④ the property-panel switch is renamed "表头每页重复" and applies to the whole header zone. Single-row headers behave exactly as before, and existing single-row-header templates render byte-identically.

## [1.3.0] - 2026-09-20

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: added **multi-page templates** — one document composed of pages with
  **different layouts** in a fixed order, all bound to **the same data record** (cover page, then body, then terms).
  A template used to describe a single page layout only: several pages came either from content-overflow slicing or from
  concatenating copies of the same template, never from combining distinct layouts inside one document.
  ① Model: new wrapper `MultiPageTemplateData` (`{ version?: 1, pages: TemplateData[] }`); `RenderRequest.templateJson`
  and `PrintJob.templateJson` now accept `TemplateData | MultiPageTemplateData`; `TemplateData` gained an optional
  `name` (page name — shown on the tab and used in error messages, ignored by the renderer).
  ② New `print/multi-template.ts`, exported from the main entry: `normalizeTemplate` (normalize + validate),
  `isMultiPageTemplate`, `mergeFontDeclarations` (font declarations of all pages merged and deduped by family),
  `composeMultiPageDocument`.
  ③ Rendering: each page template runs its own full **bind → measure → paginate** round over the same data; "the next
  template starts on a new page" follows from every template emitting whole `.print-page` elements, so no extra
  break rule is needed; `{pageIndex}` / `{totalPages}` are **global within the copy** (accumulated `pageOffset`);
  `firstPageOverlay` now applies to **each template's own first page** (identical behavior for single templates);
  `pageCount` is the sum of all pages and the entire document renders **in one pass**. CSS was split accordingly into
  `buildBasePageCss()` plus per-page `buildPageGeometryCss(template, '.mt-N')`, and the **single-template output stays
  identical**, pinned by a guard test.
  ④ `normalizeTemplate` throws three validations shared by the designer (save/preview) and the render service: at least
  one page; identical paper size including orientation; **no continuous paper and no label tiling** (both conflict with
  "always start on a new page"). Errors carry the page name, e.g. `多页面模板不支持标签拼版（第 2 页「条款」）`.
- `@worm-vue3-print/canvas`: multi-page design. New **page bar** (`PageTabs`) supporting add, duplicate, delete, move
  left/right, **double-click rename** and click-to-switch, each action button carrying a contextual hover hint; deleting
  down to one page silently falls back to single-template mode. Paper settings (size / orientation / custom width and
  height) bind to the active page but are **written to every page on change** (multi-page requires one paper size, and
  only one paper control is exposed), while margins, header/footer, first-page overlay, watermark and content elements
  remain per page. In multi-page mode the tiling config is hidden and continuous paper is disabled — a second line of
  defense behind the renderer's own check. `getTemplateJson()` returns a bare `TemplateData` for one page and the
  wrapper for two or more; `initialTemplate` accepts either shape; save and preview run the same `normalizeTemplate`
  validation and surface the error in the UI.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: added **page rotation** (`TemplateData.outputRotation`, one of
  `0 / 90 / 180 / 270`, property panel "内容旋转角度", default `0`) for "design landscape, print portrait": at 90/270 the
  output paper swaps width and height (`PreparedDocument.paperMm` follows it) and the page content is rotated wholesale to fill it
  — **no scaling, no cropping**; 0/180 keep the paper as-is. The final render wraps each page in an angle-specific rotor
  class (the measurement pass does not), with identical behavior in browser preview, render service and desktop client.
- `@worm-vue3-print/core`: the pipeline now supports **batch printing** — pass `printData` as an array of objects and the
  copies are composed into one document (hosts used to concatenate HTML themselves). All copies share one pipeline setup
  and are force-separated (`.print-copy` plus copy-break CSS; continuous paper uses named pages with a per-copy height).
  `PreparedDocument` gained `copies` and per-copy `copyPaperMm`. New helpers: `composeBatchHtml` (`BatchCopyInput`),
  `normalizePrintData` and `MAX_BATCH_COPIES` (**500 copies maximum**; an empty array or non-object items throw with a
  1-based item index). The render service PDF endpoint and the desktop client `print` protocol accept arrays
  under the same limit (the screenshot endpoint accepts them as well but keeps its existing behavior of rendering
  only the first item), and browser preview reports how many copies were rendered.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: added the **design background** (`TemplateData.designBackground`:
  `src` plus `rotation` in 90° steps) for tracing preprinted forms. It is visible **on the design canvas only** and is
  ignored by preview, server PDF and silent print. Hosts supply the uploader via `uploadDesignBackground` (it must return
  a fully resolvable image URL and is never prefixed with `baseUrl`) or via the `UPLOAD_DESIGN_BACKGROUND_KEY`
  injection key.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: switching the paper size to a **label paper** (80×60 / 60×40 / 40×30mm)
  now applies a "the whole sheet is the content area" layout by default — all four margins go to zero and the header/footer
  heights go to zero (elements already placed in the header/footer are kept; raising the height restores them). The default is
  applied **once, at the moment of switching**; users can still change margins and zone heights afterwards, and existing label
  templates are never rewritten on load. core exposes `isLabelPaperSize` / `labelPaperDefaults` so hosts and custom designers
  can reuse the same rule.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: **behavior change** barcodes (both **elements** and **table cells**)
  no longer stretch to fill their box. All ends now settle the size through one shared algorithm
  (`resolveBarcodeSize` in `render/barcode-dot.ts`): ① **preferred size comes from the bar width** — one module is
  `barWidth/2 × 0.25mm`; when the box is wide enough the barcode prints at that size instead of being scaled up
  (scaling up is exactly what produced non-integer module widths, i.e. the "bars alternate between 2 and 3 dots"
  artifact); ② **when a printer resolution is set, dpi wins** — the preferred size snaps to an integer number of
  printer dots per module (dpi takes priority over the exact millimetre value, e.g. 0.25mm becomes 3 dots ≈ 0.254mm
  at 300dpi); ③ **when the box is too narrow the barcode shrinks proportionally** — in integer-dot steps while the dot
  grid holds, and only falls back to continuous scaling when even one dot per module does not fit (then dot alignment
  is impossible, but the barcode still never overflows the box). Width and height always scale together, so the
  barcode is never distorted. Designer canvas, browser output and the render service share the same constants and
  algorithm for elements and cells alike; barcode output is now **always inlined as `<svg>`** (Chromium rounds the
  intrinsic size of an `<img>`-hosted SVG to whole CSS pixels, which rewrote the settled millimetre size), and
  `maxWidth` / `maxHeight` are folded into the available box. Because stretching breaks integer module widths, the
  "缩放模式" (fit) option is **removed for barcodes** — use the bar width to change size and "最大宽高" to cap it.
  **Existing templates will print smaller barcodes** (about half the element box with the default `barWidth: 2`);
  that is intentional — raise the bar width to grow them and get stable bar widths on paper.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: text elements and table cells now support **three text-overflow
  display modes** (property panel "文字溢出", template field `textFit`): `clip` (truncate; single-line ellipsis when
  `wordWrap: false`), `shrink` (auto-shrink down to `shrinkMinFontSize`, default 6pt, falling back to truncation if it
  still overflows) and `autoHeight` (element height / row height grows with the content). **Defaults keep existing
  behavior, so current templates are unaffected** (`text` defaults to truncate, `longText` and cells default to auto
  height). Auto-shrink is solved by binary search in the measurement pass and written back via `applyTextFit`
  (session primitive `measure` now returns `{ measurements, fits }` instead of `RawMeasurement[]`), so all three
  runtimes render the same font size; the designer canvas reuses the same algorithm and available-height math
  (`fitTextNode`). The DOM executor artifact version is bumped to `2` (new `applyTextFit`).
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
- `@worm-vue3-print/core`: the pagination engine now keeps **stacked overlaps and explicit element
  groups on the same page**. Previously every non-table content element was charged its full measured
  height independently, so vertically overlapping elements were counted twice (triggering an
  unnecessary page break) and an element that did not fit was pushed to the next page on its own,
  silently splitting a stack that was designed to overlap. Now: (1) elements whose vertical ranges
  intersect are clustered (union-find) into a stack unit, charged only once by their union height and
  moved to the next page as a whole (edge-touching does not cluster; sequential flow is unchanged);
  (2) explicit group members sharing `options.groupId` are bound to one page, excluded from table
  follow-area ownership, and locked to the first page when any member is `pageable:false`; (3) after a
  break the whole unit is shifted to the content-area top while keeping the designed inner offsets;
  (4) content stacking order is sorted by `top → zIndex → template array index` (previously `top`
  only), so the no-zIndex fallback matches the designer DOM order deterministically.
- `@worm-vue3-print/canvas`: clicking any member of a group now selects the whole group (previously
  only the single member); group drag, Ctrl+G / Ctrl+Shift+G, the context menu and the layer panel
  stay consistent. Ctrl/⌘ multi-select still toggles individual elements.
- **Breaking change: removed font querying (server and desktop client)** — the two ends' system font
  lists are no longer fetched. Removed `PrintDesigner`'s `serverFonts` / `clientFonts` / `loadFonts`
  props, the "Query fonts" button and the offline/missing-font hints; removed the render service's
  `GET /fonts` and `X-Font-Warnings` header, the client SDK's `fonts.list` protocol message and
  `PrintClient.listFonts()`, the desktop client's pre-print missing-font `warn` log, and core's
  `readSystemFonts` / `mergeFontSources` / `findMissingFonts` helpers. Font availability is now
  decided solely by the template's `fonts` declarations and their `@font-face` rules.

### Added

- `@worm-vue3-print/core`: Added **barcode print-dot alignment** (new module `render/barcode-dot.ts`) — the barcode's final size is snapped to the printer's dot grid, fixing "bars come out alternately wide/narrow with gray edges" on thermal printers. Root cause (measured): with a 56.4×14.1 mm element box and an 8-digit CODE128, one module is 0.318 mm, i.e. **2.55 dots at 203 dpi (8 dots/mm)**. The barcode is pure vector and geometrically exact in the PDF, but the printer/RIP can only image whole dots, so a fractional module width is rounded to 2 or 3 dots per bar. Dedicated label tools look crisp because they define the narrow bar as a whole number of dots (e.g. 3 dots = 0.375 mm). Barcode elements accept `printerDpi` (`options.printerDpi`, typically 203/300/600), and **barcode table cells accept it too** (`TableCell.printerDpi`; the box is the cell's content area — spanned column widths / row heights minus padding and collapsed borders, derived with the new `cellFitWidthMm` plus the existing `cellFitCapMm`; when a table has no `tableColWidths` the width is unknown and alignment is skipped). Both surfaces expose a "Printer DPI" dropdown and hide scaling mode / max width / height while dot alignment is on (stacking them would rescale the aligned size back into fractional dots); switching a cell away from barcode clears the field. Two other clarity culprits were fixed as well: ① barcodes now set `shape-rendering="crispEdges"` (QR codes always did; measured gray-edge pixels drop from 11.3% to 1.7% of the ink); ② **left/right quiet zones are restored** (jsbarcode's default 10 modules was overridden with `margin:0`, which made EAN13/UPC/ITF14 unscannable) — and only left/right, so vertical whitespace no longer eats the element height. The designer canvas `BarcodeElement` and the render end share the same constants and algorithm (all jsbarcode parameters are expressed in modules), fixing the previous split where design-time and printed output were different graphics and `fontSize` was mistaken for pt. **With no `printerDpi`, geometry and behaviour are unchanged** (only the quiet zone and anti-aliasing change).
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`: Barcode/QR **elements** gained the same configuration surface table cells already had — a new "Barcode settings" group in the property panel (the component previously existed but was never mounted, so symbology/bar width/text/font size/error-correction level had no UI at all): symbology (CODE128 / EAN13 / EAN8 / UPC / CODE39 / ITF14, legacy lowercase values normalized, clearing the field when the default is picked), bar width (2–4 multiplier, hidden when a printer DPI is set), show text (`hideTitle`), text size (relative to bar height); error-correction level for QR codes. The "custom settings" section matches cells: scaling mode (`fit`) and max width/height (mm; `ElementOptions` gained `maxWidth`/`maxHeight`). The new fields are threaded through `codeImgHtml` into the output `<img>`'s `object-fit`/`max-width`/`max-height`, and the canvas mirrors them (inline `<svg>` maps `fit` to `preserveAspectRatio`; `fit='none'` degrades to `meet`). **Output is byte-identical for templates that never set the new fields.** Also fixed: cell barcodes never showed the value text at design time — `showText` is a boolean prop, so an absent value is cast to `false` by Vue, while the render end treats an absent `showBarcodeText` as "show". `TableElement` now passes `cell.showBarcodeText !== false` explicitly, and the canvas-side jsbarcode parameters (30-module bar height, 10-module font size, 10-module left/right quiet zones, anti-aliasing off) are shared with the render end.
- Print client: New "keep generated PDFs" troubleshooting switch (config window checkbox; `keepGeneratedPdf` / `pdfOutputDir` in `config.json`, defaulting to `userData/pdf`). Each printed job's generated PDF is kept, the job history shows its absolute path, and the settings page offers an "open folder" button — useful for telling whether a color/orientation problem comes from PDF generation or from the printer/driver.
- `@worm-vue3-print/client`: Added a browser-prerendered submission channel — protocol message `print.submitHtml` and the SDK method `PrintClient.printHtml(rendered, options, templateName)`. Host pages run the two-pass `renderHtmlPages` from `@worm-vue3-print/core/browser` in the browser and submit the final HTML (paper size/orientation/margins/continuous height baked in) directly for silent printing; the client no longer executes template rendering on this path. The legacy `print` (client-side rendering) channel remains supported.
- Print client: Inbound validation for `print.submitHtml` (non-empty HTML, ≤20MB, positive `paperMm` in millimeters, typed `continuous`/`pageCount`); paper/orientation/margin overrides are rejected with `INVALID_REQUEST`. The print engine was refactored into a shared "prepare (render or take prerendered HTML) → print" flow.
- demo: "Client silent print" now renders in the browser and submits via `printHtml` (new wrapper `src/browser-render.ts`).

- `@worm-vue3-print/core`: Added an isomorphic watermark module (`render/watermark.ts`) — `generateHtml` now emits a `.watermark-layer` at the bottom of every page (explicit vector tiles, one `<svg class="watermark-tile">` per tile), keeping the watermark identical across the designer canvas, browser preview, server-side PDF, and silent print client.
- `@worm-vue3-print/core`: `WatermarkOptions` gained `tileWidth`/`tileHeight` (tile size controlling watermark density, default 260×180). New exports: `WATERMARK_DEFAULTS`, `WATERMARK_DENSITY_PRESETS`, `PX_PER_MM`, `MM_PER_PX`, `isWatermarkVisible`, `resolveWatermarkText`, `formatTimestamp`, `resolveWatermarkLayout`, `renderWatermarkTileSvg`, `renderWatermarkLayerHtml`.
- `@worm-vue3-print/core`: Watermark expressions now support the system variables `{printDate}` (YYYY-MM-DD), `{printTime}` (HH:mm:ss), `{pageIndex}`, and `{totalPages}`, matching the expression editor's "variables" tab. `injectSystemVariables` also substitutes `{printTime}`, and `resolveSystemVariables` is exported so the designer preview and the renderer share one source of values.
- `@worm-vue3-print/canvas`: The watermark panel now uses a single "watermark expression" input — plain text is a static watermark (`mode=fixed`), while `{field}`, function calls (`CONCAT(...)`) or field paths (`order.no`) are evaluated as expressions (`mode=binding`), so no manual mode switch is needed. Expressions are edited through the expression dialog (button or double-click on the input), where fields and print date/time variables can be picked directly. The preset field dropdown and the timestamp switch were removed (use `{printDate}`/`{printTime}` in the expression instead); the test value row only shows in expression mode; density (dense/medium/loose/custom tile size) and the other settings remain.
- `@worm-vue3-print/canvas`: `WatermarkConfig` and `CanvasPaper` reuse the core watermark module, so design, preview, and print render identically.
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: Added **label tiling** (template `tiling` config) — small label templates no longer need "one sheet per label". When enabled, copies are laid out in a column × row grid onto a target sheet (default A4 portrait, 10mm sheet margins, 2mm gutters, manual column count, rows derived from the sheet), and a single copy goes through the same path (one cell = one sheet). Core gained `print/tiling.ts` (`computeTileLayout`: sheet/column/label-height validation and row-column derivation; continuous paper cannot be tiled) and `print/tile-compose.ts` (grid HTML composition). With tiling on, `renderPdf` reports `pageCount` as the **actual number of sheets** (the preview's page count and the desktop client's job history share that meaning) and `paperMm` as the target sheet size. The designer gained a tiling panel (toggle, target sheet and orientation, custom size, sheet margins, gutters, columns) showing the live grid and capacity; if any label's content bottom exceeds its content area, tiling fails loudly instead of clipping silently. `@worm-vue3-print/render` gained an end-to-end tiling integration test (real Chromium, asserting sheet count and cell coordinates).
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`: Added new paper presets — **dot-matrix paper** (`DOT_FULL` 241×279.4mm, `DOT_HALF` 241×139.7mm, `DOT_THIRD` 241×93.1mm), **label paper** (`LABEL_80X60` / `LABEL_60X40` / `LABEL_40X30`), and **thermal receipt paper** (`THERMAL_57` / `THERMAL_80` / `THERMAL_110`, continuous: width comes from the preset and can be overridden with `customWidth` (e.g. 58mm rolls), height is still derived from content, orientation forced to portrait). `PaperSize`, `PAPER_DIMENSIONS` and `PAPER_PRESETS` were extended accordingly, and `isContinuousPaperSize(paperSize)` reports continuous paper (receipt sizes and `CONTINUOUS`); the tiling target-sheet dropdown still excludes continuous paper. The designer's "paper size" dropdown is now grouped (common / dot-matrix / label / receipt / continuous) with Chinese names and dimensions.
- `@worm-vue3-print/canvas`: Multi-page design APIs — `useDesignerState` and the `PrintDesigner` instance expose `pages` / `activePageIndex` / `switchPage` / `addPage` / `duplicatePage` / `deletePage` / `renamePage` / `movePage`; undo history and selection handling were lifted from one page to per-page convergence (page operations clear the active selection).
- demo: Added a **sample template gallery** (`src/samples/`) with seven static-data samples (purchase receipt, scale label, price tag, shipping label, retail receipt, asset label, sales delivery note). "Load sample" is now a grouped picker dialog with cards drawn from element coordinates; selecting one loads its template, field tree and print data, taking batch data from the sample when present and deriving it safely otherwise.
- Added the in-repo skill `skills/print-template-json` for **authoring print templates from shorthand JSON**: SKILL.md defines the workflow, `scripts/build_template.py` expands shorthand (box / size / align / code / cols / rows …) into a full `TemplateData` (backfilling the skeleton, element ids, `printElementType` and merged-cell placeholders), and `scripts/validate_template.py` checks the result against the pipeline's hard rules before printing (out-of-bounds, the 2mm safety margin, column/row sums, cells per row, tiling column cap, no tiling on continuous paper, balanced braces and a function whitelist). `assets/templates/` ships seven ready-made templates with their data.

### Changed

- Merged the rendering microservice `worm-vue3-print-render` into this monorepo as the private service package `services/print-render` (package name `@worm-vue3-print/render` unchanged, not published to npm). It now depends on `@worm-vue3-print/core` via a local npm workspace symlink instead of the npm registry.
- Added a `services/*` workspace layer; `npm run build` now also builds render, while the root `npm test` still covers core/canvas only. Browser-based render integration tests run in a dedicated CI job.
- Added a root `.npmrc` so Playwright browsers are not downloaded during dependency installation; install Chromium on demand via `npx playwright install chromium` locally/in CI (the Docker image uses the Chromium bundled in the base image). The Docker build context is now the repository root (`docker build -f services/print-render/Dockerfile .`).
- demo (`demo/`): Added server-side PDF printing. The top bar shows render-service health, and the "Server PDF" button calls the render microservice through the Vite dev proxy (`/render-api/*`, with `X-Render-Key` injected at the proxy layer), sending the current canvas JSON plus demo data for two-pass server rendering and opening the PDF in a new tab.
- `@worm-vue3-print/canvas`: **breaking change** removed the built-in "Load default layout" toolbar button and the `load-default-template` prop — loading/resetting a template is host business. The host renders its own entry point and assigns a new `TemplateData` to `initial-template` to reload the canvas (the designer watches the reference and records one history entry, so undo works). Hosts that still pass `load-default-template` will have it ignored and must migrate to the above.
- demo: Multi-page support — import/load/save all handle `MultiPageTemplateData` (what you save is what you get back), and preview plus batch data render the whole multi-page document per copy.
- `@worm-vue3-print/render`: The request type was widened to the union and the multi-page logic stays in core; added an end-to-end integration test (real Chromium asserting PDF page count, identical paper size per page and the page boundary that proves "the next template starts on a new page").

### Fixed

- Print client: Fixed the silent-print failure chain "PDF generation timeout → every later job returns BUSY". `webContents.printToPDF` no longer accepts a callback (the callback never fires and the returned promise rejection is swallowed), and `PrintToPDFOptions.pageSize` is in **inches**, not microns (passing microns produced a 210000×297000 inch page, which Electron 44 refuses to generate). The client now uses the promise form with a timeout guard (`src/main/pdf-generator.ts`), converts microns to inches, sets explicit zero margins and `printBackground: true`, and reports generation failures/timeouts as `PRINT_FAILED` while always releasing the serial gate. Printed output now matches the server-side PDF in paper size and watermark rendering.
- Print client: Documentation now describes the "HTML → printToPDF → system print command" pipeline (`clients/print-client/README.md`, Chinese silent-print guide, silent-print skill reference).
- `@worm-vue3-print/core`: Fixed watermarks being magnified ~3x, offset, and tiled incorrectly when printing to paper. The watermark used to be a CSS tile-repeated background (`background-image` + `background-repeat`), which Chromium compiles into a PDF tiling pattern; PDF viewers render it correctly, but the print path RIP ignores the pattern matrix (the enclosing form had a CTM of 3.125 = 300dpi÷96px, matching the measured magnification). Watermarks are now explicit vector tiles: `resolveWatermarkLayout` computes the tile grid for the final paper size (including the probed continuous-paper height) and emits one inline `<svg>` per tile, restoring the designed geometry on paper (68.8mm × 47.6mm at default A4 density). `buildWatermarkSvgDataUrl` was removed to prevent regressions back to the tile-repeated background approach.
- Print client: Fixed the printed page orientation not matching the browser/server preview (landscape pages came out portrait). The print command did not declare a paper size, so CUPS used the queue default sheet (usually portrait A4) and `pdftopdf` rotated landscape pages by 90° (the resulting PDF carried `/Rotate 90`). The client now sends an explicit `-o media=…` (host-provided driver paper form → matched standard size → `Custom.<width>x<height>` in points). Verified: the same landscape A4 page went from `/Rotate 90` back to `/Rotate 0`, and portrait pages are unaffected.
- `@worm-vue3-print/core`: Fixed a **blank first page** on small-paper templates (e.g. an 80×60mm custom sheet with 10mm margins and 38mm of content). Two root causes: ① `finishPage()` pushed the current page unconditionally, so when the very first element/unit did not fit it emitted an empty sheet and pushed all content to the next page. Empty pages are no longer emitted — the content stays on the page at its designed coordinates. `PageLayout.overflow` now records "content bottom exceeds the content area and would be clipped by the sheet", judged against the physical content height rather than the pagination budget's 2mm safety margin (content sitting close to the paper edge is still valid layout), so the tiling check ("each label must be exactly 1 page") keeps blocking only genuinely over-tall content. ② The DOM executor measured element height with `offsetHeight` (integer px, rounded up): 38mm was read as 144px = 38.1mm, which crossed the 38mm budget (40mm content area minus the 2mm safety margin) and made fitting content look oversized. It now reads `getBoundingClientRect().height` for true sub-pixel height (table row heights included).
- `@worm-vue3-print/canvas`: Fixed drifting page names and duplicate names on new pages in multi-page templates. The first page (created by the default template or loaded by the host) stored no `name`, so tabs fell back to "页面 N" computed from the index; moving a page shifted the fallback and clashed with the names already persisted. Unnamed pages now get a fixed default name at load, and `addPage` picks the first unused one (so adding after deleting can no longer collide).
- `@worm-vue3-print/core`: Fixed missing **page breaks between copies** in multi-page batch printing. Each copy was wrapped in `.print-copy`, but the composed CSS omitted the copy-break rule, so the last `.print-page` of a copy matched `:last-child` (`break-after: auto`) and two copies ran together. `COPY_BREAK_CSS` is now exported and appended when batching, and a render integration test asserts "2 copies × 3 pages = 6 pages".
- `@worm-vue3-print/core`: The browser adapter `renderHtmlPages` (`@worm-vue3-print/core/browser`) now accepts `TemplateData | MultiPageTemplateData` (and an array `printData`), so multi-page templates can be rendered in the browser directly.

### Known limitations

- Page rotation in multi-page documents takes the **first page's** `outputRotation`. Paper dimensions are already forced equal, but the angle is not part of that consistency check yet; per-page rotation is left as a future extension.
- Multi-page templates do not support continuous paper or label tiling, nor data-driven conditional pages (for example appending a terms page only when an amount exceeds a threshold).

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
