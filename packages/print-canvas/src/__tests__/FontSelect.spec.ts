// packages/print-canvas/src/__tests__/FontSelect.spec.ts
import { describe, it, expect } from 'vitest'
import { computed, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import FontSelect from '../components/property/FontSelect.vue'
import { FONT_CATALOG_KEY } from '../composables/useHostAdapter'
import type { FontOption } from '../composables/useFontCatalog'

const catalogOf = (fonts: Array<[string] | [string, string]>): readonly FontOption[] =>
  fonts.map(([family, label]) => (label ? { family, label } : { family }))

function mountSelect(catalog: readonly FontOption[], modelValue?: string, placeholder?: string) {
  return mount(FontSelect, {
    props: { modelValue, placeholder },
    global: { provide: { [FONT_CATALOG_KEY]: computed(() => catalog) } },
  })
}

/** 选项文案（仅列表展开时有内容） */
const optionTexts = (w: ReturnType<typeof mountSelect>) =>
  w.findAll('[role="option"]').map(o => o.text())

/** 聚焦输入框以展开列表 */
async function focus(w: ReturnType<typeof mountSelect>) {
  await w.find('input').trigger('focus')
}

/** 聚焦并输入过滤词 */
async function type(w: ReturnType<typeof mountSelect>, text: string) {
  const input = w.find('input')
  await input.trigger('focus')
  await input.setValue(text)
  return input
}

describe('FontSelect 展示与标注', () => {
  it('聚焦后列出全部声明字体', async () => {
    const w = mountSelect(catalogOf([['SimSun'], ['KaiTi']]))
    await focus(w)
    expect(optionTexts(w)).toContain('SimSun')
    expect(optionTexts(w)).toContain('KaiTi')
  })

  it('带展示名的字体显示 label 与族名', async () => {
    const w = mountSelect(catalogOf([['Ma Shan Zheng', '马善政毛笔楷书']]))
    await focus(w)
    expect(optionTexts(w)).toContain('马善政毛笔楷书（Ma Shan Zheng）')
  })

  it('首项为空值行，文案取 placeholder', async () => {
    const w = mountSelect(catalogOf([['SimSun']]), undefined, '继承默认')
    await focus(w)
    expect(optionTexts(w)[0]).toBe('继承默认')
  })

  it('输入框显示当前值的展示名', () => {
    const w = mountSelect(catalogOf([['Ma Shan Zheng', '马善政毛笔楷书']]), 'Ma Shan Zheng')
    expect((w.find('input').element as HTMLInputElement).value).toBe('马善政毛笔楷书')
  })

  it('选择带展示名的项时写入模板的仍是族名', async () => {
    const w = mountSelect(catalogOf([['Ma Shan Zheng', '马善政毛笔楷书']]), 'Ma Shan Zheng')
    await focus(w)
    const option = w.findAll('[role="option"]').find(o => o.text().startsWith('马善政毛笔楷书'))
    await option!.trigger('mousedown')
    expect(w.emitted('update:model-value')?.at(-1)).toEqual(['Ma Shan Zheng'])
  })

  it('当前值不在声明内时补一项并标注未知', async () => {
    const w = mountSelect(catalogOf([['SimSun']]), 'Comic Sans MS')
    await focus(w)
    expect(optionTexts(w)).toContain('Comic Sans MS（未知）')
  })

  it('当前值在声明内时不产生未知项', async () => {
    const w = mountSelect(catalogOf([['SimSun']]), 'SimSun')
    await focus(w)
    expect(w.text()).not.toContain('（未知）')
  })
})

describe('FontSelect 模糊搜索', () => {
  const catalog = catalogOf([
    ['Microsoft YaHei'],
    ['MS SimHei'],
    ['SimSun'],
    ['KaiTi'],
  ])

  it('子串过滤，大小写与空格不敏感', async () => {
    const w = mountSelect(catalog)
    await type(w, '  YAHEI ')
    expect(optionTexts(w)).toEqual(['Microsoft YaHei'])
  })

  it('子序列过滤（首字母缩写）', async () => {
    const w = mountSelect(catalog)
    await type(w, 'msyh')
    expect(optionTexts(w)).toEqual(['Microsoft YaHei'])
  })

  it('按 label 搜索命中，回车提交族名而非展示名', async () => {
    const w = mountSelect(catalogOf([['Ma Shan Zheng', '马善政毛笔楷书']]))
    const input = await type(w, '马善政')
    expect(optionTexts(w)).toEqual(['马善政毛笔楷书（Ma Shan Zheng）'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['Ma Shan Zheng'])
  })

  it('过滤后隐藏空值行与未知行，只留命中项', async () => {
    const w = mountSelect(catalog, 'Comic Sans MS')
    await type(w, 'sim')
    expect(optionTexts(w)).toEqual(['SimSun', 'MS SimHei'])
  })

  it('无匹配时给出「使用」行，可直接录入声明外的字体名', async () => {
    const w = mountSelect(catalog)
    const input = await type(w, 'Comic Sans MS')
    expect(optionTexts(w)).toEqual(['使用「Comic Sans MS」'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['Comic Sans MS'])
  })

  it('输入过程不提交，避免每敲一个字就写一次历史', async () => {
    const w = mountSelect(catalog)
    await type(w, 'msyh')
    expect(w.emitted('update:model-value')).toBeUndefined()
  })

  it('宿主未声明字体时退化为纯文本录入', async () => {
    const w = mountSelect(catalogOf([]))
    const input = await type(w, 'FZSongKeBenXiuKai')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['FZSongKeBenXiuKai'])
  })
})

describe('FontSelect 键盘与提交', () => {
  const catalog = catalogOf([
    ['Microsoft YaHei'],
    ['SimSun'],
  ])

  it('点击列表项提交族名', async () => {
    const w = mountSelect(catalog)
    await focus(w)
    await w.findAll('[role="option"]').find(o => o.text().startsWith('SimSun'))!.trigger('mousedown')
    expect(w.emitted('update:model-value')?.[0]).toEqual(['SimSun'])
  })

  it('↓ 移动高亮后 Enter 提交高亮项', async () => {
    const w = mountSelect(catalog)
    const input = await type(w, 'sim')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['SimSun'])
  })

  it('↑ 不会越过首项', async () => {
    const w = mountSelect(catalog)
    const input = await type(w, 'sim')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['SimSun'])
  })

  it('提交空值行时 emit undefined（清除字体）', async () => {
    const w = mountSelect(catalog, 'SimSun')
    await focus(w)
    await w.findAll('[role="option"]')[0]!.trigger('mousedown')
    expect(w.emitted('update:model-value')?.[0]).toEqual([undefined])
  })

  it('Esc 关闭列表且不提交', async () => {
    const w = mountSelect(catalog, 'SimSun')
    const input = await type(w, 'sim')
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('update:model-value')).toBeUndefined()
    expect(w.findAll('[role="option"]')).toHaveLength(0)
    expect((input.element as HTMLInputElement).value).toBe('SimSun')
  })

  it('失焦恢复显示原值且不提交', async () => {
    const w = mountSelect(catalog, 'SimSun')
    const input = await type(w, 'kai')
    await input.trigger('blur')
    expect(w.emitted('update:model-value')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('SimSun')
  })
})

describe('FontSelect 列表 id 关联', () => {
  const catalog = catalogOf([['SimSun']])

  it('输入框的 aria-controls 指向展开的列表', async () => {
    const w = mountSelect(catalog)
    await focus(w)
    expect(w.find('input').attributes('aria-controls')).toBe(w.find('ul').attributes('id'))
  })

  it('同一应用内多个实例的列表 id 互不相同', async () => {
    const Wrapper = defineComponent({
      components: { FontSelect },
      template: '<div><FontSelect /><FontSelect /></div>',
    })
    const w = mount(Wrapper, {
      global: { provide: { [FONT_CATALOG_KEY]: computed(() => catalog) } },
    })
    const inputs = w.findAll('input')
    await inputs[0]!.trigger('focus')
    await inputs[1]!.trigger('focus')
    const [first, second] = w.findAll('ul')
    expect(first!.attributes('id')).toBeTruthy()
    expect(second!.attributes('id')).not.toBe(first!.attributes('id'))
  })
})
