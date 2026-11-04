import { describe, it, expect } from 'vitest'
import { createDesktopPrintMcpServer } from '../server.js'
import { TOOLS } from '../tools.js'

describe('createDesktopPrintMcpServer', () => {
  it('必须显式传入桌面客户端组合后的工具集', () => {
    expect(() => createDesktopPrintMcpServer()).toThrow('tools')
    expect(() => createDesktopPrintMcpServer({ tools: TOOLS })).not.toThrow()
  })
})
