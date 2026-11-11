import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import ThemeSelect from '../../../src/shell/components/ThemeSelect.vue'

describe('下拉菜单热加载稳定性', () => {
  it('首帧即定位，热加载不滚动外层页面，菜单保持展开', async () => {
    const scroll = vi.fn()
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    const options = ref([{ value: '', label: '使用默认' }])
    const el = document.createElement('div'); document.body.appendChild(el)
    const app = createApp({ render: () => h(ThemeSelect, { modelValue: '', options: options.value }) })
    app.directive('hint', {}); app.mount(el)
    try {
      const trigger = el.querySelector('button')!
      trigger.getBoundingClientRect = () => ({ top: 150, bottom: 186, left: 600, width: 350, right: 950, height: 36, x: 600, y: 150, toJSON: () => ({}) })
      trigger.click(); await nextTick(); await nextTick()
      const menu = document.querySelector<HTMLElement>('[role=listbox]')!
      expect(menu.style.top).not.toBe('')
      expect(scroll).not.toHaveBeenCalled()
      options.value = [{ value: '', label: '使用默认' }, { value: 'a', label: '热加载选项' }]
      await nextTick(); await nextTick()
      expect(document.querySelector('[role=listbox]')).toBe(menu)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      expect(scroll).not.toHaveBeenCalled()
    } finally { app.unmount(); el.remove(); HTMLElement.prototype.scrollIntoView = previous }
  })
})
