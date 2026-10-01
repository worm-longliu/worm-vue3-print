// 无框架 store / 格式栏的行为基线：断言的是从 canvas 移植过来的语义，
// 而不是实现细节——改这些断言前先看 canvas 侧同名用例。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../core/store'
import { FormatToolbar, MIXED } from '../core/format'

const json = (s: DesignerStore) => JSON.parse(s.getTemplateJson()) as TemplateData & { pages?: TemplateData[] }

function makeStore() {
  return new DesignerStore()
}

describe('DesignerStore：模板与运行时池', () => {
  let s: DesignerStore
  beforeEach(() => { s = makeStore() })

  it('默认模板为 A4 纵向、页边距与页眉页脚各 10mm', () => {
    const t = s.templateData
    expect(t.paperSize).toBe('A4')
    expect(t.orientation).toBe('portrait')
    expect(t.margins).toMatchObject({ top: 10, bottom: 10, left: 10, right: 10 })
    expect(t.header.height).toBe(10)
    expect(t.footer.height).toBe(10)
    expect(s.paperSize).toMatchObject({ width: 210, height: 297 })
  })

  it('三区模板加载后摊平为元素池，序列化再按 zone 拆回', () => {
    const el = (id: string, type: string, left: number) => ({
      id, type,
      options: { left, top: 5, width: 40, height: 8 },
      printElementType: { type },
    })
    s.loadTemplate({
      unit: 'mm', paperSize: 'A4', orientation: 'portrait',
      margins: { top: 10, bottom: 10, left: 10, right: 10 },
      header: { height: 10, elements: [el('h1', 'hline', 5)] },
      footer: { height: 10, elements: [el('f1', 'text', 5)] },
      elements: [el('c1', 'text', 20)],
      guides: [],
    } as never)
    const zones = s.elements.map(e => e.zone)
    expect(zones).toContain('header')
    expect(zones).toContain('footer')
    expect(s.elements.filter(e => (e.zone ?? 'content') === 'content')).toHaveLength(1)
    const out = json(s)
    expect(out.header.elements).toHaveLength(1)
    expect(out.footer.elements).toHaveLength(1)
    expect(out.elements).toHaveLength(1)
    expect(out.elements![0]!.id).toBe('c1')
  })

  it('无名页面在解析阶段补固定默认名，重排后页签不漂移', () => {
    s.addPage()
    s.addPage()
    expect(s.pages.map(p => p.name)).toEqual(['页面 1', '页面 2', '页面 3'])
    s.movePage(2, 0)
    expect(s.pages.map(p => p.name)).toEqual(['页面 3', '页面 1', '页面 2'])
  })

  it('新增页继承当前页纸张与方向（否则横版模板加出竖版页，保存被整份拦下）', () => {
    s.updateTemplateData({ orientation: 'landscape' } as never)
    s.addPage()
    const p2 = s.pages[1]!
    expect(p2.paperSize).toBe('A4')
    expect(p2.orientation).toBe('landscape')
    expect(s.pages.map(p => p.name)).toEqual(['页面 1', '页面 2'])
  })

  it('多页导出为 { version: 1, pages }、单页导出页对象（与 canvas 的 wrapper 同形）', () => {
    const single = JSON.parse(s.getTemplateJson()) as TemplateData & { pages?: unknown; version?: number }
    expect(single.pages).toBeUndefined()
    expect(single.paperSize).toBe('A4')
    s.addPage()
    const multi = JSON.parse(s.getTemplateJson()) as { version?: number; pages?: unknown[] }
    expect(multi.version).toBe(1)
    expect(multi.pages).toHaveLength(2)
  })

  it('拼版模板拦截增页并给出与 canvas 同串提示', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    s.updateTemplateData({ tiling: { enabled: true } } as never)
    expect(s.tilingEnabled).toBe(true)
    const before = s.pages.length
    s.addPage()
    expect(s.pages.length).toBe(before)
    expect(alert).toHaveBeenCalled()
    alert.mockRestore()
  })
})

describe('DesignerStore：选择、排列与历史', () => {
  let s: DesignerStore
  let a: RuntimeElement
  let b: RuntimeElement
  beforeEach(() => {
    s = makeStore()
    a = s.addElement('text', { left: 60, top: 20, width: 40, height: 8 })
    b = s.addElement('text', { left: 20, top: 50, width: 40, height: 8 })
  })

  it('框选式多选后左对齐把两者拉到同一 left', () => {
    s.select(new Set([a.id, b.id]))
    s.alignSelected('left')
    expect(s.elements.map(e => e.options.left)).toEqual([20, 20])
  })

  it('层级置顶会把元素排到数组末尾（后画即在上）', () => {
    s.select(new Set([b.id]))
    s.moveLayer('top')
    expect(s.elements[s.elements.length - 1]!.id).toBe(b.id)
  })

  it('撤销回到添加前的元素数，重做再回来', () => {
    const before = s.elements.length
    s.addElement('rect', { left: 5, top: 5, width: 20, height: 20 })
    expect(s.elements.length).toBe(before + 1)
    s.undo()
    expect(s.elements.length).toBe(before)
    s.redo()
    expect(s.elements.length).toBe(before + 1)
  })

  it('参考线增删改只作用于当前页', () => {
    s.addGuide('vertical', 42.34)
    expect(s.templateData.guides).toHaveLength(1)
    const id = s.templateData.guides![0]!.id!
    s.moveGuide(id, 88)
    expect(s.templateData.guides![0]!.position).toBe(88)
    s.removeGuide(id)
    expect(s.templateData.guides).toHaveLength(0)
  })

  it('粘贴偏移 10mm 且不改动选中项（canvas useClipboard.paste 口径）', () => {
    s.select(new Set([a.id]))
    s.copy()
    const count = s.elements.length
    s.paste()
    expect(s.elements.length).toBe(count + 1)
    expect([...s.selectedIds]).toEqual([a.id])
    const pasted = s.elements[s.elements.length - 1]!
    expect(pasted.id).not.toBe(a.id)
    expect(pasted.options.left).toBe(a.options.left + 10)
    expect(pasted.options.top).toBe(a.options.top + 10)
    s.undo()
    expect(s.elements.length).toBe(count)
  })

  it('Ctrl+D 复制选中并选中新元素，偏移 10+5mm', () => {
    s.select(new Set([a.id]))
    const count = s.elements.length
    s.duplicateSelected()
    expect(s.elements.length).toBe(count + 1)
    const dup = s.elements[s.elements.length - 1]!
    expect([...s.selectedIds]).toEqual([dup.id])
    expect(dup.options.left).toBe(a.options.left + 15)
    expect(dup.options.top).toBe(a.options.top + 15)
  })

  it('整组粘贴换发新组 id，单成员粘贴剥离组身份', () => {
    s.select(new Set([a.id, b.id]))
    s.groupSelected()
    const gid = s.elements.find(e => e.id === a.id)!.options.groupId
    expect(gid).toBeTruthy()
    s.copy()
    s.paste()
    const [p1, p2] = s.elements.slice(-2)
    expect(p1!.options.groupId).toBe(p2!.options.groupId)
    expect(p1!.options.groupId).not.toBe(gid)
    s.select(new Set([a.id]))
    s.copy()
    s.paste()
    expect(s.elements[s.elements.length - 1]!.options.groupId).toBeUndefined()
  })

  it('方向键微移跳过锁定元素、不钳到 0、连按合并为一条历史', () => {
    // undo 会整份换掉元素对象，断言一律现取（持旧引用会读到脏值）
    const leftOf = (id: string) => s.elements.find(e => e.id === id)!.options.left
    s.select(new Set([a.id, b.id]))
    s.updateElement(b.id, { locked: true } as never)
    s.moveSelected(-1, -1)
    expect(leftOf(a.id)).toBe(59)
    expect(leftOf(b.id)).toBe(20)
    s.moveSelected(-1, -1)
    s.moveSelected(-1, -1)
    expect(leftOf(a.id)).toBe(57)
    s.undo()
    expect(leftOf(a.id)).toBe(60)
  })

  it('落点归区：拖入页眉带的元素改写 zone 并换算坐标，不允许的类型被拒且不入池', () => {
    // 默认 A4 纵向、边距 10、页眉 10 → header 纸面 y∈[10,20)
    const el = s.addElement('text', {}, { x: 30, y: 15 })
    expect(el.zone).toBe('header')
    expect(el.options.left).toBe(30 - 10)
    // 落点 top=5，但文本默认高 5.3 会超出 10mm 页眉 → clampToZone 夹到 4.7
    expect(el.options.top).toBeCloseTo(4.7, 5)
    expect(json(s).header.elements.map(e => e.id)).toEqual([el.id])

    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const count = s.elements.length
    s.addElement('table', {}, { x: 30, y: 15 })
    expect(s.elements.length).toBe(count)
    expect(alert).toHaveBeenCalledWith('该元素类型不能放入页眉/页脚')
    alert.mockRestore()
  })

  it('拖拽结束按中心点归区：跨入页眉改写 zone 并换算坐标，不允许的类型退回内容区并提示', () => {
    // 默认 A4 纵向、边距 10、页眉 10 → header 纸面 y∈[10,20)、content.top=20
    const t = s.addElement('text', { left: 30, top: 5, width: 20, height: 6 })
    s.dragStart()
    s.elements.find(e => e.id === t.id)!.options.top = -10
    s.dragStop()
    const moved = s.elements.find(e => e.id === t.id)!
    expect(moved.zone).toBe('header')
    expect(moved.options.top).toBe(0)
    expect(moved.options.left).toBe(30)
    // 归区结果要能落到序列化：页眉元素进 header.elements 而不是留在内容区
    expect(json(s).header.elements.map(e => e.id)).toEqual([t.id])

    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const lt = s.addElement('longText', { left: 30, top: 5, width: 20, height: 6 })
    s.dragStart()
    s.elements.find(e => e.id === lt.id)!.options.top = -10
    s.dragStop()
    const kept = s.elements.find(e => e.id === lt.id)!
    expect(kept.zone ?? 'content').toBe('content')
    expect(kept.options.top).toBe(0)
    expect(alert).toHaveBeenCalledWith('该元素类型不能放入页眉/页脚')
    alert.mockRestore()
  })

  it('Alt+拖拽克隆：落点插入副本、选中副本、剥离组身份，撤销即移除', () => {
    const count = s.elements.length
    const el = JSON.parse(JSON.stringify(s.elements.find(e => e.id === b.id)!)) as RuntimeElement
    el.id = 'clone-1'
    el.options.left = 88
    el.options.groupId = undefined
    s.cloneElement(el)
    expect(s.elements.length).toBe(count + 1)
    expect([...s.selectedIds]).toEqual(['clone-1'])
    expect(s.elements[s.elements.length - 1]!.options.left).toBe(88)
    s.undo()
    expect(s.elements.length).toBe(count)
  })
})

describe('FormatToolbar：与 canvas 同口径的写入', () => {
  let s: DesignerStore
  let f: FormatToolbar
  let t1: RuntimeElement
  let t2: RuntimeElement
  beforeEach(() => {
    s = makeStore()
    f = new FormatToolbar(s)
    t1 = s.addElement('text', { left: 10, top: 10, width: 40, height: 8 })
    t2 = s.addElement('text', { left: 60, top: 10, width: 40, height: 8 })
    s.updateElement(t1.id, { fontSize: 12 })
    s.updateElement(t2.id, { fontSize: 20 })
  })

  it('混选字号返回 MIXED 哨兵而不是猜测值', () => {
    s.select(new Set([t1.id, t2.id]))
    expect(f.values.fontSize).toBe(MIXED)
  })

  it('格式刷以「选中集变化」为触发点：选中目标即刷过去并退出单击模式（canvas 的 watch(selectedIds)）', () => {
    s.onSelectionChanged = () => f.painterSyncSelection()
    s.select(new Set([t1.id]))
    expect(f.pickPainterSource()).toBe(true)
    s.select(new Set([t2.id]))
    expect(t2.options.fontSize).toBe(12)
    expect(f.painterActive).toBe(false)
  })

  it('连续刷（双击锁定）刷完不退出，Esc 才退', () => {
    s.onSelectionChanged = () => f.painterSyncSelection()
    s.select(new Set([t1.id]))
    f.pickPainterSource(true)
    s.select(new Set([t2.id]))
    expect(t2.options.fontSize).toBe(12)
    expect(f.painterActive).toBe(true)
    f.handlePainterKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(f.painterActive).toBe(false)
  })

  it('一致字号回显数值', () => {
    s.updateElement(t2.id, { fontSize: 12 })
    s.select(new Set([t1.id, t2.id]))
    expect(f.values.fontSize).toBe(12)
  })

  it('applyStyle 批量写入选中元素', () => {
    s.select(new Set([t1.id, t2.id]))
    f.applyStyle({ fontSize: 14 })
    expect([t1.options.fontSize, t2.options.fontSize]).toEqual([14, 14])
  })

  it('非文本元素不吃字体，但吃背景色', () => {
    const line = s.addElement('hline', { left: 10, top: 40, width: 60, height: 1 })
    s.select(new Set([line.id]))
    f.applyStyle({ fontSize: 18 })
    expect(line.options.fontSize).toBeUndefined()
    f.applyStyle({ backgroundColor: '#eee' })
    expect(line.options.backgroundColor).toBe('#eee')
  })

  it('toggleBold 在已加粗时回落为 normal', () => {
    s.select(new Set([t1.id]))
    f.toggleBold()
    expect(t1.options.fontWeight).toBe('bold')
    f.toggleBold()
    expect(t1.options.fontWeight).toBe('normal')
  })
})
