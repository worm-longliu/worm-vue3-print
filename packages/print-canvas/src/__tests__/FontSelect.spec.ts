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

function mountSelect(catalog: FontCatalog, modelValue?: string) {
  return mount(FontSelect, {
    props: { modelValue },
    global: { provide: { [FONT_CATALOG_KEY]: computed(() => catalog) } },
  })
}

describe('FontSelect', () => {
  it('两端都可用的字体不加标注', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.findAll('option').map(o => o.text())).toContain('SimSun')
  })

  it('单端可用的字体标注可用范围', () => {
    const w = mountSelect(catalogOf([
      ['Noto Sans CJK SC', ['server']],
      ['KaiTi', ['client']],
    ]))
    const texts = w.findAll('option').map(o => o.text())
    expect(texts).toContain('Noto Sans CJK SC（仅服务端）')
    expect(texts).toContain('KaiTi（仅本机）')
  })

  it('首项为空值，表示未设置走兜底栈', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    expect(w.findAll('option')[0]!.attributes('value')).toBe('')
  })

  it('当前值不在清单内时补一项并标注未知', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'Comic Sans MS')
    expect(w.findAll('option').map(o => o.text())).toContain('Comic Sans MS（未知）')
  })

  it('当前值在清单内时不产生未知项', () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]), 'SimSun')
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

  it('选择字体后 emit 族名，选空值 emit undefined', async () => {
    const w = mountSelect(catalogOf([['SimSun', ['server', 'client']]]))
    const select = w.find('select')
    await select.setValue('SimSun')
    expect(w.emitted('update:model-value')?.[0]).toEqual(['SimSun'])
    await select.setValue('')
    expect(w.emitted('update:model-value')?.[1]).toEqual([undefined])
  })
})
