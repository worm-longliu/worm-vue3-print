// @vitest-environment happy-dom
// common 侧出纸裁切提示（与 canvas 的 print-designer-geometry.spec.ts 成对）：
// 预估口径不阻断保存，但点保存必须让用户看到「会被裁切」；宿主导出旁路可自行取同一批文案。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DesignerStore } from '../core/store'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

function stubStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => map.clear(),
    },
  })
}

function frame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function mountDesigner(options: Record<string, any>) {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  await frame()
  const store = (el as unknown as { store: DesignerStore }).store
  store.updateTemplateData({
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [],
  } as never)
  store.addElement('text', options)
  await frame()
  return el
}

const alertSpy = vi.fn()

beforeEach(() => {
  stubStorage()
  alertSpy.mockClear()
  vi.stubGlobal('alert', alertSpy)
})

describe('common 保存闸门的出纸裁切提示', () => {
  it('元素超出纸面右缘：仍正常派 save，并弹一次「出纸提示」', async () => {
    const el = await mountDesigner({ left: 150, top: 100, width: 100, height: 20, formatter: 'X' })
    const saves: string[] = []
    el.addEventListener('save', e => saves.push(String((e as CustomEvent).detail)))

    el.save()
    await frame()

    expect(saves).toHaveLength(1)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const msg = String(alertSpy.mock.calls[0]![0])
    expect(msg).toContain('出纸提示')
    expect(msg).toContain('50')
  })

  it('干净模板不打扰（无提示、正常保存）', async () => {
    const el = await mountDesigner({ left: 20, top: 100, width: 100, height: 20, formatter: 'X' })
    el.save()
    await frame()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('getGeometryWarnings() 返回与出纸同源的文案（导出旁路可自行展示）', async () => {
    const el = await mountDesigner({ left: 20, top: 10, width: 100, height: 20, rotate: 45, formatter: 'Y' })
    const warnings = el.getGeometryWarnings()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('22.43')
  })

  it('拼版非法优先阻断，不叠加出纸提示（一次只说一件事）', async () => {
    const el = await mountDesigner({ left: 150, top: 100, width: 100, height: 20, formatter: 'X' })
    const store = (el as unknown as { store: DesignerStore }).store
    store.updateTemplateData({
      paperSize: 'CUSTOM', customWidth: 70, customHeight: 40,
      tiling: {
        enabled: true, sheetPaperSize: 'A4', sheetOrientation: 'portrait',
        sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 }, gapX: 2, gapY: 2, columns: 9,
      },
    } as never)
    const saves: string[] = []
    el.addEventListener('save', e => saves.push(String((e as CustomEvent).detail)))

    el.save()
    await frame()

    expect(saves).toHaveLength(0)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(String(alertSpy.mock.calls[0]![0])).toContain('最多可放')
  })
})
