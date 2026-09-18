// pages/print-canvas/src/__tests__/useFontCatalog.spec.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { FontSourceReport } from '@worm-vue3-print/core'
import { useFontCatalog } from '../composables/useFontCatalog'

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
