// P0 基线冻结 / P4 更新：内置元素类型穷尽映射（纯编译期闸门，不参与 vitest 运行）。
//
// 命名 *.test-d.ts 是刻意的：
//   - canvas 的 vitest.config.ts 只收 src/**/__tests__/*.spec.ts → 不会被 vitest 当用例收集
//   - tsconfig.json 的 include ["src/**/*.ts", "src/**/*.vue"] → 被 pretest `vue-tsc --noEmit` 检查
//   - tsconfig.build.json 已 exclude src/__tests__ → 不生成多余 .d.ts、不污染 dist
//
// P4 起主体只认内置 13 种；扩展类型由插件包 `declare module` 注入 ElementType，
// 因此本闸门改盯 BuiltinElementType（主体自己的契约），插件侧的注入由
// print-echarts/src/type-augmentation.ts 的编译期自校验负责。
import type { BuiltinElementType } from '@worm-vue3-print/core/designer'

/** 双向闸门之一：satisfies 保证「不多」（内置联合里没有的键不能出现） */
export const ELEMENT_TYPE_TITLES = {
  text: '文本',
  image: '图片',
  longText: '长文本',
  table: '表格',
  flowList: '流式列表',
  hline: '横线',
  vline: '竖线',
  rect: '矩形',
  oval: '椭圆',
  barcode: '条形码',
  qrcode: '二维码',
  html: 'HTML',
  pageNumber: '页码',
} satisfies Record<BuiltinElementType, string>

/** 双向闸门之二：Record 赋值保证「不少」（内置联合新增类型而上面漏登记时编译红） */
export const _EXHAUSTIVE_RECORD: Record<BuiltinElementType, string> = ELEMENT_TYPE_TITLES
