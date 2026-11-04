import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_ENVIRONMENT } from '../../../src/api/config'
import QueryTemplateSection from '../../../src/floating/QueryTemplateSection.vue'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'

const { workspaceCall, confirmDialog } = vi.hoisted(() => ({
  workspaceCall: vi.fn(async (_message: unknown) => null),
  confirmDialog: vi.fn(async (_options: unknown) => true)
}))

vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return { useWorkspace: () => ({ connection: ref({ operatorId: 'download-save-test', sessionStatus: 'authenticated', easyTabId: 1,
    easyOrigin: 'http://183.36.43.66:88', connectionVersion: 1 }), call: workspaceCall }) }
})
vi.mock('../../../src/app/dialog', () => ({ confirmDialog }))
vi.mock('../../../src/shell/components/ThemeSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue', 'change'],
    setup(props: { modelValue: string; options: Array<{ value: string; label: string }> }, { emit, attrs }) {
    return () => h('select', { ...attrs, value: props.modelValue, onChange: (event: Event) => {
      const value = (event.target as HTMLSelectElement).value
      emit('update:modelValue', value); emit('change', value)
    } }, props.options.map(option => h('option', { value: option.value }, option.label)))
  } }) }
})

const ID = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const SAVED = '045eb1fc-e77a-4d50-98df-cbfcc9e5f4e7'
const RECIPE = { newFilename: 'app_no;-;case_name;-;file_desc', fileNameType: 'colname;txt;colname;txt;colname' }
let app: App | undefined
let writes: ContentRequest[] = []
let fileTypeRequests: ContentRequest[] = []
let rejectSave = false
afterEach(() => {
  app?.unmount(); app = undefined; document.body.innerHTML = ''
  workspaceCall.mockClear(); confirmDialog.mockClear(); writes = []; rejectSave = false
})
async function settle() { for (let i = 0; i < 40; i++) { await Promise.resolve(); await nextTick() } }

async function mount() {
  writes = []; fileTypeRequests = []
  const request: MessageBridge['request'] = async message => {
    if (message.type === MessageType.ScanFileSearchForm) return { type: MessageType.FileSearchFormResult, payload: { fields: [] } }
    if (message.type === MessageType.ListHistoryQueries) return { type: MessageType.HistoryQueriesResult, payload: { ok: true, data: [] } }
    if (message.type === MessageType.SaveFileTempName || message.type === MessageType.DeleteFileTempName) {
      writes.push(message)
      if (rejectSave && message.type === MessageType.SaveFileTempName) {
        return { type: MessageType.FileTempNamesResult, payload: { ok: false, error: { code: 'BUSINESS_ERROR', message: '模板名称已存在！' } } }
      }
      const templates = message.type === MessageType.SaveFileTempName
        ? [{ id: ID, tempName: '华峰官文', ...RECIPE }, { id: SAVED, tempName: message.payload.tempName, ...RECIPE }]
        : [{ id: ID, tempName: '华峰官文', ...RECIPE }]
      return { type: MessageType.FileTempNamesResult, payload: { ok: true, data: { templates } } }
    }
    if (message.type === MessageType.LoadDictionary) {
      const kind = message.payload.kind
      if (kind === 'fileType') {
        fileTypeRequests.push(message)
        return { type: MessageType.DictionaryResult, payload: { ok: true, data: { kind: 'fileType', caseTypeId: message.payload.caseTypeId, nodes: [], rootIds: [], diagnostics: [] } } }
      }
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
  app = createApp({ render: () => h(QueryTemplateSection, {
    bridge: { request }, userId: 'download-save-test', canSearch: true, mode: 'history', pageSize: 100
  }) })
  app.directive('hint', {})
  app.mount(document.body.appendChild(document.createElement('div')))
  await settle()
}
function selects() { return Array.from(document.querySelectorAll<HTMLSelectElement>('.download-name-row select')) }
async function choose(select: HTMLSelectElement, value: string) { select.value = value; select.dispatchEvent(new Event('change')); await settle() }
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(node => node.textContent?.trim() === label)! }
function nameInput() { return document.querySelector<HTMLInputElement>('input[placeholder="模板名称"]')! }
function templateOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options).filter(option => option.value).map(option => option.textContent ?? '')
}
function typeTemplateName(name: string) {
  const input = nameInput()
  input.value = name
  input.dispatchEvent(new Event('input'))
}

describe('下载文件名模板的保存与删除', () => {
  it('保存写到原网站账号并换掉模板下拉，刚保存的那份直接选中', async () => {
    await mount()
    await choose(selects()[0], ID)
    typeTemplateName('季华官文2'); await settle()
    button('保存下载名称').click(); await settle()
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ type: MessageType.SaveFileTempName, payload: { tempName: '季华官文2', ...RECIPE } })
    const templateSelect = selects()[0]
    expect(templateOptions(templateSelect)).toEqual(['华峰官文', '季华官文2'])
    expect(templateSelect.value).toBe(SAVED)
    expect(document.body.textContent).toContain('已保存下载名称模板「季华官文2」')
  })

  it('删除当前选中的模板，确认后从下拉里消失并清空选择', async () => {
    await mount()
    await choose(selects()[0], ID)
    typeTemplateName('季华官文2'); await settle()
    button('保存下载名称').click(); await settle()
    button('删除下载名称').click(); await settle()
    expect(confirmDialog).toHaveBeenCalledTimes(1)
    expect(writes[1]).toMatchObject({ type: MessageType.DeleteFileTempName, payload: { tempId: SAVED } })
    const templateSelect = selects()[0]
    expect(templateOptions(templateSelect)).toEqual(['华峰官文'])
    expect(templateSelect.value).toBe('')
    expect(document.body.textContent).toContain('已删除下载名称模板')
  })

  it('没有模板名称或没有配方时提示，不发保存请求', async () => {
    await mount()
    button('保存下载名称').click(); await settle()
    expect(document.body.textContent).toContain('请填写模板名称。')
    typeTemplateName('季华官文2'); await settle()
    button('保存下载名称').click(); await settle()
    expect(document.body.textContent).toContain('请先配置下载文件名称。')
    expect(writes).toHaveLength(0)
  })

  it('没有选中模板时删除按钮不可用', async () => {
    await mount()
    expect(button('删除下载名称').disabled).toBe(true)
    await choose(selects()[0], ID)
    expect(button('删除下载名称').disabled).toBe(false)
  })

  it('原站拒绝时把错误原因带出来，字典不换', async () => {
    await mount()
    await choose(selects()[0], ID)
    typeTemplateName('季华官文2'); await settle()
    rejectSave = true
    button('保存下载名称').click(); await settle()
    expect(writes).toHaveLength(1)
    expect(document.body.textContent).toContain('模板名称已存在！')
    expect(templateOptions(selects()[0])).toEqual(['华峰官文'])
  })
})

it('未手选案件类型也按原站默认专利热加载文件描述', async () => {
  await mount()
  expect(fileTypeRequests).toContainEqual({ type: MessageType.LoadDictionary, payload: { kind: 'fileType', force: false, caseTypeId: CURRENT_ENVIRONMENT.caseTypeId } })
})
