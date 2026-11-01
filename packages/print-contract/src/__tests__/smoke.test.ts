import { describe, it, expect } from 'vitest'
import type { TemplateData, ElementOptions } from '@worm-vue3-print/core/designer'
import { CONTRACT_VERSION } from '../index.js'

describe('契约层脚手架', () => {
  it('能取到 core 的设计器类型（证明边界正确）', () => {
    const probe: Pick<ElementOptions, 'left' | 'top' | 'width' | 'height'> = {
      left: 0, top: 0, width: 40, height: 10,
    }
    const options = probe as ElementOptions
    const tpl: Pick<TemplateData, 'paperSize' | 'margins' | 'elements'> = {
      paperSize: 'A4', margins: { top: 10, right: 10, bottom: 10, left: 10 }, elements: [],
    }
    expect(options.width).toBe(40)
    expect(tpl.paperSize).toBe('A4')
    expect(CONTRACT_VERSION).toBe('1')
  })
})
