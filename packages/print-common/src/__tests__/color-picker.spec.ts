// @vitest-environment happy-dom
// 颜色选择器单测：移植 canvas PresetColorPicker.vue 的换算/输入/选中/清除语义，
// 断言口径与 canvas 侧同名用例（src/__tests__/PresetColorPicker.spec.ts）对齐。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESET_COLORS } from '@worm-vue3-print/core/designer'
import { render, h } from '../core/h'
import {
  closeColorPicker, colorPicker, hsvToRgb, normalizeHex, parseHex, rgbToHex, rgbToHsv,
} from '../shell/color-picker'

afterEach(() => {
  closeColorPicker()
  document.body.replaceChildren()
})

function mountPicker(opts: Parameters<typeof colorPicker>[0]): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(h('div', {}, [colorPicker(opts)]), host)
  return host.querySelector('.preset-color-trigger') as HTMLElement
}

/** 点触发钮开面板，返回面板节点（普通文档环境下面板挂到 document.body） */
function openPanel(trigger: HTMLElement): HTMLElement {
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  const panel = document.body.querySelector('.preset-color-panel') as HTMLElement
  expect(panel, '点击触发钮后面板应出现').toBeTruthy()
  return panel
}

describe('HSV ↔ hex 换算（与 canvas 组件内私有函数同口径）', () => {
  it('预设 12 色：hex → rgb → hsv → rgb → hex 往返无损', () => {
    for (const color of PRESET_COLORS) {
      const rgb = parseHex(color)
      expect(rgb, `${color} 应可解析`).toBeTruthy()
      const hsv = rgbToHsv(rgb!.r, rgb!.g, rgb!.b)
      expect(normalizeHex(rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)))).toBe(color)
    }
  })

  it('已知角点：红/青/灰的 HSV', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv(0, 255, 255)).toMatchObject({ h: 180, s: 1, v: 1 })
    const gray = rgbToHsv(128, 128, 128)
    expect(gray.h).toBe(0)
    expect(gray.s).toBe(0)
    expect(rgbToHex(hsvToRgb(gray.h, gray.s, gray.v))).toBe('#808080')
  })

  it('hsvToRgb 色相环绕：-90 与 270 同色', () => {
    expect(rgbToHex(hsvToRgb(-90, 1, 1))).toBe(rgbToHex(hsvToRgb(270, 1, 1)))
  })
})

describe('hex 解析合法性', () => {
  it('接受 3 位/6 位/无 # 形式并归一化为 6 位小写', () => {
    expect(normalizeHex('f00')).toBe('#ff0000')
    expect(normalizeHex('#FFF')).toBe('#ffffff')
    expect(normalizeHex('#1E88E5')).toBe('#1e88e5')
  })

  it('拒绝非 hex 字符串', () => {
    expect(parseHex('zzz')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('rgb(1,2,3)')).toBeNull()
    expect(normalizeHex('bogus')).toBe('#000000')
  })
})

describe('面板 DOM 结构与 canvas 逐字一致', () => {
  it('触发钮 / 面板分区 / 预设格类名', () => {
    const trigger = mountPicker({ value: '#333333', onChange: () => {} })
    expect(trigger.className).toBe('preset-color-trigger')
    expect(trigger.getAttribute('type')).toBe('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    const swatch = trigger.querySelector('.preset-color-swatch') as HTMLElement
    // happy-dom 原样保留 #333333，真实浏览器会归一为 rgb(51, 51, 51)，两种形态都接受
    expect(swatch.style.background.replace(/\s/g, '')).toMatch(/(#333333)|(rgb\(51,51,51\))/)

    const panel = openPanel(trigger)
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-label')).toBe('颜色选择')
    const sections = Array.from(panel.children).map(c => c.className)
    expect(sections).toEqual([
      'picker-preview', 'picker-area', 'picker-hue', 'picker-heading', 'preset-color-grid',
    ])
    const preview = panel.querySelector('.picker-preview')!
    const current = preview.querySelector('.picker-current') as HTMLElement
    expect(current.className).toBe('picker-current')
    expect(preview.querySelector('.picker-hex')).toBeTruthy()
    expect((panel.querySelector('.picker-area') as HTMLElement).style.getPropertyValue('--picker-hue')).toBe('0deg')
    expect(panel.querySelector('.picker-handle')).toBeTruthy()
    expect(panel.querySelector('.picker-heading > span')!.textContent).toBe('常用颜色')
    expect(panel.querySelector('.picker-clear')).toBeTruthy()
    const items = Array.from(panel.querySelectorAll('.preset-color-item'))
    expect(items).toHaveLength(PRESET_COLORS.length)
    // #333333 打开时对应预设格 active（大小写不敏感判定）
    const activeItems = items.filter(i => i.className === 'preset-color-item active')
    expect(activeItems).toHaveLength(1)
    expect(activeItems[0]!.getAttribute('title')).toBe('#333333')
  })

  it('无颜色时 .picker-current 带 is-empty、清除钮禁用', () => {
    const trigger = mountPicker({ value: undefined, onChange: () => {} })
    const panel = openPanel(trigger)
    expect((panel.querySelector('.picker-current') as HTMLElement).className).toBe('picker-current is-empty')
    expect((panel.querySelector('.picker-clear') as HTMLButtonElement).disabled).toBe(true)
    for (const item of panel.querySelectorAll('.preset-color-item')) {
      expect(item.className).toBe('preset-color-item')
    }
  })
})

describe('交互回写', () => {
  it('点预设色 → onPick 收到该色值，active 判定迁移', () => {
    const onPick = vi.fn()
    const trigger = mountPicker({ value: '#333333', onChange: onPick })
    const panel = openPanel(trigger)
    const target = Array.from(panel.querySelectorAll<HTMLElement>('.preset-color-item'))
      .find(i => i.getAttribute('title') === '#e53935')!
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).toHaveBeenCalledWith('#e53935')
    expect(target.className).toBe('preset-color-item active')
    expect((panel.querySelector('.picker-hex') as HTMLInputElement).value).toBe('#E53935')
  })

  it('hex 输入：非法不回写；合法回写归一值；清空回 undefined（等价 canvas 的 emit ""）', () => {
    const onPick = vi.fn()
    const trigger = mountPicker({ value: '#333333', onChange: onPick })
    const panel = openPanel(trigger)
    const hex = panel.querySelector('.picker-hex') as HTMLInputElement
    hex.value = 'zzzzzz'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onPick).not.toHaveBeenCalled()
    hex.value = 'f00'
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onPick).toHaveBeenLastCalledWith('#ff0000')
    expect(hex.value).toBe('#FF0000')
    hex.value = ''
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onPick).toHaveBeenLastCalledWith(undefined)
  })

  it('清除钮 → onPick 收到 undefined，is-empty 生效、预设全部脱选', () => {
    const onPick = vi.fn()
    const trigger = mountPicker({ value: '#333333', onChange: onPick })
    const panel = openPanel(trigger)
    const clearBtn = panel.querySelector('.picker-clear') as HTMLButtonElement
    expect(clearBtn.disabled).toBe(false)
    clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).toHaveBeenCalledWith(undefined)
    expect((panel.querySelector('.picker-current') as HTMLElement).className).toBe('picker-current is-empty')
    expect((panel.querySelector('.picker-hex') as HTMLInputElement).value).toBe('')
    for (const item of panel.querySelectorAll('.preset-color-item')) {
      expect(item.className).toBe('preset-color-item')
    }
  })

  it('clearable=false：无清除钮，hex 清空不回写', () => {
    const onPick = vi.fn()
    const trigger = mountPicker({ value: '#333333', clearable: false, onChange: onPick })
    const panel = openPanel(trigger)
    expect(panel.querySelector('.picker-clear')).toBeNull()
    const hex = panel.querySelector('.picker-hex') as HTMLInputElement
    hex.value = ''
    hex.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('面板关闭', () => {
  it('再次点击同一触发钮收起（canvas 的 toggle）', () => {
    const trigger = mountPicker({ value: '#333333', onChange: () => {} })
    openPanel(trigger)
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(document.body.querySelector('.preset-color-panel')).toBeNull()
  })

  it('Esc 关闭', () => {
    const trigger = mountPicker({ value: '#333333', onChange: () => {} })
    openPanel(trigger)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.body.querySelector('.preset-color-panel')).toBeNull()
  })

  it('外部 pointerdown 关闭；面板内 pointerdown 不关闭', () => {
    const trigger = mountPicker({ value: '#333333', onChange: () => {} })
    const panel = openPanel(trigger)
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    expect(document.body.querySelector('.preset-color-panel')).toBeTruthy()
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    expect(document.body.querySelector('.preset-color-panel')).toBeNull()
  })

  it('外壳重绘（clear 触发钮所在容器）不销毁面板，面板状态保留', () => {
    const trigger = mountPicker({ value: '#333333', onChange: () => {} })
    const panel = openPanel(trigger)
    // 模拟 print-designer paint()：清空 shell 容器后重画
    const shell = trigger.parentElement!.parentElement!
    while (shell.firstChild) shell.removeChild(shell.firstChild)
    expect(document.body.querySelector('.preset-color-panel')).toBe(panel)
    const hex = panel.querySelector('.picker-hex') as HTMLInputElement
    expect(hex.value).toBe('#333333')
  })
})
