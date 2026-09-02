// web/src/components/print/composables/useAdsorb.ts
import { ref, type Ref } from 'vue'
import type { ElementRect, AlignLine, AdsorbResult } from '../types'

export interface AdsorbConfig {
  adsorbMin?: number
  adsorbLineMin?: number
  showAdsorbLine?: boolean
}

export function useAdsorb(config: AdsorbConfig = {}) {
  const adsorbMin = config.adsorbMin ?? 1
  const adsorbLineMin = config.adsorbLineMin ?? 2
  const showAdsorbLine = config.showAdsorbLine ?? true

  /** 引导线响应式数据，由模板 v-for 渲染 */
  const guideLines: Ref<AlignLine[]> = ref([])

  /** 纸张尺寸（mm），用于引导线贯穿整页 */
  const paperSize = ref({ width: 0, height: 0 })

  /** 对齐类型颜色:左/顶端蓝,居中绿,右/底橘 */
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

  function check(
    movingRect: ElementRect,
    others: ElementRect[],
    guideLines?: { vertical: number[]; horizontal: number[] },
  ): AdsorbResult {
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
    if (guideLines) {
      const m2 = {
        left, right: left + movingRect.width, vCenter: left + movingRect.width / 2,
        top, bottom: top + movingRect.height, hCenter: top + movingRect.height / 2,
      }
      const hKeys: (keyof typeof m2)[] = ['left', 'vCenter', 'right']
      for (const pos of guideLines.vertical) {
        for (const k of hKeys) {
          const d = Math.abs(m2[k] - pos)
          if (d <= adsorbMin && d < minDist) { minDist = d; left = movingRect.left + (pos - m2[k]) }
        }
      }
      const vKeys: (keyof typeof m2)[] = ['top', 'hCenter', 'bottom']
      for (const pos of guideLines.horizontal) {
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

    if (guideLines) {
      for (const pos of guideLines.vertical) {
        if (!lines.some(l => l.type === 'vertical' && l.position === pos)) {
          lines.push({ type: 'vertical', position: pos })
        }
      }
      for (const pos of guideLines.horizontal) {
        if (!lines.some(l => l.type === 'horizontal' && l.position === pos)) {
          lines.push({ type: 'horizontal', position: pos })
        }
      }
    }

    return { left, top, lines }
  }

  /** 更新引导线（Vue 响应式，不再直接操作 DOM） */
  function renderLines(lines: AlignLine[], paperW: number, paperH: number) {
    guideLines.value = lines
    paperSize.value = { width: paperW, height: paperH }
  }

  /** 清除引导线 */
  function clearLines() {
    guideLines.value = []
  }

  return { check, renderLines, clearLines, guideLines, paperSize }
}
