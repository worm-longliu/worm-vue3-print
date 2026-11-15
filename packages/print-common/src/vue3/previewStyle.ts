/**
 * PrintHtmlPreview 的样式：canvas 版是 SFC scoped CSS，本子路径不引入 @vitejs/plugin-vue，
 * 故把同一份规则改为「根节点前缀 + 幂等注入」，宿主无需额外 import 样式文件。
 * 前缀把规则限制在本组件根节点内，不会污染宿主页面。
 */
const STYLE_ID = 'worm-print-common-vue3-preview'

const PREVIEW_CSS = `
.pcv3-preview.print-html-preview {
  width: 100%;
  height: 100%;
  position: relative;
  background: #e9ebee;
}
.pcv3-preview .print-html-preview-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.pcv3-preview .print-html-preview-loading,
.pcv3-preview .print-html-preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}
.pcv3-preview .print-html-preview-error { color: #f56c6c; }
.pcv3-preview .print-html-preview-warn {
  position: absolute;
  top: 8px;
  left: 12px;
  z-index: 2;
  max-width: 62%;
  padding: 4px 8px;
  border: 1px solid #e6a23c;
  border-radius: 4px;
  background: rgba(250, 236, 209, 0.94);
  color: #b88230;
  font-size: 12px;
  line-height: 1.5;
}
.pcv3-preview .print-html-preview-zoom {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  border: 1px solid var(--pd-border-soft, #ebeef5);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.pcv3-preview .print-html-preview-zoom-btn {
  padding: 2px 7px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text-muted, #909399);
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
  transition: color .14s ease, background .14s ease;
}
.pcv3-preview .print-html-preview-zoom-btn:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
  color: var(--pd-text, #2a2e37);
}
.pcv3-preview .print-html-preview-zoom-btn.active {
  background: var(--pd-accent, #165DFF);
  color: #fff;
  font-weight: 600;
}
.pcv3-preview .print-html-preview-zoom-note {
  padding-right: 4px;
  color: var(--pd-text-muted, #909399);
  font-size: 11px;
}
.pcv3-preview .print-html-preview-zoom-hint {
  color: #b88230;
  font-size: 11px;
}
`

/** 同页多个预览实例只注入一次；SSR 下静默跳过 */
export function ensurePreviewStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = PREVIEW_CSS
  document.head.appendChild(style)
}
