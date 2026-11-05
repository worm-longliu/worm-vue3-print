import { describe, it, expect } from 'vitest'
import { createDefaultOptions } from '@worm-vue3-print/core/designer'
import type { ElementType } from '@worm-vue3-print/core/designer'
import { OPTION_META, OPTION_KEYS, DEPRECATED_OPTION_KEYS } from '../option-meta.js'

const ALL_TYPES: ElementType[] = [
  'text', 'image', 'longText', 'table', 'flowList', 'hline', 'vline', 'rect', 'oval',
  'barcode', 'qrcode', 'html', 'pageNumber',
]

describe('OPTION_META', () => {
  it('覆盖 core 各元素类型实际产出的每一个键', () => {
    // 用 core 的元素工厂反查真实键名，比手抄类型定义更硬：新增键没登记元数据就会在这里红。
    // 反方向（core 加了键但没人用）由 `Record<keyof ElementOptions, OptionMeta>` 的编译期必填保证。
    const unknown = new Set<string>()
    for (const type of ALL_TYPES) {
      for (const key of Object.keys(createDefaultOptions(type))) {
        if (!OPTION_KEYS.includes(key as never)) unknown.add(key)
      }
    }
    expect([...unknown]).toEqual([])
  })

  it('长度类键的单位与区间符合口径', () => {
    expect(OPTION_META.left.kind).toBe('mm')
    expect(OPTION_META.barHeight.kind).toBe('mm')
    expect(OPTION_META.fontSize.kind).toBe('pt')
    expect(OPTION_META.borderWidth.kind).toBe('pt')
    // 条宽是「模块」而非 mm：误标成长度会让 AI 按 mm 换算，条宽直接错一个量级
    expect(OPTION_META.barWidth.kind).toBe('count')
    expect(OPTION_META.qrQuietZone.kind).toBe('count')
    expect(OPTION_META.flowColumns.kind).toBe('count')
    expect(OPTION_META.flowLayoutMode).toEqual({ kind: 'enum', enum: ['fixed', 'dynamic'] })
    expect(OPTION_META.repeatOnEveryPage.kind).toBe('bool')
    expect(OPTION_META.fixed.kind).toBe('bool')
    expect(OPTION_META.flowPaddingTop.kind).toBe('mm')
    expect(OPTION_META.flowPaddingRight.kind).toBe('mm')
    expect(OPTION_META.flowPaddingBottom.kind).toBe('mm')
    expect(OPTION_META.flowPaddingLeft.kind).toBe('mm')
    expect(OPTION_META.marginTop.kind).toBe('mm')
    expect(OPTION_META.marginRight.kind).toBe('mm')
    expect(OPTION_META.marginBottom.kind).toBe('mm')
    expect(OPTION_META.marginLeft.kind).toBe('mm')
    expect(OPTION_META.marginTop.min).toBeUndefined()
    expect(OPTION_META.fitScale.min).toBe(100)
    expect(OPTION_META.fitScale.max).toBe(400)
    // types.ts 里 printerDpi 是 number，不是字符串枚举
    expect(OPTION_META.printerDpi.kind).toBe('count')
    expect(OPTION_META.printerDpi.enum).toBeUndefined()
  })

  it('废弃键只降级为警告并被单独列出', () => {
    expect(OPTION_META.title.deprecated).toBe(true)
    expect(OPTION_META.tableMode.deprecated).toBe(true)
    expect(OPTION_META.fields.deprecated).toBe(true)
    expect([...DEPRECATED_OPTION_KEYS].sort()).toEqual(['fields', 'tableMode', 'title'])
  })
})
