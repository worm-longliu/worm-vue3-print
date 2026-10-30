import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import PropertyPanel from '../components/PropertyPanel.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'
import type { RuntimeElement, TableSelection, TemplateData } from '@worm-vue3-print/core/designer'

function tpl(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function makeTable(rowCells: Array<Array<any>>): RuntimeElement {
  return reactive({
    id: 'el-table',
    options: {
      tableColWidths: rowCells[0]!.map(() => 50),
      tableRows: rowCells.map((cells, ri) => ({
        id: `r${ri}`, type: 'data', height: 10,
        cells: cells.map((cell, ci) => ({ id: `c${ri}-${ci}`, ...cell })),
      })),
    },
    printElementType: { type: 'table', title: '表格' },
  }) as unknown as RuntimeElement
}

function mountPanel(element: RuntimeElement, selection?: TableSelection) {
  return mount(PropertyPanel, {
    props: {
      element,
      templateData: tpl(),
      fields: [],
      activeTab: 'element',
      tableSelection: selection,
      collapsed: false,
    },
    global: {
      provide: {
        [TABLE_EDIT_KEY as symbol]: {
          tableSelection: { value: selection },
          setTableSelection: () => {},
          recordHistory: () => {},
          maxTableWidth: { value: 190 },
        },
      },
    },
  })
}

const titles = (w: ReturnType<typeof mountPanel>) =>
  w.findAll('.group-title').map(t => t.text())

describe('PropertyPanel 单元格「内容」绑定组的单选门控', () => {
  it('单选单元格：出「内容」绑定组（逐格回显可编辑）', () => {
    const element = makeTable([[{ formatter: 'A' }, { formatter: 'B' }]])
    const w = mountPanel(element, { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 0 })
    expect(titles(w)).toContain('内容')
  })

  it('多选单元格：整组让位，避免按 r1,c1 只回显/只写第一格', () => {
    const element = makeTable([[{ formatter: 'A' }, { formatter: 'B' }]])
    const w = mountPanel(element, { elementId: 'el-table', r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(titles(w)).not.toContain('内容')
    expect(titles(w)).toContain('单元格')
  })

  it('跨行合并格只有一个可写主格：仍算单选，保留「内容」组', () => {
    const element = makeTable([[{ rowspan: 2, formatter: '合并' }], [{ merged: true }]])
    const w = mountPanel(element, { elementId: 'el-table', r1: 0, c1: 0, r2: 1, c2: 0 })
    expect(titles(w)).toContain('内容')
  })
})

describe('PropertyPanel 元素属性页签的分组顺序', () => {
  it('「内容」绑定组置顶：作者最常改的一栏排在位置/外观之前', () => {
    const element = reactive({
      id: 'el-text',
      options: { left: 0, top: 0, width: 30, height: 10, formatter: '文本' },
      printElementType: { type: 'text', title: '文本' },
    }) as unknown as RuntimeElement
    const w = mountPanel(element)
    expect(titles(w)[0]).toBe('内容')
  })
})
