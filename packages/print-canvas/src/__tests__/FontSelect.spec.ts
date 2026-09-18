// packages/print-canvas/src/__tests__/FontSelect.spec.ts
import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import type { FontCatalog } from '@worm-vue3-print/core'
import FontSelect from '../components/property/FontSelect.vue'
import { FONT_CATALOG_KEY } from '../composables/useHostAdapter'

const catalogOf = (
  fonts: Array<[string, Array<'server' | 'client'>]>,
  available: { server: boolean; client: boolean } = { server: true, client: true },
): FontCatalog => ({
  fonts: fonts.map(([family, sources]) => ({ family, sources })),
  available,
})

function mountSelect(catalog: FontCatalog, modelValue?: string, placeholder?: string) {
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
  it('聚焦后列出全部字体，两端都可用的不加标注', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    await focus(w)
    expect(optionTexts(w)).toContain('SimSun')
  })

  it('单端可用的字体标注可用范围', async () => {
    const w = mountSelect(catalogOf([
      ['Noto Sans CJK SC', ['server']],
      ['KaiTi', ['client']],
    ]))
    await focus(w)
    expect(optionTexts(w)).toContain('Noto Sans CJK SC（仅服务端）')
    expect(optionTexts(w)).toContain('KaiTi（仅本机）')
  })

  it('首项为空值行，文案取 placeholder', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), undefined, '继承默认')
    await focus(w)
    expect(optionTexts(w)[0]).toBe('继承默认')
  })

  it('输入框显示当前值', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
    expect((w.find('input').element as HTMLInputElement).value).toBe('SimSun')
  })

  it('当前值不在清单内时补一项并标注未知', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'Comic Sans MS')
    await focus(w)
    expect(optionTexts(w)).toContain('Comic Sans MS（未知）')
  })

  it('当前值在清单内时不产生未知项', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
    await focus(w)
    expect(w.text()).not.toContain('（未知）')
  })

  it('客户端未连接时提示本机字体未知', () => {
    const w = mountSelect(catalogOf([['Noto Sans CJK SC', ['server']]], { server: true, client: false }))
    expect(w.text()).toContain('桌面客户端未连接，本机字体未知')
  })

  it('服务端不可达时给出对应提示', () => {
    const w = mountSelect(catalogOf([['KaiTi', ['client']]], { server: false, client: true }))
    expect(w.text()).toContain('服务端字体清单不可用')
  })

  it('两端都正常时不显示任何提示', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.text()).not.toContain('不可用')
    expect(w.text()).not.toContain('未连接')
  })
})

describe('FontSelect 模糊搜索', () => {
  const catalog = catalogOf([
    ['Microsoft YaHei', ['server', 'client']],
    ['MS SimHei', ['server']],
    ['SimSun', ['server']],
    ['KaiTi', ['client']],
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

  it('过滤后隐藏空值行与未知行，只留命中项', async () => {
    const w = mountSelect(catalog, 'Comic Sans MS')
    await type(w, 'sim')
    expect(optionTexts(w)).toEqual(['SimSun（仅服务端）', 'MS SimHei（仅服务端）'])
  })

  it('无匹配时给出「使用」行，可直接录入清单外的字体名', async () => {
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

  it('清单不可用时退化为纯文本录入', async () => {
    const w = mountSelect(catalogOf([], { server: false, client: false }))
    const input = await type(w, 'FZSongKeBenXiuKai')
    expect(w.text()).toContain('字体清单不可用')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:model-value')?.[0]).toEqual(['FZSongKeBenXiuKai'])
  })
})

describe('FontSelect 键盘与提交', () => {
  const catalog = catalogOf([
    ['Microsoft YaHei', ['server', 'client']],
    ['SimSun', ['server']],
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

describe('FontSelect 缺失字体提示', () => {
  it('字体在服务端缺失时点明缺失端与后果', () => {
    const w = mountSelect(catalogOf([['SimSun', ['client']]]), 'SimSun')
    expect(w.text()).toContain('服务端无此字体，出图将回退到默认字体')
  })

  it('两端都有该字体时不提示缺失', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
    expect(w.text()).not.toContain('无此字体')
  })

  it('该端未上报时不判定缺失（未连接不等于没有）', () => {
    const w = mountSelect(
      catalogOf([['SimSun', ['server']]], { server: true, client: false }),
      'SimSun',
    )
    expect(w.text()).not.toContain('无此字体')
  })

  it('未设置字体时不提示', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server']]]))
    expect(w.text()).not.toContain('无此字体')
  })
})
