// print-core/src/render/page-number-expression.test.ts
// 系统变量（页码 / 打印日期）在表达式中参与运算与函数调用的场景

import { describe, it, expect } from 'vitest'
import { bindData } from './data-binder.js'
import { generateHtml } from './html-generator.js'

function makeTemplate(elements: any[], header?: any[]): any {
  return {
    version: 1,
    paperSize: 'A4',
    orientation: 'portrait',
    width: 210,
    height: 297,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: header ? { height: 10, elements: header } : undefined,
    elements,
  }
}

function textEl(id: string, formatter: string): any {
  return { id, type: 'text', options: { left: 10, top: 10, width: 100, height: 8, formatter } }
}

/** 两页布局：每个元素各占一页 */
function twoPageLayouts(ids: string[]): any[] {
  return ids.map((id, i) => ({
    pageIndex: i,
    sections: [{ elementId: id, type: 'element' }],
  }))
}

describe('绑定阶段：系统变量进入表达式上下文', () => {
  it('打印日期在绑定阶段即可求值', () => {
    const bound = bindData(makeTemplate([textEl('e1', '{DATE(printDate,"YYYY")}')]), {})
    expect(bound.elements[0].options.formatter).toBe(String(new Date().getFullYear()))
  })

  it('引用页码的表达式保留原文并记住原始表达式', () => {
    const bound = bindData(makeTemplate([textEl('e1', '{ADD(pageIndex,1)}')]), {})
    expect(bound.elements[0].options.formatter).toBe('{ADD(pageIndex,1)}')
    expect(bound.elements[0].options.rawFormatter).toBe('{ADD(pageIndex,1)}')
  })

  it('业务数据同名时覆盖系统变量', () => {
    const bound = bindData(makeTemplate([textEl('e1', '{printDate}')]), { printDate: '2020-01-01' })
    expect(bound.elements[0].options.formatter).toBe('2020-01-01')
  })
})

describe('最终渲染：页码按页求值', () => {
  it('整括号 {pageIndex} 仍逐页替换', () => {
    const tpl = makeTemplate([textEl('e1', '第 {pageIndex} 页')])
    const bound = bindData(tpl, {})
    const html = generateHtml(bound, twoPageLayouts(['e1', 'e1']), {}, {})
    expect(html).toContain('第 1 页')
    expect(html).toContain('第 2 页')
  })

  it('页码参与运算与函数调用时逐页求值', () => {
    const tpl = makeTemplate([textEl('e1', '{ADD(pageIndex,1)}'), textEl('e2', '{pageIndex + 1}')])
    const bound = bindData(tpl, {})
    const html = generateHtml(bound, twoPageLayouts(['e1', 'e2']), {}, {})
    // 第 1 页：ADD(1,1)=2、1+1=2；第 2 页：ADD(2,1)=3、2+1=3
    expect(html).toContain('>2<')
    expect(html).toContain('>3<')
  })

  it('总页数可用 {totalPages}', () => {
    const tpl = makeTemplate([textEl('e1', '共 {totalPages} 页')])
    const bound = bindData(tpl, {})
    const html = generateHtml(bound, twoPageLayouts(['e1', 'e1']), {}, {})
    expect(html).toContain('共 2 页')
  })

  it('页眉里的页码表达式同样逐页求值', () => {
    const tpl = makeTemplate([], [textEl('h1', '第 {ADD(pageIndex,1)} / {totalPages} 页')])
    const bound = bindData(tpl, {})
    const html = generateHtml(bound, [
      { pageIndex: 0, sections: [] },
      { pageIndex: 1, sections: [] },
    ], {}, {})
    // 两页页眉各自求值：第 1 页 ADD(1,1)=2，第 2 页 ADD(2,1)=3
    expect(html).toContain('第 2 / 2 页')
    expect(html).toContain('第 3 / 2 页')
  })

  it('表格单元格引用页码时按页求值', () => {
    const tpl = makeTemplate([{
      id: 't1',
      type: 'table',
      options: {
        left: 10, top: 10, width: 100,
        tableMode: 'static',
        tableRows: [{ type: 'data', height: 8, cells: [{ formatter: 'P{pageIndex}' }] }],
      },
    }])
    const bound = bindData(tpl, {})
    const html = generateHtml(bound, [
      { pageIndex: 0, sections: [{ elementId: 't1', type: 'table-slice', startRow: 0, endRow: 1 }] },
      { pageIndex: 1, sections: [{ elementId: 't1', type: 'table-slice', startRow: 0, endRow: 1 }] },
    ], {}, {})
    expect(html).toContain('P1')
    expect(html).toContain('P2')
  })
})
