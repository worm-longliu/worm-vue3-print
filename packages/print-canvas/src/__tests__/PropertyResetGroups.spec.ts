import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import AdvancedGroup from '../components/property/AdvancedGroup.vue'
import TableSettingsGroup from '../components/property/TableSettingsGroup.vue'
import { createDefaultOptions } from '@worm-vue3-print/core/designer'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'

function makeElement(type: 'text' | 'table', options: Record<string, any> = {}): RuntimeElement {
  return reactive({
    id: 'el-1',
    options: { ...createDefaultOptions(type), ...options },
    printElementType: { type, title: type },
  }) as unknown as RuntimeElement
}

const TABLE_EDIT_PROVIDE = { tableSelection: { value: null }, setTableSelection: () => {}, recordHistory: () => {}, maxTableWidth: { value: Infinity } }

/** 按标签文本定位属性行。用 .pd-label 而非 .pd-label-t：后者只存在于已接入的行，排除项行要能查到才能断言"没挂图标" */
function rowOf(w: any, text: string) {
  const row = w.findAll('.pd-field').find((f: any) => f.find('.pd-label').exists() && f.find('.pd-label').text().includes(text))
  if (!row) throw new Error(`未找到属性行：${text}`)
  return row
}

describe('AdvancedGroup「恢复默认值」', () => {
  function mountAdvanced(element: RuntimeElement) {
    return mount(AdvancedGroup, { props: { element } })
  }

  it('锁定/每页重复/每页固定/层级都挂图标，且出厂未设 ⇒ 灰态', () => {
    const w = mountAdvanced(makeElement('text'))
    for (const t of ['锁定', '每页重复', '每页固定', '层级']) {
      const btn = rowOf(w, t).find('.pd-reset-btn')
      expect(btn.exists()).toBe(true)
      expect(btn.classes()).not.toContain('is-dirty')
    }
  })

  it('设过之后变亮态，点击写回 undefined（删键）', async () => {
    const element = makeElement('text', { locked: true, zIndex: 5 })
    const w = mountAdvanced(element)
    const lock = rowOf(w, '锁定').find('.pd-reset-btn')
    expect(lock.classes()).toContain('is-dirty')
    await lock.trigger('click')
    expect(element.options.locked).toBeUndefined()
    await rowOf(w, '层级').find('.pd-reset-btn').trigger('click')
    expect(element.options.zIndex).toBeUndefined()
  })

  it('「删除元素」按钮那行不挂图标', () => {
    expect(mountAdvanced(makeElement('text')).find('.pd-button.danger .pd-reset-btn').exists()).toBe(false)
  })

  it('图标不带文字，标签文本不被污染', () => {
    const w = mountAdvanced(makeElement('text', { locked: true }))
    for (const l of w.findAll('.pd-label')) expect(l.text()).not.toContain('默认')
  })
})

describe('TableSettingsGroup「恢复默认值」', () => {
  function mountSettings(element: RuntimeElement) {
    return mount(TableSettingsGroup, {
      props: { element, fields: [] },
      global: { provide: { [TABLE_EDIT_KEY as symbol]: TABLE_EDIT_PROVIDE } },
    })
  }

  it('表格级默认三项的落点是字面值而非删键：字号 10 / 颜色 #333333 / 内边距 1', async () => {
    const element = makeElement('table', { tableDefaultFontSize: 14, tableDefaultColor: '#ff0000', tableDefaultPadding: 3 })
    const w = mountSettings(element)
    await rowOf(w, '默认字号').find('.pd-reset-btn').trigger('click')
    expect(element.options.tableDefaultFontSize).toBe(10)
    await rowOf(w, '默认文字颜色').find('.pd-reset-btn').trigger('click')
    expect(element.options.tableDefaultColor).toBe('#333333')
    await rowOf(w, '默认内边距').find('.pd-reset-btn').trigger('click')
    expect(element.options.tableDefaultPadding).toBe(1)
  })

  it('三项出厂即被写上 ⇒ 未改过时灰态', () => {
    const w = mountSettings(makeElement('table'))
    for (const t of ['默认字号', '默认文字颜色', '默认内边距']) {
      expect(rowOf(w, t).find('.pd-reset-btn').classes()).not.toContain('is-dirty')
    }
  })

  it('「列表数据源字段」与「列宽」两行不挂图标（数据绑定与数组结构）', () => {
    const w = mountSettings(makeElement('table'))
    for (const t of ['列表数据源字段', '列宽']) {
      expect(rowOf(w, t).find('.pd-reset-btn').exists()).toBe(false)
    }
  })
})
