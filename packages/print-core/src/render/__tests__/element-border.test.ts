// print-core/src/render/__tests__/element-border.test.ts
import { describe, it, expect } from 'vitest'
import { resolveElementBorder } from '../element-border.js'

describe('resolveElementBorder：无边框判定', () => {
  it('borderWidth 未设 / 0 / 负数 / 非法值且无分边 → null（绝不兜底默认边框）', () => {
    expect(resolveElementBorder('text', {})).toBeNull()
    expect(resolveElementBorder('text', undefined)).toBeNull()
    expect(resolveElementBorder('text', { borderWidth: 0 })).toBeNull()
    expect(resolveElementBorder('text', { borderWidth: -1 })).toBeNull()
    expect(resolveElementBorder('text', { borderWidth: NaN })).toBeNull()
    expect(resolveElementBorder('text', { borderWidth: '2' as any })).toBeNull()
  })

  it('rect/oval/hline/vline/table 用 border 画自身本体或走单元格边框，恒为 null', () => {
    for (const type of ['rect', 'oval', 'hline', 'vline', 'table']) {
      expect(resolveElementBorder(type, {
        borderWidth: 2,
        borders: { top: { width: 3, style: 'dashed', color: '#f00' } },
      })).toBeNull()
    }
  })

  it('元素类型缺失返回 null', () => {
    expect(resolveElementBorder(undefined, { borderWidth: 2 })).toBeNull()
  })
})

describe('resolveElementBorder：整圈边框解析', () => {
  it('text + borderWidth=2 缺省线型 solid、缺省色 #000，无分边时 edges 为空', () => {
    expect(resolveElementBorder('text', { borderWidth: 2 })).toEqual({
      all: { borderWidth: '2px', borderStyle: 'solid', borderColor: '#000' },
      edges: {},
    })
  })

  it('dashed 与自定义颜色透传', () => {
    const r = resolveElementBorder('text', { borderWidth: 2, borderStyle: 'dashed', borderColor: '#f00' })
    expect(r?.all).toEqual({ borderWidth: '2px', borderStyle: 'dashed', borderColor: '#f00' })
  })

  it('非法线型回落到 solid', () => {
    expect(resolveElementBorder('longText', { borderWidth: 1, borderStyle: 'wavy' })?.all?.borderStyle).toBe('solid')
  })

  it('image/barcode/qrcode/html/pageNumber 等非表格元素均生效', () => {
    for (const type of ['image', 'barcode', 'qrcode', 'html', 'pageNumber', 'longText']) {
      expect(resolveElementBorder(type, { borderWidth: 3 })?.all).toEqual({
        borderWidth: '3px',
        borderStyle: 'solid',
        borderColor: '#000',
      })
    }
  })
})

describe('resolveElementBorder：分边边框解析', () => {
  it('仅分边（无整圈）：all 为 null，对应边按 px 解析', () => {
    expect(resolveElementBorder('text', { borders: { top: { width: 2, style: 'dashed', color: '#f00' } } })).toEqual({
      all: null,
      edges: { top: { borderWidth: '2px', borderStyle: 'dashed', borderColor: '#f00' } },
    })
  })

  it('整圈与分边共存：两者都解析，出纸时由调用方逐边覆盖', () => {
    const r = resolveElementBorder('text', { borderWidth: 1, borders: { bottom: { width: 3 } } })
    expect(r?.all).toEqual({ borderWidth: '1px', borderStyle: 'solid', borderColor: '#000' })
    expect(r?.edges.bottom).toEqual({ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000' })
  })

  it('分边非法宽度（0/负/NaN/非数字）跳过；全部非法且无整圈 → null', () => {
    expect(resolveElementBorder('text', {
      borders: { top: { width: 0 }, right: { width: -2 }, bottom: { width: NaN }, left: { width: '3' as any } },
    })).toBeNull()
    const r = resolveElementBorder('text', { borderWidth: 1, borders: { top: { width: 0 } } })
    expect(r?.edges.top).toBeUndefined()
    expect(r?.all).toBeTruthy()
  })

  it('分边线型/颜色缺省规则与整圈一致（solid / #000，非法线型回落 solid）', () => {
    const r = resolveElementBorder('text', { borders: { left: { width: 2, style: 'wavy', color: '' } } })
    expect(r?.edges.left).toEqual({ borderWidth: '2px', borderStyle: 'solid', borderColor: '#000' })
    const d = resolveElementBorder('text', { borders: { left: { width: 2, style: 'double', color: '#abc' } } })
    expect(d?.edges.left).toEqual({ borderWidth: '2px', borderStyle: 'double', borderColor: '#abc' })
  })

  it('borders 为空对象且无整圈 → null', () => {
    expect(resolveElementBorder('text', { borders: {} })).toBeNull()
  })
})
