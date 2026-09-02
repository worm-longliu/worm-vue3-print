import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableSettingsGroup from '../components/property/TableSettingsGroup.vue'
import type { RuntimeElement } from '../types'

const tableElement = {
  id: 't1',
  zone: 'content',
  printElementType: { type: 'table', title: '表格' },
  options: {
    left: 0, top: 0, width: 100, height: 20,
    dataSource: undefined,
    tableRows: [],
    tableColWidths: [20, 20],
  },
} as unknown as RuntimeElement

const fields = [
  { fieldKey: 'name', fieldLabel: '名称', fieldType: 'string', sortOrder: 1 },
  { fieldKey: 'goods', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 0 },
  { fieldKey: 'logs', fieldLabel: '操作日志', fieldType: 'list', sortOrder: 2 },
]

describe('TableSettingsGroup 列表数据源', () => {
  it('仅列出 fieldType=list 的宿主字段', () => {
    const wrapper = mount(TableSettingsGroup, {
      props: { element: tableElement, fields },
    })
    const options = wrapper.findAll('select option').map(o => o.text())
    expect(options).toContain('商品明细')
    expect(options).toContain('操作日志')
    expect(options).not.toContain('名称')
  })

  it('宿主未传入 list 字段时下拉为空', () => {
    const wrapper = mount(TableSettingsGroup, {
      props: { element: tableElement, fields: fields.filter(f => f.fieldType !== 'list') },
    })
    expect(wrapper.findAll('select option').length).toBe(0)
  })
})
