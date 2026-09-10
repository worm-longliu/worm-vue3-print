# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-09-10

### Added

- `@worm-vue3-print/canvas`: Help modal (HelpModal) with feature guide, keyboard shortcuts, and FAQ.
- `@worm-vue3-print/canvas`: Enhanced ruler guides — drag to add guides, double-click to edit, delete, with real-time snap alignment display.

### Changed

- `@worm-vue3-print/canvas`: Optimized zoom logic — removed zoom-in limit, scroll-wheel multiplicative step zooming, fixed zoom anchor drift.
- `@worm-vue3-print/canvas`: Removed the fx binding badge tooltip at the top-left corner of elements in design mode.

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

## [1.0.0] - 2026-09-02

### Added

- First open source release.
- `@worm-vue3-print/core`: template expression engine and isomorphic rendering pipeline (HTML generation / pagination / data binding).
- `@worm-vue3-print/canvas`: Vue 3 visual print template designer canvas.
- Rendering microservice split into a separate repository `worm-vue3-print-render` (Docker deployment only, not published to npm).
