// packages/print-canvas/src/__tests__/StatusBar.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBar from '../components/StatusBar.vue'

const baseProps = {
  coordinate: null,
  scale: 100,
  elementCount: 3,
  selectedCount: 0,
  paper: 'A4',
  dirty: false,
}

describe('StatusBar 字体缺失汇总', () => {
  it('无缺失时不出现汇总项', () => {
    const w = mount(StatusBar, { props: { ...baseProps, fontIssues: [] } })
    expect(w.text()).not.toContain('字体缺失')
  })

  it('有缺失时显示条数', () => {
    const w = mount(StatusBar, {
      props: {
        ...baseProps,
        fontIssues: [{ family: 'KaiTi', sources: ['server'], targets: ['txt-1'] }],
      },
    })
    expect(w.text()).toContain('1 项字体缺失')
  })

  it('点击后展开明细，标出缺失端', async () => {
    const w = mount(StatusBar, {
      props: {
        ...baseProps,
        fontIssues: [
          { family: 'KaiTi', sources: ['server'], targets: ['txt-1'] },
          { family: 'SimSun', sources: ['server', 'client'], targets: ['tbl-1#r0c0'] },
        ],
      },
    })
    await w.find('.status-font-warn').trigger('click')
    expect(w.text()).toContain('KaiTi')
    expect(w.text()).toContain('服务端')
    expect(w.text()).toContain('两端')
  })
})
