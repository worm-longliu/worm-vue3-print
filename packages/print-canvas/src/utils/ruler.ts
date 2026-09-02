export interface RulerTick {
  mm: number
  major: boolean
  label?: string
}

/** 生成标尺刻度：5mm 小刻度，10mm 大刻度 + 数字标签 */
export function buildRulerTicks(lengthMM: number): RulerTick[] {
  const ticks: RulerTick[] = []
  for (let mm = 0; mm <= lengthMM + 1e-9; mm += 5) {
    const rounded = Math.round(mm * 100) / 100
    const major = rounded % 10 === 0
    if (major) {
      ticks.push({ mm: rounded, major, label: String(rounded) })
    } else {
      ticks.push({ mm: rounded, major })
    }
  }
  return ticks
}
