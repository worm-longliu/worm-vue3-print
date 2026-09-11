// 吸附逻辑的 Vue 适配层：引导线/纸张尺寸保持响应式状态，
// 吸附坐标与引导线计算全部委托 @worm-vue3-print/core/designer 的纯函数。
import { ref, type Ref } from 'vue'
import {
  computeAdsorb,
  type AdsorbConfig,
  type ElementRect,
  type AlignLine,
  type AdsorbResult,
} from '@worm-vue3-print/core/designer'

export type { AdsorbConfig }

export function useAdsorb(config: AdsorbConfig = {}) {
  /** 引导线响应式数据，由模板 v-for 渲染 */
  const guideLines: Ref<AlignLine[]> = ref([])

  /** 纸张尺寸（mm），用于引导线贯穿整页 */
  const paperSize = ref({ width: 0, height: 0 })

  function check(
    movingRect: ElementRect,
    others: ElementRect[],
    guides?: { vertical: number[]; horizontal: number[] },
  ): AdsorbResult {
    return computeAdsorb(movingRect, others, guides, config)
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
