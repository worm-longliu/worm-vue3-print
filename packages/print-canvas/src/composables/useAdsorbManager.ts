// web/src/components/print/composables/useAdsorbManager.ts
// 吸附管理器：在 CanvasPaper 层创建单例，统一处理吸附检测与引导线渲染
// BaseElement 拖拽时通过函数 props 调用 requestAdsorb / clearGuides
import type { RuntimeElement, ElementRect, AdsorbResult } from '../types'
import { useAdsorb, type AdsorbConfig } from './useAdsorb'

export interface AdsorbManagerOptions {
  getElements: () => RuntimeElement[]
  /** 纸张尺寸（mm），用于引导线贯穿整页 */
  getPaperSize: () => { width: number; height: number }
  /** 手动参考线位置(mm),参与吸附 */
  getGuides?: () => { vertical: number[]; horizontal: number[] }
  config?: AdsorbConfig
}

export function useAdsorbManager(options: AdsorbManagerOptions) {
  const { check, renderLines, clearLines, guideLines, paperSize } = useAdsorb(
    options.config ?? { adsorbMin: 1, adsorbLineMin: 2, showAdsorbLine: true }
  )

  function requestAdsorb(movingRect: ElementRect): AdsorbResult {
    const others = options.getElements()
      .filter(e => e.id !== movingRect.id)
      .map(e => ({
        id: e.id,
        left: e.options.left,
        top: e.options.top,
        width: e.options.width,
        height: e.options.height,
      } as ElementRect))
    const result = check(movingRect, others, options.getGuides?.())
    const paper = options.getPaperSize()
    renderLines(result.lines, paper.width, paper.height)
    return result
  }

  function clearGuides() {
    clearLines()
  }

  return { requestAdsorb, clearGuides, guideLines, paperSize }
}
