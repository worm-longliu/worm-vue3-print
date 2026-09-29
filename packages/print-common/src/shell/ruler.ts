// 视口固定式标尺（单条）绘制：逐行移植 print-canvas/src/components/Ruler.vue 的 draw 口径。
// 类名 pd-ruler / is-horizontal / is-vertical 的定位（top/left 22px）、指针样式与
// 投影来自派生 CSS（print-common/src/styles/designer.css），本模块只负责 canvas 内容与 CSS 盒尺寸。
import {
  RULER_THICKNESS,
  buildRulerTicks,
  chooseMajorStepMM,
  mmToPx,
} from '@worm-vue3-print/core/designer'
import type { RulerTick } from '@worm-vue3-print/core/designer'

/** 设计区视口几何（与 CanvasArea.vue 的 rulerGeom 同构） */
export interface RulerGeom {
  /** 纸张 0mm 点相对横尺起点的屏幕偏移（已扣除尺条厚度） */
  originX: number
  /** 纸张 0mm 点相对竖尺起点的屏幕偏移 */
  originY: number
  /** 横尺可见长度（屏幕 px） */
  viewW: number
  /** 竖尺可见长度（屏幕 px） */
  viewH: number
  /** 纸张当前缩放（1 = 100%） */
  paperScale: number
}

export interface RulerOptions {
  orientation: 'horizontal' | 'vertical'
  geom: RulerGeom
  /** 纸张该方向长度（mm），用于边界标记与纸外淡化范围 */
  paperLengthMM: number
  scale: number
  /** 鼠标在尺条轴向上的位置（屏幕 px） */
  cursorPx?: number | null
}

/** 单次绘制内部共享的几何与上下文，避免各子步骤重复解算方向分支 */
interface Paint {
  ctx: CanvasRenderingContext2D
  horizontal: boolean
  /** 未取整的原始长度：纸张边界可见性判定沿用 Ruler.vue 的 viewportPx 口径 */
  viewportPx: number
  thickness: number
  originPx: number
  pxPerMM: number
  paperLengthMM: number
}

/** canvas 无法解析 var()，照 Ruler.vue 用 getComputedStyle 读自定义属性（缺失时回退常量） */
function readVar(
  style: CSSStyleDeclaration,
  names: string[],
  fallback: string,
): string {
  for (const name of names) {
    const value = style.getPropertyValue(name).trim()
    if (value) return value
  }
  return fallback
}

export function drawRuler(canvas: HTMLCanvasElement, opts: RulerOptions): void {
  const horizontal = opts.orientation === 'horizontal'
  const geom = opts.geom
  const viewportPx = horizontal ? geom.viewW : geom.viewH

  // cssSize：横尺 = 视口宽 × 尺厚；竖尺 = 尺厚 × 视口高
  canvas.style.width = `${horizontal ? viewportPx : RULER_THICKNESS}px`
  canvas.style.height = `${horizontal ? RULER_THICKNESS : viewportPx}px`

  const ctx = canvas.getContext('2d')
  // happy-dom 等无 canvas 环境直接跳过绘制
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const length = Math.max(0, Math.round(viewportPx))
  const thickness = RULER_THICKNESS
  canvas.width = (horizontal ? length : thickness) * dpr
  canvas.height = (horizontal ? thickness : length) * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const style = getComputedStyle(canvas)
  const bg = readVar(style, ['--pd-ruler-bg'], '#F8F9FC')
  const fg = readVar(style, ['--pd-ruler'], '#9AA1AF')
  // Ruler.vue 的游标与纸张边界取 --pd-accent；common 主题另有语义更精确的 --pd-ruler-cursor，
  // 当前主题下两者同值（#165DFF），优先后者再回退，保证与设计态观感一致
  const accent = readVar(style, ['--pd-ruler-cursor', '--pd-accent'], '#165DFF')

  // 背景
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, horizontal ? length : thickness, horizontal ? thickness : length)

  // CanvasArea 把 paperScale 同时作为 scale 传入，正常同值；scale 非法时退回几何值
  const s = opts.scale > 0
    ? opts.scale
    : (geom.paperScale > 0 ? geom.paperScale : 1)
  const pxPerMM = mmToPx(1) * s
  if (pxPerMM <= 0) return

  const paint: Paint = {
    ctx,
    horizontal,
    viewportPx,
    thickness,
    originPx: horizontal ? geom.originX : geom.originY,
    pxPerMM,
    paperLengthMM: opts.paperLengthMM,
  }

  // 可见毫米范围（含纸张外区域）
  const startMM = -paint.originPx / pxPerMM
  const endMM = (length - paint.originPx) / pxPerMM
  const majorStep = chooseMajorStepMM(s)
  const ticks = buildRulerTicks(startMM, endMM, majorStep)

  // 纸外刻度淡化处理：先画纸外，再画纸内
  drawTicks(paint, ticks, fg, true)
  drawTicks(paint, ticks, fg, false)

  // 纸张 0 / 末端边界标记
  drawPaperEdge(paint, 0, accent)
  drawPaperEdge(paint, opts.paperLengthMM, accent)

  // 鼠标位置指示线
  const cursor = opts.cursorPx ?? null
  if (cursor !== null && cursor >= 0 && cursor <= length) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (horizontal) {
      const x = Math.round(cursor) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, thickness)
    } else {
      const y = Math.round(cursor) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(thickness, y)
    }
    ctx.stroke()
  }
}

/** 纸面毫米坐标 → 尺条轴向屏幕像素（半像素对齐，与 Ruler.vue 一致） */
function axisPosition(paint: Paint, mm: number): number {
  return Math.round(paint.originPx + mm * paint.pxPerMM) + 0.5
}

function drawTicks(
  paint: Paint,
  ticks: RulerTick[],
  fg: string,
  outside: boolean,
): void {
  const { ctx, horizontal, paperLengthMM } = paint
  ctx.strokeStyle = fg
  ctx.fillStyle = fg
  ctx.globalAlpha = outside ? 0.32 : 1
  ctx.lineWidth = 1
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'

  for (const tick of ticks) {
    const isOutside = tick.mm < 0 || tick.mm > paperLengthMM
    if (isOutside !== outside) continue
    const pos = axisPosition(paint, tick.mm)
    const len = tick.major ? 8 : 4
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, len)
    } else {
      ctx.moveTo(0, pos)
      ctx.lineTo(len, pos)
    }
    ctx.stroke()
    if (tick.major && tick.label) {
      if (horizontal) {
        ctx.fillText(tick.label, pos + 2, 11)
      } else {
        ctx.save()
        // 旋转 -90° 后文字沿屏幕 +x 铺开（9px 字体约占 9px）：x=11 落在 11..20px，
        // 完整处于 22px 尺宽内并与横尺标签（y=11）对称
        ctx.translate(11, pos + 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(tick.label, 0, 0)
        ctx.restore()
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawPaperEdge(paint: Paint, mm: number, color: string): void {
  const { ctx, horizontal, thickness, viewportPx } = paint
  const pos = axisPosition(paint, mm)
  if (pos <= 0 || pos >= viewportPx) return
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 1
  ctx.beginPath()
  if (horizontal) {
    ctx.moveTo(pos, 0)
    ctx.lineTo(pos, thickness)
  } else {
    ctx.moveTo(0, pos)
    ctx.lineTo(thickness, pos)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}
