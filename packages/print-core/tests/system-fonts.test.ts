// packages/print-core/tests/system-fonts.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseFcListOutput,
  parseSystemProfilerFonts,
  parseWindowsFontOutput,
  readSystemFonts,
} from '../src/print/system-fonts.js'

describe('parseFcListOutput', () => {
  it('按行切分并展开逗号分隔的多 family', () => {
    const stdout = [
      'Noto Sans CJK JP,Noto Sans CJK SC,Noto Sans CJK TC',
      'DejaVu Sans',
      '',
      'Liberation Serif',
    ].join('\n')
    expect(parseFcListOutput(stdout)).toEqual([
      'Noto Sans CJK JP',
      'Noto Sans CJK SC',
      'Noto Sans CJK TC',
      'DejaVu Sans',
      'Liberation Serif',
    ])
  })

  it('空输出返回空数组', () => {
    expect(parseFcListOutput('')).toEqual([])
  })
})

describe('parseSystemProfilerFonts', () => {
  it('从 typefaces 取 family，忽略文件级 _name', () => {
    const json = {
      SPFontsDataType: [
        {
          _name: 'Times New Roman Bold.ttf',
          typefaces: [{ family: 'Times New Roman' }, { family: 'Times New Roman Bold' }],
        },
      ],
    }
    expect(parseSystemProfilerFonts(json)).toEqual(['Times New Roman', 'Times New Roman Bold'])
  })

  it('结构不符时返回空数组而不抛异常', () => {
    expect(parseSystemProfilerFonts(null)).toEqual([])
    expect(parseSystemProfilerFonts({ SPFontsDataType: 'nope' })).toEqual([])
  })
})

describe('parseWindowsFontOutput', () => {
  it('按行切分，去掉空行与首尾空白', () => {
    expect(parseWindowsFontOutput('SimSun\r\n\r\nKaiTi\r\n')).toEqual(['SimSun', 'KaiTi'])
  })
})

describe('readSystemFonts', () => {
  const ok = (stdout: string) => async () => ({ stdout })

  it('linux 走 fc-list 并归一化', async () => {
    const report = await readSystemFonts('linux', ok('DejaVu Sans\nDejaVu Sans\n.Al Bayan PUA\n'))
    expect(report.available).toBe(true)
    expect(report.fonts).toEqual(['DejaVu Sans'])
  })

  it('darwin 走 system_profiler 并解析 JSON', async () => {
    const stdout = JSON.stringify({ SPFontsDataType: [{ typefaces: [{ family: 'PingFang SC' }] }] })
    const report = await readSystemFonts('darwin', ok(stdout))
    expect(report.fonts).toEqual(['PingFang SC'])
  })

  it('win32 走 PowerShell 并解析文本', async () => {
    const report = await readSystemFonts('win32', ok('SimSun\nKaiTi\n'))
    expect(report.fonts).toEqual(['KaiTi', 'SimSun'])
  })

  it('命令失败时返回 available:false 而非空清单', async () => {
    const fail = async () => {
      throw new Error('spawn fc-list ENOENT')
    }
    expect(await readSystemFonts('linux', fail)).toEqual({ available: false, fonts: [] })
  })

  it('输出不可解析时返回 available:false', async () => {
    const report = await readSystemFonts('darwin', ok('not json at all'))
    expect(report.available).toBe(false)
  })
})
