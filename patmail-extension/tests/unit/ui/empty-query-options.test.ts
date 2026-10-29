import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import TreeOptionSelect from '../../../src/shell/components/TreeOptionSelect.vue'
import { buildPickerCatalog } from '../../../src/api/dictionaries/picker-catalog'
import { rememberChoices, rememberDictionaries, savedChoices } from '../../../src/query/option-fallback'
let app: App | undefined
let host: HTMLElement
function mount(props: Record<string, unknown>) {
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(TreeOptionSelect, { options: [], ...props }) }); app.mount(host)
}
afterEach(() => { app?.unmount(); host?.remove() })
it('ApplyTags:null produces a nonexpandable account status without an empty interactive panel', async () => {
  const dictionary = buildPickerCatalog({ applyTags: { ApplyTags: null } }).dictionaries.applyTags
  mount({ options: dictionary.options, status: dictionary.status, emptyText: '当前账号未配置专利标签' })
  host.querySelector('button')?.click(); await nextTick()
  expect(host.textContent).toContain('当前账号未配置专利标签')
  expect(document.querySelector('[role=tree]')).toBeNull()
  expect(host.querySelector('.theme-select-chevron')).toBeNull()
})
it('distinguishes failed, missing and malformed responses from explicit empty', () => {
  for (const source of [undefined, null, {}, { ApplyTags: {} }, { ApplyTags: [null] }]) {
    expect(buildPickerCatalog({ applyTags: source }).dictionaries.applyTags.status).toBe('invalid')
  }
  expect(buildPickerCatalog({ applyTags: { ApplyTags: [] } }).dictionaries.applyTags.status).toBe('empty')
})
it('records explicit empty tombstones', () => {
  rememberChoices('empty-regression', 'apply_tags_id', [{ value: 'old', label: '旧标签' }])
  rememberDictionaries('empty-regression', { apply_tags_id: 'applyTags' }, buildPickerCatalog({ applyTags: { ApplyTags: null } }).dictionaries)
  expect(savedChoices('empty-regression', 'apply_tags_id')).toEqual([])
})
it('renders loading and failure retry separately', () => {
  const retry = vi.fn()
  mount({ status: 'loading', onRetry: retry })
  expect(host.textContent).toContain('正在读取选项')
  app?.unmount(); host.remove()
  mount({ status: 'invalid', onRetry: retry })
  expect(host.textContent).toContain('选项读取失败')
  ;Array.from(host.querySelectorAll('button')).find(button => button.textContent === '重试')?.click()
  expect(retry).toHaveBeenCalledOnce()
})
it('shows unresolved history outside selectable nodes and permits explicit clearing', () => {
  const update = vi.fn()
  mount({ status: 'empty', modelValue: 'old', 'onUpdate:modelValue': update })
  expect(host.textContent).toContain('原选项当前不可用')
  expect(host.textContent).toContain('old')
  ;Array.from(host.querySelectorAll('button')).find(button => button.textContent === '清除原选项')?.click()
  expect(update).toHaveBeenCalledWith('')
})
it('retains search when a loaded tree has no matching options', async () => {
  mount({ status: 'ready', options: [{ value: 'a', label: '部门' }] })
  host.querySelector('button')?.click(); await nextTick()
  const input = document.querySelector<HTMLInputElement>('.theme-tree-search input')!
  input.value = 'no-match'; input.dispatchEvent(new Event('input')); await nextTick()
  document.querySelector<HTMLButtonElement>('.theme-tree-query')!.click(); await nextTick()
  expect(document.querySelector('.theme-tree-list')?.textContent).toContain('没有匹配')
  expect(document.querySelector('.theme-tree-search input')).not.toBeNull()
})

it('does not confuse a filtered source with an explicitly empty source', () => {
  const filtered = buildPickerCatalog({ limitInit: { case_status: [{ value: 'proc', text_zh_cn: '年费', status_class: 'PROC' }] } }).dictionaries.limitCaseStatus
  expect(filtered.status).toBe('ready')
  expect(filtered.options).toEqual([])
  expect(buildPickerCatalog({ limitInit: { case_status: [null] } }).dictionaries.limitCaseStatus.status).toBe('invalid')
})
