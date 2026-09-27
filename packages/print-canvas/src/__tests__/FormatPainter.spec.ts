import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { effectScope, nextTick, ref } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import FormatToolbar from '../components/FormatToolbar.vue'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import { useFormatPainter } from '../composables/useFormatPainter'

function el(id: string, type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return {
    id, zone: 'content',
    printElementType: { type, title: type },
    options: { left: 0, top: 0, width: 20, height: 10, ...options },
  } as unknown as RuntimeElement
}

const SOURCE_OPTIONS = {
  fontSize: 14, fontFamily: 'SimHei', fontWeight: 'bold', color: '#ff0000',
  textAlign: 'center', verticalAlign: 'middle', textDecoration: 'underline',
  backgroundColor: '#eeeeee',
  borderWidth: 1, borderStyle: 'dashed', borderColor: '#333333',
  borders: { top: { width: 2, style: 'solid', color: '#000000' } },
  lineHeight: 1.5,
}

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => { scopes.splice(0).forEach(s => s.stop()) })

function makePainter(elements: RuntimeElement[], selectedIds: string[]) {
  const scope = effectScope()
  let historyCount = 0
  const ids = ref(new Set(selectedIds))
  const painter = scope.run(() => useFormatPainter({
    elements: ref(elements),
    selectedIds: ids,
    recordHistory: () => { historyCount++ },
  }))!
  scopes.push(scope)
  const select = async (next: string[]) => {
    ids.value = new Set(next)
    await nextTick()
  }
  return { painter, select, history: () => historyCount }
}

describe('useFormatPainter 捕获与刷取', () => {
  it('文本源刷到文本目标：整组文本格式+背景+边框覆盖，刷一次后退出', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const b = el('b', 'text', { fontSize: 9, color: '#000000', lineHeight: 2 })
    const { painter, select, history } = makePainter([a, b], ['a'])
    expect(painter.capture()).toBe(true)
    await select(['b'])
    expect(b.options).toMatchObject({
      fontSize: 14, fontFamily: 'SimHei', fontWeight: 'bold', color: '#ff0000',
      textAlign: 'center', verticalAlign: 'middle', textDecoration: 'underline',
      backgroundColor: '#eeeeee',
      borderWidth: 1, borderStyle: 'dashed', borderColor: '#333333',
    })
    expect(b.options.borders?.top).toEqual({ width: 2, style: 'solid', color: '#000000' })
    expect(b.options.lineHeight).toBe(2) // 行距不在格式刷字段集内
    expect(painter.active.value).toBe(false)
    expect(history()).toBe(1)
  })

  it('按目标类型过滤：图片只收背景色，矩形不写元素级边框', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const img = el('img', 'image')
    const rect = el('r', 'rect', { backgroundColor: '#fff', borderWidth: 3 })
    const { painter, select } = makePainter([a, img, rect], ['a'])
    painter.capture()
    await select(['img', 'r'])
    expect(img.options.backgroundColor).toBe('#eeeeee')
    expect(img.options.fontSize).toBeUndefined()
    expect(rect.options.backgroundColor).toBe('#eeeeee')
    expect(rect.options.borderWidth).toBe(3)
    expect(rect.options.borders).toBeUndefined()
  })

  it('文本字段仅写文本类目标，非文本目标不被清空', async () => {
    const a = el('a', 'text', { fontSize: 12 })
    const img = el('img', 'image')
    const { painter, select } = makePainter([a, img], ['a'])
    painter.capture()
    await select(['img'])
    expect(img.options.fontSize).toBeUndefined()
  })

  it('边框为深拷贝：目标与源的 borders 不共享引用', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const b = el('b', 'text')
    const { painter, select } = makePainter([a, b], ['a'])
    painter.capture()
    await select(['b'])
    const edge = b.options.borders?.top
    expect(edge).toBeTruthy()
    expect(edge).not.toBe(a.options.borders?.top)
    edge!.width = 9
    expect(a.options.borders?.top!.width).toBe(2)
  })

  it('双击锁定：连刷两个目标后仍保持激活', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const b = el('b', 'text')
    const c = el('c', 'text')
    const d = el('d', 'text')
    const { painter, select, history } = makePainter([a, b, c, d], ['a'])
    expect(painter.capture(true)).toBe(true)
    await select(['b'])
    expect(painter.active.value).toBe(true)
    await select(['c'])
    expect(c.options.fontSize).toBe(14)
    expect(painter.active.value).toBe(true)
    expect(history()).toBe(2)
    painter.cancel()
    await select(['d'])
    expect(d.options.fontSize).toBeUndefined()
  })

  it('清空选中即退出刷取；再改选中不写入', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const b = el('b', 'text')
    const { painter, select } = makePainter([a, b], ['a'])
    painter.capture()
    await select([])
    expect(painter.active.value).toBe(false)
    await select(['b'])
    expect(b.options.fontSize).toBeUndefined()
  })

  it('Esc 退出刷取', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const { painter } = makePainter([a], ['a'])
    painter.capture()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(painter.active.value).toBe(false)
  })

  it('框选多个目标一次提交只记一次历史', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const b = el('b', 'text')
    const c = el('c', 'text')
    const { painter, select, history } = makePainter([a, b, c], ['a'])
    painter.capture()
    await select(['b', 'c'])
    expect(b.options.fontSize).toBe(14)
    expect(c.options.fontSize).toBe(14)
    expect(history()).toBe(1)
  })
})

describe('FormatToolbar 格式刷按钮', () => {
  function mountWith(elements: RuntimeElement[], selectedIds: string[]) {
    const scope = effectScope()
    const ids = ref(new Set(selectedIds))
    const refs = scope.run(() => ({
      format: useFormatToolbar({
        elements: ref(elements), selectedIds: ids, tableSelection: ref(null), recordHistory: () => {},
      }),
      painter: useFormatPainter({
        elements: ref(elements), selectedIds: ids, recordHistory: () => {},
      }),
    }))!
    scopes.push(scope)
    return mount(FormatToolbar, { props: { format: refs.format, painter: refs.painter } })
  }

  it('单选元素时可用，点击后进入激活态并高亮，再点退出', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const w = mountWith([a], ['a'])
    const btn = w.find('[data-test=format-painter]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.find('[data-test=format-painter]').classes()).toContain('on')
    await w.find('[data-test=format-painter]').trigger('click')
    expect(w.find('[data-test=format-painter]').classes()).not.toContain('on')
  })

  it('无选中/多选时禁用并在 tip 中给出原因', () => {
    const a = el('a', 'text')
    const b = el('b', 'text')
    expect(mountWith([a, b], []).find('[data-test=format-painter]').attributes('data-tip'))
      .toContain('需选中元素')
    expect(mountWith([a, b], ['a', 'b']).find('[data-test=format-painter]').attributes('data-tip'))
      .toContain('一个源元素')
  })

  it('双击直接进入连续刷（锁定）态', async () => {
    const a = el('a', 'text', SOURCE_OPTIONS)
    const w = mountWith([a], ['a'])
    await w.find('[data-test=format-painter]').trigger('dblclick')
    expect(w.find('[data-test=format-painter]').classes()).toContain('on')
  })
})
