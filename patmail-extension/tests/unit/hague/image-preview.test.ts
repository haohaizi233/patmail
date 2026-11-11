import { expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import ImagePreview from '../../../src/app/components/ImagePreview.vue'

it('supports navigation, zoom, escape dismissal and returning focus to the thumbnail', async () => {
  const index = ref<number | null>(null), root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h('div', [h('button', { id: 'thumbnail', onClick: () => { index.value = 0 } }, 'preview'), h(ImagePreview, { index: index.value, 'onUpdate:index': (v: number | null) => { index.value = v }, items: [{ src: 'blob:a', label: '1.1.jpg' }, { src: 'blob:b', label: '1.2.jpg' }] })]) })
  app.mount(root)
  try {
    const button = root.querySelector<HTMLButtonElement>('button')!
    button.focus(); button.click(); await nextTick(); await nextTick()
    const dialog = document.querySelector<HTMLElement>('[aria-label="图片放大预览"]')!
    expect(dialog).not.toBeNull()
    dialog.querySelector<HTMLButtonElement>('[aria-label="下一张图片"]')!.click(); await nextTick()
    expect(dialog.textContent).toContain('1.2.jpg')
    dialog.querySelector<HTMLButtonElement>('[aria-label="放大图片"]')!.click(); await nextTick()
    expect(dialog.textContent).toContain('125%')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick(); await nextTick()
    expect(index.value).toBeNull(); expect(document.activeElement).toBe(button)
  } finally { app.unmount(); root.remove() }
})
