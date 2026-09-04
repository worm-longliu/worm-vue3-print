import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CellImage from '../components/elements/CellImage.vue'

describe('CellImage', () => {
  it('renders placeholder when no value', () => {
    const wrapper = mount(CellImage, {
      props: { value: '' }
    })
    expect(wrapper.find('.image-placeholder').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders image when value is provided', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png' }
    })
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('/test-image.png')
  })

  it('applies fit style', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png', fit: 'cover' }
    })
    expect(wrapper.find('img').attributes('style')).toContain('object-fit: cover')
  })

  it('applies max width and height', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png', maxWidth: 50, maxHeight: 30 }
    })
    expect(wrapper.find('img').attributes('style')).toContain('max-width: 50mm')
    expect(wrapper.find('img').attributes('style')).toContain('max-height: 30mm')
  })
})