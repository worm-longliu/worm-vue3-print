// print-canvas/src/__tests__/element-rotate-gate.spec.ts
// 元素级旋转的归属门禁（spec 2026-10-27 契约四/五）：
// 契约四 —— table/flowList 与「表格跟随区成员」v1 忽略 rotate：渲染不转、属性台不出输入框；
// 契约五 —— barcode/qrcode 非直角档需 ≥385dpi 打印头，无承诺时输入框置灰、只留 90° 步进。
// 判据必须来自 core 单点，画布所见必须等于出纸结果。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import AppearanceGroup from '../components/property/AppearanceGroup.vue'
import BaseElement from '../components/elements/BaseElement.vue'
import { SELECTED_IDS_KEY } from '../composables/useSelection'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { collectFollowMemberIds } from '@worm-vue3-print/core/designer'

function mkEl(id: string, type: string, options: Record<string, any> = {}): RuntimeElement {
  return {
    id,
    options: { left: 0, top: 0, width: 42.3, height: 7.1, fontSize: 12, formatter: '文本', ...options },
    printElementType: { type, title: type },
  } as unknown as RuntimeElement
}

/** 表格（设计底部 = top 10 + height 24 = 34）与其下方的跟随区成员 */
const TABLE = mkEl('tbl', 'table', { left: 10, top: 10, width: 100, height: 24, tableColWidths: [40, 60], tableRows: [] })
const FOLLOWER = mkEl('f1', 'text', { left: 10, top: 40, width: 40, height: 8, rotate: 45 })
const OUTSIDE = mkEl('far', 'text', { left: 120, top: 40, width: 30, height: 8, rotate: 45 })

function mountGroup(element: RuntimeElement, extraProps: Record<string, any> = {}) {
  return mount(AppearanceGroup, {
    props: { element, isTextType: element.printElementType.type === 'text', ...extraProps },
  })
}

function rotateField(wrapper: ReturnType<typeof mountGroup>) {
  return wrapper.findAll('.pd-field').find(f => f.text().includes('旋转 (°)')) ?? null
}

function mountBase(element: RuntimeElement, allElements: RuntimeElement[]) {
  return mount(BaseElement, {
    props: {
      element,
      designMode: true,
      scale: 1,
      allElements,
      followMemberIds: collectFollowMemberIds(allElements),
    },
    global: { provide: { [SELECTED_IDS_KEY as symbol]: ref(new Set<string>()) } },
  })
}

describe('AppearanceGroup 旋转行归属门禁（契约四）', () => {
  it('普通文本元素出旋转行', () => {
    expect(rotateField(mountGroup(mkEl('t', 'text')))).not.toBeNull()
  })

  it('表格元素不出旋转行', () => {
    expect(rotateField(mountGroup(TABLE))).toBeNull()
  })

  it('表格跟随区成员不出旋转行（出纸忽略其 rotate，画布不得给输入框）', () => {
    const w = mountGroup(FOLLOWER, { followMemberIds: new Set(['f1']) })
    expect(rotateField(w)).toBeNull()
  })

  it('与表格横向零交集的元素照常出旋转行', () => {
    const w = mountGroup(OUTSIDE, { followMemberIds: new Set(['f1']) })
    expect(rotateField(w)).not.toBeNull()
  })
})

describe('AppearanceGroup 码类斜角置灰（契约五）', () => {
  const stepperInput = (w: ReturnType<typeof mountGroup>) =>
    w.find('.pd-rotate-stepper input').element as HTMLInputElement

  it('条码未声明 printerDpi：角度输入框禁用并给 90° 步进提示', () => {
    const w = mountGroup(mkEl('b', 'barcode', { testData: '12345678' }))
    expect(stepperInput(w).disabled).toBe(true)
    expect(w.find('.pd-rotate-note').text()).toContain('90° 步进')
  })

  it('二维码与条码同口径（未声明 printerDpi 也置灰）', () => {
    const w = mountGroup(mkEl('q', 'qrcode', { testData: 'ABC' }))
    expect(stepperInput(w).disabled).toBe(true)
  })

  it('声明 printerDpi ≥385：角度输入框放开', () => {
    const w = mountGroup(mkEl('b', 'barcode', { testData: '12345678', printerDpi: 385 }))
    expect(stepperInput(w).disabled).toBe(false)
    expect(w.find('.pd-rotate-note').exists()).toBe(false)
  })

  it('声明低 dpi（203）同样置灰，90° 步进按钮仍可用', () => {
    const w = mountGroup(mkEl('b', 'barcode', { testData: '12345678', printerDpi: 203 }))
    expect(stepperInput(w).disabled).toBe(true)
    const btns = w.findAll('.pd-rotate-btn')
    expect(btns).toHaveLength(2)
    expect((btns[1].element as HTMLButtonElement).disabled).toBe(false)
  })

  it('非码类元素不受影响', () => {
    const w = mountGroup(mkEl('t', 'text'))
    expect(stepperInput(w).disabled).toBe(false)
    expect(w.find('.pd-rotate-note').exists()).toBe(false)
  })

  it('置灰状态下点 90° 步进仍可写入角度', async () => {
    const el = mkEl('b', 'barcode', { testData: '12345678' })
    const w = mountGroup(el)
    await w.findAll('.pd-rotate-btn')[1].trigger('click')
    expect(el.options.rotate).toBe(90)
  })
})

describe('BaseElement 旋转声明与出纸同口径', () => {
  it('跟随区成员不写 rotate（画布所见 = 出纸不转）', () => {
    const w = mountBase(FOLLOWER, [TABLE, FOLLOWER, OUTSIDE])
    const style = w.find('.print-element').attributes('style') ?? ''
    expect(style).not.toContain('rotate')
  })

  it('非成员元素照常写 rotate', () => {
    const w = mountBase(OUTSIDE, [TABLE, FOLLOWER, OUTSIDE])
    expect(w.find('.print-element').attributes('style') ?? '').toContain('rotate: 45deg')
  })

  it('无表格场景（如页眉页脚）不受归属判据影响', () => {
    const w = mountBase(mkEl('h', 'text', { top: 0, rotate: 30 }), [mkEl('h', 'text', { top: 0, rotate: 30 })])
    expect(w.find('.print-element').attributes('style') ?? '').toContain('rotate: 30deg')
  })
})
