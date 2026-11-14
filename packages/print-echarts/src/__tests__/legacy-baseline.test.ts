// P0 基线冻结：历史 chart 模板「零迁移」回归。
// 改造前后必须产出逐字一致的 HTML/SVG；基线资产见 docs/superpowers/specs/baseline/。
// 注意：本用例刻意使用旧 API（bindData + generateHtml 的 chartRenderer 入参），
// 用来钉住 §4.3 的兼容别名契约——P2/P4 泛化后这些入参仍需可用。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bindData, generateHtml } from '@worm-vue3-print/core'
// P4：历史 chart 模板的知识已全部迁入插件描述符；加载本模块即完成自注册。
// 旧 API chartRenderer 入参照旧保留（§4.3），出图由描述符的 render.html 承担。
import '../plugin.js'
import { createChartRenderer } from '../renderer.js'

const baseline = (name: string): string =>
  fileURLToPath(new URL(`../../../../docs/superpowers/specs/baseline/${name}`, import.meta.url))

const CASES = [
  { name: 'sales-chart', chartCount: 2 },
  { name: 'echarts-test-case', chartCount: 4 },
] as const

/**
 * ECharts SSR 的 zrender class 前缀是进程级递增计数器（zr0 / zr1 / …），
 * P0 基线是同一进程按 CASES 顺序依次生成的。新增的对照用例必须放在逐字基线之后，
 * 且比较时归一化 class 名，否则多渲染一次就会让前缀漂移、逐字断言失真。
 */
const normalizeZrClasses = (html: string): string =>
  html.replace(/zr\d+-(?:cls-\d+|c\d+)/g, 'zrN-ID')

describe('历史 chart 模板零迁移回归基线（P0 / R5）', () => {
  // 顺序不可插入新用例：这两条必须与基线生成时的渲染顺序完全一致
  for (const c of CASES) {
    it(`${c.name}：原样模板产出与改造前逐字一致`, () => {
      const sample = JSON.parse(readFileSync(baseline(`${c.name}.legacy.json`), 'utf8')) as {
        template: Record<string, unknown>
        data: Record<string, unknown>
      }
      const expectedHtml = readFileSync(baseline(`${c.name}.html-baseline.html`), 'utf8')

      // R5：历史模板不得被写入 plugins 清单；改造后也不得要求迁移
      expect('plugins' in sample.template).toBe(false)

      const bound = bindData(sample.template as never, sample.data)
      const html = generateHtml(bound, [], sample.data, {
        isMeasurementPass: true,
        chartRenderer: createChartRenderer(),
      })

      expect((html.match(/<svg/g) ?? []).length).toBe(c.chartCount)
      expect(html).toBe(expectedHtml)
    })
  }

  // P5：demo 预览与浏览器打印删掉手写 chartRenderer 传参后走的就是这条路径，
  // html-generator 的 default 分支按插件描述符分派，不依赖任何旧入参。
  for (const c of CASES) {
    it(`${c.name}：不传旧 chartRenderer 也由注册表出图（归一化 zrender class 后等价）`, () => {
      const sample = JSON.parse(readFileSync(baseline(`${c.name}.legacy.json`), 'utf8')) as {
        template: Record<string, unknown>
        data: Record<string, unknown>
      }
      const expectedHtml = readFileSync(baseline(`${c.name}.html-baseline.html`), 'utf8')
      const bound = bindData(sample.template as never, sample.data)
      const html = generateHtml(bound, [], sample.data, { isMeasurementPass: true })
      expect((html.match(/<svg/g) ?? []).length).toBe(c.chartCount)
      expect(normalizeZrClasses(html)).toBe(normalizeZrClasses(expectedHtml))
    })
  }
})
