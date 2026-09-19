// print-canvas/src/__tests__/TilingConfig.spec.ts
// 拼版配置面板：开关联动、目标纸（含自定义）、方向、实时摘要与红字。
// 校验与摘要全部来自 core 的纯函数，面板只负责展示与写回。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TilingConfig from '../components/property/TilingConfig.vue'
import { TILE_DEFAULTS } from '@worm-vue3-print/core'
import type { TilingOptions } from '@worm-vue3-print/core'
import type { TemplateData } from '@worm-vue3-print/core/designer'

/** 70×40mm 标签模板 */
function labelTemplate(overrides: Partial<TemplateData> = {}): TemplateData {
  return {
    paperSize: 'CUSTOM',
    orientation: 'portrait',
    customWidth: 70,
    customHeight: 40,
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    ...overrides,
  } as TemplateData
}

function lastEmit(wrapper: ReturnType<typeof mount>): TilingOptions | undefined {
  const emitted = wrapper.emitted('update:modelValue') ?? []
  return emitted[emitted.length - 1]?.[0] as TilingOptions | undefined
}

/** 列数输入框是本组件最后一个 StepperInput */
function columnInput(wrapper: ReturnType<typeof mount>) {
  const inputs = wrapper.findAll('.pd-step-input')
  return inputs[inputs.length - 1]!
}

const SWITCH = '.tiling-switch input'

describe('TilingConfig', () => {
  it('未配置拼版的模板开关为关闭态（不误显示为已开启）', () => {
    const wrapper = mount(TilingConfig, { props: { templateData: labelTemplate() } })
    expect((wrapper.find(SWITCH).element as HTMLInputElement).checked).toBe(false)
  })

  it('勾选开关写入 TILE_DEFAULTS', async () => {
    const wrapper = mount(TilingConfig, { props: { templateData: labelTemplate() } })
    await wrapper.find(SWITCH).setValue(true)
    const last = lastEmit(wrapper)
    expect(last?.enabled).toBe(true)
    expect(last?.columns).toBe(2)
    expect(last?.sheetPaperSize).toBe('A4')
    expect(last?.sheetOrientation).toBe('portrait')
    expect(last?.sheetMargin).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
    expect(last?.gapX).toBe(2)
    expect(last?.gapY).toBe(2)
  })

  it('关闭拼版保留其余字段（再次打开不丢配置）', async () => {
    const wrapper = mount(TilingConfig, {
      props: {
        templateData: labelTemplate(),
        modelValue: { ...TILE_DEFAULTS, columns: 1, gapX: 5 },
      },
    })
    await wrapper.find(SWITCH).setValue(false)
    const last = lastEmit(wrapper)
    expect(last?.enabled).toBe(false)
    expect(last?.columns).toBe(1)
    expect(last?.gapX).toBe(5)
  })

  it('目标纸放不下默认列数时，勾选开关把列数收敛为 1', async () => {
    // 标签宽 200mm > A4 可用宽 190mm → maxColumns=0 → 收敛为 1（否则一开拼版就非法到无法保存）
    const wrapper = mount(TilingConfig, {
      props: {
        templateData: labelTemplate({ customWidth: 200 }),
        modelValue: { ...TILE_DEFAULTS, enabled: false },
      },
    })
    await wrapper.find(SWITCH).setValue(true)
    expect(lastEmit(wrapper)?.columns).toBe(1)
  })

  it('开启时显示实时摘要，切到横向目标纸后行列随之更新', async () => {
    const wrapper = mount(TilingConfig, {
      props: { templateData: labelTemplate(), modelValue: { ...TILE_DEFAULTS } },
    })
    expect(wrapper.find('.tiling-summary').text()).toContain('A4 纵向 210×297mm')
    expect(wrapper.find('.tiling-summary').text()).toContain('2 列 × 6 行 = 每张 12 格')

    await wrapper.setProps({ modelValue: { ...TILE_DEFAULTS, sheetOrientation: 'landscape' } })
    expect(wrapper.find('.tiling-summary').text()).toContain('A4 横向 297×210mm')
    expect(wrapper.find('.tiling-summary').text()).toContain('2 列 × 4 行 = 每张 8 格')
  })

  it('选「自定义」后补上当前解析尺寸并露出宽高输入', async () => {
    const wrapper = mount(TilingConfig, {
      props: { templateData: labelTemplate(), modelValue: { ...TILE_DEFAULTS } },
    })
    await wrapper.find('select').setValue('CUSTOM')
    const last = lastEmit(wrapper)
    expect(last?.sheetPaperSize).toBe('CUSTOM')
    expect(last?.sheetCustomWidth).toBe(210)
    expect(last?.sheetCustomHeight).toBe(297)

    const custom = mount(TilingConfig, {
      props: { templateData: labelTemplate(), modelValue: last },
    })
    expect(custom.findAll('.custom-size-grid .pd-stepper')).toHaveLength(2)
    // CUSTOM 宽高已定，方向不适用，不再显示方向单选
    expect(custom.find('.pd-radio-group').exists()).toBe(false)
  })

  it('自定义目标纸放不下标签时给出红字，且摘要不展示', () => {
    const wrapper = mount(TilingConfig, {
      props: {
        templateData: labelTemplate(),
        modelValue: {
          ...TILE_DEFAULTS,
          sheetPaperSize: 'CUSTOM',
          // 宽 100mm 容得下 1 列 70mm 标签，高 30mm 容不下 40mm 标签 → 只报高度问题
          sheetCustomWidth: 100,
          sheetCustomHeight: 30,
          columns: 1,
          sheetMargin: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      },
    })
    expect(wrapper.find('.tiling-error').text()).toContain('超出纸面可用高度')
    expect(wrapper.find('.tiling-summary').exists()).toBe(false)
  })

  it('列数超宽时红字含「最多可放」，且输入框不被静默改写（只预警不阻断）', async () => {
    const wrapper = mount(TilingConfig, {
      props: {
        templateData: labelTemplate(),
        modelValue: { ...TILE_DEFAULTS, columns: 5 },
      },
    })
    expect(wrapper.find('.tiling-error').text()).toContain('最多可放 2 列')
    expect((columnInput(wrapper).element as HTMLInputElement).value).toBe('5')

    // 输入上限被约束为可放列数，避免用户继续往上调
    expect(columnInput(wrapper).attributes('max')).toBe('2')

    await wrapper.setProps({ modelValue: { ...TILE_DEFAULTS, columns: 2 } })
    expect(wrapper.find('.tiling-error').exists()).toBe(false)
    expect(wrapper.find('.tiling-summary').exists()).toBe(true)
  })

  it('连续纸模板：开关置灰并提示', () => {
    const wrapper = mount(TilingConfig, {
      props: { templateData: labelTemplate({ paperSize: 'CONTINUOUS', customWidth: 80 }) },
    })
    expect((wrapper.find(SWITCH).element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('连续纸不支持拼版')
  })
})
