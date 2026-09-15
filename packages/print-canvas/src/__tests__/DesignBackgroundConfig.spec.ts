import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import DesignBackgroundConfig from '../components/property/DesignBackgroundConfig.vue'
import { UPLOAD_DESIGN_BACKGROUND_KEY } from '../composables/useHostAdapter'

function setFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
}

function mountWith(
  uploader?: (file: File) => Promise<string>,
  modelValue?: { src: string; rotation: 0 | 90 | 180 | 270 },
) {
  return mount(DesignBackgroundConfig, {
    props: { modelValue },
    global: uploader
      ? { provide: { [UPLOAD_DESIGN_BACKGROUND_KEY as symbol]: computed(() => uploader) } }
      : {},
  })
}

describe('DesignBackgroundConfig', () => {
  it('未注入上传适配器时上传入口禁用', () => {
    const wrapper = mountWith(undefined)
    const label = wrapper.find('label')
    expect(label.classes()).toContain('disabled')
    expect(wrapper.find('input[type="file"]').attributes('disabled')).toBeDefined()
  })

  it('上传成功后发出 { src, rotation: 0 }', async () => {
    const uploader = vi.fn(async () => 'https://host.example.com/bg.png')
    const wrapper = mountWith(uploader)
    const input = wrapper.find('input[type="file"]')
    setFile(input.element as HTMLInputElement, new File(['x'], 'bg.png', { type: 'image/png' }))
    await input.trigger('change')
    expect(uploader).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { src: 'https://host.example.com/bg.png', rotation: 0 },
    ])
  })

  it('非图片文件被拒绝且不调用适配器', async () => {
    vi.stubGlobal('alert', vi.fn())
    const uploader = vi.fn(async () => 'https://host.example.com/bg.png')
    const wrapper = mountWith(uploader)
    const input = wrapper.find('input[type="file"]')
    setFile(input.element as HTMLInputElement, new File(['x'], 'a.txt', { type: 'text/plain' }))
    await input.trigger('change')
    expect(uploader).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('点击旋转按 0→90 循环发出新角度', async () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 0 })
    await wrapper.find('button.rotate-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { src: 'https://host.example.com/bg.png', rotation: 90 },
    ])
  })

  it('点击移除发出 undefined', async () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 180 })
    await wrapper.find('button.remove-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([undefined])
  })

  it('已设置时只读展示完整路径', () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 0 })
    const path = wrapper.find('.design-background-path')
    expect(path.text()).toBe('https://host.example.com/bg.png')
    expect(path.attributes('title')).toBe('https://host.example.com/bg.png')
  })
})
