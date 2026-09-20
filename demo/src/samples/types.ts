// demo/src/samples/types.ts
// 示例模板库的数据契约：一份示例 = 模板 + 静态字段树 + 静态打印数据。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'

/** 示例分组（按打印场景归类，示例库弹窗据此筛选） */
export type SampleGroup = '单据' | '标签' | '小票'

/** 示例模板：全部数据静态内置，不依赖任何后端接口 */
export interface SampleTemplate {
  /** 示例唯一标识 */
  id: string
  /** 示例名称 */
  name: string
  group: SampleGroup
  /** 一句话场景说明 */
  desc: string
  /** 纸张 / 拼版说明（卡片上展示） */
  paper: string
  /** 业务字段树：选中示例时注入设计器 */
  fields: PrintBusinessField[]
  /** 静态打印数据（单份预览 / 单份打印） */
  data: Record<string, any>
  /**
   * 静态批量打印数据；缺省时由 `deriveBatchData(data)` 派生。
   * 标签类示例（一枚一份）必须自带，才能演示「N 份数据铺满一张纸」的拼版打印。
   */
  batchData?: Record<string, any>[]
  /** 模板 JSON（设计器完整模型，单位 mm） */
  template: TemplateData
}
