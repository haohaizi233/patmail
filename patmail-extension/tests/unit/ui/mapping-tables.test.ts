import { createApp, createVNode, nextTick, type App, type Component } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import DescriptionEditor from '../../../src/app/components/rules/DescriptionMailTypeEditor.vue'
import ProcedureEditor from '../../../src/app/components/rules/ProcedureMailTypeMapping.vue'
let app: App | undefined
let host: HTMLDivElement
function mount(component: Component, props: Record<string, unknown>) {
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => createVNode(component, props) }); app.directive('hint', {}); app.mount(host)
}
afterEach(() => { app?.unmount(); host?.remove() })
for (const kind of ['description', 'procedure'] as const) {
  it(`${kind} 映射超过10行分页，搜索覆盖全部页且切回首页`, async () => {
    const descriptions = Array.from({ length: 14 }, (_, i) => ({ id: `d${i}`, fileDescriptionText: `描述${i}`, mailTypeId: `t${i}`, mailTypeName: `类型${i}`, enabled: true, version: 1, updatedAt: '' }))
    const procedures = descriptions.map((row, i) => ({ id: row.id, procedure: `事项${i}`, condition: 'none' as const, mailTypeName: row.mailTypeName }))
    mount(kind === 'description' ? DescriptionEditor : ProcedureEditor, {
      mappings: kind === 'description' ? descriptions : procedures, mailTypes: [], descriptions: [], procedures: [], notice: ''
    })
    expect(host.querySelectorAll('tbody > tr:not(.mapping-add)')).toHaveLength(10)
    const next = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === '下一页')!
    next.click(); await nextTick()
    expect(host.querySelector('.mapping-pagination')?.textContent).toContain('2 /')
    const search = host.querySelector<HTMLInputElement>('.mapping-search')!
    search.value = '类型13'; search.dispatchEvent(new Event('input')); await nextTick()
    expect(host.querySelectorAll('tbody > tr:not(.mapping-add)')).toHaveLength(1)
    expect(host.querySelector('tbody')?.textContent).toContain('类型13')
    expect(host.querySelector('.mapping-pagination')).toBeNull()
    search.value = ''; search.dispatchEvent(new Event('input')); await nextTick()
    expect(host.querySelector('.mapping-pagination')?.textContent).toContain('1 /')
  })
}
it('文件描述从查询表同款树选择后新增，原输入框已替换', async () => {
  const save = vi.fn()
  mount(DescriptionEditor, { mappings: [], mailTypes: [{ id: 'type', name: '发文类型', parentId: '' }], descriptions: [{ value: 'desc', label: '原站文件描述' }], notice: '', onSave: save })
  expect(host.querySelector('input[aria-label="文件描述"]')).toBeNull()
  ;(host.querySelector('.description-picker .theme-select-trigger') as HTMLButtonElement).click()
  await nextTick(); await nextTick()
  ;(document.querySelector('input[type="radio"]') as HTMLInputElement).click()
  await nextTick()
  ;(host.querySelector('.mapping-add .type-cell .theme-select-trigger') as HTMLButtonElement).click()
  await nextTick(); await nextTick()
  ;([...document.querySelectorAll<HTMLButtonElement>('.theme-tree-pick')].find(node => node.textContent === '发文类型')!).click()
  await nextTick()
  ;(host.querySelector('.mapping-add .solid') as HTMLButtonElement).click()
  expect(save).toHaveBeenCalledWith({ descriptionId: 'desc', description: '原站文件描述', mailTypeId: 'type', mailTypeName: '发文类型' })
})
