import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import PresetColorPicker from '../components/PresetColorPicker.vue'
import { PRESET_COLORS } from '../utils/preset-colors'

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
})
