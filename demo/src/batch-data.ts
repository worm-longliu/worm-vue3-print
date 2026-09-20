// 批量打印模拟数据：以采购收货单默认数据为原型，派生 3 份互不相同的数据。
export const BATCH_SIZE = 3

const SUPPLIERS = [
  { name: '鑫达五金有限公司', phone: '0571-88776655', address: '杭州市萧山区经济开发区88号' },
  { name: '恒泰机电设备有限公司', phone: '0571-86554433', address: '杭州市钱塘区智造六路12号' },
  { name: '瑞安钢材贸易有限公司', phone: '0577-65558899', address: '瑞安市塘下镇工业园北区3号' },
] as const

const RECEIVERS = ['李四', '王五', '赵六']

/** 各份截取的明细行数：8 行 / 20 行 / 全部 50 行，制造页数差异 */
const GOODS_LIMITS = [8, 20, 50]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 由一条原型数据派生 BATCH_SIZE 条批量打印数据（深拷贝，不修改入参）。
 *
 * 各示例的数据结构不同，这里只认「采购收货单式」的 supplier / receiver / order / goods 路径：
 * 命中的字段随份次变化，未命中则原样保留，因此任意结构的示例都能安全派生。
 * 需要精确控制批量内容（如一枚一条的标签）的示例请自带 batchData，不走本函数。
 */
export function deriveBatchData(base: Record<string, any>): Record<string, any>[] {
  return Array.from({ length: BATCH_SIZE }, (_, i) => {
    const data: Record<string, any> = structuredClone(base)
    if (data.supplier) data.supplier = { ...data.supplier, ...SUPPLIERS[i % SUPPLIERS.length] }
    if (data.receiver) data.receiver = { ...data.receiver, name: RECEIVERS[i % RECEIVERS.length] }
    if (data.order && typeof data.order === 'object') {
      data.order = {
        ...data.order,
        ...(typeof data.order.no === 'string'
          ? { no: `${data.order.no}-B${String(i + 1).padStart(2, '0')}` }
          : {}),
        ...(typeof data.order.date === 'string' ? { date: addDays(data.order.date, i) } : {}),
      }
    }
    if (Array.isArray(data.goods)) {
      const goods = (base.goods as any[]).slice(0, GOODS_LIMITS[i]).map((g: any) => {
        const qty = g.qty * (i + 1)
        return { ...g, qty, amount: round2(qty * g.price) }
      })
      data.goods = goods
      if (typeof data.order?.total === 'number') {
        data.order.total = round2(goods.reduce((sum, g) => sum + g.amount, 0))
      }
    }
    return data
  })
}
