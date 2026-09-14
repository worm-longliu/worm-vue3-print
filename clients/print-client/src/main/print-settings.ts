import type { PrintOptions } from '@worm-vue3-print/client'

/** 出纸链路真正消费的设置；纸张几何由 core 的 pdf 规格决定 */
export interface PrintJobSettings {
  copies: number
  /** 驱动纸型名（针式打印机预置纸型），用于向打印系统声明纸张 */
  paperName?: string
}

export function buildPrintJobSettings(print: PrintOptions): PrintJobSettings {
  const copies = print.copies && print.copies > 0 ? Math.trunc(print.copies) : 1
  return print.paperName ? { copies, paperName: print.paperName } : { copies }
}
