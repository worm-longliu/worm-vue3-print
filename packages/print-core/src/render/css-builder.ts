// print-core/src/render/css-builder.ts
// 生成打印页面 CSS 样式，所有尺寸使用 mm 单位

import type { TemplateData } from './types.js'
import { getPaperDimensions } from './types.js'

/** mm 值转 CSS 字符串 */
export function mm(value: number): string {
  return `${value}mm`
}

/**
 * 生成完整的打印页面 CSS。
 * 包含纸张尺寸、边距、页眉页脚、内容区、首页叠加区域等样式。
 */
export function buildPageCss(template: TemplateData): string {
  const paper = getPaperDimensions(template)
  const { top: mt, right: mr, bottom: mb, left: ml } = template.margins
  const headerH = template.header?.height ?? 0
  const footerH = template.footer?.height ?? 0
  const overlayH = template.firstPageOverlay?.height ?? 0
  const contentWidth = paper.width - ml - mr

  return `
/* ── 打印纸张：浏览器原生打印按此尺寸分页（Playwright page.pdf 以显式宽高为准，无副作用） ── */
@page { size: ${mm(paper.width)} ${mm(paper.height)}; margin: 0; }

/* ── 全局重置 ── */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; }

/* ── 屏幕预览：灰底 + 纸张阴影/页间距；打印时去除 ── */
@media screen {
  body { background: #e9ebee; }
  .print-page { margin: 12px auto; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18); }
}
@media print {
  body { background: #fff; }
  .print-page { margin: 0; box-shadow: none; }
}

/* ── 纸张页面 ── */
.print-page {
  width: ${mm(paper.width)};
  min-height: ${mm(paper.height)};
  padding: ${mm(mt)} ${mm(mr)} ${mm(mb)} ${mm(ml)};
  position: relative;
  page-break-after: always;
  overflow: hidden;
}
.print-page:last-child {
  page-break-after: auto;
}

/* ── 页眉 ── */
.page-header {
  width: ${mm(contentWidth)};
  height: ${mm(headerH)};
  position: relative;
}

/* ── 页脚：绝对定位固定在页面底部（内容不足时不随文档流上浮） ──
   用显式 top 定位到「纸高 - 下边距 - 页脚高」，保证下边距生效、
   与设计器 CanvasPaper 的三区几何一致。 */
.page-footer {
  width: ${mm(contentWidth)};
  height: ${mm(footerH)};
  position: absolute;
  top: ${mm(paper.height - mb - footerH)};
  left: 0;
}

/* ── 内容区 ── */
.content-area {
  width: ${mm(contentWidth)};
  position: relative;
  overflow: visible;
}

/* ── 首页叠加区域 ── */
.first-page-overlay {
  width: ${mm(contentWidth)};
  height: ${mm(overlayH)};
  position: relative;
}

/* ── 元素通用定位 ── */
.print-element {
  position: absolute;
  overflow: hidden;
}

/* ── 表格样式 ── */
.print-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.print-table th,
.print-table td {
  border: 1px solid #ccc;
  padding: 2mm 3mm;
  word-break: break-all;
  overflow: hidden;
}
.print-table thead th {
  background-color: #f5f5f5;
  font-weight: bold;
}

/* ── 测量模式 ── */
.measure-mode .print-page {
  height: auto;
  min-height: auto;
  overflow: visible;
}
.measure-mode .content-area {
  height: auto;
  overflow: visible;
}
`.trim()
}

/**
 * 生成内联样式：元素绝对定位（mm 单位）
 */
export function elementPositionStyle(
  left: number,
  top: number,
  width: number,
  height?: number,
): string {
  const parts = [
    `position:absolute`,
    `left:${mm(left)}`,
    `top:${mm(top)}`,
    `width:${mm(width)}`,
  ]
  if (height !== undefined && height > 0) {
    parts.push(`height:${mm(height)}`)
  }
  return parts.join(';') + ';'
}
