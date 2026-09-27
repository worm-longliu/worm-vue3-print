import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import FormatToolbar from '../components/FormatToolbar.vue'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import type { RuntimeElement, TableSelection, TableCell } from '@worm-vue3-print/core/designer'

function el(id: string, type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return {
    id, zone: 'content',
    printElementType: { type, title: type },
    options: { left: 0, top: 0, width: 20, height: 10, ...options },
  } as unknown as RuntimeElement
}

function tableEl(rows: TableCell[][]): RuntimeElement {
  return el('t1', 'table', {
    tableColWidths: rows[0]!.map(() => 30),
    tableRows: rows.map((cs, r) => ({
      id: `r${r}`, type: 'data', height: 8,
      cells: cs.map((c, i) => ({ ...c, id: `r${r}c${i}` })),
    })),
  })
}

function mountToolbar(elements: RuntimeElement[], selectedIds: string[], selection: TableSelection | null = null) {
  const format = useFormatToolbar({
    elements: ref(elements),
    selectedIds: ref(new Set(selectedIds)),
    tableSelection: ref(selection),
    recordHistory: () => {},
  })
  return mount(FormatToolbar, { props: { format } })
}

describe('FormatToolbar 上下文禁用', () => {
  it('无选中时加粗/对齐/边框按钮均禁用', () => {
    const w = mountToolbar([el('a', 'text')], [])
    expect(w.find('[data-test=bold]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=align-dd]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=border]').attributes('disabled')).toBeDefined()
  })

  it('混选文本与图片时字体组禁用、边框可用', () => {
    const w = mountToolbar([el('a', 'text'), el('img', 'image')], ['a', 'img'])
    expect(w.find('[data-test=bold]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=border]').attributes('disabled')).toBeUndefined()
  })

  it('单元格上下文提供下划线禁用（单元格模型无装饰线字段）', () => {
    const t = tableEl([[{ id: 'c' } as TableCell]])
    const w = mountToolbar([t], ['t1'], { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 0 })
    expect(w.find('[data-test=bold]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-test=underline]').attributes('disabled')).toBeDefined()
  })
})

describe('FormatToolbar 交互写入', () => {
  it('字号输入提交后批量写入选中文本元素', async () => {
    const a = el('a', 'text')
    const b = el('b', 'text')
    const w = mountToolbar([a, b], ['a', 'b'])
    const input = w.find('[data-test=font-size] input')
    await input.setValue('14')
    await input.trigger('change')
    expect(a.options.fontSize).toBe(14)
    expect(b.options.fontSize).toBe(14)
  })

  it('点击加粗按钮切换 fontWeight', async () => {
    const a = el('a', 'text')
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=bold]').trigger('click')
    expect(a.options.fontWeight).toBe('bold')
    await w.find('[data-test=bold]').trigger('click')
    expect(a.options.fontWeight).toBe('normal')
  })

  it('展开对齐下拉后点击水平居中写入 textAlign', async () => {
    const a = el('a', 'text')
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=align-dd]').trigger('click')
    await w.find('[data-test=align-center]').trigger('click')
    expect(a.options.textAlign).toBe('center')
  })

  it('单元格上下文字号写入选区单元格', async () => {
    const t = tableEl([[{ id: 'c' } as TableCell, { id: 'd' } as TableCell]])
    const w = mountToolbar([t], ['t1'], { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 1 })
    const input = w.find('[data-test=font-size] input')
    await input.setValue('9')
    await input.trigger('change')
    expect(t.options.tableRows![0]!.cells[0]!.fontSize).toBe(9)
    expect(t.options.tableRows![0]!.cells[1]!.fontSize).toBe(9)
  })
})

describe('FormatToolbar 边框下拉（WPS 式菜单）', () => {
  it('展开面板后「所有边框」写入元素边框参数；元素上下文「内部边框」禁用、单边可用', async () => {
    const a = el('a', 'text')
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=border]').trigger('click')
    expect(w.find('[data-test=border-panel]').exists()).toBe(true)
    expect(w.find('[data-test=preset-inner]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=edge-top]').attributes('disabled')).toBeUndefined()
    await w.find('[data-test=preset-all]').trigger('click')
    expect(a.options.borderWidth).toBeGreaterThan(0)
    expect(a.options.borderColor).toBeTruthy()
  })

  it('元素上下文单边按钮：点击写入该边并呈按下态，再点清除', async () => {
    const a = el('a', 'text')
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=border]').trigger('click')
    await w.find('[data-test=style-dashed]').trigger('click')
    const top = w.find('[data-test=edge-top]')
    expect(top.classes()).not.toContain('on')
    await top.trigger('click')
    expect(a.options.borders?.top).toMatchObject({ style: 'dashed' })
    expect(w.find('[data-test=edge-top]').classes()).toContain('on')
    await w.find('[data-test=edge-top]').trigger('click')
    expect(a.options.borders?.top).toBeUndefined()
  })

  it('「无边框」置 borderWidth 为 0', async () => {
    const a = el('a', 'text', { borderWidth: 1 })
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=border]').trigger('click')
    await w.find('[data-test=preset-none]').trigger('click')
    expect(a.options.borderWidth).toBe(0)
  })

  it('线样式例按钮切换后随预设写入 borderStyle', async () => {
    const a = el('a', 'text')
    const w = mountToolbar([a], ['a'])
    await w.find('[data-test=border]').trigger('click')
    await w.find('[data-test=style-dashed]').trigger('click')
    await w.find('[data-test=preset-all]').trigger('click')
    expect(a.options.borderStyle).toBe('dashed')
  })

  it('单元格上下文单边按钮可用：点击补齐上边框并呈按下态，再点清除', async () => {
    const t = tableEl([[{ id: 'c' } as TableCell]])
    const w = mountToolbar([t], ['t1'], { elementId: 't1', r1: 0, c1: 0, r2: 0, c2: 0 })
    await w.find('[data-test=border]').trigger('click')
    const top = w.find('[data-test=edge-top]')
    expect(top.classes()).not.toContain('on')
    await top.trigger('click')
    expect(t.options.tableRows![0]!.cells[0]!.borders?.top).toBeTruthy()
    expect(w.find('[data-test=edge-top]').classes()).toContain('on')
    await w.find('[data-test=edge-top]').trigger('click')
    expect(t.options.tableRows![0]!.cells[0]!.borders?.top).toBeUndefined()
  })
})
