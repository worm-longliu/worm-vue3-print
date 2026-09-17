// 打印数据归一：对象=单份；非空对象数组=批量（数组长度即份数）。
// 这是整条管线唯一的数组拆分点。

export const MAX_BATCH_COPIES = 500

export type PrintDataInput = Record<string, any> | Record<string, any>[]

export type NormalizedPrintData =
  | { mode: 'single'; data: Record<string, any> }
  | { mode: 'batch'; dataList: Record<string, any>[] }

function isPlainRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function normalizePrintData(raw: PrintDataInput | undefined): NormalizedPrintData {
  if (raw === undefined) return { mode: 'single', data: {} }
  if (!Array.isArray(raw)) return { mode: 'single', data: raw }

  if (raw.length === 0) {
    throw new Error('批量打印数据必须是非空对象数组')
  }
  if (raw.length > MAX_BATCH_COPIES) {
    throw new Error(`批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${raw.length} 份`)
  }
  for (let i = 0; i < raw.length; i++) {
    if (!isPlainRecord(raw[i])) {
      throw new Error(`批量打印数据第 ${i + 1} 项必须是对象`)
    }
  }
  return { mode: 'batch', dataList: raw }
}
