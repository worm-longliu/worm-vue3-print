// 统一元素定义注册表：内置与插件同权、可覆盖、可注销，且 UI 分派真的走同一张表。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearElementUIs, defineElementUI, registerElementUI } from '@worm-vue3-print/plugin-kit'
import { clearElementPlugins, defineElementPlugin, registerElementPlugin } from '@worm-vue3-print/core/designer'
import {
  BUILTIN_ELEMENT_DEFINITIONS,
  getElementDefinition,
  getElementDefinitions,
  getElementDblEditableField,
  getElementLayerIcon,
  getElementPropertyGroup,
  getMaterialElementDefinitions,
  registerElementDefinition,
  registerElementRenderer,
  resetElementDefinitions,
  subscribeElementDefinitions,
} from '../core/element-definitions'
import { renderDesignElement } from '../shell/elements'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import type { ShellCtx } from '../shell/controls'
import { DesignerStore } from '../core/store'
import { FormatToolbar } from '../core/format'
import { render } from '../core/h'

function element(type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return {
    id: `el-${type}`,
    printElementType: { type, title: type },
    options: { left: 0, top: 0, width: 20, height: 10, ...options },
  } as unknown as RuntimeElement
}

afterEach(() => {
  clearElementPlugins()
  clearElementUIs()
  resetElementDefinitions()
})

describe('统一元素定义注册表：内置基线', () => {
  it('13 类内置定义，11 类可进素材台，顺序与旧静态表一致', () => {
    expect(BUILTIN_ELEMENT_DEFINITIONS).toHaveLength(13)
    expect(getMaterialElementDefinitions().map(d => d.type)).toEqual([
      'text', 'barcode', 'qrcode', 'image', 'table', 'longText', 'flowList',
      'hline', 'vline', 'rect', 'oval',
    ])
    expect(getElementDefinitions()).toHaveLength(13)
  })

  it('属性台分组 / 双击字段 / 图层图标逐项对齐旧硬编码', () => {
    expect(getElementPropertyGroup('text')).toBe('text')
    expect(getElementPropertyGroup('longText')).toBe('text')
    expect(getElementPropertyGroup('barcode')).toBe('code')
    expect(getElementPropertyGroup('qrcode')).toBe('code')
    expect(getElementPropertyGroup('table')).toBe('table')
    expect(getElementPropertyGroup('rect')).toBe('general')
    expect(getElementDblEditableField('text')).toBe('formatter')
    expect(getElementDblEditableField('flowList')).toBe('formatter')
    expect(getElementDblEditableField('image')).toBe('src')
    expect(getElementDblEditableField('table')).toBeUndefined()
    expect(getElementLayerIcon('html')).toBe('Code')
    expect(getElementLayerIcon('flowList')).toBe('List')
    expect(getElementLayerIcon('unknown')).toBe('Shapes')
  })

  it('内置渲染器已注入：text / image / line / shape 均走注册表分派', () => {
    for (const type of ['text', 'longText', 'hline', 'vline', 'rect', 'oval', 'image', 'qrcode', 'barcode', 'html', 'pageNumber', 'table', 'flowList']) {
      expect(getElementDefinition(type)?.renderContent, type).toBeTypeOf('function')
    }
  })
})

describe('统一元素定义注册表：插件与内置同权', () => {
  it('自定义元素注册后立即出现在素材台，注销后消失', () => {
    const release = registerElementDefinition({
      type: 'signature', label: '手写签名', icon: 'PenLine', material: true,
      propertyGroup: 'general', dblEditableField: 'src', group: '扩展',
    })
    try {
      expect(getMaterialElementDefinitions().map(d => d.type)).toContain('signature')
      const def = getElementDefinition('signature')!
      expect(def).toMatchObject({ label: '手写签名', origin: 'custom', dblEditableField: 'src' })
      expect(getElementDblEditableField('signature')).toBe('src')
      expect(getElementLayerIcon('signature')).toBe('PenLine')
    } finally {
      release()
    }
    expect(getElementDefinition('signature')).toBeUndefined()
    expect(getMaterialElementDefinitions().map(d => d.type)).not.toContain('signature')
  })

  it('插件可覆盖内置定义（标签/图标/分组/双击字段），注销后回落内置基线', () => {
    const release = registerElementDefinition({
      type: 'text', label: '富文本', icon: 'FileText', material: true,
      propertyGroup: 'general', dblEditableField: 'styler',
    })
    try {
      expect(getElementDefinition('text')).toMatchObject({ label: '富文本', icon: 'FileText', origin: 'custom' })
      expect(getElementPropertyGroup('text')).toBe('general')
      expect(getElementDblEditableField('text')).toBe('styler')
      // 覆盖不应改变素材台顺序
      expect(getMaterialElementDefinitions()[0]?.label).toBe('富文本')
    } finally {
      release()
    }
    expect(getElementDefinition('text')).toMatchObject({ label: '文本', icon: 'Type', origin: 'builtin' })
    expect(getElementPropertyGroup('text')).toBe('text')
  })

  it('同 type 后注册覆盖，旧句柄不会误删新版', () => {
    const a = registerElementDefinition({ type: 'text', label: 'A', icon: 'Type', material: true, propertyGroup: 'text' })
    const b = registerElementDefinition({ type: 'text', label: 'B', icon: 'Type', material: true, propertyGroup: 'text' })
    expect(getElementDefinition('text')?.label).toBe('B')
    a()
    expect(getElementDefinition('text')?.label).toBe('B')
    b()
    expect(getElementDefinition('text')?.label).toBe('文本')
  })

  it('渲染器覆盖真的改变画布内容，注销后回到内置渲染', () => {
    const store = new DesignerStore()
    const ctx: ShellCtx = {
      store, format: new FormatToolbar(store),
      state: {
        leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
        openDd: null, openMore: false, collapsedGroups: new Set(), renamingPage: null,
      } as unknown as ShellCtx['state'],
      repaint: () => {}, fire: () => {}, showHelp: false, isEdit: false, host: {},
    }
    const textEl = element('text', { formatter: '原始文本' })
    const mount = document.createElement('div')
    render(renderDesignElement(ctx, textEl), mount)
    expect(mount.querySelector('.print-text')?.textContent).toContain('原始文本')

    const release = registerElementRenderer('text', () => {
      const box = document.createElement('div')
      box.className = 'custom-text-renderer'
      box.textContent = '插件接管'
      return box
    })
    try {
      mount.replaceChildren()
      render(renderDesignElement(ctx, textEl), mount)
      expect(mount.querySelector('.custom-text-renderer')?.textContent).toBe('插件接管')
      expect(mount.querySelector('.print-text')).toBeNull()
    } finally {
      release()
    }
    mount.replaceChildren()
    render(renderDesignElement(ctx, textEl), mount)
    expect(mount.querySelector('.print-text')?.textContent).toContain('原始文本')
    expect(mount.querySelector('.custom-text-renderer')).toBeNull()
  })

  it('注册态变化会通知宿主重绘', () => {
    const listener = vi.fn()
    const unsub = subscribeElementDefinitions(listener)
    const release = registerElementDefinition({
      type: 'stamp', label: '印章', icon: 'Stamp', material: true, propertyGroup: 'general',
    })
    expect(listener).toHaveBeenCalled()
    release()
    expect(listener).toHaveBeenCalledTimes(2)
    unsub()
    const another = registerElementDefinition({
      type: 'stamp2', label: '印章2', icon: 'Stamp', material: true, propertyGroup: 'general',
    })
    expect(listener).toHaveBeenCalledTimes(2)
    another()
  })

  it('core 插件 kind + plugin-kit UI 的元素自动成为统一定义', () => {
    const plugin = defineElementPlugin({
      id: 'test-definition-plugin', version: '1.0.0',
      kinds: [{ type: 'gauge2', label: '仪表盘2', icon: 'Gauge' }],
    })
    const ui = defineElementUI({
      types: ['gauge2'],
      renderCanvas: () => '<div>gauge</div>',
    })
    const releasePlugin = registerElementPlugin(plugin)
    const releaseUI = registerElementUI(ui)
    try {
      const def = getElementDefinition('gauge2')
      expect(def).toMatchObject({ type: 'gauge2', label: '仪表盘2', icon: 'Gauge', origin: 'plugin', material: true })
      expect(getElementDefinitions().map(d => d.type)).toContain('gauge2')
      expect(getElementLayerIcon('gauge2')).toBe('Gauge')
    } finally {
      releaseUI()
      releasePlugin()
    }
    expect(getElementDefinition('gauge2')).toBeUndefined()
  })
})
