# worm-vue3-print — English Overview

Vue 3 visual print-template designer + template expression engine + isomorphic rendering pipeline.

> **AI-generated notice** · This page and `CHANGELOG.en.md` are the English documentation set, produced with AI assistance from the Chinese sources under [`docs/中文/`](../中文/文档总览.md). The Chinese documentation is the **authoritative** version; when the two disagree, follow Chinese. Guidance translated by AI may lag behind code changes — verify API details against [`docs/中文/接口/API文档.md`](../中文/接口/API文档.md) before relying on them.

## Contents

- [What it does](#what-it-does)
- [Packages](#packages)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Three output paths](#three-output-paths)
- [Documentation map](#documentation-map)
- [License](#license)

## What it does

Design a print template once — paper size, margins, text, tables, barcodes, QR codes, images, lines, shapes, page numbers, watermarks — then produce identical output from a browser, a server-side PDF service, and a desktop silent-print client.

Two properties define the architecture:

- **Framework-neutral core.** `@worm-vue3-print/core` is pure TypeScript with no Vue/React dependency. It owns the expression engine (`lexer` → `parser` → `evaluator`), data binding, pagination, and HTML generation, and runs in both browser and Node.
- **One pipeline, three renderers.** All output paths share the same generated print CSS and the same layout code, so what you see in the designer is what the paper gets. The core package publishes subpaths (`/designer`, `/browser`, `/client`, `/node`) instead of forcing a single bundle.

Layout is authored in millimetres with `pt` for line and font units, against fixed paper sizes (A4, labels, receipts) or continuous paper.

## Packages

| Package | Directory | Published | Purpose |
|---|---|---|---|
| `@worm-vue3-print/core` | `packages/print-core` | npm | Expression engine + isomorphic rendering pipeline; browser silent-print SDK at `/client` |
| `@worm-vue3-print/canvas` | `packages/print-canvas` | npm | Vue 3 visual designer (`PrintDesigner`) and preview component (`PrintHtmlPreview`), native controls, no UI kit |
| `@worm-vue3-print/render` | `services/print-render` | Docker | Server-side PDF / screenshot renderer built on Playwright (Headless Chromium) |
| `@worm-vue3-print/print-client` | `clients/print-client` | installer | Cross-platform Electron silent-print client (loopback WebSocket + `webContents.print`) |

Only `core` and `canvas` are published to npm.

## Installation

```bash
npm install @worm-vue3-print/core      # engine + rendering pipeline
npm install @worm-vue3-print/canvas    # Vue 3 designer
```

The browser-side silent-print SDK ships inside `core`; import it from `@worm-vue3-print/core/client`. It requires the desktop client to be running on the same machine.

Current version: `1.3.4`.

## Quick start

### Render a template programmatically

```ts
import { bindData, paginate, generateHtml } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData)   // resolve {field.path} bindings
const pages = paginate(bound, measured, options)  // paginate and lay out
const html = generateHtml(pages)                  // print-ready HTML
```

### Mount the designer

```ts
import { PrintDesigner, PrintHtmlPreview, createDefaultTemplate } from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
// Designer control styles ship as one stylesheet; import it once, globally.
import '@worm-vue3-print/canvas/style.css'
```

```vue
<template>
  <PrintDesigner
    ref="designerRef"
    :initial-template="templateData"
    :fields="fields"
    :is-edit="true"
    @preview="onPreview"
    @save="onSave"
  />

  <!-- Save-free preview straight from the live canvas JSON -->
  <Teleport to="body">
    <PrintHtmlPreview
      v-if="previewVisible"
      :template-json="previewTemplateJson"
      :print-data="printData"
      @rendered="(n) => (previewPages = n)"
    />
  </Teleport>
</template>
```

Key contract:

- `initial-template` (`TemplateData`), `fields` (`PrintBusinessField[]`), `is-edit`.
- `getTemplateJson()` via `ref` — read the current canvas for preview, save, or screenshot.
- `@save` hands the host a template JSON string; persistence is the host's job.
- Loading or resetting a template is host business: assign a new `TemplateData` to `initial-template`. The designer toolbar does not embed such entry points.
- `PrintHtmlPreview` renders without saving; `ref.print()` triggers the browser print flow.

The canonical integration is [`demo/src/App.vue`](../../demo/src/App.vue) — the snippets above match it.

## Three output paths

| Path | Mechanism | When to use |
|---|---|---|
| Browser print | `PrintHtmlPreview` → host Chromium print dialog | Zero deployment, user confirms the dialog |
| Server PDF | `services/print-render` HTTP API → Playwright Chromium → vector PDF/PNG | Batch jobs, archiving, email attachments, no client-side dependency |
| Desktop silent print | `core/client` WebSocket → `print-client` → `webContents.print({ silent: true })` | Warehouse / storefront stations: no dialog, no browser extension, paper-length auto-derivation for continuous paper |

All three consume the same rendering pipeline from `core`, which is why a template designed once prints consistently everywhere. Repository guard `npm run lint:print-architecture` fails the build if measurement, paper-height, output, or barcode logic ever gets duplicated across those three ends.

## Documentation map

Full documentation is currently Chinese-first:

| Topic | Chinese |
|---|---|
| Overview / index | [文档总览](../中文/文档总览.md) |
| Quick start | [快速开始](../中文/指南/快速开始.md) |
| Core concepts and output selection | [使用指南](../中文/指南/使用指南.md) |
| Designer integration | [模板设计器](../中文/指南/模板设计器.md) |
| Expression engine | [表达式引擎](../中文/指南/表达式引擎.md) |
| Rendering pipeline | [渲染管线](../中文/指南/渲染管线.md) |
| Cross-end rendering consistency | [三端渲染一致性方案](../中文/指南/三端渲染一致性方案.md) |
| Silent printing | [静默打印](../中文/指南/静默打印.md) |
| API reference | [API 文档](../中文/接口/API文档.md) |
| Examples | [示例文档](../中文/示例/示例文档.md) |
| Retrospective (known deviations, client stack) | [技术复盘](../技术复盘.md) |

English: this page plus [CHANGELOG](./CHANGELOG.en.md).

## License

MIT — see [LICENSE](../../LICENSE) and the repository [README](../../README.md). Commercial use, redistribution, modification, closed-source integration and resale are all permitted without fee or authorization; the sole obligation is retaining the copyright notice (`Copyright (c) 2026 Worm Base AI`). Dependency license audit is documented in the README section "依赖与开源协议（商用合规说明）": no GPL/AGPL/LGPL copyleft contamination.
