import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import PresetColorPicker from '../components/PresetColorPicker.vue'
import { PRESET_COLORS } from '@worm-vue3-print/core/designer'

describe('PresetColorPicker', () => {
  it('shows preset colors in the popup', async () => {
    const wrapper = mount(PresetColorPicker, {
      props: { modelValue: '#000000' },
      attachTo: document.body,
    })

    await wrapper.find('button').trigger('click')

    const swatches = [...document.body.querySelectorAll<HTMLButtonElement>('.preset-color-item')]
    expect(swatches).toHaveLength(PRESET_COLORS.length)
    expect(swatches.map(item => item.title)).toEqual([...PRESET_COLORS])

    const target = swatches.find(item => item.title === '#1e88e5')!
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#1e88e5'])
    wrapper.unmount()
  })

  it('emits empty value when clicking the clear button in the panel', async () => {
    const wrapper = mount(PresetColorPicker, {
      props: { modelValue: '#ff0000' },
      attachTo: document.body,
    })

    await wrapper.find('button').trigger('click')

    const clearBtn = document.body.querySelector<HTMLButtonElement>('.picker-clear')!
    expect(clearBtn).toBeTruthy()
    expect(clearBtn.disabled).toBe(false)
    clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })

  it('disables the clear button when there is no color', async () => {
    const wrapper = mount(PresetColorPicker, {
      props: { modelValue: '' },
      attachTo: document.body,
    })

    await wrapper.find('button').trigger('click')

    const clearBtn = document.body.querySelector<HTMLButtonElement>('.picker-clear')!
    expect(clearBtn.disabled).toBe(true)
    wrapper.unmount()
  })

  it('hides the clear button when clearable is false', async () => {
    const wrapper = mount(PresetColorPicker, {
      props: { modelValue: '#ff0000', clearable: false },
      attachTo: document.body,
    })

    await wrapper.find('button').trigger('click')

    expect(document.body.querySelector('.picker-clear')).toBeNull()
    wrapper.unmount()
  })
})
