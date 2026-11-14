// 类型扩展点：声明合并让宿主在 TS 里直接写 signature 与三个专属属性键。
// 编译期自校验：注入失效时本文件会直接报 TS 错误，而不是等到运行时才发现。
import type { ElementOptions, ElementType } from '@worm-vue3-print/core/designer'

type _TypeInjected = 'signature' extends ElementType ? true : never
type _OptionInjected = 'signatureText' extends keyof ElementOptions ? true : never
const _injected: _TypeInjected & _OptionInjected = true
void _injected

declare module '@worm-vue3-print/core/designer' {
  interface PluginElementTypeMap {
    signature: true
  }

  interface ElementOptions {
    signatureText?: string
    signatureColor?: string
    signatureField?: string
  }
}
