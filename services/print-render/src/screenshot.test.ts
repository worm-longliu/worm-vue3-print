// services/print-render/src/screenshot.test.ts
import { describe, it, expect } from 'vitest'
import { renderScreenshot } from './pdf-render.js'
import type { RenderRequest } from '@worm-vue3-print/core'

describe('renderScreenshot', () => {
  it('返回 PNG buffer', async () => {
    const req: RenderRequest = {
      templateJson: {
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        header: { height: 0, elements: [] },
        footer: { height: 0, elements: [] },
        firstPageOverlay: { height: 0, elements: [] },
        elements: [],
      },
      printData: {},
    }
    const result = await renderScreenshot(req)
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  }, 30000)
})