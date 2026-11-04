import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Editor from '../../../src/app/components/rules/ProcedureMailTypeMapping.vue'

let app: App | undefined
let host: HTMLDivElement

afterEach(() => { app?.unmount(); host?.remove() })
it('内置项锁定，自定义项可从树中新增和删除，复用映射表样式', async () => {
  host = document.createElement('div'); document.body.append(host)
  const save = vi.fn(), remove = vi.fn()
  app = createApp({ render: () => h(Editor, {
    procedures: [{ value: 'proc', label: '自定义事项' }],
    mailTypes: [{ id: 'leaf', name: '自定义类型全名', parentId: '' }],
    mappings: [{ id: 'diy', procedure: '已有事项', condition: 'our', mailTypeName: '已有类型' }],
    onSave: save, onRemove: remove
  }) })
  app.directive('hint', {})
  app.mount(host)
  expect(host.querySelector('.mapping-board .mapping-head')).not.toBeNull()
  expect(host.querySelector('input[aria-label="导入处理事项映射 Excel"]')).not.toBeNull()
  expect(host.querySelector('.mapping-actions')?.textContent).toContain('导出 Excel')
  expect(host.querySelectorAll('.builtin-row button:disabled')).toHaveLength(6)
  expect(host.querySelectorAll('.builtin-row .mapping-remove')).toHaveLength(0)
  ;(host.querySelector('.mapping-remove') as HTMLButtonElement).click()
  expect(remove).toHaveBeenCalledWith('diy')
  ;(host.querySelector('.procedure-picker .theme-select-trigger') as HTMLButtonElement).click()
  await nextTick(); await nextTick()
  const radio = document.querySelector('input[type="radio"]') as HTMLInputElement
  expect(radio).not.toBeNull()
  radio.click()
  await nextTick()
  ;(host.querySelector('.mapping-add .type-cell .theme-select-trigger') as HTMLButtonElement).click()
  await nextTick(); await nextTick()
  const leaf = [...document.querySelectorAll<HTMLButtonElement>('.theme-tree-pick')].find(node => node.textContent === '自定义类型全名')
  expect(leaf).toBeDefined(); leaf!.click()
  await nextTick()
  ;(host.querySelector('.mapping-add .solid') as HTMLButtonElement).click()
  expect(save).toHaveBeenCalledWith({ procedure: '自定义事项', condition: 'none', mailTypeName: '自定义类型全名', mailTypePath: '自定义类型全名' })
})
