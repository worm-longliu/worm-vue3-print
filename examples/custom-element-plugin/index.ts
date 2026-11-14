// 浏览器 / 设计器入口：import 即注册。宿主只需在自己的入口里写一行
// `import '@acme/print-signature'`，素材卡、画布组件、属性台与出图同时生效。
import { defineComponent, h } from 'vue'
import { registerElementPlugin } from '@worm-vue3-print/core/designer'
import './type-augmentation.js'
import { SIGNATURE_PLUGIN, SIGNATURE_TYPE } from './plugin.js'

/** 画布组件可用 Vue SFC；这里用 defineComponent 让脚手架保持纯 TS */
const SignatureElement = defineComponent({
  name: 'SignatureElement',
  props: { element: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { style: 'font-style:italic;opacity:.75' },
      String((props.element as { options?: Record<string, unknown> }).options?.signatureText ?? ''))
  },
})

/** 「自定义属性」tab：只有带专属属性的实例才显示（实例级判据） */
const SignaturePropertyGroup = defineComponent({
  name: 'SignaturePropertyGroup',
  props: { element: { type: Object, required: true } },
  setup(props) {
    return () => h('label', {}, [
      '签名文字',
      h('input', {
        value: String((props.element as { options?: Record<string, unknown> }).options?.signatureText ?? ''),
        onInput: (event: Event) => {
          const el = (props.element as { options: Record<string, unknown> }).options
          el.signatureText = (event.target as HTMLInputElement).value
        },
      }),
    ])
  },
})

const hasSignatureProperties = (element: unknown): boolean => {
  const opts = (element as { options?: Record<string, unknown> } | null)?.options
  return !!opts && opts.signatureText !== undefined
}

registerElementPlugin({
  ...SIGNATURE_PLUGIN,
  designer: {
    canvasComponent: SignatureElement,
    materialCard: { label: '手写签名', icon: '✍', group: '自定义元素' },
    propertyTab: {
      id: 'signature-properties',
      label: '自定义属性',
      component: SignaturePropertyGroup,
      hasProperties: hasSignatureProperties,
    },
  },
})

export { SIGNATURE_PLUGIN, SIGNATURE_TYPE }
