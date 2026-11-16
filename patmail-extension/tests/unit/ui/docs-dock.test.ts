import { createApp, nextTick } from 'vue'
import { expect, it, vi } from 'vitest'
import DocsDock from '../../../src/app/components/DocsDock.vue'
vi.mock('../../../src/app/components/MermaidDiagram.vue', () => ({
  default: { template: '<span>图表由浏览器回归验证</span>' },
}))
it('searches the offline technical tree, shows verification provenance, and explains hidden targets', async () => {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(DocsDock)
  app.mount(root)
  try {
    root.querySelector('button')!.click()
    await nextTick()
    const dialog = document.querySelector<HTMLElement>('[aria-label="PatMail 文档"]')!
    expect(dialog.textContent).toContain('逆向与算法')
    const search = dialog.querySelector<HTMLInputElement>('[aria-label="搜索文档标题"]')!
    search.value = 'AST'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    const ast = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'JavaScript AST')!
    ast.click()
    await vi.waitFor(() => expect(dialog.querySelector('.docs-md')?.textContent).toContain('核心过程'))
    expect(ast.classList.contains('on')).toBe(true)
    expect(dialog.querySelector('.docs-provenance')?.textContent).toContain('de2ee0d')
    search.value = ''
    search.dispatchEvent(new Event('input'))
    await nextTick()
    const section = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent === '海牙协议研究',
    )!
    expect(section.getAttribute('aria-expanded')).toBe('true')
    section.click()
    await nextTick()
    expect(section.getAttribute('aria-expanded')).toBe('false')
    section.click()
    await nextTick()
    expect(section.getAttribute('aria-expanded')).toBe('true')
    ;[...dialog.querySelectorAll('button')].find(button => button.textContent === '技术知识总览')!.click()
    await vi.waitFor(() => expect(dialog.querySelector('.docs-md')?.textContent).toContain('事实与历史'))
    ;[...dialog.querySelectorAll<HTMLAnchorElement>('a')].find(a => a.textContent === '历史索引')!.click()
    await nextTick()
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('历史档案')
  } finally {
    app.unmount()
    root.remove()
  }
})
