import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import QueryTemplateSection from '../../../src/floating/QueryTemplateSection.vue'
import LimitQuerySection from '../../../src/floating/LimitQuerySection.vue'
import FilingSearchQuery from '../../../src/app/components/FilingSearchQuery.vue'
import { MessageType, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import { buildPickerCatalog } from '../../../src/api/dictionaries/picker-catalog'
import { rememberChoices } from '../../../src/query/option-fallback'

const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const account = vi.hoisted(() => ({ userId: 'silent-pull' }))
vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return { useWorkspace: () => ({ connection: ref({ operatorId: account.userId }), call: async () => ({
    connection: { operatorId: account.userId }, customers: [], templates: []
  }) }) }
})
let app: App | undefined
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
async function settle() { for (let i = 0; i < 80; i++) { await Promise.resolve(); await nextTick() } }
function button(label: string, root: ParentNode = document) { return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.trim() === label) }

/** 有账本的界面走静默校对：拉取不挡界面（没账本的字段也不挂读取占位）、非空才更新、拉不到用账本兜底、更新了给提示。 */
for (const surface of ['文件', '期限', '递交'] as const) {
  it(`${surface}查询有账本时静默校对：拉取照常可选、更新给提示、拉不到用账本兜底`, async () => {
    const userId = surface === '文件' ? 'silent-file' : surface === '期限' ? 'silent-limit' : 'silent-filing'
    const key = surface === '递交' ? 'audit_user_id' : 'apply_tags_id'
    const label = surface === '递交' ? '办理人' : '专利标签'
    account.userId = userId
    rememberChoices(userId, key, [{ value: OLD, label: '账本选项' }])
    let mode: 'pending' | 'ready' | 'invalid' = 'pending'
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.LoadDictionary) {
        const kind = message.payload.kind
        if (kind === 'picker') {
          if (mode === 'pending') await gate
          if (mode === 'invalid') return { type: MessageType.DictionaryResult, payload: { ok: false, error: { code: 'INVALID_RESPONSE', message: '失败' } } }
          const rows = [{ id: NEW, name: '新选项', pid: '' }]
          return { type: MessageType.DictionaryResult, payload: { ok: true, data: { kind, ...buildPickerCatalog({ applyTags: { ApplyTags: rows }, user: { TreeUser: rows } }) } } }
        }
        return { type: MessageType.DictionaryResult, payload: { ok: true, data: { kind, dictionaries: {}, columns: [], nodes: [], rootIds: [], responseKeys: [] } } } as ContentResponse
      }
      if (message.type === MessageType.ListHistoryQueries) return { type: MessageType.HistoryQueriesResult, payload: { ok: true, data: [] } }
      if (message.type === MessageType.ScanFileSearchForm) return { type: MessageType.FileSearchFormResult, payload: { fields: [] } }
      if (message.type === MessageType.ScanFilingForm) return { type: MessageType.FilingFormResult, payload: { fields: [] } }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }
    const component = surface === '文件' ? QueryTemplateSection : surface === '期限' ? LimitQuerySection : FilingSearchQuery
    const host = document.body.appendChild(document.createElement('div'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 存量豁免：外部输入边界保留 any
    app = createApp({ render: () => h(component as any, {
      bridge: { request }, userId, canSearch: true, mode: 'history', pageSize: 20,
      onSearch: () => {}, onSearched: () => {}
    }) })
    app.directive('hint', {}); app.provide('bridge', { request }); app.mount(host); await settle()
    if (surface === '期限') { button('更多条件')?.click(); await settle() }
    const field = () => Array.from(host.querySelectorAll<HTMLElement>('.query-cell')).find(node => node.firstElementChild?.textContent === label)!
    expect(field()).toBeTruthy()
    // 拉取还在进行：整个界面都不进 loading，没账本的字段也不挂「正在读取选项」，直接给账本上的选项。
    expect(host.textContent).not.toContain('正在读取选项')
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    expect(document.querySelector('.theme-tree-list')?.textContent).toContain('账本选项')
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    // 接口回了非空选项：静默换上，并提示更新了什么。
    mode = 'ready'; release(); await settle()
    expect(host.textContent).toContain('下拉选项已更新')
    expect(host.textContent).toContain(label)
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    expect(document.querySelector('.theme-tree-list')?.textContent).toContain('新选项')
    expect(document.querySelector('.theme-tree-list')?.textContent).not.toContain('账本选项')
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    // 拉不到：整个界面不进失败态，继续用账本上的选项，并说明在兜底。
    mode = 'invalid'; button('校对最新字段')!.click(); await settle()
    expect(host.textContent).not.toContain('选项读取失败')
    expect(host.textContent).toContain('没有拉到最新下拉，继续用上次的选项。')
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    expect(document.querySelector('.theme-tree-list')?.textContent).toContain('新选项')
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    // 手动校对没有变化：给一句话回执。
    mode = 'ready'; button('校对最新字段')!.click(); await settle()
    expect(host.textContent).toContain('已经和原网站对过，选项没有变化。')
  })
}
