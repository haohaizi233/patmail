import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QueryTemplateSection from '../../../src/floating/QueryTemplateSection.vue'
import { MessageType, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import { resolveDownloadFileNames, type FileDownloadSelection } from '../../../src/mail/download-name'
import { buildGetSearchFilesFromFields } from '../../../src/api/file-search-params'
import type { EasyTransport } from '../../../src/api/transport'
import type { FileSearchQuery } from '../../../src/api/file-search-params'
import { buildQueryXml } from '../../../src/query/query-xml'

const { workspaceCall } = vi.hoisted(() => ({ workspaceCall: vi.fn(async (_message: unknown) => null) }))

vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return { useWorkspace: () => ({ connection: ref({ operatorId: 'download-editor-test', sessionStatus: 'authenticated', easyTabId: 1,
    easyOrigin: 'http://183.36.43.66:88', connectionVersion: 1 }), call: workspaceCall }) }
})
vi.mock('../../../src/shell/components/ThemeSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue', 'change'], setup(props, { emit, attrs }) {
    return () => h('select', { ...attrs, value: props.modelValue, onChange: (event: Event) => {
      const value = (event.target as HTMLSelectElement).value
      emit('update:modelValue', value); emit('change', value)
    } }, props.options.map((option: { value: string; label: string }) => h('option', { value: option.value }, option.label)))
  } }) }
})
const ID = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const RECIPE = { newFilename: 'app_no;-;case_name;-;file_desc', fileNameType: 'colname;txt;colname;txt;colname' }
let app: App | undefined
let exposed: { currentDownloadSelection(): FileDownloadSelection | null }
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; workspaceCall.mockClear() })
async function settle() { for (let i = 0; i < 40; i++) { await Promise.resolve(); await nextTick() } }
async function mount(historyXml = '') {
  const searches: FileSearchQuery[] = []
  const request: MessageBridge['request'] = async message => {
    if (message.type === MessageType.ScanFileSearchForm) return { type: MessageType.FileSearchFormResult, payload: { fields: [] } }
    if (message.type === MessageType.ListHistoryQueries) return { type: MessageType.HistoryQueriesResult, payload: { ok: true, data: historyXml ? [{ id: ID, name: '季华递交合并档', source: 'easy' }] : [] } }
    if (message.type === MessageType.GetHistoryQuery) return { type: MessageType.HistoryQueryResult, payload: { ok: true, data: { id: ID, name: '季华递交合并档', queryXml: historyXml } } }
    if (message.type === MessageType.LoadDictionary) {
      const kind = message.payload.kind
      const options = kind === 'picker' ? [{ value: ID, label: '华峰官文', metadata: RECIPE }] : [
        { value: 'app_no', label: '申请号' }, { value: 'fixtxt', label: '固定字符' },
        { value: 'case_name', label: '案件名称' }, { value: 'file_desc', label: '文件描述' }
      ]
      return { type: MessageType.DictionaryResult, payload: { ok: true, data: {
        kind, dictionaries: { [kind === 'picker' ? 'fileTemp' : 'downloadFileName']: { key: 'fixture', options, status: 'ready', warnings: [] } }, warnings: [], responseKeys: []
      } } } as ContentResponse
    }
    return { type: MessageType.Error, payload: { message: 'unused' } }
  }
  app = createApp({ render: () => h(QueryTemplateSection, { ref: value => { exposed = value as unknown as typeof exposed },
    bridge: { request }, userId: 'download-editor-test', canSearch: true, mode: 'history', pageSize: 100,
    onSearch: (query: FileSearchQuery) => searches.push(query) }) })
  app.directive('hint', {})
  app.mount(document.body.appendChild(document.createElement('div')))
  await settle()
  return searches
}
function selects() { return Array.from(document.querySelectorAll<HTMLSelectElement>('.download-name-row select')) }
async function choose(select: HTMLSelectElement, value: string) { select.value = value; select.dispatchEvent(new Event('change')); await settle() }
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(node => node.textContent?.trim() === label)! }

describe('文件下载名称的动态配方', () => {
  it('选用保存的查询模板会恢复下载命名模板，下载配置仍不进入搜索参数', async () => {
    const searches = await mount(`<xmlRoot><case_volume>PA-1</case_volume><filetemp>${ID}</filetemp><selfilename1>app_no</selfilename1></xmlRoot>`)
    button('季华递交合并档EASY').click(); await settle()
    expect(exposed.currentDownloadSelection()).toMatchObject({ templateId: ID, ...RECIPE })
    expect(selects().slice(1).map(node => node.value)).toEqual(['app_no', 'fixtxt', 'case_name', 'fixtxt', 'file_desc'])
    button('查询文件').click(); await settle()
    expect(searches).toHaveLength(1)
    const params = buildGetSearchFilesFromFields(searches[0].resolvedFields!, { pageIndex: 1, pageSize: 100 })
    expect(params.ok).toBe(true)
    if (params.ok) for (const key of ['filetemp', 'selfilename1', 'txtfilename1']) expect(params.data.has(key)).toBe(false)
    await choose(selects()[0], '')
    expect(exposed.currentDownloadSelection()).toBeNull()
  })

  it('没有命名模板ID的历史配方恢复全部名称段和固定字符', async () => {
    await mount('<xmlRoot><case_volume>PA-1</case_volume><selfilename1>app_no</selfilename1><selfilename2>fixtxt</selfilename2><txtfilename2>-</txtfilename2><selfilename3>file_desc</selfilename3></xmlRoot>')
    button('季华递交合并档EASY').click(); await settle()
    expect(exposed.currentDownloadSelection()).toMatchObject({ newFilename: 'app_no;-;file_desc', fileNameType: 'colname;txt;colname' })
    expect(selects().slice(1).map(node => node.value)).toEqual(['app_no', 'fixtxt', 'file_desc'])
  })

  it('保存当前编辑后的完整配方并覆盖旧下载控件，清空后保存不残留旧模板', async () => {
    await mount(`<xmlRoot><case_volume>PA-1</case_volume><filetemp>${ID}</filetemp><selfilename1>app_no</selfilename1><legacy_note>保留</legacy_note></xmlRoot>`)
    button('季华递交合并档EASY').click(); await settle()
    const fixed = document.querySelector<HTMLInputElement>('.download-part-text')!
    fixed.value = '_'; fixed.dispatchEvent(new Event('input')); await settle()
    button('保存到本地和网站').click(); await settle()
    const saved = workspaceCall.mock.calls.map(([message]) => message as { action: string; template?: { unknownFields: Record<string, string> } })
      .find(message => message.action === 'saveQueryTemplate')!.template!
    expect(saved.unknownFields).toEqual({ legacy_note: '保留', selfilename1: 'app_no', selfilename2: 'fixtxt', txtfilename2: '_', selfilename3: 'case_name', selfilename4: 'fixtxt', txtfilename4: '-', selfilename5: 'file_desc' })
    await choose(selects()[0], '')
    workspaceCall.mockClear()
    button('保存到本地和网站').click(); await settle()
    const cleared = workspaceCall.mock.calls.map(([message]) => message as { action: string; template?: { unknownFields: Record<string, string> } })
      .find(message => message.action === 'saveQueryTemplate')!.template!
    expect(cleared.unknownFields).toEqual({ legacy_note: '保留' })
    app!.unmount(); app = undefined; document.body.innerHTML = ''
    await mount(buildQueryXml({ case_volume: 'PA-1' }, {}, saved.unknownFields))
    button('季华递交合并档EASY').click(); await settle()
    expect(exposed.currentDownloadSelection()).toMatchObject({ newFilename: 'app_no;_;case_name;-;file_desc', fileNameType: RECIPE.fileNameType })
  })

  it('历史配方中固定字符为空时显示错误并阻止下载和保存', async () => {
    await mount('<xmlRoot><case_volume>PA-1</case_volume><selfilename1>app_no</selfilename1><selfilename2>fixtxt</selfilename2></xmlRoot>')
    button('季华递交合并档EASY').click(); await settle()
    expect(document.body.textContent).toContain('第2段固定字符不能为空')
    expect(() => exposed.currentDownloadSelection()).toThrow('第2段固定字符不能为空')
    button('保存到本地和网站').click(); await settle()
    expect(workspaceCall.mock.calls.some(([message]) => (message as { action: string }).action === 'saveQueryTemplate')).toBe(false)
  })

  it('选中原站模板后展开全部五段，固定字符回显；清空模板后恢复空白一段', async () => {
    await mount()
    await choose(selects()[0], ID)
    expect(selects().slice(1).map(node => node.value)).toEqual(['app_no', 'fixtxt', 'case_name', 'fixtxt', 'file_desc'])
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('.download-part-text')).map(node => node.value)).toEqual(['-', '-'])
    expect(exposed.currentDownloadSelection()).toMatchObject({ templateId: ID, ...RECIPE })
    await choose(selects()[0], '')
    expect(selects().slice(1).map(node => node.value)).toEqual([''])
    expect(exposed.currentDownloadSelection()).toBeNull()
  })
  it('增删和修改配方后使用当前完整内容，不再由旧模板覆盖；空固定字符阻止下载', async () => {
    await mount()
    await choose(selects()[0], ID)
    const fixed = document.querySelector<HTMLInputElement>('.download-part-text')!
    expect(fixed).not.toBeNull()
    fixed.value = '_'; fixed.dispatchEvent(new Event('input')); await settle()
    expect(exposed.currentDownloadSelection()).toMatchObject({ newFilename: 'app_no;_;case_name;-;file_desc', fileNameType: RECIPE.fileNameType })
    expect(exposed.currentDownloadSelection()?.templateId).toBeUndefined()
    const post = vi.fn(async () => ({ ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_names: '验收.pdf' } }))
    expect((await resolveDownloadFileNames({ post } as unknown as EasyTransport, [ID], exposed.currentDownloadSelection()!)).ok).toBe(true)
    expect(post.mock.calls).toHaveLength(1)
    const [operation, params] = post.mock.calls[0] as unknown as [string, URLSearchParams]
    expect(operation).toBe('getFileName')
    expect(params.get('new_filename')).toBe('app_no;_;case_name;-;file_desc')
    expect(params.get('file_name_type')).toBe(RECIPE.fileNameType)
    button('添加名称段').click(); await settle()
    await choose(selects().at(-1)!, 'case_name')
    expect(exposed.currentDownloadSelection()?.newFilename).toBe('app_no;_;case_name;-;file_desc;case_name')
    document.querySelector<HTMLButtonElement>('[aria-label="删除第6段"]')!.click(); await settle()
    fixed.value = ''; fixed.dispatchEvent(new Event('input')); await settle()
    expect(document.body.textContent).toContain('第2段固定字符不能为空')
    expect(() => exposed.currentDownloadSelection()).toThrow('第2段固定字符不能为空')
  })
  it('手工新建配方后恢复模板会清掉本次编辑', async () => {
    await mount()
    await choose(selects()[1], 'app_no')
    expect(exposed.currentDownloadSelection()?.newFilename).toBe('app_no')
    button('恢复模板').click(); await settle()
    expect(exposed.currentDownloadSelection()).toBeNull()
    expect(selects()[1].value).toBe('')
  })
  it('同值模板选择仍会恢复配方，空项可以清掉手工配方', async () => {
    await mount()
    await choose(selects()[1], 'app_no')
    await choose(selects()[0], '')
    expect(exposed.currentDownloadSelection()).toBeNull()
    await choose(selects()[0], ID)
    const fixed = document.querySelector<HTMLInputElement>('.download-part-text')!
    fixed.value = '_'; fixed.dispatchEvent(new Event('input')); await settle()
    await choose(selects()[0], ID)
    expect(exposed.currentDownloadSelection()).toMatchObject({ templateId: ID, ...RECIPE })
    expect(document.querySelector<HTMLInputElement>('.download-part-text')!.value).toBe('-')
  })
})
