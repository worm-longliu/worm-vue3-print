// print-canvas/src/__tests__/print-designer-geometry.spec.ts
// 出纸裁切提示（编辑期预估）：不阻断保存，但必须让用户在点保存时看到「会被裁切」。
// 与出纸同一实现（core collectPrintWarnings → paginate），只是没有实测高，故只提示不拦。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrintDesigner from '../components/PrintDesigner.vue'
import DesignerToolbar from '../components/DesignerToolbar.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function a4(elements: TemplateData['elements']): TemplateData {
  return {
    // unit: 'mm' 必须显式声明——缺省视为历史 pt 模板，载入时会被 normalizeTemplateUnits 换算
    unit: 'mm',
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
  } as TemplateData
}

/** ElementOptions 的 left/top/width/height 是必填项，夹具按同一形状声明 */
type Box = { left: number; top: number; width: number; height: number; [key: string]: any }

const el = (id: string, options: Box) => ({
  id,
  type: 'text' as const,
  options,
  printElementType: { type: 'text' as const, title: '文本' },
})

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

describe('保存闸门的出纸裁切提示', () => {
  it('元素超出纸面右缘：仍正常保存，并弹一次「出纸提示」说明会被裁切', async () => {
    const wrapper = mountDesigner(a4([el('t1', { left: 150, top: 100, width: 100, height: 20, formatter: 'X' })]))
    await clickSave(wrapper)

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const msg = String(alertSpy.mock.calls[0]![0])
    expect(msg).toContain('出纸提示')
    expect(msg).toContain('t1')
    expect(msg).toContain('50')
  })

  it('旋转元素顶越界同样给提示', async () => {
    const wrapper = mountDesigner(a4([el('r1', { left: 20, top: 10, width: 100, height: 20, rotate: 45, formatter: 'Y' })]))
    await clickSave(wrapper)
    expect(String(alertSpy.mock.calls[0]![0])).toContain('22.43')
  })

  it('干净模板不打扰（无提示、正常保存）', async () => {
    const wrapper = mountDesigner(a4([el('t1', { left: 20, top: 100, width: 100, height: 20, formatter: 'X' })]))
    await clickSave(wrapper)
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('暴露 getGeometryWarnings()：宿主可在导出旁路自行拦截同一批文案', () => {
    const wrapper = mountDesigner(a4([el('t1', { left: 150, top: 100, width: 100, height: 20, formatter: 'X' })]))
    const warnings = wrapper.vm.getGeometryWarnings() as string[]
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('超出纸面右侧')
  })

  it('拼版非法优先阻断，且不叠加出纸提示（一次只说一件事）', async () => {
    const tpl = a4([el('t1', { left: 150, top: 100, width: 100, height: 20, formatter: 'X' })])
    tpl.tiling = {
      enabled: true, sheetPaperSize: 'A4', sheetOrientation: 'portrait',
      sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 }, gapX: 2, gapY: 2, columns: 9,
    }
    const wrapper = mountDesigner(tpl)
    await clickSave(wrapper)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(String(alertSpy.mock.calls[0]![0])).toContain('最多可放')
  })
})
