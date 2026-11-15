// demo/src/samples/host-samples.ts
// 宿主安全示例注册表：不含图表类示例（它们依赖可选包 @worm-vue3-print/echarts）。
// demo-common 四个宿主不安装图表可选包，同步脚本只求值本文件；demo 的全量示例库见 ./index.ts。
import type { SampleTemplate } from './types'
import { PURCHASE_RECEIPT_SAMPLE } from './purchase-receipt'
import { SALES_OUTBOUND_SAMPLE } from './sales-outbound'
import { EXPRESS_WAYBILL_SAMPLE } from './express-waybill'
import { WEIGHT_LABEL_SAMPLE } from './weight-label'
import { PRICE_LABEL_SAMPLE } from './price-label'
import { ASSET_TAG_SAMPLE } from './asset-tag'
import { ROLL_LABEL_SAMPLE } from './roll-label'
import { BATTERY_MODULE_LABEL_SAMPLE } from './battery-module-label'
import { BATTERY_MODULE_LABEL_NO_SN_SAMPLE } from './battery-module-label-no-sn'
import { THERMAL_RECEIPT_SAMPLE } from './thermal-receipt'
import { TCM_PRESCRIPTION_SAMPLE } from './tcm-prescription'
import { COMPREHENSIVE_SHOWCASE_SAMPLE } from './comprehensive-showcase'
import { PAGINATION_EDGE_SAMPLE } from './pagination-edge'
import { TEXT_WRAP_FOLLOW_SAMPLE } from './text-wrap-follow'
import { PAYMENT_REQUEST_SAMPLE } from './payment-request'
import { HEALTH_REPORT_SAMPLE } from './health-report'

/** 不依赖可选包的示例：单据 → 标签 → 小票 */
export const HOST_SAMPLE_TEMPLATES: SampleTemplate[] = [
  PURCHASE_RECEIPT_SAMPLE,
  SALES_OUTBOUND_SAMPLE,
  PAYMENT_REQUEST_SAMPLE,
  HEALTH_REPORT_SAMPLE,
  TCM_PRESCRIPTION_SAMPLE,
  EXPRESS_WAYBILL_SAMPLE,
  COMPREHENSIVE_SHOWCASE_SAMPLE,
  PAGINATION_EDGE_SAMPLE,
  TEXT_WRAP_FOLLOW_SAMPLE,
  WEIGHT_LABEL_SAMPLE,
  PRICE_LABEL_SAMPLE,
  ASSET_TAG_SAMPLE,
  ROLL_LABEL_SAMPLE,
  BATTERY_MODULE_LABEL_SAMPLE,
  BATTERY_MODULE_LABEL_NO_SN_SAMPLE,
  THERMAL_RECEIPT_SAMPLE,
]
