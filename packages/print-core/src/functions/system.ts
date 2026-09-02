// packages/print-core/src/functions/system.ts

let _pageIndex = 1
let _totalPages = 1

export function setPageIndex(v: number) { _pageIndex = v }
export function setTotalPages(v: number) { _totalPages = v }

export const systemVars = {
  pageIndex: () => _pageIndex,
  totalPages: () => _totalPages,
  printDate: () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },
  printTime: () => Date.now(),
}
