import { describe, it, expect } from 'vitest'

/**
 * 复制 PropertyPanel.vue 中的 parsePath 实现（作为 UT 直接引用），
 * 以便脱离组件 mount 环境单独验证路径解析正确性。
 * 组件层逻辑（setBindingValue → element.options.formatter 写入）在下方
 * 通过构造仿 RuntimeElement 对象直接调用等价函数验证。
 */
function parsePath(targetPath: string): (string | number)[] {
  return targetPath.split('.').flatMap(segment => {
    const match = segment.match(/^([^\[]+)((?:\[\d+\])*)$/)
    if (!match) return [segment]
    const baseName = match[1]!
    const indices = [...match[2]!.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]!))
    return [baseName, ...indices]
  })
}

describe('parsePath', () => {
  it('简单点分路径：options.formatter', () => {
    expect(parsePath('options.formatter')).toEqual(['options', 'formatter'])
  })

  it('带下标路径：表格单元格 formatter', () => {
    expect(parsePath('options.tableRows[0].cells[1].formatter'))
      .toEqual(['options', 'tableRows', 0, 'cells', 1, 'formatter'])
  })

  it('带下标路径：网格子项 formatter', () => {
    expect(parsePath('options.gridChildren[2].formatter'))
      .toEqual(['options', 'gridChildren', 2, 'formatter'])
  })

  it('连续下标（理论场景）：arr[0][1]', () => {
    expect(parsePath('arr[0][1]')).toEqual(['arr', 0, 1])
  })

  it('纯字段（无点无下标）：formatter', () => {
    expect(parsePath('formatter')).toEqual(['formatter'])
  })
})

/** 复现原始 bug：get/set 路径起点不一致的等价测试 */
describe('setBindingValue vs getBindingValue 路径一致性（防回归）', () => {
  function makeElement() {
    return {
      id: 1,
      options: {
        formatter: '文本',
        left: 10,
        top: 20,
        tableRows: [
          { cells: [{ formatter: 'r0c0' }, { formatter: 'r0c1' }] },
          { cells: [{ formatter: 'r1c0' }] },
        ],
      },
    } as any
  }

  // 修复后的 getBindingValue 等价函数
  function getBindingValue(element: any, targetPath: string): string {
    if (!element) return ''
    const segments = parsePath(targetPath)
    const result = segments.reduce((cur, seg) => {
      if (cur === null || cur === undefined) return ''
      return cur[seg as keyof typeof cur]
    }, element as any)
    return result ?? ''
  }

  // 修复后的 setBindingValue 等价函数（reduce 初始值 = element）
  function setBindingValue(
    element: any,
    targetPath: string,
    value: string,
    recordHistory?: () => void,
  ) {
    if (!element) return
    const segments = parsePath(targetPath)
    const lastKey = segments.pop()!
    const obj = segments.reduce((cur, seg) => {
      if (cur[seg] === undefined || cur[seg] === null) cur[seg] = {}
      return cur[seg]
    }, element as any)
    obj[lastKey] = value || undefined
    recordHistory?.()
  }

  it('text formatter: 写入后 get 读到相同值（根因用例）', () => {
    const el = makeElement()
    expect(getBindingValue(el, 'options.formatter')).toBe('文本')

    setBindingValue(el, 'options.formatter', '你好世界')

    expect(getBindingValue(el, 'options.formatter')).toBe('你好世界')
    // 关键断言：修复后，不得出现 element.options.options 嵌套
    expect(el.options.options).toBeUndefined()
    // 直接读 element.options.formatter 也必须一致（对齐画布渲染侧）
    expect(el.options.formatter).toBe('你好世界')
  })

  it('longText styler: options.styler 路径', () => {
    const el = makeElement()
    setBindingValue(el, 'options.styler', 'font-weight:bold')
    expect(getBindingValue(el, 'options.styler')).toBe('font-weight:bold')
    expect(el.options.styler).toBe('font-weight:bold')
  })

  it('表格单元格：options.tableRows[0].cells[1].formatter', () => {
    const el = makeElement()
    expect(getBindingValue(el, 'options.tableRows[0].cells[1].formatter')).toBe('r0c1')

    setBindingValue(el, 'options.tableRows[0].cells[1].formatter', '新内容')

    expect(getBindingValue(el, 'options.tableRows[0].cells[1].formatter')).toBe('新内容')
    expect(el.options.tableRows[0].cells[1].formatter).toBe('新内容')
  })

  it('recordHistory 回调在 setBindingValue 完成后被触发', () => {
    const el = makeElement()
    let called = 0
    setBindingValue(el, 'options.formatter', 'v', () => {
      called++
    })
    expect(called).toBe(1)
  })

  it('空值写入：value 为空串时，目标赋值为 undefined（对齐现有 value || undefined 语义）', () => {
    const el = makeElement()
    setBindingValue(el, 'options.formatter', '')
    expect(el.options.formatter).toBeUndefined()
  })
})
