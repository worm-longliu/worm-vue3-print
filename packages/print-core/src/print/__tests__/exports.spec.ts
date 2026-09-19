import { describe, it, expect } from 'vitest'

describe('core 根入口的打印 API', () => {
  it('导出管线与规格函数', async () => {
    const core = await import('../../index.js')
    const names = [
      'prepareDocument', 'renderPdf', 'renderScreenshot', 'createDomHostRuntime',
      'resolvePaperMm', 'paperViewportPx', 'buildPdfTargetSpec',
      'toElectronPrintToPdfOptions', 'toPlaywrightPdfOptions',
      'normalizeMeasurements', 'codeSpecKey', 'createMapCodeRenderer',
      'PrintFailure', 'withTimeout', 'PX_PER_MM',
    ] as const
    for (const name of names) {
      expect(typeof (core as Record<string, unknown>)[name]).not.toBe('undefined')
    }
  })

  it('Node 下加载 core 根入口不触碰 DOM（服务端与 Electron 主进程的前提）', async () => {
    expect(typeof (globalThis as Record<string, unknown>).document).toBe('undefined')
    await import('../../index.js')
  })

  it('导出拼版能力', async () => {
    const core = await import('../../index.js')
    const fns = [
      'computeTileLayout', 'tilePosition', 'computeMaxColumns',
      'validateTiling', 'resolveSheetMm', 'normalizeTilingOptions', 'roundMm',
      'composeTiledHtml',
    ] as const
    for (const name of fns) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function')
    }
    expect(core.TILE_DEFAULTS.columns).toBe(2)
    expect(core.TILE_DEFAULTS.sheetPaperSize).toBe('A4')
    expect(new core.TilingError('COLUMNS_OVERFLOW', 'x')).toBeInstanceOf(Error)
  })
})
