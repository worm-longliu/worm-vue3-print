// 素材台素材卡标签的「文本较长」判据：canvas 的 LeftPanel 与 common 的零框架外壳共用同一份，
// 避免两套设计器对「哪些素材独占整行」给出不同结论。判据只依赖标签文本，扩展包注册的任意标签同样适用。

/** 中日韩文字、假名、全角符号按一个中文字宽计 */
function isWideChar(char: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char)
}

/**
 * 标签视觉宽度（单位≈一个中文字宽）：宽字符记 1，拉丁字母/数字/空格约记 0.55。
 * 例：`流式列表` = 4、`条形码` = 3、`HTML` = 2.2。
 */
function labelVisualWidth(label: string): number {
  let width = 0
  for (const char of label) width += isWideChar(char) ? 1 : 0.55
  return width
}

/** 素材卡标签是否文本较长（≥4 个中文字宽）：素材台两列栅格下需独占整行 */
export function isWideMaterialLabel(label: string): boolean {
  return labelVisualWidth(label) >= 4
}
