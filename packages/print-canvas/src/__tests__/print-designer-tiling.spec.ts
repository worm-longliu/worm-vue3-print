// print-canvas/src/__tests__/print-designer-tiling.spec.ts
// 拼版保存闸门：非法配置不允许保存，且给出原因并把用户带到配置所在页签。
// 同时验证 tiling 字段能穿过模板载入（迁移 + Runtime 池）存活。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrintDesigner from '../components/PrintDesigner.vue'
import DesignerToolbar from '../components/DesignerToolbar.vue'
import PropertyPanel from '../components/PropertyPanel.vue'
import PageTabs from '../components/PageTabs.vue'
import { TILE_DEFAULTS } from '@worm-vue3-print/core'
import type { TilingOptions } from '@worm-vue3-print/core'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function tilingTemplate(
  tiling: Partial<TilingOptions> = {},
  overrides: Partial<TemplateData> = {},
): TemplateData {
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
    tiling: { ...TILE_DEFAULTS, ...tiling },
    ...overrides,
  } as TemplateData
}

function mountDesigner(template: TemplateData) {
  return mount(PrintDesigner, { props: { initialTemplate: template } })
}

async function clickSave(wrapper: ReturnType<typeof mountDesigner>) {
  wrapper.findComponent(DesignerToolbar).vm.$emit('save')
  await wrapper.vm.$nextTick()
}

const alertSpy = vi.fn()
vi.stubGlobal('alert', alertSpy)

afterEach(() => {
  alertSpy.mockClear()
})

describe('拼版保存闸门', () => {
  it('配置合法时正常保存，且 tiling 随模板落盘（载入未丢字段）', async () => {
    const wrapper = mountDesigner(tilingTemplate())
    await clickSave(wrapper)

    const events = wrapper.emitted('save')
    expect(events).toHaveLength(1)
    const json = JSON.parse(events![0]![0] as string) as TemplateData
    expect(json.tiling?.enabled).toBe(true)
    expect(json.tiling?.columns).toBe(2)
    expect(json.tiling?.sheetPaperSize).toBe('A4')
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('列数超宽：不触发 save、弹出原因、切到页面属性页签', async () => {
    const wrapper = mountDesigner(tilingTemplate({ columns: 5 }))
    await clickSave(wrapper)

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy.mock.calls[0]![0]).toContain('最多可放 2 列')
    expect(wrapper.findComponent(PropertyPanel).props('activeTab')).toBe('page')
  })

  it('连续纸模板开启拼版：保存被拦并提示', async () => {
    const wrapper = mountDesigner(tilingTemplate({}, {
      paperSize: 'CONTINUOUS',
      customWidth: 80,
    }))
    await clickSave(wrapper)

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(alertSpy.mock.calls[0]![0]).toContain('连续纸不支持拼版')
  })

  it('未开启拼版时不校验（列数超宽也照常保存）', async () => {
    const wrapper = mountDesigner(tilingTemplate({ columns: 5, enabled: false }))
    await clickSave(wrapper)

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('expose validateTemplate 供宿主在旁路（导出/另存）拦截', async () => {
    const bad = mountDesigner(tilingTemplate({ columns: 5 }))
    // 先切到「元素」页签，验证纯查询不会把用户拽回页面属性页签
    bad.findComponent(PropertyPanel).vm.$emit('update:activeTab', 'element')
    await bad.vm.$nextTick()

    const issues = (bad.vm as unknown as { validateTemplate: () => Array<{ code: string }> })
      .validateTemplate()

    expect(issues).toHaveLength(1)
    expect(issues[0]!.code).toBe('COLUMNS_OVERFLOW')
    // 纯查询：不弹窗、不切页签、不落盘（副作用交给调用方决定）
    expect(alertSpy).not.toHaveBeenCalled()
    expect(bad.findComponent(PropertyPanel).props('activeTab')).toBe('element')
    expect(bad.emitted('save')).toBeUndefined()

    const ok = mountDesigner(tilingTemplate())
    const none = (ok.vm as unknown as { validateTemplate: () => unknown[] }).validateTemplate()
    expect(none).toEqual([])
  })

  it('开启拼版后页签增页入口禁用：拼版模板只能有一个设计页面', () => {
    const on = mountDesigner(tilingTemplate())
    const onTabs = on.findComponent(PageTabs)
    expect(onTabs.props('tilingEnabled')).toBe(true)
    expect(onTabs.find('[data-test="add-page"]').attributes('disabled')).toBeDefined()
    expect(onTabs.find('[data-test="duplicate-page"]').attributes('disabled')).toBeDefined()

    const off = mountDesigner(tilingTemplate({ enabled: false }))
    const offTabs = off.findComponent(PageTabs)
    expect(offTabs.props('tilingEnabled')).toBe(false)
    expect(offTabs.find('[data-test="add-page"]').attributes('disabled')).toBeUndefined()
    expect(offTabs.find('[data-test="duplicate-page"]').attributes('disabled')).toBeUndefined()
  })

  it('非法拼版配置不妨碍预览（预览是诊断路径，不被保存闸门连带拦死）', async () => {
    const wrapper = mountDesigner(tilingTemplate({ columns: 5 }))
    wrapper.findComponent(DesignerToolbar).vm.$emit('preview')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('preview')).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
