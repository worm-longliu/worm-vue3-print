// 设计器吸附算法（框架无关纯函数）：元素拖动时计算吸附坐标与对齐引导线。
// Vue 适配层（响应式引导线状态）由各宿主 UI 包自行实现。
import type { ElementRect, AlignLine, AdsorbResult } from '../types.js'

export interface AdsorbConfig {
  adsorbMin?: number
  adsorbLineMin?: number
  showAdsorbLine?: boolean
}

/** 手动参考线（mm） */
export interface ManualGuides {
  vertical: number[]
  horizontal: number[]
}

/** 对齐类型颜色：左/顶端蓝，居中绿，右/底橘 */
const SNAP_COLORS: Record<'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', string> = {
  left: '#3b82f6',
  center: '#10b981',
  right: '#f59e0b',
  top: '#3b82f6',
  middle: '#10b981',
  bottom: '#f59e0b',
}

/** 根据移动元素对齐点(mk)返回引导线颜色 */
function snapColor(mk: string): string {
  if (mk === 'vCenter') return SNAP_COLORS.center
  if (mk === 'hCenter') return SNAP_COLORS.middle
  return SNAP_COLORS[mk as keyof typeof SNAP_COLORS] ?? SNAP_COLORS.left
}

/**
 * 计算拖动元素的吸附结果（新坐标 + 引导线）。
 * @param movingRect 拖动元素矩形
 * @param others 其他参与吸附的元素矩形
 * @param manualGuides 手动参考线（可选）
 * @param config 吸附阈值配置
 */
export function computeAdsorb(
  movingRect: ElementRect,
  others: ElementRect[],
  manualGuides?: ManualGuides,
  config: AdsorbConfig = {},
): AdsorbResult {
  const adsorbMin = config.adsorbMin ?? 1
  const adsorbLineMin = config.adsorbLineMin ?? 2
  const showAdsorbLine = config.showAdsorbLine ?? true

  let left = movingRect.left
  let top = movingRect.top
  const lines: AlignLine[] = []

  const m = {
    left: movingRect.left,
    right: movingRect.left + movingRect.width,
    vCenter: movingRect.left + movingRect.width / 2,
    top: movingRect.top,
    bottom: movingRect.top + movingRect.height,
    hCenter: movingRect.top + movingRect.height / 2,
  }

  let minDist = Infinity

  for (const other of others) {
    if (other.id === movingRect.id) continue
    const o = {
      left: other.left,
      right: other.left + other.width,
      vCenter: other.left + other.width / 2,
      top: other.top,
      bottom: other.top + other.height,
      hCenter: other.top + other.height / 2,
    }

    const hPairs: [keyof typeof m, keyof typeof o][] = [
      ['left', 'left'], ['left', 'vCenter'], ['left', 'right'],
      ['vCenter', 'left'], ['vCenter', 'vCenter'], ['vCenter', 'right'],
      ['right', 'left'], ['right', 'vCenter'], ['right', 'right'],
    ]
    const vPairs: [keyof typeof m, keyof typeof o][] = [
      ['top', 'top'], ['top', 'hCenter'], ['top', 'bottom'],
      ['hCenter', 'top'], ['hCenter', 'hCenter'], ['hCenter', 'bottom'],
      ['bottom', 'top'], ['bottom', 'hCenter'], ['bottom', 'bottom'],
    ]

    for (const [mk, ok] of hPairs) {
      const dist = Math.abs(m[mk] - o[ok])
      if (dist <= adsorbMin && dist < minDist) {
        minDist = dist
        left = movingRect.left + (o[ok] - m[mk])
      }
    }
    for (const [mk, ok] of vPairs) {
      const dist = Math.abs(m[mk] - o[ok])
      if (dist <= adsorbMin && dist < minDist) {
        minDist = dist
        top = movingRect.top + (o[ok] - m[mk])
      }
    }
  }

  // 手动参考线吸附:垂直参考线(position=X)参与水平方向,水平参考线参与垂直方向
  if (manualGuides) {
    const m2 = {
      left, right: left + movingRect.width, vCenter: left + movingRect.width / 2,
      top, bottom: top + movingRect.height, hCenter: top + movingRect.height / 2,
    }
    const hKeys: (keyof typeof m2)[] = ['left', 'vCenter', 'right']
    for (const pos of manualGuides.vertical) {
      for (const k of hKeys) {
        const d = Math.abs(m2[k] - pos)
        if (d <= adsorbMin && d < minDist) { minDist = d; left = movingRect.left + (pos - m2[k]) }
      }
    }
    const vKeys: (keyof typeof m2)[] = ['top', 'hCenter', 'bottom']
    for (const pos of manualGuides.horizontal) {
      for (const k of vKeys) {
        const d = Math.abs(m2[k] - pos)
        if (d <= adsorbMin && d < minDist) { minDist = d; top = movingRect.top + (pos - m2[k]) }
      }
    }
  }

  const adjustedM = {
    left, right: left + movingRect.width,
    vCenter: left + movingRect.width / 2,
    top, bottom: top + movingRect.height,
    hCenter: top + movingRect.height / 2,
  }

  if (showAdsorbLine) {
    const seen = new Set<string>()
    for (const other of others) {
      if (other.id === movingRect.id) continue
      const o = {
        left: other.left,
        right: other.left + other.width,
        vCenter: other.left + other.width / 2,
        top: other.top,
        bottom: other.top + other.height,
        hCenter: other.top + other.height / 2,
      }

      const hPairs: [keyof typeof adjustedM, keyof typeof o][] = [
        ['left', 'left'], ['left', 'vCenter'], ['left', 'right'],
        ['vCenter', 'left'], ['vCenter', 'vCenter'], ['vCenter', 'right'],
        ['right', 'left'], ['right', 'vCenter'], ['right', 'right'],
      ]
      const vPairs: [keyof typeof adjustedM, keyof typeof o][] = [
        ['top', 'top'], ['top', 'hCenter'], ['top', 'bottom'],
        ['hCenter', 'top'], ['hCenter', 'hCenter'], ['hCenter', 'bottom'],
        ['bottom', 'top'], ['bottom', 'hCenter'], ['bottom', 'bottom'],
      ]

      for (const [mk, ok] of hPairs) {
        const dist = Math.abs(adjustedM[mk] - o[ok])
        // 吸附（dist <= adsorbMin）或近距（adsorbMin < dist <= adsorbLineMin）均绘制竖直引导线
        if (dist <= adsorbLineMin) {
          const key = `v:${o[ok]}`
          if (!seen.has(key)) {
            seen.add(key)
            lines.push({ type: 'vertical', position: o[ok], id: other.id, color: snapColor(mk) })
          }
        }
      }
      for (const [mk, ok] of vPairs) {
        const dist = Math.abs(adjustedM[mk] - o[ok])
        if (dist <= adsorbLineMin) {
          const key = `h:${o[ok]}`
          if (!seen.has(key)) {
            seen.add(key)
            lines.push({ type: 'horizontal', position: o[ok], id: other.id, color: snapColor(mk) })
          }
        }
      }
    }
  }

  if (manualGuides) {
    for (const pos of manualGuides.vertical) {
      if (!lines.some(l => l.type === 'vertical' && l.position === pos)) {
        lines.push({ type: 'vertical', position: pos })
      }
    }
    for (const pos of manualGuides.horizontal) {
      if (!lines.some(l => l.type === 'horizontal' && l.position === pos)) {
        lines.push({ type: 'horizontal', position: pos })
      }
    }
  }

  return { left, top, lines }
}
