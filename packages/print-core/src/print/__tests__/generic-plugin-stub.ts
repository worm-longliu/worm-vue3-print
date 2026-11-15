// 通用多 kind 插件替身：core 包内不引入任何渲染库，用「无渲染库依赖」的替身验证
// 「一插件多 kind + kind 级渲染覆盖 + 通用收集通道」的完整链路。
import {
  defineElementPlugin,
  registerElementPlugin,
} from '../../designer/element-plugin-registry.js'

export const GENERIC_STUB_ID = 'test.generic-stub'
export const GENERIC_STUB_BUNDLE_VERSION = 'generic-stub-executor'

const SVG = (kind: string): string => `<svg data-generic="${kind}" viewBox="0 0 100 60"></svg>`

/**
 * 注册两个 kind：
 * - `testBox`：只提供进程内 renderer（单趟直出）；
 * - `testSvg`：只登记页面执行器 bundle（强制走「收集 → 会话出图 → 回填」两趟），并带 kind 级绑定。
 */
export function registerGenericPluginStub(): () => void {
  return registerElementPlugin(defineElementPlugin({
    id: GENERIC_STUB_ID,
    version: '2',
    kinds: [
      {
        type: 'testBox',
        label: '测试盒',
        render: { html: spec => SVG(String(spec.type)), createRenderer: () => ({ render: spec => SVG(String(spec.type)) }) },
      },
      {
        type: 'testSvg',
        label: '测试图',
        binding: { bind: options => ({ _svgOption: options.chartOption ?? {} }) },
        render: {
          html: spec => SVG(String(spec.type)),
          executorBundle: () => ({ name: GENERIC_STUB_ID, version: GENERIC_STUB_BUNDLE_VERSION, code: '/* stub executor */' }),
        },
      },
    ],
  }))
}
