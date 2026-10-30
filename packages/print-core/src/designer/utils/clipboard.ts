// 设计器里「复制一段文本到系统剪贴板」的唯一实现：素材台字段单击复制、
// 表达式弹窗字段复制按钮都走这里，避免两套宿主各写一份口径（Gitee #IKRIZM）。
//
// 两个宿主（canvas 的 Vue 壳、common 的无框架外壳）都跑在浏览器里：
//   · 安全上下文（https / localhost）直接用 navigator.clipboard.writeText；
//   · 非安全上下文（http 局域网地址、Electron 部分装载方式）该 API 不可用或被拒，
//     回退到临时 textarea + execCommand('copy')，失败返回 false 由调用方决定要不要给反馈。
// 不抛异常：调用方只关心「复制成功 / 失败」，便于在 UI 上显示「已复制」或保持静默。
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒或非安全上下文：继续走下面的回退分支
    }
  }

  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // 放在视口外且不可见：避免复制瞬间页面滚动或闪烁
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
