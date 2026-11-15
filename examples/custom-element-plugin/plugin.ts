// 最小自定义元素插件：一个插件注册两个元素（signature / signatureStamp）
// 复制本目录到自己的包里即可使用；本目录不参与仓库构建与 workspace 解析。
//
// 主体（core / contract / canvas）不认识这两个 type，也不需要认识：
// 一份描述符用 kinds[] 同时声明「多个种类 / 属性元数据 / 数据绑定 / 出图 / 设计器」。
import { defineElementPlugin } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'

export const SIGNATURE_PLUGIN_ID = '@acme/print-signature'
export const SIGNATURE_TYPE = 'signature'
export const SIGNATURE_STAMP_TYPE = 'signatureStamp'

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

const SHARED_OPTION_META = {
  signatureText: { kind: 'text' as const, label: '签名文字', default: '待签署' },
  signatureColor: { kind: 'color' as const, label: '笔迹颜色', default: '#1f2329' },
  signatureField: { kind: 'text' as const, label: '数据字段' },
}

export const SIGNATURE_PLUGIN: PrintElementPlugin = defineElementPlugin({
  id: SIGNATURE_PLUGIN_ID,
  version: '1.0.0',
  // 一个插件注册两个 kind：插件级 binding/render 为默认，kind 级可覆盖
  kinds: [
    {
      type: SIGNATURE_TYPE,
      label: '手写签名',
      icon: 'PenTool',
      fixedHeight: true,
      requiredOptionKeys: ['left', 'top', 'width', 'height', 'signatureText'],
      notes: 'signatureText 支持 {表达式}；signatureField 指定数据源字段时自动覆写文字',
      optionMeta: SHARED_OPTION_META,
      defaultOptions: () => ({
        width: 60, height: 20, title: '手写签名',
        signatureText: '待签署', signatureColor: '#1f2329', signatureField: '',
      }),
    },
    {
      type: SIGNATURE_STAMP_TYPE,
      label: '签名章',
      icon: 'Stamp',
      fixedHeight: true,
      requiredOptionKeys: ['left', 'top', 'width', 'height', 'signatureText'],
      notes: '与手写签名共用数据绑定与属性，出图为描边印章样式',
      optionMeta: SHARED_OPTION_META,
      defaultOptions: () => ({
        width: 40, height: 40, title: '签名章',
        signatureText: '待签署', signatureColor: '#c0392b', signatureField: '',
      }),
      // kind 级 render 覆盖：只写 html 时仍保留插件级 createRenderer（逐字段合并）
      render: { html: spec => renderStamp(spec as Record<string, unknown>) },
    },
  ],
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
    // ③ 可选：只有页面执行器的宿主才需要，返回 { name, version, code }
    // executorBundle: () => ({ name: SIGNATURE_PLUGIN_ID, version: '1.0.0', code: IIFE_CODE }),
  },
})

/** 签名章：描边圆框 + 居中文字， 用于演示 kind 级 render 覆盖 */
export function renderStamp(spec: Record<string, unknown>): string {
  const text = String(spec.signatureText ?? '')
  const color = String(spec.signatureColor ?? '#c0392b')
  const width = Number(spec.widthMm ?? 40) * 3.78
  const height = Number(spec.heightMm ?? 40) * 3.78
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:100%">`
    + `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.42}" fill="none" stroke="${color}" stroke-width="3"/>`
    + `<text x="${width / 2}" y="${height * 0.6}" text-anchor="middle" font-size="${Math.round(height * 0.22)}" fill="${color}">${escapeXml(text)}</text>`
    + `</svg>`
}
