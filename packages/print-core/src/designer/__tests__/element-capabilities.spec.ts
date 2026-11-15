import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_ELEMENT_CAPABILITIES,
  getElementCapabilities,
  getElementCapabilityTypes,
  registerElementCapabilities,
  resetElementCapabilities,
} from '../element-capabilities.js'
import { defineElementPlugin, registerElementPlugin, clearElementPlugins } from '../element-plugin-registry.js'
import { getZoneAllowedTypes, isZoneAllowedType, ZONE_ALLOWED_TYPES } from '../utils/zone-layout.js'
import { isRotationExcludedType, isFreeAngleEditable, resolveElementRotation, CODE_ROTATION_MIN_DPI } from '../../render/rotation.js'
import { resolveElementTextFit } from '../../render/text-fit.js'
import { acceptsElementBorder, resolveElementBorder } from '../../render/element-border.js'
import { ELEMENT_BINDING_REGISTRY, getElementBindings } from '../utils/binding-registry.js'
import { createDefaultOptions, createRuntimeElement, isBlockedElementType, BLOCKED_ELEMENT_TYPES } from '../utils/element-factory.js'

afterEach(() => {
  clearElementPlugins()
  resetElementCapabilities()
})

describe('元素能力位注册表：内置基线', () => {
  it('13 类内置元素全部预注册，顺序稳定', () => {
    const types = getElementCapabilityTypes()
    expect(types).toHaveLength(13)
    expect(types).toEqual(Object.keys(BUILTIN_ELEMENT_CAPABILITIES))
  })

  it('六处历史白名单取值与基线逐项一致（零回归）', () => {
    expect(getZoneAllowedTypes()).toEqual(['text', 'barcode', 'qrcode', 'image', 'hline', 'vline', 'rect', 'oval'])
    expect(ZONE_ALLOWED_TYPES).toEqual(getZoneAllowedTypes())
    expect(isZoneAllowedType('table')).toBe(false)
    expect(BLOCKED_ELEMENT_TYPES).toEqual(['html'])
    expect(isBlockedElementType('html')).toBe(true)
    expect(isBlockedElementType('text')).toBe(false)
    expect(isRotationExcludedType('table')).toBe(true)
    expect(isRotationExcludedType('flowList')).toBe(true)
    expect(isRotationExcludedType('text')).toBe(false)
    expect(resolveElementTextFit('longText', {})).toBe('autoHeight')
    expect(resolveElementTextFit('flowList', {})).toBe('clip')
    expect(acceptsElementBorder('text')).toBe(true)
    expect(acceptsElementBorder('rect')).toBe(false)
    expect(ELEMENT_BINDING_REGISTRY['longText']).toHaveLength(2)
    expect(createDefaultOptions('text')).toMatchObject({ fontSize: 12, textAlign: 'left', height: 5.3 })
    expect(createRuntimeElement('qrcode').printElementType.title).toBe('二维码')
  })

  it('出厂默认值只有一个出口：base 盒来自共享源', () => {
    expect(createDefaultOptions('pageNumber')).toEqual({ left: 7, top: 17.6, width: 42.3, height: 7.1 })
    expect(createDefaultOptions('table').tablePagination).toEqual({ enabled: true })
  })
})

describe('元素能力位注册表：插件与内置同权', () => {
  it('注册自定义类型后，六处消费点立即认它', () => {
    const release = registerElementCapabilities('myChart', {
      zoneAllowed: true,
      rotationExcluded: true,
      defaultTextFit: 'autoHeight',
      acceptsElementBorder: false,
      bindings: [{ targetPath: 'options.formatter', label: '图表标题', dataSource: 'main' }],
      defaultOptions: () => ({ width: 60, height: 40, title: '图表' }),
      title: '图表',
    })
    try {
      expect(isZoneAllowedType('myChart')).toBe(true)
      expect(getZoneAllowedTypes()).toContain('myChart')
      expect(isRotationExcludedType('myChart')).toBe(true)
      expect(resolveElementRotation('myChart', { rotate: 30 })).toBeUndefined()
      expect(resolveElementTextFit('myChart', {})).toBe('autoHeight')
      expect(acceptsElementBorder('myChart')).toBe(false)
      expect(resolveElementBorder('myChart', { borderWidth: 1 })).toBeNull()
      expect(getElementBindings({ printElementType: { type: 'myChart' }, options: {} })).toHaveLength(1)
      expect(createDefaultOptions('myChart')).toMatchObject({ width: 60, height: 40, title: '图表' })
      expect(createRuntimeElement('myChart').printElementType.title).toBe('图表')
    } finally {
      release()
    }
    // 注销后回到未注册态：按历史默认回落，不残留插件能力
    expect(isZoneAllowedType('myChart')).toBe(false)
    expect(isRotationExcludedType('myChart')).toBe(false)
    expect(resolveElementTextFit('myChart', {})).toBe('clip')
    expect(acceptsElementBorder('myChart')).toBe(true)
    expect(getElementCapabilities('myChart')).toEqual({ type: 'myChart' })
  })

  it('插件可以覆盖内置类型的声明，注销后回落内置基线', () => {
    const release = registerElementCapabilities('text', {
      zoneAllowed: false,
      defaultTextFit: 'autoHeight',
      title: '富文本',
    })
    try {
      expect(isZoneAllowedType('text')).toBe(false)
      expect(resolveElementTextFit('text', {})).toBe('autoHeight')
      expect(createRuntimeElement('text').printElementType.title).toBe('富文本')
      // 未覆盖的能力位仍从内置基线回落（浅覆盖不丢其它声明）
      expect(acceptsElementBorder('text')).toBe(true)
    } finally {
      release()
    }
    expect(isZoneAllowedType('text')).toBe(true)
    expect(resolveElementTextFit('text', {})).toBe('clip')
    expect(createRuntimeElement('text').printElementType.title).toBe('文本')
  })

  it('同 type 后注册覆盖，旧句柄不会误删新声明', () => {
    const releaseA = registerElementCapabilities('text', { title: 'A' })
    const releaseB = registerElementCapabilities('text', { title: 'B' })
    expect(getElementCapabilities('text').title).toBe('B')
    releaseA()
    expect(getElementCapabilities('text').title).toBe('B')
    releaseB()
    expect(getElementCapabilities('text').title).toBe('文本')
  })

  it('未声明任何能力位的类型走历史默认', () => {
    expect(isZoneAllowedType('unknown')).toBe(false)
    expect(isRotationExcludedType('unknown')).toBe(false)
    expect(isFreeAngleEditable('unknown')).toBe(true)
    expect(resolveElementTextFit('unknown', {})).toBe('clip')
    expect(acceptsElementBorder('unknown')).toBe(true)
    expect(getElementBindings({ printElementType: { type: 'unknown' }, options: {} })).toEqual([])
  })

  it('码类 dpi 门槛由能力位决定，自定义类型也能声明', () => {
    expect(isFreeAngleEditable('barcode')).toBe(false)
    expect(isFreeAngleEditable('barcode', { printerDpi: CODE_ROTATION_MIN_DPI })).toBe(true)
    const release = registerElementCapabilities('myCode', { codeRotationDpiGated: true })
    try {
      expect(isFreeAngleEditable('myCode')).toBe(false)
      // 低 dpi 时斜角吸附到 0 → undefined；达到门槛按声明角放行
      expect(resolveElementRotation('myCode', { rotate: 30 }, 300)).toBeUndefined()
      expect(resolveElementRotation('myCode', { rotate: 30 }, CODE_ROTATION_MIN_DPI)).toBe(30)
    } finally {
      release()
    }
    expect(isFreeAngleEditable('myCode')).toBe(true)
  })
})

describe('元素能力位注册表：与 core 插件注册联动', () => {
  it('kind.capabilities 随插件注册自动进入统一能力表', () => {
    const plugin = defineElementPlugin({
      id: 'test-capability-plugin',
      version: '1.0.0',
      kinds: [{
        type: 'gauge',
        label: '仪表盘',
        capabilities: {
          zoneAllowed: true,
          rotationExcluded: true,
          defaultTextFit: 'shrink',
          bindings: [{ targetPath: 'options.formatter', label: '数值', dataSource: 'main' }],
          defaultOptions: () => ({ width: 50, height: 50 }),
          title: '仪表盘',
        },
      }],
    })
    const release = registerElementPlugin(plugin)
    try {
      expect(isZoneAllowedType('gauge')).toBe(true)
      expect(isRotationExcludedType('gauge')).toBe(true)
      expect(resolveElementTextFit('gauge', {})).toBe('shrink')
      expect(createRuntimeElement('gauge').options).toMatchObject({ width: 50, height: 50 })
      expect(createRuntimeElement('gauge').printElementType.title).toBe('仪表盘')
    } finally {
      release()
    }
    expect(isZoneAllowedType('gauge')).toBe(false)
    expect(getElementCapabilities('gauge')).toEqual({ type: 'gauge' })
  })

  it('旧插件只声明 fixedHeight / blocked 也自动入表', () => {
    const plugin = defineElementPlugin({
      id: 'test-legacy-plugin',
      version: '1.0.0',
      kinds: [{ type: 'legacyBlocked', label: '旧屏蔽', blocked: true, fixedHeight: true }],
    })
    const release = registerElementPlugin(plugin)
    try {
      expect(getElementCapabilities('legacyBlocked')).toMatchObject({ blocked: true, fixedHeight: true })
      expect(isBlockedElementType('legacyBlocked')).toBe(true)
    } finally {
      release()
    }
    expect(isBlockedElementType('legacyBlocked')).toBe(false)
  })
})
