// packages/print-core/tests/functions/system.test.ts
import { describe, it, expect } from 'vitest'
import { systemVars } from '../../src/functions/system.js'

describe('system variables', () => {
  it('pageIndex returns number', () => {
    const v = systemVars.pageIndex()
    expect(typeof v).toBe('number')
  })

  it('totalPages returns number', () => {
    const v = systemVars.totalPages()
    expect(typeof v).toBe('number')
  })

  it('printDate returns YYYY-MM-DD format', () => {
    const v = systemVars.printDate()
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('printTime returns timestamp', () => {
    const v = systemVars.printTime()
    expect(typeof v).toBe('number')
  })
})
