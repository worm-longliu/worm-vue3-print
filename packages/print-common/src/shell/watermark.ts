// 水印配置区段：移植 print-canvas/src/components/WatermarkConfig.vue（无框架版）。
// 类名与 canvas 逐字一致（样式由 scripts/gen-styles.mjs 派生，只认类名）。
//
// 落盘口径照抄 canvas 的 onChange：表达式写 binding、静态文本写 content，两种模式 core 都支持；
// 文本输入用 change（失焦/回车提交）而非 input —— 无框架版每次 store 变更都会整体重绘属性台，
// 边打边提交会把光标顶回输入框开头。
import { WATERMARK_DEFAULTS, WATERMARK_DENSITY_PRESETS } from '@worm-vue3-print/core'
import type { WatermarkOptions } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import { colorTrigger, divider, field } from './controls'
import type { ShellCtx } from './controls'

const PRESETS = WATERMARK_DENSITY_PRESETS

/** 与 canvas 的 isExpressionText 同判定：花括号 / 函数调用 / 字段路径视为表达式 */
export function isExpressionText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[{}]/.test(t)) return true
  if (/^[A-Za-z_$][\w$]*\s*\(/.test(t)) return true
  return /^[A-Za-z_$][\w$]*(\.[\w$]+)+$/.test(t)
}

/** 取模板里的水印文本：binding 模式取 binding，其余取 content */
function readText(wm?: WatermarkOptions): string {
  if (!wm) return ''
  return wm.mode === 'binding' ? (wm.binding ?? '') : (wm.content ?? '')
}

export function watermarkSection(ctx: ShellCtx) {
  const wm = ctx.store.templateData.watermark
  const text = readText(wm)
  const isExpression = wm?.mode === 'binding' || (text !== '' && isExpressionText(text))
  const density = (() => {
    const w = wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth
    const hgt = wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight
    for (const [key, preset] of Object.entries(PRESETS)) {
      if (preset.width === w && preset.height === hgt) return key
    }
    return 'custom'
  })()

  /** 统一落盘：只覆盖本区段负责的键，保留时间戳等其它水印配置 */
  const commit = (patch: Partial<WatermarkOptions>) => {
    const base: WatermarkOptions = {
      testData: wm?.testData ?? '',
      rotate: wm?.rotate ?? WATERMARK_DEFAULTS.rotate,
      color: wm?.color || WATERMARK_DEFAULTS.color,
      opacity: wm?.opacity ?? WATERMARK_DEFAULTS.opacity,
      tileWidth: wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth,
      tileHeight: wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight,
      timestamp: wm?.timestamp,
      format: wm?.format,
    }
    ctx.store.updateTemplateData({ watermark: { ...base, ...patch } })
  }

  const openEditor = () => ctx.fire('open-expression', {
    elementId: '',
    targetPath: 'watermark.content',
    value: text,
  })

  return h('div', { class: 'watermark-config' }, [
    divider('水印'),
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '水印表达式' }),
        h('input', {
          class: 'pd-input', type: 'text', value: text,
          placeholder: '直接输入文字，或用表达式：{order.no}、{printDate}',
          title: '双击或点「编辑表达式」打开表达式弹框',
          onChange: (ev: Event) => {
            const v = (ev.target as HTMLInputElement).value
            commit(isExpressionText(v)
              ? { mode: 'binding', binding: v, content: '' }
              : { mode: 'fixed', content: v, binding: '' })
          },
          onDblclick: openEditor,
        }),
        h('button', {
          type: 'button', class: 'pd-button small', text: '编辑表达式', onClick: openEditor,
        }),
      ]),
      isExpression ? field('测试值', h('input', {
        class: 'pd-input', type: 'text', value: wm?.testData ?? '',
        placeholder: '表达式取不到值时预览显示',
        onChange: (ev: Event) => commit({ testData: (ev.target as HTMLInputElement).value }),
      })) : '',
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '旋转角度' }),
        h('input', {
          type: 'range', class: 'pd-range',
          min: -90, max: 90, step: 5, value: String(wm?.rotate ?? WATERMARK_DEFAULTS.rotate),
          onChange: (ev: Event) => commit({ rotate: Number((ev.target as HTMLInputElement).value) }),
        }),
        h('span', { class: 'pd-hint', text: `${wm?.rotate ?? WATERMARK_DEFAULTS.rotate}°` }),
      ]),
      field('颜色', colorTrigger(wm?.color || WATERMARK_DEFAULTS.color, v => commit({ color: v }), '水印颜色')),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '透明度' }),
        h('input', {
          type: 'range', class: 'pd-range',
          min: 0.05, max: 0.5, step: 0.05, value: String(wm?.opacity ?? WATERMARK_DEFAULTS.opacity),
          onChange: (ev: Event) => commit({ opacity: Number((ev.target as HTMLInputElement).value) }),
        }),
        h('span', {
          class: 'pd-hint',
          text: (wm?.opacity ?? WATERMARK_DEFAULTS.opacity).toFixed(2),
        }),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '密度' }),
        h('select', {
          class: 'pd-select', style: { width: '100%' },
          onChange: (ev: Event) => {
            const key = (ev.target as HTMLSelectElement).value
            const preset = PRESETS[key]
            if (preset) commit({ tileWidth: preset.width, tileHeight: preset.height })
          },
        }, [
          ...Object.entries(PRESETS).map(([key, p]) => h('option', {
            value: key, text: `${p.label}（${p.width}×${p.height}）`, selected: density === key,
          })),
          h('option', { value: 'custom', text: '自定义', selected: density === 'custom' }),
        ]),
      ]),
      density === 'custom' ? h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '瓦片宽' }),
        h('input', {
          type: 'number', class: 'pd-input', min: WATERMARK_DEFAULTS.minTileWidth, step: 10,
          value: String(wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth),
          onChange: (ev: Event) => commit({ tileWidth: Number((ev.target as HTMLInputElement).value) }),
        }),
      ]) : '',
      density === 'custom' ? h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '瓦片高' }),
        h('input', {
          type: 'number', class: 'pd-input', min: WATERMARK_DEFAULTS.minTileHeight, step: 10,
          value: String(wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight),
          onChange: (ev: Event) => commit({ tileHeight: Number((ev.target as HTMLInputElement).value) }),
        }),
      ]) : '',
    ].filter(Boolean)),
  ])
}
