// 水印配置区段：移植 print-canvas/src/components/WatermarkConfig.vue（无框架版）。
// 类名与 canvas 逐字一致（样式由 scripts/gen-styles.mjs 派生，只认类名）。
//
// 落盘口径照抄 canvas 的 onChange：表达式写 binding、静态文本写 content，两种模式 core 都支持；
// 文本输入用 change（失焦/回车提交）而非 input —— 无框架版每次 store 变更都会整体重绘属性台，
// 边打边提交会把光标顶回输入框开头。
import { WATERMARK_DEFAULTS, WATERMARK_DENSITY_PRESETS } from '@worm-vue3-print/core'
import type { WatermarkOptions } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { El } from '../core/h'
import { colorTrigger, divider, field, resetButton } from './controls'
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

  /** 统一落盘：以内置缺省补齐数值键后整体写回。
   *  注意必须带上当前 wm 的其余键（mode/content/binding/timestamp/format）：
   *  updateTemplateData 是浅合并，watermark 整体被替换，漏掉这些键就会把已配好的表达式清空。 */
  const commit = (patch: Partial<WatermarkOptions>) => {
    const base: WatermarkOptions = {
      ...wm,
      testData: wm?.testData ?? '',
      rotate: wm?.rotate ?? WATERMARK_DEFAULTS.rotate,
      color: wm?.color || WATERMARK_DEFAULTS.color,
      opacity: wm?.opacity ?? WATERMARK_DEFAULTS.opacity,
      tileWidth: wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth,
      tileHeight: wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight,
    }
    ctx.store.updateTemplateData({ watermark: { ...base, ...patch } })
  }

  const openEditor = () => ctx.fire('open-expression', {
    elementId: '',
    targetPath: 'watermark.content',
    value: text,
  })

  /** 判定基准必须是「已落值视图」而非原始 wm：commit() 会把五个键全部落值，且控件在 wm 缺省时
   *  显示的就是 WATERMARK_DEFAULTS 的值。若拿 wm 当 target，未配置的水印会显示 -30 却判为已偏离——
   *  与 canvas 的 localConfig 同口径才不会两端不一致。 */
  const view: Record<string, any> = {
    rotate: wm?.rotate ?? WATERMARK_DEFAULTS.rotate,
    color: wm?.color || WATERMARK_DEFAULTS.color,
    opacity: wm?.opacity ?? WATERMARK_DEFAULTS.opacity,
    tileWidth: wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth,
    tileHeight: wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight,
  }
  const wmReset = (key: string): El => resetButton({
    target: view, base: WATERMARK_DEFAULTS as Record<string, any>, propKey: key,
    write: () => commit({ [key]: (WATERMARK_DEFAULTS as Record<string, any>)[key] } as Partial<WatermarkOptions>),
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
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '旋转角度' }), wmReset('rotate')]),
        h('input', {
          type: 'range', class: 'pd-range',
          min: -90, max: 90, step: 5, value: String(wm?.rotate ?? WATERMARK_DEFAULTS.rotate),
          onChange: (ev: Event) => commit({ rotate: Number((ev.target as HTMLInputElement).value) }),
        }),
        h('span', { class: 'pd-hint', text: `${wm?.rotate ?? WATERMARK_DEFAULTS.rotate}°` }),
      ]),
      field('颜色', colorTrigger(wm?.color || WATERMARK_DEFAULTS.color, v => commit({ color: v }), '水印颜色'), undefined, wmReset('color')),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '透明度' }), wmReset('opacity')]),
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
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '瓦片宽' }), wmReset('tileWidth')]),
        h('input', {
          type: 'number', class: 'pd-input', min: WATERMARK_DEFAULTS.minTileWidth, step: 10,
          value: String(wm?.tileWidth ?? WATERMARK_DEFAULTS.tileWidth),
          onChange: (ev: Event) => commit({ tileWidth: Number((ev.target as HTMLInputElement).value) }),
        }),
      ]) : '',
      density === 'custom' ? h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '瓦片高' }), wmReset('tileHeight')]),
        h('input', {
          type: 'number', class: 'pd-input', min: WATERMARK_DEFAULTS.minTileHeight, step: 10,
          value: String(wm?.tileHeight ?? WATERMARK_DEFAULTS.tileHeight),
          onChange: (ev: Event) => commit({ tileHeight: Number((ev.target as HTMLInputElement).value) }),
        }),
      ]) : '',
    ].filter(Boolean)),
  ])
}
