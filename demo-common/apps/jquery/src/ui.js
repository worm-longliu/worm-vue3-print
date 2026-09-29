// 宿主侧零碎 DOM 工具：弹层显隐 + JSON 下载，供 app.js / gallery.js / print-dialog.js 复用。

/**
 * 弹层显隐：验收脚本按 hidden 属性判定可见性，同时要求实际不占位。
 * demo-ui.css 里 .print-mask / .gallery-mask / .custom-mask 是 display:flex，
 * 作者样式会盖掉 [hidden] 的 UA 规则，所以 hidden 之外还要同步一行内 display（不改样式文件）。
 */
export function setVisible(el, visible) {
  const node = typeof el === 'string' ? document.querySelector(el) : el
  if (!node) return
  node.toggleAttribute('hidden', !visible)
  node.style.display = visible ? '' : 'none'
}

/** 写文本并显示；传空串则隐藏（demo 里对应 v-if） */
export function setNotice(el, text) {
  const node = typeof el === 'string' ? document.querySelector(el) : el
  if (!node) return
  node.textContent = text
  setVisible(node, !!text)
}

/** 下载模板 JSON：格式化后落盘，与 demo 的下载口径一致 */
export function downloadJson(json, name) {
  const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 等一帧：元素刚插入 DOM 后取布局/iframe 用 */
export const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))
