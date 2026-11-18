import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import QueryTemplateSection from '../../../src/floating/QueryTemplateSection.vue'
import LimitQuerySection from '../../../src/floating/LimitQuerySection.vue'
import FilingSearchQuery from '../../../src/app/components/FilingSearchQuery.vue'
import { MessageType, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import { buildPickerCatalog } from '../../../src/api/dictionaries/picker-catalog'
const account = vi.hoisted(() => ({ userId: 'empty-surfaces' }))
vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return { useWorkspace: () => ({ connection: ref({ operatorId: account.userId }), call: async () => ({
    connection: { operatorId: account.userId }, customers: [], templates: [{
      id: 'historical', name: '历史条件', source: 'local', queryType: 'FilingSearch',
      fields: { audit_user_id: OLD, case_volume: 'test' }, version: 1
    }]
  }) }) }
})
const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
let app: App | undefined
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
async function settle() { for (let i = 0; i < 80; i++) { await Promise.resolve(); await nextTick() } }
function button(label: string, root: ParentNode = document) { return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.trim() === label) }
for (const surface of ['文件', '期限', '递交'] as const) {
  it(`${surface}查询贯通加载、明确空、失败重试、树选项和历史ID保护`, async () => {
    let mode: 'pending' | 'empty' | 'invalid' | 'ready' = 'pending'
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const search = vi.fn()
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.LoadDictionary) {
        const kind = message.payload.kind
        if (kind === 'picker') {
          if (mode === 'pending') await gate
          if (mode === 'invalid') return { type: MessageType.DictionaryResult, payload: { ok: false, error: { code: 'INVALID_RESPONSE', message: '失败' } } }
          const rows = mode === 'ready' ? [{ id: NEW, name: '新选项', pid: '' }] : null
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
    // 每个界面用独立账号：选项账本按账号分区，串了会让后面的界面误以为已有账本。
    account.userId = surface === '文件' ? 'empty-file' : surface === '期限' ? 'empty-limit' : 'empty-filing'
    const host = document.body.appendChild(document.createElement('div'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 存量豁免：外部输入边界保留 any
    app = createApp({ render: () => h(component as any, {
      bridge: { request }, userId: account.userId, canSearch: true, mode: 'history', pageSize: 20,
      seed: { apply_tags_id: OLD, case_volume: 'test' }, seedToken: 1, onSearch: search, onSearched: search
    }) })
    app.directive('hint', {}); app.provide('bridge', { request }); app.mount(host); await settle()
    if (surface === '期限') { button('更多条件')?.click(); await settle() }
    const field = () => Array.from(host.querySelectorAll<HTMLElement>('.query-cell')).find(node => node.firstElementChild?.textContent === (surface === '递交' ? '办理人' : '专利标签'))!
    expect(field()).toBeTruthy()
    expect(field().textContent).toContain('正在读取选项')
    mode = 'empty'; release(); await settle()
    if (surface === '递交') { host.querySelector<HTMLButtonElement>('.template-picks li:last-child button')!.click(); await settle() }
    expect(field().textContent).toContain('当前账号未配置')
    expect(field().textContent).toContain(OLD)
    expect(field().textContent).toContain('原选项当前不可用')
    expect(field().querySelector('.theme-select-chevron')).toBeNull()
    const submit = () => button(surface === '文件' ? '查询文件' : '查询', host)!
    expect(submit()).toBeTruthy()
    submit().click(); await settle(); expect(search).not.toHaveBeenCalled()
    mode = 'invalid'; button('校对最新字段')!.click(); await settle()
    expect(field().textContent).toContain('选项读取失败')
    expect(field().textContent).toContain(OLD)
    mode = 'ready'; button('重试', field())!.click(); await settle()
    expect(field().querySelector('.theme-select-trigger')).not.toBeNull()
    expect(field().textContent).toContain('原选项当前不可用')
    button('清除原选项', field())!.click(); await settle()
    expect(field().textContent).not.toContain(OLD)
    field().querySelector<HTMLButtonElement>('.theme-select-trigger')!.click(); await settle()
    const input = document.querySelector<HTMLInputElement>('.theme-tree-search input')!
    input.value = '不存在'; input.dispatchEvent(new Event('input')); await settle()
    document.querySelector<HTMLButtonElement>('.theme-tree-query')!.click(); await settle()
    expect(document.querySelector('.theme-tree-list')?.textContent).toContain('没有匹配')
    input.value = ''; input.dispatchEvent(new Event('input')); await settle()
    document.querySelector<HTMLButtonElement>('.theme-tree-query')!.click(); await settle()
    document.querySelector<HTMLInputElement>('.theme-tree-list input')!.click(); await settle()
    expect(field().textContent).toContain('新选项')
    submit().click(); await settle()
    expect(search).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
    const query = search.mock.calls[0][0]
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
    expect(surface === '文件' ? query.resolvedFields.apply_tags_id : surface === '期限' ? query.fields.apply_tags_id : query.fields.audit_user_id).toBe(NEW)
  })
}
