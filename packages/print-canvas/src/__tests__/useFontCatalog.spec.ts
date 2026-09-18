// pages/print-canvas/src/__tests__/useFontCatalog.spec.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { FontCandidate, FontSourceReport } from '@worm-vue3-print/core'
import { filterFontCandidates, useFontCatalog } from '../composables/useFontCatalog'

describe('useFontCatalog', () => {
  it('两端都未上报时返回空目录且 available 全为 false', () => {
    const { catalog } = useFontCatalog(ref(undefined), ref(undefined))
    expect(catalog.value.fonts).toEqual([])
    expect(catalog.value.available).toEqual({ server: false, client: false })
  })

  it('只上报服务端时并集仅含服务端来源', () => {
    const { catalog } = useFontCatalog(
      ref({ available: true, fonts: ['SimSun'] } satisfies FontSourceReport),
      ref(undefined),
    )
    expect(catalog.value.fonts).toEqual([{ family: 'SimSun', sources: ['server'] }])
    expect(catalog.value.available).toEqual({ server: true, client: false })
  })

  it('客户端上报后响应式补齐来源标注', () => {
    const client = ref<FontSourceReport | undefined>(undefined)
    const { catalog } = useFontCatalog(
      ref({ available: true, fonts: ['SimSun'] } satisfies FontSourceReport),
      client,
    )
    expect(catalog.value.fonts).toEqual([{ family: 'SimSun', sources: ['server'] }])

    client.value = { available: true, fonts: ['SimSun', 'KaiTi'] }
    expect(catalog.value.available).toEqual({ server: true, client: true })
    expect(catalog.value.fonts.map(f => [f.family, f.sources])).toEqual([
      ['SimSun', ['server', 'client']],
      ['KaiTi', ['client']],
    ])
  })
})

describe('filterFontCandidates', () => {
  const fonts: FontCandidate[] = [
    { family: 'Microsoft YaHei', sources: ['server', 'client'] },
    { family: 'MS SimHei', sources: ['server'] },
    { family: 'SimSun', sources: ['server'] },
    { family: 'KaiTi', sources: ['client'] },
  ]

  it('查询为空时原样返回（保持目录的可用性排序）', () => {
    expect(filterFontCandidates(fonts, '')).toEqual(fonts)
    expect(filterFontCandidates(fonts, '   ')).toEqual(fonts)
  })

  it('子串匹配，大小写与空格不敏感', () => {
    expect(filterFontCandidates(fonts, 'yahei').map(f => f.family)).toEqual(['Microsoft YaHei'])
    expect(filterFontCandidates(fonts, '  MICROSOFT   YAHEI ').map(f => f.family)).toEqual(['Microsoft YaHei'])
  })

  it('子序列匹配（首字母缩写）', () => {
    expect(filterFontCandidates(fonts, 'msyh').map(f => f.family)).toEqual(['Microsoft YaHei'])
    expect(filterFontCandidates(fonts, 'kt').map(f => f.family)).toEqual(['KaiTi'])
  })

  it('排序为 完全相等 > 前缀 > 子串 > 子序列，同档保持原顺序', () => {
    expect(filterFontCandidates(fonts, 'sim').map(f => f.family)).toEqual([
      'SimSun',
      'MS SimHei',
    ])
    expect(filterFontCandidates(fonts, 'SimSun').map(f => f.family)).toEqual(['SimSun'])
  })

  it('无匹配时返回空数组', () => {
    expect(filterFontCandidates(fonts, 'zzz')).toEqual([])
  })
})
