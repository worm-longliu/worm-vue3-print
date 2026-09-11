// 标尺刻度纯函数：步长选择与可见范围刻度生成

/** 视口固定尺条厚度（px），CanvasArea 布局与左上角块共用 */
export const RULER_THICKNESS = 22

export interface RulerTick {
  /** 刻度在纸面坐标系上的位置（mm，可为负，表示纸张原点之外） */
  mm: number
  /** 是否为主刻度（带数字标签） */
  major: boolean
  label?: string
}

/** 漂亮数步长序列：1/2/5 × 10^n，单位 mm */
const STEP_SEQUENCE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const

/**
 * 按缩放选择主刻度步长（mm）：取漂亮数序列中使屏幕间距
 * 不小于 targetPx 的最小步长，保证任意缩放下标签不重叠
 * @param scale 画布缩放比例（1 = 100%）
 * @param targetPx 主刻度之间的目标屏幕间距（px）
 */
export function chooseMajorStepMM(scale: number, targetPx = 64): number {
  const pxPerMM = scale * (96 / 25.4)
  for (const step of STEP_SEQUENCE) {
    if (step * pxPerMM >= targetPx) return step
  }
  return STEP_SEQUENCE[STEP_SEQUENCE.length - 1]
}

/**
 * 次刻度步长：5 系（5/50/500…）五等分、2 系（2/20/200…）二等分、
 * 10 的幂从 10mm 起五等分（10→2mm、100→20mm），1mm 时无次刻度
 */
export function minorStepMM(majorStepMM: number): number | null {
  const exp = Math.floor(Math.log10(majorStepMM) + 1e-9)
  const base = majorStepMM / 10 ** exp // 归一化到 1 / 2 / 5
  if (base === 5 || (base === 1 && majorStepMM >= 10)) return majorStepMM / 5
  if (base === 2) return majorStepMM / 2
  return null
}

/** 消除浮点误差，保留到 0.001mm */
function roundMM(mm: number): number {
  return Math.round(mm * 1000) / 1000
}

/**
 * 生成可见毫米范围内的全部刻度（升序）：
 * 从首个对齐的次刻度开始，主刻度带数字标签
 * @param startMM 可见范围起点（纸面坐标，可为负）
 * @param endMM 可见范围终点
 * @param majorStepMM 主刻度步长（由 chooseMajorStepMM 选出）
 */
export function buildRulerTicks(
  startMM: number,
  endMM: number,
  majorStepMM: number,
): RulerTick[] {
  if (endMM < startMM || majorStepMM <= 0) return []
  const minor = minorStepMM(majorStepMM)
  const fine = minor ?? majorStepMM
  const first = Math.ceil(startMM / fine - 1e-9) * fine
  const lastIndex = Math.floor((endMM - first) / fine + 1e-9)
  const ticks: RulerTick[] = []
  for (let i = 0; i <= lastIndex; i++) {
    const mm = roundMM(first + i * fine)
    const isMajor = Math.abs(mm / majorStepMM - Math.round(mm / majorStepMM)) < 1e-6
    if (isMajor) {
      ticks.push({ mm, major: true, label: String(mm) })
    } else {
      ticks.push({ mm, major: false })
    }
  }
  return ticks
}
