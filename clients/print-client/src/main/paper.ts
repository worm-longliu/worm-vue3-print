// 打印纸张解析：以 core 返回的 paperMm 为基准应用宿主覆盖。
// 连续纸时 core 已完成探针推导（HTML 纸高即该值），此处只做微米换算与逃生门覆盖。单位：微米。
import type { PrintOptions } from '@worm-vue3-print/client'

const MM_TO_UM = 1000

export interface ResolvedPaper {
  paper: { width: number; height: number }
  heightSource: 'config' | 'derived'
}

export function resolvePaper(input: {
  print: PrintOptions
  /** core renderHtmlPages 返回的最终纸张尺寸（mm；连续纸已推导） */
  paperMm: { width: number; height: number }
  continuous: boolean
}): ResolvedPaper {
  const { print, paperMm, continuous } = input
  const ps = print.paperSize
  const overrideWidth = typeof ps?.width === 'number' && ps.width > 0 ? ps.width : undefined
  const overrideHeight = typeof ps?.height === 'number' && ps.height > 0 ? ps.height : undefined

  const width = overrideWidth ?? Math.round(paperMm.width * MM_TO_UM)

  if (continuous) {
    if (overrideHeight) {
      return { paper: { width, height: overrideHeight }, heightSource: 'config' }
    }
    return { paper: { width, height: Math.round(paperMm.height * MM_TO_UM) }, heightSource: 'derived' }
  }

  return {
    paper: { width, height: overrideHeight ?? Math.round(paperMm.height * MM_TO_UM) },
    heightSource: 'config',
  }
}
