// 把模板声明字体的 @font-face 注入设计器所在文档：
// 否则画布只能用系统字体渲染，出图却用模板的 webfont，所见非所得。
import { onUnmounted, toValue, useId, watchEffect, type MaybeRefOrGetter } from 'vue'

const STYLE_ID_PREFIX = 'print-designer-font-face'

export function useDocumentFontFace(css: MaybeRefOrGetter<string>): void {
  // 每实例唯一，多个设计器同页时不产生重复 id（与 FontSelect 的列表 id 同一处理）
  const styleId = `${STYLE_ID_PREFIX}-${useId()}`
  let el: HTMLStyleElement | undefined

  watchEffect(() => {
    const text = toValue(css)
    if (!text) {
      el?.remove()
      el = undefined
      return
    }
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = text
  })

  onUnmounted(() => {
    el?.remove()
    el = undefined
  })
}
