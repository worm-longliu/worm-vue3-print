const DEFAULTS = { lineWidth: 16, maxLines: 2 }

function chunks(text, size) {
  const chars = [...text]
  const out = []
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''))
  return out
}

function clauses(text) {
  return text.match(/[^，、；：。！？!?]+[，、；：。！？!?]?/gu)?.filter(Boolean) || [text]
}

/** 按标点组成短条；单条最多两行，保留所有原始字符。 */
export function splitSubtitle(text, options = {}) {
  const { lineWidth, maxLines } = { ...DEFAULTS, ...options }
  if (maxLines !== 2) throw new Error('抖音短字幕固定最多两行')
  const capacity = lineWidth * maxLines
  const units = clauses(text).flatMap((part) => chunks(part, capacity))
  const captions = []
  for (const unit of units) {
    const last = captions.at(-1)
    if (last && [...(last + unit)].length <= capacity) captions[captions.length - 1] += unit
    else captions.push(unit)
  }
  return captions.map((caption) => wrapSubtitle(caption, lineWidth))
}

/** 两行时优先在标点处均衡换行，避免第二行只剩一两个字。 */
export function wrapSubtitle(text, lineWidth = DEFAULTS.lineWidth) {
  const chars = [...text]
  if (chars.length <= lineWidth) return text
  const middle = Math.ceil(chars.length / 2)
  const candidates = []
  for (let i = 1; i < chars.length; i++) {
    if ('，、；：。！？!?'.includes(chars[i - 1])) candidates.push(i)
  }
  const valid = candidates.filter((i) => i <= lineWidth && chars.length - i <= lineWidth)
  const at = valid.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? middle
  return `${chars.slice(0, at).join('')}\n${chars.slice(at).join('')}`
}

/** 在同一真实发音时长内按字数分配短条时间轴，最后一条吸附到句尾消除舍入误差。 */
export function subtitlesFor(text, start, end, options = {}) {
  const captions = splitSubtitle(text, options)
  const weights = captions.map((caption) => [...caption.replaceAll('\n', '')].length)
  const total = weights.reduce((sum, n) => sum + n, 0) || 1
  let cursor = start
  return captions.map((caption, index) => {
    const segStart = cursor
    cursor = index === captions.length - 1 ? end : +(cursor + ((end - start) * weights[index]) / total).toFixed(3)
    return { start: +segStart.toFixed(3), end: +cursor.toFixed(3), text: caption }
  })
}

/** 从短字幕时间轴恢复原句的完整听审窗口；兼容未拆条的旧 timings。 */
export function sentenceWindow(parts, sentenceIndex) {
  const matched = parts.filter((part) => part.sentence === sentenceIndex)
  if (!matched.length && parts[sentenceIndex]?.sentence == null) {
    const { start, end } = parts[sentenceIndex]
    return { start, end }
  }
  if (!matched.length) throw new Error(`字幕时间轴缺原句 ${sentenceIndex}`)
  return { start: matched[0].start, end: matched.at(-1).end }
}
