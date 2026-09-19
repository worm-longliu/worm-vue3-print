// 自动缩小（textFit='shrink'）在画布上的落地：
// 与打印管线共用 core 的 fitTextNode（同一套二分算法），
// 使「设计态看到的字号」就是「出纸的字号」，不出现预览/出纸两副面孔。
import { nextTick, onMounted, watchEffect, type Ref } from 'vue'
import { fitTextNode } from '@worm-vue3-print/core/browser'

/** 容器自身（元素级缩小）与后代（单元格级缩小）中所有缩放下限节点 */
function fitTargets(root: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = []
  if (root.getAttribute('data-fit') === 'shrink') targets.push(root)
  root.querySelectorAll<HTMLElement>('[data-fit="shrink"]').forEach(node => targets.push(node))
  return targets
}

/**
 * 复原：曾被缩过（data-fit-size）但当前已不在缩小模式的节点，把字号写回基准值。
 * 不做这一步，从「自动缩小」切回「截断」时会残留上一次缩小后的字号。
 */
function restoreFitted(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-fit-size]').forEach(node => {
    if (node.getAttribute('data-fit') === 'shrink') return
    node.removeAttribute('data-fit-size')
    const base = node.getAttribute('data-fit-base')
    if (base) node.style.fontSize = `${base}pt`
    else node.style.removeProperty('font-size')
  })
}

/**
 * @param root 元素根节点（元素级缩小挂在根上，单元格级挂在根的后代上）
 * @param trigger 依赖采集：字号/尺寸/内容/模式变化时重新适配
 */
export function useShrinkFit(root: Ref<HTMLElement | null>, trigger: () => unknown): void {
  const apply = (): void => {
    const el = root.value
    if (!el) return
    fitTargets(el).forEach(fitTextNode)
    restoreFitted(el)
  }
  // flush: 'post' 保证在 DOM 更新后测量；Vue 只在绑定值变化时重写内联样式，不会冲掉适配结果
  watchEffect(() => {
    void trigger()
    void nextTick(apply)
  }, { flush: 'post' })
  onMounted(() => {
    void nextTick(apply)
  })
}
