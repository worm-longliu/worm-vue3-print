// 最小自定义元素插件：手写签名（signature）
// 复制本目录到自己的包里即可使用；本目录不参与仓库构建与 workspace 解析。
//
// 主体（core / contract / canvas）不认识 signature，也不需要认识：
// 一份描述符同时声明「种类 / 属性元数据 / 数据绑定 / 出图 / 设计器」。
import { defineElementPlugin } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'

export const SIGNATURE_PLUGIN_ID = '@acme/print-signature'
export const SIGNATURE_TYPE = 'signature'

/** 与 render.html / createRenderer 共用的纯函数：进程内 SSR 与页面执行器口径一致 */
export function renderSignature(spec: Record<string, unknown>): string {
  const text = String(spec.signatureText ?? '')
  const color = String(spec.signatureColor ?? '#1f2329')
  const width = Number(spec.widthMm ?? 60) * 3.78
  const height = Number(spec.heightMm ?? 20) * 3.78
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:100%">`
    + `<text x="4" y="${height * 0.7}" font-size="${Math.round(height * 0.5)}" font-style="italic" fill="${color}">${escapeXml(text)}</text>`
    + `</svg>`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const SIGNATURE_PLUGIN: PrintElementPlugin = defineElementPlugin({
  kind: {
    id: SIGNATURE_PLUGIN_ID,
    version: '1.0.0',
    type: SIGNATURE_TYPE,
    label: '手写签名',
    icon: '✍',
    fixedHeight: true,
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'signatureText'],
    notes: 'signatureText 支持 {表达式}；signatureField 指定数据源字段时自动覆写文字',
    optionMeta: {
      signatureText: { kind: 'text', label: '签名文字', default: '待签署' },
      signatureColor: { kind: 'color', label: '笔迹颜色', default: '#1f2329' },
      signatureField: { kind: 'text', label: '数据字段' },
    },
    defaultOptions: () => ({
      width: 60,
      height: 20,
      title: '手写签名',
      signatureText: '待签署',
      signatureColor: '#1f2329',
      signatureField: '',
    }),
  },
  // 绑定阶段只写「运行时选项」，不改模板 JSON；历史模板零迁移
  binding: {
    bind: (options, data) => {
      const field = String(options.signatureField ?? '')
      return field && data[field] !== undefined
        ? { signatureText: String(data[field]) }
        : {}
    },
  },
  render: {
    // ① 进程内 SSR（推荐）：core 的 renderAssetSpecsInProcess 直接调用，三端零页面注入
    createRenderer: () => ({ render: spec => renderSignature(spec as Record<string, unknown>) }),
    // ② 兜底：没有 renderers 时 html-generator 的 default 分支直接取内联 SVG
    html: spec => renderSignature(spec as Record<string, unknown>),
    // ③ 可选：只有页面执行器的宿主才需要。返回 { name, version, code }，
    //    并在 legacyAliases 里登记「执行器旧方法名 → renderAssets」，由别名桥反查。
    // executorBundle: () => ({ name: SIGNATURE_PLUGIN_ID, version: '1.0.0', code: IIFE_CODE }),
  },
})
