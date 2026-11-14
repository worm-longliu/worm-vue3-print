import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { registerElementPlugin, clearElementPlugins } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'
import { validateTemplateJson } from '../validate.js'

const element = (type: string, options: Record<string, unknown> = {}, metaType = type) => ({
  id: 'e1',
  type,
  options: { left: 0, top: 0, width: 50, height: 20, ...options },
  printElementType: { type: metaType },
})

const template = (elements: unknown[], extra: Record<string, unknown> = {}) => ({
  paperSize: 'A4',
  orientation: 'portrait',
  unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements,
  ...extra,
})

const signaturePlugin: PrintElementPlugin = {
  kind: {
    id: '@acme/signature',
    version: '1.2.0',
    type: 'signature',
    label: '手写签名',
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'signerName'],
    optionMeta: {
      signerName: { kind: 'text', label: '签名人' },
      strokeColor: { kind: 'color', default: '#000' },
    },
  },
}

afterEach(() => clearElementPlugins())

describe('legacy 宽松通道（历史模板零迁移）', () => {
  it('两份真实历史 chart 模板的校验结果与 P0 基线完全一致', () => {
    // §4.1 兼容边界是「已装包宿主」：P4 起五个 chart* 键由插件 optionMeta 声明，
    // 因此本用例模拟装入并注册了图表插件的进程（包入口 import 即自注册）。
    registerElementPlugin({
      kind: {
        id: '@worm-vue3-print/echarts',
        version: '1',
        type: 'chart',
        label: '图表',
        optionMeta: {
          chartOption: { kind: 'object' },
          chartDataSource: { kind: 'text' },
          chartCategoryField: { kind: 'text' },
          chartValueFields: { kind: 'object' },
          chartSeriesField: { kind: 'text' },
        },
      },
    })
    for (const name of ['sales-chart', 'echarts-test-case']) {
      const sample = JSON.parse(readFileSync(
        new URL(`../../../../docs/superpowers/specs/baseline/${name}.legacy.json`, import.meta.url),
        'utf8',
      ))
      const baseline = JSON.parse(readFileSync(
        new URL(`../../../../docs/superpowers/specs/baseline/${name}.validate-baseline.json`, import.meta.url),
        'utf8',
      ))
      const r = validateTemplateJson(sample.template)
      expect(r.ok, name).toBe(baseline.ok)
      expect(r.issues.map(i => `${i.level}:${i.path}`), name).toEqual(baseline.issues.map((i: { level: string; path: string }) => `${i.level}:${i.path}`))
      expect(r.unknownKeys, name).toEqual(baseline.unknownKeys)
      expect('plugins' in sample.template, name).toBe(false)
    }
  })

  it('未声明 plugins 的未知 type 只给 warning，不判死模板', () => {
    const r = validateTemplateJson(template([element('signature')]))
    expect(r.ok).toBe(true)
    const warnings = r.issues.filter(i => i.level === 'warning')
    expect(warnings.some(i => i.path === 'elements[0].type' && i.message.includes('未知元素类型'))).toBe(true)
  })

  it('明显拼写错误（大小写 / 相邻转置）仍报 error', () => {
    for (const bad of ['Text', 'tabel', 'imag']) {
      const r = validateTemplateJson(template([element(bad)]))
      expect(r.ok, bad).toBe(false)
      expect(r.issues.some(i => i.path === 'elements[0].type' && i.level === 'error'), bad).toBe(true)
    }
  })

  it('注册插件后其 type 与 optionMeta 键都不再被告警', () => {
    registerElementPlugin(signaturePlugin)
    const r = validateTemplateJson(template([
      element('signature', { signerName: '张三', strokeColor: '#123456' }),
    ]))
    expect(r.ok).toBe(true)
    expect(r.issues.some(i => i.path === 'elements[0].type')).toBe(false)
    expect(r.unknownKeys).toEqual([])
  })

  it('未注册插件时其专属键沿用现状 warning（AI 幻觉键不被无条件豁免）', () => {
    const r = validateTemplateJson(template([element('signature', { signerName: '张三' })]))
    expect(r.ok).toBe(true)
    expect(r.unknownKeys).toContain('elements[0].options.signerName')
    expect(r.issues.some(i => i.level === 'warning' && i.path.endsWith('signerName'))).toBe(true)
  })
})

describe('strict 强校验通道（模板声明 plugins）', () => {
  it('缺插件报 MISSING_PLUGIN 硬错误，而不是静默出空纸', () => {
    const r = validateTemplateJson(template([element('signature')], {
      plugins: [{ id: '@acme/signature', version: '1.2.0' }],
    }))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.level === 'error' && i.message.startsWith('MISSING_PLUGIN'))).toBe(true)
  })

  it('已注册且版本一致时放行自定义 type 与插件属性', () => {
    registerElementPlugin(signaturePlugin)
    const r = validateTemplateJson(template([
      element('signature', { signerName: '张三', strokeColor: '#123456' }),
    ], { plugins: [{ id: '@acme/signature', version: '1.2.0' }] }))
    expect(r.ok).toBe(true)
    expect(r.unknownKeys).toEqual([])
  })

  it('版本不一致报 PLUGIN_VERSION_MISMATCH', () => {
    registerElementPlugin(signaturePlugin)
    const r = validateTemplateJson(template([element('signature')], {
      plugins: [{ id: '@acme/signature', version: '0.9.0' }],
    }))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.message.startsWith('PLUGIN_VERSION_MISMATCH'))).toBe(true)
  })

  it('未注册的未知 type 被 enum 拦下，另附 MISSING_PLUGIN', () => {
    const r = validateTemplateJson(template([element('seal')], {
      plugins: [{ id: '@acme/seal' }],
    }))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path === 'elements[0].type' && i.level === 'error')).toBe(true)
    expect(r.issues.some(i => i.message.startsWith('MISSING_PLUGIN'))).toBe(true)
  })

  it('strict 下契约未知键升级为 error', () => {
    registerElementPlugin(signaturePlugin)
    const r = validateTemplateJson(template([
      element('signature', { hallucinatedKey: 1 }),
    ], { plugins: [{ id: '@acme/signature' }] }))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path.endsWith('hallucinatedKey') && i.level === 'error')).toBe(true)
  })

  it('多页 wrapper 顶层声明 plugins 同样进入 strict', () => {
    const page = template([element('signature')])
    const r = validateTemplateJson({ version: 1, pages: [page], plugins: [{ id: '@acme/signature' }] })
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.message.startsWith('MISSING_PLUGIN'))).toBe(true)
  })

  it('plugins 为空数组也算 strict（声明了但未列插件，只允许内置类型）', () => {
    const r = validateTemplateJson(template([element('text')], { plugins: [] }))
    expect(r.ok).toBe(true)
    const strict = validateTemplateJson(template([element('signature')], { plugins: [] }))
    expect(strict.ok).toBe(false)
    expect(strict.issues.some(i => i.path === 'elements[0].type' && i.level === 'error')).toBe(true)
  })
})
