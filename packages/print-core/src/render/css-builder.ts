// print-core/src/render/css-builder.ts
// 生成打印页面 CSS 样式，所有尺寸使用 mm 单位

import type { TemplateData } from './types.js'
import { getPaperDimensions, getOutputPaperDimensions, getOutputRotationAngle, isContinuousPaper } from './types.js'
import { FALLBACK_FONT_STACK } from '../print/fonts.js'
import type { TileLayout } from '../print/tiling.js'

/** mm 值转 CSS 字符串 */
export function mm(value: number): string {
  return `${value}mm`
}

/**
 * 外层纸张尺寸（@page / .print-page 实际出纸尺寸）。
 * - 固定纸且出纸旋转 90/270：取交换长宽后的尺寸（Hd×Wd）；
 * - 连续纸：设计稿尺寸，并允许 pageHeightMm 覆盖推导纸高。
 */
function resolveOuterPaper(template: TemplateData, pageHeightMm?: number): { width: number; height: number } {
  const out = getOutputPaperDimensions(template)
  return pageHeightMm && pageHeightMm > 0 && isContinuousPaper(template)
    ? { width: out.width, height: pageHeightMm }
    : out
}

/**
 * 内层纸张尺寸（设计稿尺寸）：三区几何、页脚定位、内容区宽度都基于它，
 * 与出纸方向无关；连续纸允许 pageHeightMm 覆盖推导纸高。
 */
function resolveAreaPaper(template: TemplateData, pageHeightMm?: number): { width: number; height: number } {
  const design = getPaperDimensions(template)
  return pageHeightMm && pageHeightMm > 0 && isContinuousPaper(template)
    ? { width: design.width, height: pageHeightMm }
    : design
}

// ── 基础块（模板无关；多页时整体只输出一份） ──

function screenBlock(): string {
  return `
/* ── 全局重置 ── */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* 打印必须保留元素背景色（Chromium 默认剔除背景，需显式声明） */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body { font-family: ${FALLBACK_FONT_STACK.join(', ')}; }

/* ── 屏幕预览：灰底 + 纸张阴影/页间距；打印时去除 ── */
@media screen {
  body { background: #e9ebee; }
  .print-page { margin: 12px auto; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18); }
}
@media print {
  body { background: #fff; }
  .print-page { margin: 0; box-shadow: none; }
}
`
}

function watermarkBlock(): string {
  return `
/* ── 水印层：覆盖整页、位于所有内容之下（显式矢量瓦片，禁止用 CSS 平铺背景：
       Chromium 会把它编译成 PDF 平铺图案，出纸链路的 RIP 会忽略图案矩阵导致水印放大/错位） ── */
.watermark-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
/* 单块水印瓦片：位置/尺寸由 core 的瓦片网格给出（mm） */
.watermark-tile {
  position: absolute;
  pointer-events: none;
}
`
}

function elementBlock(): string {
  return `
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
`
}

// ── 几何块（模板相关；多页时按模板作用域化，单页时保持原始选择器） ──

/** @page 规则：纸张尺寸（含连续纸推导纸高）；@page 无法作用域化，多页时由首个模板输出一次 */
function pageRuleBlock(paper: { width: number; height: number }): string {
  return `
/* ── 打印纸张：浏览器原生打印按此尺寸分页（Playwright page.pdf 以显式宽高为准，无副作用） ── */
@page { size: ${mm(paper.width)} ${mm(paper.height)}; margin: 0; }
`
}

/**
 * 转子层（出纸旋转容器）：设计稿尺寸，按 angle 整页旋转把设计稿填入出纸纸张。
 * 仅在出纸旋转非 0 的固定纸场景输出；连续纸/拼版不输出。
 * 物理映射（设计稿 Wd×Hd，旋转后包围盒）：
 *   90°  → translate(Hd,0) rotate(90deg)   → 填满 Hd×Wd（纸张交换长宽）
 *   180° → translate(Wd,Hd) rotate(180deg)  → 填满 Wd×Hd（纸张不变）
 *   270° → translate(0,Wd) rotate(270deg)   → 填满 Hd×Wd（纸张交换长宽，方向反向）
 * 无需缩放，内容不被拉伸/裁切。基础规则 .print-page-rotor 无 transform，由 .print-page-rotor-${angle} 补旋转。
 */
function buildRotorCss(area: { width: number; height: number }, margins: { top: number; right: number; bottom: number; left: number }, angle: 0 | 90 | 180 | 270): string {
  const base = `
/* ── 出纸转子：设计稿整页旋转 ${angle}° 填入出纸纸张 ── */
.print-page-rotor {
  position: absolute;
  top: 0;
  left: 0;
  width: ${mm(area.width)};
  height: ${mm(area.height)};
  padding: ${mm(margins.top)} ${mm(margins.right)} ${mm(margins.bottom)} ${mm(margins.left)};
  box-sizing: border-box;
  transform-origin: 0 0;
}`
  if (angle === 0) return base.trim()
  const transforms: Record<90 | 180 | 270, string> = {
    90: `translate(${mm(area.height)}, 0mm) rotate(90deg)`,
    180: `translate(${mm(area.width)}, ${mm(area.height)}) rotate(180deg)`,
    270: `translate(0mm, ${mm(area.width)}) rotate(270deg)`,
  }
  const tf = transforms[angle]
  return [
    base.trim(),
    `.print-page-rotor-${angle} {\n  transform: ${tf};\n}`,
  ].join('\n')
}

/**
 * 纸张页几何：.print-page 宽高/背景，以及文档末页取消强制分页。
 * @param pageSel 页面选择器：单页 '.print-page'；作用域化时 '.mt-N.print-page'
 * @param outerPaper 外层（出纸）尺寸：@page / .print-page 实际尺寸
 * @param rotated 是否出纸旋转：旋转时 .print-page 不内边距（边距由转子承担），否则沿用设计稿边距
 */
function pageGeometryBlock(
  template: TemplateData,
  outerPaper: { width: number; height: number },
  pageSel: string,
  rotated: boolean,
): string {
  const { top: mt, right: mr, bottom: mb, left: ml } = template.margins
  const padding = rotated ? '0' : `${mm(mt)} ${mm(mr)} ${mm(mb)} ${mm(ml)}`
  return `
/* ── 纸张页面 ── */
${pageSel} {
  width: ${mm(outerPaper.width)};
  min-height: ${mm(outerPaper.height)};
  background: ${template.pageBackground ?? '#fff'};
  padding: ${padding};
  position: relative;
  page-break-after: always;
  overflow: hidden;
}
.print-page:last-child {
  page-break-after: auto;
}
`
}

/**
 * 区域几何：页眉/页脚/内容区/首页叠加。
 * @param desc 后代前缀：单页 ''；作用域化时 '.mt-N '
 */
function areaGeometryBlock(
  template: TemplateData,
  paper: { width: number; height: number },
  desc: string,
): string {
  const { right: mr, left: ml } = template.margins
  const { bottom: mb } = template.margins
  const headerH = template.header?.height ?? 0
  const footerH = template.footer?.height ?? 0
  const overlayH = template.firstPageOverlay?.height ?? 0
  const contentWidth = paper.width - ml - mr
  return `
/* ── 页眉 ── */
${desc}.page-header {
  width: ${mm(contentWidth)};
  height: ${mm(headerH)};
  position: relative;
}

/* ── 页脚：绝对定位固定在页面底部（内容不足时不随文档流上浮） ──
   用显式 top 定位到「纸高 - 下边距 - 页脚高」，保证下边距生效、
   与设计器 CanvasPaper 的三区几何一致。 */
${desc}.page-footer {
  width: ${mm(contentWidth)};
  height: ${mm(footerH)};
  position: absolute;
  top: ${mm(paper.height - mb - footerH)};
  left: 0;
}

/* ── 内容区 ── */
${desc}.content-area {
  width: ${mm(contentWidth)};
  position: relative;
  overflow: visible;
}

/* ── 首页叠加区域 ── */
${desc}.first-page-overlay {
  width: ${mm(contentWidth)};
  height: ${mm(overlayH)};
  position: relative;
}
`
}

/** 模板无关的基础 CSS（多页文档外壳用；不含 @page，@page 由首模板单独输出） */
export function buildBasePageCss(): string {
  return [screenBlock(), watermarkBlock(), elementBlock()].join('').trim()
}

/** @page 规则 CSS（纸张尺寸，含连续纸推导纸高）。@page 无法作用域化，多页文档由首个模板输出一份 */
export function buildPageRuleCss(template: TemplateData, pageHeightMm?: number): string {
  return pageRuleBlock(resolveOuterPaper(template, pageHeightMm)).trim()
}

/**
 * 模板相关几何 CSS，可按作用域前缀输出（多页时每页模板一份）。
 * @param scope 页面作用域类选择器（如 '.mt-3'）；缺省输出原始选择器
 * @param pageHeightMm 连续纸推导纸高（mm）；普通纸不传
 */
export function buildPageGeometryCss(
  template: TemplateData,
  scope?: string,
  pageHeightMm?: number,
): string {
  const angle = getOutputRotationAngle(template)
  const rotated = angle !== 0
  const outer = resolveOuterPaper(template, pageHeightMm)
  const area = resolveAreaPaper(template, pageHeightMm)
  const pageSel = scope ? `${scope}.print-page` : '.print-page'
  const desc = scope ? `${scope} ` : ''
  return [
    pageGeometryBlock(template, outer, pageSel, rotated),
    areaGeometryBlock(template, area, desc),
    ...(rotated ? [buildRotorCss(area, template.margins, angle)] : []),
  ].join('').trim()
}

/**
 * 生成完整的打印页面 CSS。
 * 包含纸张尺寸、边距、页眉页脚、内容区、首页叠加区域等样式。
 * 出纸旋转角度非 0（固定纸）时，额外输出 .print-page-rotor / .print-page-rotor-${angle} 转子规则完成整页旋转。
 * @param pageHeightMm 连续纸由浏览器探针推导出的最终纸高（mm）；传入时替换模板纸张高度，
 *                     使 @page/.print-page/footer 全部对齐该高度。普通纸不传。
 */
export function buildPageCss(template: TemplateData, pageHeightMm?: number): string {
  const angle = getOutputRotationAngle(template)
  const rotated = angle !== 0
  const outer = resolveOuterPaper(template, pageHeightMm)
  const area = resolveAreaPaper(template, pageHeightMm)
  return [
    pageRuleBlock(outer),
    screenBlock(),
    pageGeometryBlock(template, outer, '.print-page', rotated),
    watermarkBlock(),
    areaGeometryBlock(template, area, ''),
    elementBlock(),
    ...(rotated ? [buildRotorCss(area, template.margins, angle)] : []),
  ].join('').trim()
}

/** 份间强制分页：覆盖每份最后一个 .print-page 的 page-break-after:auto */
export const COPY_BREAK_CSS =
  '.print-copy:not(:last-child){break-after:page;page-break-after:always;}'

/**
 * 批量（多份）文档 CSS。
 * - 固定纸：各份 @page 相同，共用 buildPageCss，仅追加份间分页；
 * - 连续纸：每份纸高独立推导，用命名页 @page copyN + 作用域 .print-copy-N
 *   使一个文档内各份输出不同物理页高（Chromium preferCSSPageSize 支持）。
 */
export function buildBatchPageCss(
  template: TemplateData,
  copies: Array<{ heightMm?: number }>,
): string {
  if (!isContinuousPaper(template)) {
    return `${buildPageCss(template)}\n${COPY_BREAK_CSS}`
  }

  const { bottom: mb } = template.margins
  const footerH = template.footer?.height ?? 0
  const width = getPaperDimensions(template).width
  // base 用首份推导纸高生成匿名 @page 与全局 .print-page 几何，作为兜底默认
  const base = buildPageCss(template, copies[0]?.heightMm)
  const scoped = copies
    .map((copy, i) => {
      const h = copy.heightMm
      const rules = [
        `@page copy${i} { size: ${mm(width)} ${h ? mm(h) : 'auto'}; margin: 0; }`,
        `.print-copy-${i} { page: copy${i}; }`,
      ]
      if (h) {
        rules.push(`.print-copy-${i} .print-page { min-height: ${mm(h)}; }`)
        rules.push(`.print-copy-${i} .page-footer { top: ${mm(h - mb - footerH)}; }`)
      }
      return rules.join('\n')
    })
    .join('\n')
  return `${base}\n${scoped}\n${COPY_BREAK_CSS}`
}

/**
 * 拼版纸张 CSS：一张目标纸承载多行多列标签。
 * 必须由调用方拼在 buildPageCss 之后（同优先级下后出现的 @page 生效），
 * 否则浏览器 window.print() 会按标签纸尺寸分页——实测 12 格被切成 7 张 70×40mm。
 */
export function buildSheetPageCss(layout: TileLayout): string {
  return `
/* ── 拼版纸张：@page 尺寸 = 目标纸。服务端/客户端链路以 paperMm 显式定尺寸、不看这里，
      但浏览器链路只看 @page，故这条是硬需求 ── */
@page { size: ${mm(layout.sheet.width)} ${mm(layout.sheet.height)}; margin: 0; }

/* ── 一张目标纸 ── */
.print-sheet {
  width: ${mm(layout.sheet.width)};
  height: ${mm(layout.sheet.height)};
  position: relative;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.print-sheet:last-child { break-after: auto; page-break-after: auto; }

/* ── 一格：绝对定位，位置由 tilePosition() 以行内 style 给出 ── */
.print-tile {
  position: absolute;
  width: ${mm(layout.tile.width)};
  height: ${mm(layout.tile.height)};
  overflow: hidden;
}
/* 防御性声明：绝对定位 + overflow:hidden 容器内的后代不产生分页点，当前布局下无实际作用；
   若将来改用 flex/grid 布局，格内整页会重新参与分页，故保留 */
.print-tile > .print-page { break-after: auto; page-break-after: auto; }

@media screen {
  .print-sheet { margin: 12px auto; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18); }
  /* 必需：抵消标签 CSS 的 @media screen{.print-page{margin:12px auto}}，
     否则设计器预览错位 3.17mm、与出纸不一致 */
  .print-tile > .print-page { margin: 0; box-shadow: none; }
}
`
}

/**
 * 生成内联样式：元素绝对定位（mm 单位）。
 * 可选 z-index：与设计器「层级」一致，未设置（undefined）时不输出（层叠回退 DOM 顺序）。
 */
export function elementPositionStyle(
  left: number,
  top: number,
  width: number,
  height?: number,
  zIndex?: number,
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
  if (zIndex !== undefined) {
    parts.push(`z-index:${zIndex}`)
  }
  return parts.join(';') + ';'
}
