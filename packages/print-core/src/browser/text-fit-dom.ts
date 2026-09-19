// print-core/src/browser/text-fit-dom.ts
// 自动缩小（textFit='shrink'）的 DOM 实现：在真实排版引擎里二分字号，直到内容放得下。
// 三端共用同一份实现——浏览器进程内直调，服务端/客户端注入 IIFE 后在页面上下文执行；
// 设计器画布也复用 fitTextNode，保证「设计态看到的字号」与「出纸的字号」一致。

import {
  floorFontSize,
  resolveShrinkMinFontSize,
} from '../render/text-fit.js'
import { mmToPx } from '../designer/utils/units.js'
import type { FitFontSize } from '../render/text-fit.js'

/** 溢出判定容差（px）：scrollHeight/clientHeight 取整后的余量 */
const FIT_TOLERANCE_PX = 0.5

/** 二分次数：区间 1~72pt 下收敛精度优于 0.02pt */
const SEARCH_STEPS = 12

function readAttrNumber(el: HTMLElement, name: string): number | undefined {
  const raw = el.getAttribute(name)
  if (raw === null || raw === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * 内容是否超出可用空间。
 * 纵向：给了 data-fit-mm（单元格可用高度）按毫米换算，否则与容器裁剪盒比较。
 * 横向：不换行（nowrap）时高度往往放得下但整行被裁掉，故一并按横向溢出判定。
 */
function overflows(el: HTMLElement, targetPx: number | undefined): boolean {
  if (el.scrollWidth > el.clientWidth + FIT_TOLERANCE_PX) return true
  const content = el.scrollHeight
  if (targetPx !== undefined) return content > targetPx + FIT_TOLERANCE_PX
  return content > el.clientHeight + FIT_TOLERANCE_PX
}

/**
 * 单个节点自动缩小；返回最终字号（pt）。非 shrink 节点返回 undefined。
 * 缩到下限仍放不下时保持下限字号，由容器裁剪兜底（等价退化为截断）。
 * 返回的字号与写进 DOM 的字号完全一致（向下取两位小数），
 * 否则测量趟按 9.623pt 排版、最终趟按回写的 9.62pt 渲染，会出现不可控的亚像素错版。
 */
export function fitTextNode(el: HTMLElement): number | undefined {
  if (el.getAttribute('data-fit') !== 'shrink') return undefined
  const minPt = resolveShrinkMinFontSize(readAttrNumber(el, 'data-fit-min'))
  const start = Math.max(readAttrNumber(el, 'data-fit-base') ?? minPt, minPt)
  const targetMm = readAttrNumber(el, 'data-fit-mm')
  const targetPx = targetMm !== undefined && targetMm > 0 ? mmToPx(targetMm) : undefined
  const apply = (pt: number): number => {
    const size = floorFontSize(pt)
    el.style.fontSize = `${size}pt`
    // 记录适配结果：宿主据此回写模板；画布据此识别「曾缩放的节点」以便切模式时复原
    el.setAttribute('data-fit-size', String(size))
    return size
  }

  const base = apply(start)
  if (!overflows(el, targetPx)) return base
  if (start <= minPt) return base

  let lo = minPt
  let hi = start
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2
    apply(mid)
    if (overflows(el, targetPx)) hi = mid
    else lo = mid
  }
  return apply(lo)
}

/**
 * 全文档自动缩小：按 DOM 顺序处理所有 data-fit="shrink" 节点，
 * 返回需要回写到模板的字号清单（key = 元素 id 或 `元素id#行类别#行:列`）。
 * 调用方须在读取测量值之前执行，使实测高度与最终渲染同口径。
 */
export function applyTextFit(doc: Document): FitFontSize[] {
  const fits: FitFontSize[] = []
  doc.querySelectorAll<HTMLElement>('[data-fit="shrink"]').forEach(el => {
    const size = fitTextNode(el)
    const key = el.getAttribute('data-fit-key')
    if (size === undefined || !key) return
    fits.push({ key, fontSizePt: size })
  })
  return fits
}
