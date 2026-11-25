import { createApp, h, ref, nextTick, type App } from 'vue'
import { afterEach, expect, it } from 'vitest'
import TreeOptionSelect from '../../../src/shell/components/TreeOptionSelect.vue'
let app: App | undefined
let host: HTMLDivElement
const options = [{ value: 'root', label: '根' }, { value: 'group', label: '分类', parent: 'root', selectable: false }, { value: 'a', label: '甲', parent: 'group' }, { value: 'b', label: '乙', parent: 'group' }]
async function settle() { await nextTick(); await nextTick() }
afterEach(() => { app?.unmount(); host?.remove() })
it('勾选折叠父节点也联动全部子项，取消子项回传并显示半选', async () => {
  const value = ref('')
  host = document.createElement('div'); document.body.append(host)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  app = createApp({ render: () => h(TreeOptionSelect, { options, modelValue: value.value, 'onUpdate:modelValue': next => { value.value = next } }) })
  app.directive('hint', {}); app.mount(host)
  ;(host.querySelector('.theme-select-trigger') as HTMLButtonElement).click(); await settle()
  ;(document.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); await settle()
  expect(value.value.split(',')).toEqual(['root', 'a', 'b'])
  ;(document.querySelector('.theme-tree-toggle') as HTMLButtonElement).click(); await settle()
  const group = [...document.querySelectorAll<HTMLElement>('.theme-tree-row')].find(row => row.textContent?.includes('分类'))!
  expect((group.querySelector('input') as HTMLInputElement).disabled).toBe(false)
  ;(group.querySelector('.theme-tree-toggle') as HTMLButtonElement).click(); await settle()
  const leaf = [...document.querySelectorAll<HTMLElement>('.theme-tree-row')].find(row => row.textContent?.trim() === '甲')!
  ;(leaf.querySelector('input') as HTMLInputElement).click(); await settle()
  expect(value.value).toBe('b')
  expect((group.querySelector('input') as HTMLInputElement).indeterminate).toBe(true)
})
it('单选树仍然只选择一个节点', async () => {
  const value = ref('')
  host = document.createElement('div'); document.body.append(host)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  app = createApp({ render: () => h(TreeOptionSelect, { options, multiple: false, modelValue: value.value, 'onUpdate:modelValue': next => { value.value = next } }) })
  app.directive('hint', {}); app.mount(host)
  ;(host.querySelector('.theme-select-trigger') as HTMLButtonElement).click(); await settle()
  ;(document.querySelector('input[type="radio"]') as HTMLInputElement).click(); await settle()
  expect(value.value).toBe('root')
})

it('叶子限定的单选树不能选择分类，展开后可以选择具体项', async () => {
  const value = ref('')
  host = document.createElement('div'); document.body.append(host)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  app = createApp({ render: () => h(TreeOptionSelect, { options, multiple: false, leavesOnly: true, modelValue: value.value, 'onUpdate:modelValue': next => { value.value = next } }) })
  app.directive('hint', {}); app.mount(host)
  ;(host.querySelector('.theme-select-trigger') as HTMLButtonElement).click(); await settle()
  const parentRadio = document.querySelector('input[type="radio"]') as HTMLInputElement
  expect(parentRadio.disabled).toBe(true)
  parentRadio.click(); await settle(); expect(value.value).toBe('')
  ;(document.querySelector('.theme-tree-toggle') as HTMLButtonElement).click(); await settle()
  const group = [...document.querySelectorAll<HTMLElement>('.theme-tree-row')].find(row => row.textContent?.includes('分类'))!
  ;(group.querySelector('.theme-tree-toggle') as HTMLButtonElement).click(); await settle()
  const leaf = [...document.querySelectorAll<HTMLElement>('.theme-tree-row')].find(row => row.textContent?.trim() === '甲')!
  ;(leaf.querySelector('input') as HTMLInputElement).click(); await settle()
  expect(value.value).toBe('a')
})

it('hideParentRadio 隐藏父节点单选框并点击展开，且打开时自动展开已选项祖先', async () => {
  const value = ref('a')
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(TreeOptionSelect, { options, multiple: false, leavesOnly: true, hideParentRadio: true, modelValue: value.value, 'onUpdate:modelValue': (next: string) => { value.value = next } }) })
  app.directive('hint', {}); app.mount(host)
  ;(host.querySelector('.theme-select-trigger') as HTMLButtonElement).click(); await settle()

  const rows = [...document.querySelectorAll<HTMLElement>('.theme-tree-row')]
  const rootRow = rows.find(row => row.textContent?.includes('根'))!
  expect(rootRow.querySelector('input[type="radio"]')).toBeNull()
  expect(rows.some(row => row.textContent?.includes('甲'))).toBe(true)

  const leafB = rows.find(row => row.textContent?.trim() === '乙')!
  ;(leafB.querySelector('input[type="radio"]') as HTMLInputElement).click(); await settle()
  expect(value.value).toBe('b')

  ;(host.querySelector('.theme-select-trigger') as HTMLButtonElement).click(); await settle()
  const pickBtn = document.querySelector<HTMLButtonElement>('.theme-tree-pick')!
  pickBtn.click(); await settle()
  expect(document.querySelectorAll('.theme-tree-row').length).toBe(1)
})
