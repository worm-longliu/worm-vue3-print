// 页面属性补充区段：设计背景 + 拼版打印。
// DOM 类名对齐 canvas 的 DesignBackgroundConfig.vue / TilingConfig.vue，
// 拼版的校验与布局数字全部走 core 纯函数（TILE_DEFAULTS / validateTiling / computeTileLayout 等）。
import { PAPER_PRESETS, isContinuousPaperSize } from '@worm-vue3-print/core/designer'
import {
  TILE_DEFAULTS, computeMaxColumns, computeTileLayout, resolveSheetMm, validateTiling,
} from '@worm-vue3-print/core'
import type { TilingOptions } from '@worm-vue3-print/core'
import { h } from '../core/h'
import { divider, field, radioGroup, stepper } from './controls'
import type { ShellCtx } from './controls'

const SHEET_PRESET_KEYS = Object.keys(PAPER_PRESETS)
  .filter(k => k !== 'CUSTOM' && !PAPER_PRESETS[k]?.continuous)

/** 设计背景：走宿主注入的 uploadDesignBackground（与 canvas 同契约，未注入时入口禁用） */
function backgroundUpload(ctx: ShellCtx) {
  const label = document.createElement('label')
  label.className = 'pd-button small upload-label'
  const textNode = document.createTextNode('上传背景图')
  const input = document.createElement('input')
  input.className = 'visually-hidden'
  input.type = 'file'
  input.accept = 'image/*'
  label.append(textNode, input)

  const setDisabled = (disabled: boolean) => {
    label.className = `pd-button small upload-label${disabled ? ' disabled' : ''}`
    input.disabled = disabled
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('仅支持上传图片文件')
      input.value = ''
      return
    }
    const upload = ctx.host.uploadDesignBackground
    if (!upload) {
      alert('设计背景上传能力未配置')
      input.value = ''
      return
    }
    setDisabled(true)
    textNode.textContent = '上传中...'
    try {
      const src = await upload(file)
      if (src) ctx.store.updateTemplateData({ designBackground: { src, rotation: 0 } } as never)
      else alert('设计背景上传失败')
    } catch (err) {
      alert(err instanceof Error ? err.message : '设计背景上传失败')
    } finally {
      textNode.textContent = '上传背景图'
      setDisabled(!ctx.host.uploadDesignBackground)
      input.value = ''
    }
  })
  if (!ctx.host.uploadDesignBackground) setDisabled(true)
  return label
}
export function designBackgroundSection(ctx: ShellCtx) {
  const t = ctx.store.templateData
  const bg = t.designBackground
  const rotation = bg?.rotation ?? 0
  return h('div', { class: 'design-background-config' }, [
    divider('设计背景'),
    h('p', { class: 'design-background-tip', text: '仅设计器显示，用于套打定位，不会出现在预览和打印中' }),
    bg?.src
      ? [
        h('div', { class: 'design-background-path', title: bg.src, text: bg.src }),
        h('div', { class: 'design-background-actions' }, [
          h('button', {
            type: 'button', class: 'pd-button small rotate-btn',
            text: `旋转（${(rotation + 90) % 360}°）`,
            onClick: () => ctx.store.updateTemplateData({
              designBackground: { ...bg, rotation: ((rotation + 90) % 360) as 0 | 90 | 180 | 270 },
            }),
          }),
          h('button', {
            type: 'button', class: 'pd-button small remove-btn', text: '移除',
            onClick: () => ctx.store.updateTemplateData({ designBackground: undefined }),
          }),
        ]),
      ]
      : backgroundUpload(ctx),
  ].flat())
}

/** 拼版打印：开关 + 目标纸 + 留白 + 间距列数 + 校验与摘要 */
export function tilingSection(ctx: ShellCtx) {
  const store = ctx.store
  const template = store.templateData
  const raw = template.tiling
  const cfg: TilingOptions = {
    ...TILE_DEFAULTS,
    ...(raw ?? {}),
    enabled: raw?.enabled ?? false,
    sheetMargin: { ...TILE_DEFAULTS.sheetMargin, ...(raw?.sheetMargin ?? {}) },
  }
  const labelContinuous = isContinuousPaperSize(template.paperSize)
  const patch = (partial: Partial<TilingOptions>) => store.updateTemplateData({ tiling: { ...cfg, ...partial } })
  const patchMargin = (side: 'top' | 'right' | 'bottom' | 'left', value: number) =>
    patch({ sheetMargin: { ...cfg.sheetMargin, [side]: value ?? 0 } })
  const withTiling = { ...template, tiling: cfg }
  const issues = validateTiling(withTiling as never)
  const columnMax = Math.max(computeMaxColumns(withTiling as never), 1)
  let summary = ''
  if (!issues.length) {
    try {
      const l = computeTileLayout(withTiling as never)
      const s = resolveSheetMm(withTiling as never)
      const name = cfg.sheetPaperSize === 'CUSTOM' ? '自定义' : (cfg.sheetPaperSize ?? 'A4')
      const dir = cfg.sheetPaperSize === 'CUSTOM' ? '' : (cfg.sheetOrientation === 'landscape' ? ' 横向' : ' 纵向')
      summary = `目标纸 ${name}${dir} ${s.width}×${s.height}mm · ${l.columns} 列 × ${l.rows} 行 = 每张 ${l.perSheet} 格`
    } catch { summary = '' }
  }

  return h('div', { class: 'tiling-config', dataset: { test: 'tiling-config' } }, [
    divider('拼版打印'),
    h('p', { class: 'pd-hint', text: '把标签按「列 × 行」铺到一张大纸上批量打印' }),
    h('div', { class: 'pd-field' }, [
      h('label', { class: 'tiling-switch' }, [
        h('input', {
          type: 'checkbox', checked: cfg.enabled === true, disabled: labelContinuous,
          onChange: (ev: Event) => {
            const next = (ev.target as HTMLInputElement).checked
            // canvas onEnabledChange：打开时写入 TILE_DEFAULTS 并按纸面收敛列数
            // （目标纸很小时默认 2 列直接非法，连保存都会被拦）；关闭时保留其余字段
            if (!next) { patch({ enabled: false }); return }
            patch({ ...TILE_DEFAULTS, columns: Math.min(TILE_DEFAULTS.columns, Math.max(columnMax, 1)) })
          },
        }),
        h('span', { text: '启用拼版' }),
      ]),
      labelContinuous ? h('p', { class: 'pd-hint tiling-error', text: '连续纸不支持拼版' }) : '',
    ].filter(Boolean)),
    cfg.enabled && !labelContinuous ? [
      field('目标纸张', h('select', {
        class: 'pd-select',
        style: { width: '100%' },
        onChange: (ev: Event) => {
          const value = (ev.target as HTMLSelectElement).value
          if (value !== 'CUSTOM') { patch({ sheetPaperSize: value as TilingOptions['sheetPaperSize'] }); return }
          const current = resolveSheetMm(withTiling as never)
          // canvas onSheetPaperChange：切到 CUSTOM 时只在从未填过时补当前解析尺寸，保留用户已填值
          patch({
            sheetPaperSize: 'CUSTOM',
            sheetCustomWidth: cfg.sheetCustomWidth ?? current.width,
            sheetCustomHeight: cfg.sheetCustomHeight ?? current.height,
          })
        },
      }, [
        ...SHEET_PRESET_KEYS.map(key => h('option', {
          value: key, text: PAPER_PRESETS[key]?.label ?? key, selected: (cfg.sheetPaperSize ?? 'A4') === key,
        })),
        h('option', { value: 'CUSTOM', text: '自定义', selected: cfg.sheetPaperSize === 'CUSTOM' }),
      ])),
      cfg.sheetPaperSize === 'CUSTOM'
        ? field('目标纸宽高 (mm)', h('div', { class: 'custom-size-grid' }, [
          stepper({ value: Number(cfg.sheetCustomWidth ?? 0), min: 25, max: 2000, onCommit: v => patch({ sheetCustomWidth: v }) }),
          h('span', { class: 'custom-size-x', text: '×' }),
          stepper({ value: Number(cfg.sheetCustomHeight ?? 0), min: 25, max: 2000, onCommit: v => patch({ sheetCustomHeight: v }) }),
        ]))
        : field('目标纸方向', radioGroup('tiling-ori', [
          { value: 'portrait', label: '纵向' }, { value: 'landscape', label: '横向' },
        ], cfg.sheetOrientation === 'landscape' ? 'landscape' : 'portrait', v => patch({ sheetOrientation: v as TilingOptions['sheetOrientation'] }))),
      divider('拼版留白 (mm)'),
      h('div', { class: 'margin-grid' }, [
        field('上', stepper({ value: cfg.sheetMargin.top ?? 0, min: 0, max: 100, onCommit: v => patchMargin('top', v) })),
        field('下', stepper({ value: cfg.sheetMargin.bottom ?? 0, min: 0, max: 100, onCommit: v => patchMargin('bottom', v) })),
        field('左', stepper({ value: cfg.sheetMargin.left ?? 0, min: 0, max: 100, onCommit: v => patchMargin('left', v) })),
        field('右', stepper({ value: cfg.sheetMargin.right ?? 0, min: 0, max: 100, onCommit: v => patchMargin('right', v) })),
      ]),
      divider('格间距与列数'),
      field('横向间距', stepper({ value: cfg.gapX ?? 0, min: 0, max: 50, onCommit: v => patch({ gapX: v ?? 0 }) })),
      field('纵向间距', stepper({ value: cfg.gapY ?? 0, min: 0, max: 50, onCommit: v => patch({ gapY: v ?? 0 }) })),
      field('列数', stepper({ value: cfg.columns ?? 1, min: 1, max: columnMax, onCommit: v => patch({ columns: v || 1 }) })),
      ...issues.map(issue => h('p', { class: 'pd-hint tiling-error', text: issue.message })),
      !issues.length && summary ? h('p', { class: 'pd-hint tiling-summary', text: summary }) : '',
    ] : '',
  ].flat().filter(Boolean) as never)
}
