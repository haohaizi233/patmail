import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FileSearchQuery from '../../../src/app/components/FileSearchQuery.vue'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import type { SelectedPatentFile } from '../../../src/mail'
import { resetTaskCheckProgress, taskCheckProgress } from '../../../src/app/check-progress'
import { DOWNLOAD_PROGRESS_CHANNEL } from '../../../src/shared/download-progress'
const templateLabel = vi.hoisted(() => ({ value: '模板甲' }))
const downloadRecipe = vi.hoisted(() => ({ value: null as { templateId?: string; newFilename: string; fileNameType: string } | null }))
const targetPicker = vi.hoisted(() => ({ cancel: false, calls: 0, wait: null as Promise<void> | null }))
vi.mock('../../../src/browser-download/target', () => ({
  chooseBrowserDownloadTarget: async () => { targetPicker.calls++; if (targetPicker.wait) await targetPicker.wait; if (targetPicker.cancel) throw new DOMException('cancel', 'AbortError'); return '22222222-2222-4222-8222-222222222222' },
  releaseBrowserDownloadTarget: async () => {}
}))

const recoveryRows = vi.hoisted(() => new Map<string, unknown>())
const recoveryGate = vi.hoisted(() => ({ wait: null as Promise<void> | null, read: null as Promise<void> | null }))
vi.mock('../../../src/recovery/wal-ledger', () => ({
  recallRecovery: async (_slot: string, scope: string) => { if (recoveryGate.read) await recoveryGate.read; return recoveryRows.get(scope) ?? null },
  rememberRecovery: async (_slot: string, scope: string, payload: unknown) => { recoveryRows.set(scope, JSON.parse(JSON.stringify(payload))); if (recoveryGate.wait) await recoveryGate.wait }
}))

vi.mock('../../../src/floating/QueryTemplateSection.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['pageSize'], emits: ['search', 'download-name'], setup(props, { emit, expose }) {
    expose({ currentDownloadSelection: () => downloadRecipe.value, currentSearchTemplateName: () => templateLabel.value })
    return () => h('div', [h('button', { onClick: () => emit('download-name', downloadRecipe.value) }, '测试下载名称'), h('button', { onClick: () => emit('search', {
      resolvedFields: { case_volume: 'AUDIT' }, pageIndex: 1, pageSize: Number(props.pageSize)
    }) }, '测试查询')])
  } }) }
})
vi.mock('../../../src/shell/components/ThemeSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue'], setup(props, { emit }) {
    return () => h('select', { 'aria-label': '每页数量', value: props.modelValue,
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value)
    }, (props.options as Array<{ value: number; label: string }>).map(option => h('option', { value: option.value }, option.label)))
  } }) }
})

let app: App | undefined
afterEach(() => { targetPicker.cancel = false; targetPicker.calls = 0; targetPicker.wait = null; recoveryGate.wait = null; recoveryGate.read = null; app?.unmount(); recoveryRows.clear(); app = undefined; document.body.innerHTML = ''; resetTaskCheckProgress(); downloadRecipe.value = null; templateLabel.value = '模板甲'; vi.useRealTimers(); vi.unstubAllGlobals() })
async function settle() { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(node => node.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function reply(message: Extract<ContentRequest, { type: 'SEARCH_FILES' }>, total = 1597): ContentResponse {
  const { pageIndex, pageSize } = message.payload.query
  const first = (pageIndex - 1) * pageSize
  return { type: MessageType.SearchFilesResult, payload: { ok: true, data: {
    pageIndex, pageSize, total, totalPages: Math.ceil(total / pageSize), querySessionId: '11111111-1111-4111-8111-111111111111',
    items: Array.from({ length: Math.max(0, Math.min(pageSize, total - first)) }, (_, offset) => ({
      fileId: `00000000-0000-4000-8000-${String(first + offset + 1).padStart(12, '0')}`,
      fileName: `file-${first + offset + 1}.pdf`, fileNo: `A${first + offset + 1}`
    }))
  } } }
}
function mount(request: MessageBridge['request'], allowed = ref(true), epoch = ref(0), actions: { onPlan?: () => void; onReview?: () => void; showMailActions?: boolean } = {}) {
  const selected = ref<Record<string, SelectedPatentFile>>({})
  app = createApp({ render: () => h('div', [h(CheckRainbow), h(FileSearchQuery, {
    userId: 'test', origin: 'http://183.36.43.66:88', canSearch: allowed.value, selectable: true, epoch: epoch.value,
    selected: selected.value, 'onUpdate:selected': (value: Record<string, SelectedPatentFile>) => { selected.value = value },
    onPlan: actions.onPlan, onReview: actions.onReview, showMailActions: actions.showMailActions
  })]) })
  app.provide('bridge', { request })
  app.directive('hint', {})
  app.mount(document.body.appendChild(document.createElement('div')))
  return selected
}

function duplicateOption(): HTMLInputElement {
  const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent?.includes('同名文件仅保留最新'))?.querySelector('input')
  expect(input).toBeDefined()
  return input as HTMLInputElement
}

describe('DIY名称实时去重', () => {
  it('文件管理仅显示查询与下载操作，不显示旧版已选和发文入口', async () => {
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 2) : { type: MessageType.Error, payload: { message: 'unused' } }, ref(true), ref(0), { showMailActions: false })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    expect(document.body.textContent).not.toContain('查看已选')
    expect(document.body.textContent).not.toContain('生成发文计划')
    expect(button('下载已选').disabled).toBe(false)
  })

  it('连接恢复后提示恢复下载，不再把历史登录错误当成当前状态', async () => {
    const allowed = ref(true)
    const previous = '找到 EASY 页面，但还读不到登录状态。请刷新该页面后再检测。'
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 1) : { type: MessageType.Error, payload: { message: previous } }, allowed)
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    allowed.value = false; await settle(); allowed.value = true; await settle()
    const notice = document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent
    expect(notice).toContain('EASY 已连接')
    expect(notice).toContain('刷新')
    expect(notice).not.toContain('还读不到登录状态')
    expect(button('继续下载').disabled).toBe(true)
    button('刷新').click(); await settle()
    expect(button('继续下载').disabled).toBe(false)
  })

  it('后台回执超时只标记结果待确认，不把仍可恢复的下载描述成失败', async () => {
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 1) : { type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    const notice = document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent
    expect(notice).toContain('回执尚未确认')
    expect(notice).toContain('继续下载')
    expect(notice).not.toContain('没有在时限内返回')
  })

  it('连接正常也保留真实的文件权限错误', async () => {
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 1) : { type: MessageType.Error, payload: { message: '目标文件权限已撤销，请重新授权。 | Error: 目标文件权限已撤销，请重新授权。 at chrome-extension://fixture/content.js:1:20' } })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).toContain('权限已撤销')
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).not.toContain('chrome-extension://')
  })

  it('流任务已返回具体启动错误时保留阶段，不误称为初始受理回执未确认', async () => {
    const failure = '下载初始化超时，尚未确认浏览器下载目标。扩展后台没有在时限内返回。缓存已保留，请继续下载。'
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 1)
      : { type: MessageType.DownloadFilesResult, payload: { ok: false, error: { code: 'BUSINESS_ERROR', message: failure } } })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    const notice = document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent
    expect(notice).toContain('下载初始化超时')
    expect(notice).not.toContain('回执尚未确认')
    expect(button('继续下载').disabled).toBe(false)
  })

  it('新的登录失败不能仅凭旧的已连接状态被当作已恢复', async () => {
    const failure = 'EASY 登录已失效，请在原网站重新登录后检测。'
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 1) : { type: MessageType.Error, payload: { message: failure } })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).toContain(failure)
  })

  it('重新打开已连接工作面时恢复任务与选择，同时把旧登录错误改为恢复引导', async () => {
    const request: MessageBridge['request'] = async message => message.type === MessageType.SearchFiles ? reply(message, 1)
      : { type: MessageType.Error, payload: { message: '找到 EASY 页面，但还读不到登录状态。请刷新该页面后再检测。' } }
    mount(request)
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    app?.unmount(); await settle(); document.body.innerHTML = ''
    const selected = mount(request); await settle()
    expect(Object.keys(selected.value)).toHaveLength(1)
    const notice = document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent
    expect(notice).toContain('EASY 已连接')
    expect(notice).toContain('刷新')
    expect(notice).not.toContain('还读不到登录状态')
    expect(button('继续下载').disabled).toBe(true)
  })

  it('keeps selected-file review and planning actions available through the parent events', async () => {
    const onPlan = vi.fn()
    const onReview = vi.fn()
    const allowed = ref(true)
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 2) : { type: MessageType.Error, payload: { message: 'unused' } }, allowed, ref(0), { onPlan, onReview })
    button('测试查询').click(); await settle()
    expect(button('查看已选').disabled).toBe(true)
    expect(button('生成发文计划').disabled).toBe(true)
    button('全选本页').click(); await settle()
    expect(button('查看已选').disabled).toBe(false)
    expect(button('生成发文计划').disabled).toBe(false)
    allowed.value = false; await settle()
    expect(button('查看已选').disabled).toBe(true)
    expect(button('生成发文计划').disabled).toBe(true)
    allowed.value = true; await settle()
    expect(button('查看已选').disabled).toBe(true)
    expect(button('生成发文计划').disabled).toBe(true)
    button('刷新').click(); await settle()
    button('全选本页').click(); await settle()
    expect(button('查看已选').disabled).toBe(false)
    expect(button('生成发文计划').disabled).toBe(false)
    button('查看已选').click()
    button('生成发文计划').click()
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(onPlan).toHaveBeenCalledTimes(1)
  })

  it('父面板给获选文件绑定客户后仍保留隐藏候选', async () => {
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      const response = reply(message, 2)
      if (response.type === MessageType.SearchFilesResult && response.payload.ok) response.payload.data.items.forEach((file, index) => {
        file.fileName = 'same.pdf'; file.caseId = 'same'; file.uploadTime = `2026-10-${20 + index}`
      })
      return response
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(1)
    selected.value = Object.fromEntries(Object.entries(selected.value).map(([id, file]) => [id, { ...file, customerProfileId: 'bound-customer' }]))
    await settle(); duplicateOption().click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(2)
    expect(Object.values(selected.value).find(file => file.customerProfileId === 'bound-customer')).toBeDefined()
    selected.value = {}; await settle(); duplicateOption().click(); await settle()
    expect(selected.value).toEqual({})
  })
  it('全选遍历后的下载中翻页直接显示已读结果，不查询、不清空表格或下载进度', async () => {
    let finishDownload!: (response: ContentResponse) => void
    const request = vi.fn<MessageBridge['request']>(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 250)
      if (message.type === MessageType.DownloadFiles) return new Promise(resolve => { finishDownload = resolve })
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    mount(request)
    button('测试查询').click(); await settle(); button('全选所有').click(); await settle()
    const searches = () => request.mock.calls.filter(([message]) => message.type === MessageType.SearchFiles).length
    expect(searches()).toBe(3)
    button('下载已选').click(); await settle()
    const downloadDetail = taskCheckProgress.detail
    button('下一页').click()
    expect(document.body.textContent).not.toContain('正在查询')
    await settle()
    expect(searches()).toBe(3)
    expect(document.body.textContent).toContain('file-101.pdf')
    expect(taskCheckProgress.detail).toBe(downloadDetail)
    button('下一页').click(); await settle()
    expect(document.body.textContent).toContain('file-201.pdf')
    button('上一页').click(); await settle()
    expect(document.body.textContent).toContain('file-101.pdf')
    expect(searches()).toBe(3)
    finishDownload({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 250, notice: '' } } })
    await settle()
    button('刷新').click(); await settle(); button('下一页').click(); await settle()
    expect(searches()).toBe(5)
    expect(request.mock.calls.filter(([message]) => message.type === MessageType.SearchFiles).slice(-2)
      .every(([message]) => message.type === MessageType.SearchFiles && message.payload.batch)).toBe(true)
  })

  it('预热中开始下载会接收保存位置选择期间的新成果，并从已完成数量继续显示', async () => {
    vi.useFakeTimers()
    type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void
    const listeners = new Set<Listener>()
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: {
      addListener: (listener: Listener) => listeners.add(listener), removeListener: (listener: Listener) => listeners.delete(listener)
    } } })
    const pending: { ids: string[]; finish: (response: ContentResponse) => void }[] = []
    let payload: Extract<ContentRequest, { type: 'DOWNLOAD_FILES' }>['payload'] | undefined
    let finishDownload!: (response: ContentResponse) => void
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 120)
      if (message.type === MessageType.ResolveDownloadNames) return new Promise(resolve => { pending.push({ ids: message.payload.fileIds, finish: resolve }) })
      if (message.type === MessageType.DownloadFiles) { payload = message.payload; return new Promise(resolve => { finishDownload = resolve }) }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选所有').click(); await settle()
    downloadRecipe.value = { templateId: '11111111-1111-4111-8111-111111111111', newFilename: 'app_no', fileNameType: 'colname' }
    button('测试下载名称').click(); await settle(); await vi.advanceTimersByTimeAsync(250)
    expect(pending).toHaveLength(3)
    const complete = (index: number) => pending[index].finish({ type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: { names: pending[index].ids.map(id => `${id}.pdf`) } } })
    complete(0); await settle()
    let choose!: () => void
    targetPicker.wait = new Promise(resolve => { choose = resolve })
    button('下载已选').click(); await settle()
    expect(payload).toBeUndefined()
    complete(1); await settle(); choose(); await settle()
    expect(Object.keys(payload?.resolvedNames ?? {})).toHaveLength(80)
    expect(taskCheckProgress.detail).toContain('取名 80/120')
    for (const listener of listeners) listener({ channel: DOWNLOAD_PROGRESS_CHANNEL, id: payload?.progressId, progress: { phase: 'naming', done: 0, total: 120 } }, { id: 'test-extension' })
    expect(taskCheckProgress.detail).toContain('取名 80/120')
    expect(pending).toHaveLength(3)
    complete(2); await settle()
    finishDownload({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 120, notice: '' } } })
    await settle()
  })

  it('首次读取未遍历页沿用查询来源，避免清掉预热中的共享命名请求', async () => {
    const calls: Extract<ContentRequest, { type: 'SEARCH_FILES' }>[] = []
    mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      calls.push(message)
      return reply(message, 250)
    })
    button('测试查询').click(); await settle(); button('下一页').click(); await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1].payload.continuation?.querySessionId).toBe('11111111-1111-4111-8111-111111111111')
    expect(calls[1].payload.batch).toBe(true)
    button('上一页').click(); await settle()
    expect(calls).toHaveLength(2)
  })

  it('后台要求重新验证来源后清掉旧页缓存，不能通过翻页绕过只读状态', async () => {
    const calls: Extract<ContentRequest, { type: 'SEARCH_FILES' }>[] = []
    mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      calls.push(message)
      const response = reply(message, 250)
      if (calls.length === 3 && response.type === MessageType.SearchFilesResult && response.payload.ok) {
        delete response.payload.data.querySessionId
        response.payload.data.sourceCode = 'QUERY_SESSION_REVALIDATION_REQUIRED'
        response.payload.data.sourceMessage = '查询记录已从本地恢复，需要重新查询后才能继续。'
      }
      return response
    })
    button('测试查询').click(); await settle(); button('下一页').click(); await settle(); button('全选本页').click(); await settle()
    button('下一页').click(); await settle()
    expect(button('下载已选').disabled).toBe(true)
    button('上一页').click(); await settle()
    expect(calls).toHaveLength(4)
    expect(calls[3].payload.continuation).toBeUndefined()
    expect(calls[3].payload.batch).toBeUndefined()
  })

  it('全选遇到后台恢复校验不能把没有有效来源的页当作遍历成功', async () => {
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      const response = reply(message, 250)
      if (message.payload.batch && response.type === MessageType.SearchFilesResult && response.payload.ok) {
        delete response.payload.data.querySessionId
        response.payload.data.sourceCode = 'QUERY_SESSION_REVALIDATION_REQUIRED'
      }
      return response
    })
    button('测试查询').click(); await settle(); button('全选所有').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(100)
    expect(button('下载已选').disabled).toBe(true)
  })

  it('预览未返回时直接下载，冻结完整候选与当前配方供下载器判断', async () => {
    vi.useFakeTimers()
    let payload: Extract<ContentRequest, { type: 'DOWNLOAD_FILES' }>['payload'] | undefined
    let previewRecipe: unknown
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 2)
      if (message.type === MessageType.ResolveDownloadNames) { previewRecipe = message.payload.selection; return new Promise(() => {}) }
      if (message.type === MessageType.DownloadFiles) {
        payload = message.payload
        return { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'test.zip', fileCount: 2, notice: '' } } }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    downloadRecipe.value = { templateId: '11111111-1111-4111-8111-111111111111', newFilename: 'one', fileNameType: 'txt' }
    button('测试下载名称').click(); await settle(); await vi.advanceTimersByTimeAsync(250)
    button('下载已选').click(); await settle()
    expect(payload?.items).toHaveLength(2)
    expect(payload?.deduplicate).toBe(true)
    expect(payload?.resolvedNames).toEqual({})
    expect(Object.keys(payload?.caseScopes ?? {})).toHaveLength(2)
    expect(payload?.selection).toEqual({ newFilename: 'one', fileNameType: 'txt' })
    expect(payload?.selection).toEqual(previewRecipe)
  })
  it('名称修改恢复隐藏候选且不重新查询，原名中的 (2) 保留、不同案件不合并', async () => {
    vi.useFakeTimers()
    let searches = 0
    const selected = mount(async message => {
      if (message.type === MessageType.SearchFiles) {
        searches++
        const response = reply(message, 4)
        if (response.type === MessageType.SearchFilesResult && response.payload.ok) response.payload.data.items.forEach((file, index) => {
          file.fileName = index === 1 ? '说明书 (2).docx' : '说明书.docx'
          file.caseId = index === 3 ? 'other' : 'same'
          file.uploadTime = `2026-10-${20 + index} 12:00:00`
        })
        return response
      }
      if (message.type === MessageType.ResolveDownloadNames) return { type: MessageType.ResolveDownloadNamesResult, payload: { ok: true, data: {
        names: message.payload.fileIds.map(id => message.payload.selection.newFilename === 'one' ? '合并.docx' : `${id}.docx`)
      } } }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(3)
    downloadRecipe.value = { newFilename: 'one', fileNameType: 'txt' }
    button('测试下载名称').click(); await settle(); await vi.advanceTimersByTimeAsync(250); await settle()
    expect(Object.keys(selected.value)).toHaveLength(2)
    downloadRecipe.value = { newFilename: 'different', fileNameType: 'txt' }
    button('测试下载名称').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(250); await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)
    expect(searches).toBe(1)
    duplicateOption().click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)
  })
})

describe('按同案同名文件的上传时间选择', () => {
  function duplicateReply(message: Extract<ContentRequest, { type: 'SEARCH_FILES' }>, page = message.payload.query.pageIndex): ContentResponse {
    return { type: MessageType.SearchFilesResult, payload: { ok: true, data: {
      pageIndex: page, pageSize: 100, total: 201, totalPages: 3, querySessionId: '11111111-1111-4111-8111-111111111111',
      items: [{ fileId: `duplicate-${page}`, fileNo: `A${page}`, caseId: 'same-case',
        fileName: page === 1 ? '说明书.doc' : '说明书.docx', uploadTime: `2026-10-${20 + page} 12:00:00` }]
    } } }
  }
  it('默认开启，本页全选只勾较新版本，保留全部结果及正确的页全选状态', async () => {
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      const response = duplicateReply(message)
      if (response.type === MessageType.SearchFilesResult && response.payload.ok) {
        response.payload.data.items.push({ fileId: 'new', fileNo: 'A-new', caseId: 'same-case', fileName: '说明书.docx', uploadTime: '2026-10-29 12:00:00' })
      }
      return response
    })
    button('测试查询').click(); await settle()
    expect(duplicateOption().checked).toBe(true)
    button('全选本页').click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['new'])
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(document.querySelector<HTMLInputElement>('[aria-label="当前页全选"]')?.checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>('[aria-label="说明书.doc"]')?.checked).toBe(false)
    document.querySelector<HTMLInputElement>('[aria-label="说明书.doc"]')!.click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['new'])
  })
  it('并发跨页先返回最新再返回旧版本也只保留最新，批量期间锁定选项', async () => {
    const pending = new Map<number, () => void>()
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      if (!message.payload.batch) return duplicateReply(message)
      return new Promise(resolve => pending.set(message.payload.query.pageIndex, () => resolve(duplicateReply(message))))
    })
    button('测试查询').click(); await settle(); button('全选所有').click(); await settle()
    expect(duplicateOption().disabled).toBe(true)
    pending.get(3)!(); await settle(); pending.get(2)!(); await settle()
    expect(Object.keys(selected.value)).toEqual(['duplicate-3'])
    expect(duplicateOption().disabled).toBe(false)
    expect(document.body.textContent).toContain('共 201 个文件')
  })
  it('关闭后全选保留全部，重新开启仅整理已选，不补勾未选文件', async () => {
    const selected = mount(async message => message.type === MessageType.SearchFiles ? duplicateReply(message)
      : { type: MessageType.Error, payload: { message: 'unused' } })
    button('测试查询').click(); await settle(); duplicateOption().click(); await settle()
    button('全选所有').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(3)
    duplicateOption().click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['duplicate-3'])
    button('取消全选所有').click(); await settle(); duplicateOption().click(); await settle(); duplicateOption().click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(0)
  })
  it('恢复关闭选项及全部选择，旧账本未带选项时默认开启', async () => {
    const request: MessageBridge['request'] = async message => message.type === MessageType.SearchFiles ? duplicateReply(message)
      : { type: MessageType.Error, payload: { message: 'unused' } }
    mount(request); button('测试查询').click(); await settle(); duplicateOption().click(); await settle()
    button('全选所有').click(); await settle()
    app!.unmount(); app = undefined; await settle(); document.body.innerHTML = ''
    const selected = mount(request); await settle()
    expect(duplicateOption().checked).toBe(false)
    expect(Object.keys(selected.value)).toHaveLength(3)
    app!.unmount(); app = undefined; await settle(); document.body.innerHTML = ''
    for (const value of recoveryRows.values()) delete (value as { deduplicate?: boolean }).deduplicate
    const legacy = mount(request); await settle()
    expect(duplicateOption().checked).toBe(true)
    expect(Object.keys(legacy.value)).toEqual(['duplicate-3'])
  })
  it('新下载冻结全部候选，按上传时间排序交给下载器去重', async () => {
    const downloaded: string[][] = []
    const selected = mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 2)
      if (message.type === MessageType.DownloadFiles) {
        downloaded.push(message.payload.items.map(item => item.fileId))
        return { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'one.zip', fileCount: 1, notice: '' } } }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    const ids = Object.keys(selected.value)
    selected.value = Object.fromEntries(Object.values(selected.value).map((file, index) => [file.fileId, {
      ...file, caseId: 'same-case', fileName: index ? '说明书.docx' : '说明书.doc', uploadTime: `2026-10-${21 + index} 12:00:00`
    }]))
    await settle(); button('下载已选').click(); await settle()
    expect(downloaded).toEqual([[ids[1], ids[0]]])
  })
  it('补读失败页时以更新版本替换已选旧版本', async () => {
    let attempts = 0
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      if (message.payload.query.pageIndex === 3 && ++attempts === 1) return { type: MessageType.Error, payload: { message: '登录已失效。' } }
      return duplicateReply(message)
    })
    button('测试查询').click(); await settle(); button('全选所有').click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['duplicate-2'])
    button('重试没读到的 1 页').click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['duplicate-3'])
  })
  it('暂停后调整去重只改变新选择，继续下载沿用冻结清单', async () => {
    const downloaded: string[][] = []
    const selected = mount(async message => {
      if (message.type === MessageType.SearchFiles) {
        const response = duplicateReply(message)
        if (response.type === MessageType.SearchFilesResult && response.payload.ok) response.payload.data.items[0].fileId = `00000000-0000-4000-8000-00000000000${message.payload.query.pageIndex}`
        return response
      }
      if (message.type === MessageType.DownloadFiles) {
        downloaded.push(message.payload.items.map(item => item.fileId))
        return { type: MessageType.DownloadFilesResult, payload: { ok: false, error: { code: 'NETWORK_ERROR', message: 'interrupted' } } }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); duplicateOption().click(); await settle()
    button('全选所有').click(); await settle(); button('下载已选').click(); await settle()
    expect(duplicateOption().disabled).toBe(false)
    duplicateOption().click(); await settle()
    expect(Object.keys(selected.value)).toEqual(['00000000-0000-4000-8000-000000000003'])
    expect(document.querySelector('[aria-label="文件导出"]')?.textContent).toContain('下载任务沿用启动时的 3 个附件；当前查询已选 1 个文件。')
    button('继续下载').click(); await settle()
    expect(downloaded).toEqual([
      ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'],
      ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001']
    ])
  })
})

describe('文件全选的批量分页', () => {
  it.each([false, true])('简化导出区后仍显示下载结果中的操作提醒（成功=%s）', async success => {
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 1)
      if (message.type === MessageType.DownloadFiles) return success
        ? { type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'one.zip', fileCount: 1, notice: '请检查浏览器保存位置。' } } }
        : { type: MessageType.Error, payload: { message: '下载目标不可写，请重新选择保存位置。' } }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).toBe(success
      ? '请检查浏览器保存位置。' : '下载目标不可写，请重新选择保存位置。')
  })
  it('用户取消保存位置时，不建立下载任务也不请求原站下载', async () => {
    const messages: ContentRequest[] = []
    mount(async message => { messages.push(message); return message.type === MessageType.SearchFiles ? reply(message, 1) : { type: MessageType.Error, payload: { message: 'unused' } } })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    targetPicker.cancel = true
    button('下载已选').click(); await settle()
    expect(targetPicker.calls).toBe(1)
    expect(messages.some(message => message.type === MessageType.DownloadFiles)).toBe(false)
    expect([...recoveryRows.values()].some(value => Boolean((value as { activeTask?: unknown }).activeTask))).toBe(false)
  })
  it.each(['unmount', 'session'] as const)('WAL ACK 等待期间发生 %s 后不能启动旧下载', async event => {
    const messages: ContentRequest[] = []
    const allowed = ref(true)
    mount(async message => {
      messages.push(message)
      if (message.type === MessageType.SearchFiles) return reply(message, 1)
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }, allowed)
    button('测试查询').click(); await settle()
    button('全选本页').click(); await settle()
    let release!: () => void
    recoveryGate.wait = new Promise(resolve => { release = resolve })
    button('下载已选').click(); await settle()
    expect(messages.some(message => message.type === MessageType.DownloadFiles)).toBe(false)
    if (event === 'unmount') { app?.unmount(); app = undefined }
    else { allowed.value = false; await settle(); allowed.value = true }
    await settle(); release(); recoveryGate.wait = null; await settle()
    expect(messages.some(message => message.type === MessageType.DownloadFiles)).toBe(false)
  })
  it.each(['unmount', 'session'])('%s 时暂停来源生产者，不能只取消界面等待', async event => {
    const messages: ContentRequest[] = [], allowed = ref(true)
    let finish!: (response: ContentResponse) => void
    mount(async message => {
      messages.push(message)
      if (message.type === MessageType.SearchFiles) return reply(message, 1)
      if (message.type === MessageType.DownloadFiles) return new Promise(resolve => { finish = resolve })
      if (message.type === MessageType.PauseDownload) return { type: MessageType.PauseDownloadResult, payload: { ok: true } }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }, allowed)
    button('测试查询').click(); await settle()
    button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    const task = messages.find(message => message.type === MessageType.DownloadFiles)!
    if (event === 'unmount') { app?.unmount(); app = undefined } else allowed.value = false
    await settle()
    expect(messages).toContainEqual({ type: MessageType.PauseDownload, payload: { taskId: task.payload.taskId, backend: 'browser' } })
    finish({ type: MessageType.DownloadFilesResult, payload: { ok: false, error: { code: 'NETWORK_ERROR', message: '暂停' } } }); await settle()
  })
  it('下载期间不能重试漏页，避免两个任务争用彩虹条', async () => {
    let finishDownload: ((value: ContentResponse) => void) | undefined
    let batchCalls = 0
    mount(async message => {
      if (message.type === MessageType.SearchFiles) {
        if (message.payload.batch) {
          batchCalls++
          return { type: MessageType.SearchFilesResult, payload: { ok: false, error: { code: 'SESSION_EXPIRED', message: '登录已失效。' } } }
        }
        return reply(message, 700)
      }
      if (message.type === MessageType.DownloadFiles) return new Promise(resolve => { finishDownload = resolve })
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    const retry = Array.from(document.querySelectorAll('button')).find(node => node.textContent?.startsWith('重试没读到的'))!
    expect(retry).toBeDefined()
    button('下载已选').click(); await settle()
    expect(retry.disabled).toBe(true)
    const calls = batchCalls
    retry.click(); await settle()
    expect(batchCalls).toBe(calls)
    finishDownload!({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'a.zip', fileCount: 100, notice: '' } } })
    await settle()
  })
  it('顶部彩虹条持续显示下载进度，命名结束不提前完成，保存后才到100%', async () => {
    downloadRecipe.value = { newFilename: 'file_name', fileNameType: 'colname' }
    type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void
    const listeners = new Set<Listener>()
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: {
      addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn)
    } } })
    let download: { message: Extract<ContentRequest, { type: 'DOWNLOAD_FILES' }>; resolve: (value: ContentResponse) => void } | undefined
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 100)
      if (message.type === MessageType.DownloadFiles) return new Promise(resolve => { download = { message, resolve } })
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    templateLabel.value = '后来选的模板乙'
    button('下载已选').click(); await settle()
    expect(taskCheckProgress.label).toBe('下载文件')
    expect(download!.message.payload.archiveName).toBe('模板甲.zip')
    expect(download!.message.payload.stream).toBe(true)
    expect(listeners.size).toBe(1)
    const panel = document.querySelector('[aria-label="文件导出"]')!
    expect(panel.closest('[aria-label="查询结果"]')).not.toBeNull()
    expect(panel.querySelector('[role="progressbar"]')).toBeNull()
    expect(panel.querySelector('strong')).toBeNull()
    expect(panel.textContent).not.toContain('模板甲.zip')
    expect(panel.textContent).not.toContain('本次任务')
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('0')
    expect(button('暂停下载').closest('[aria-label="文件导出"]')).toBe(panel)
    const progress = { channel: DOWNLOAD_PROGRESS_CHANNEL, id: download!.message.payload.progressId, progress: { phase: 'naming', done: 40, total: 100 } }
    for (const fn of listeners) fn({ ...progress, id: 'other-download' }, { id: 'test-extension' })
    expect(taskCheckProgress.done).toBe(0)
    for (const fn of listeners) fn(progress, { id: 'test-extension' })
    expect(taskCheckProgress.done).toBe(0)
    for (const phase of [
      { phase: 'packing', done: 10, total: 100 },
      { phase: 'downloading', done: 0, total: 1, receivedBytes: 1024, totalBytes: 8192 },
      { phase: 'saving', done: 0, total: 1 }
    ]) {
      for (const fn of listeners) fn({ ...progress, progress: phase }, { id: 'test-extension' })
      expect(taskCheckProgress.done).toBe(10)
      expect(taskCheckProgress.status).toBe('run')
    }
    await settle()
    const rainbow = document.querySelector('.check-rainbow')!
    expect(rainbow.querySelectorAll('p')).toHaveLength(2)
    expect(rainbow.querySelectorAll('p')[0].textContent).toContain('正在取名、入包…')
    expect(rainbow.querySelectorAll('p')[0].textContent).toContain('预计')
    expect(rainbow.querySelector('.check-rainbow-percent')?.textContent).toBe('10%')
    expect(rainbow.querySelectorAll('p')[1].textContent).toContain('取名 40/100')
    expect(rainbow.querySelectorAll('p')[1].textContent).toContain('入包 10/100')
    expect(rainbow.querySelectorAll('p')[1].textContent).toContain('下载 1.0 KB / 8.0 KB（12.5%）')
    expect(rainbow.textContent).not.toContain('下载文件 10%')
    expect(rainbow.textContent?.match(/10\/100/g)).toHaveLength(1)
    expect(panel.textContent).not.toContain('入包')
    expect(panel.textContent).not.toContain('已命名')
    expect(panel.querySelector('[role="status"]')).toBeNull()
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('10')
    for (const fn of listeners) fn({ ...progress, progress: { phase: 'naming', done: 100, total: 100 } }, { id: 'test-extension' })
    expect(taskCheckProgress.label).toBe('下载文件')
    expect(taskCheckProgress.status).toBe('run')
    for (const fn of listeners) fn({ ...progress, progress: { phase: 'packing', done: 100, total: 100 } }, { id: 'test-extension' })
    await settle()
    expect(taskCheckProgress.percent).toBe(99)
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('正在保存压缩包')
    expect(document.querySelector('.check-rainbow-percent')?.textContent).toBe('99%')
    expect(document.querySelector('.check-rainbow')?.textContent).not.toContain('预计')
    download!.resolve({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'download.zip', fileCount: 100, notice: '' } } })
    await settle()
    expect(taskCheckProgress.status).toBe('done')
    expect(taskCheckProgress.label).toBe('下载文件')
    expect(taskCheckProgress.visible).toBe(true)
    expect(listeners.size).toBe(0)
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('导出完成')
    expect(document.querySelector('.check-rainbow-percent')?.textContent).toBe('100%')
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('下载 已保存')
    expect(panel.querySelector('[role="status"]')).toBeNull()
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('100')
  })
  it('跳过文件算已处理进度，保存后显示真实入包数而非全部入包', async () => {
    type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void
    const listeners = new Set<Listener>()
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: {
      addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn)
    } } })
    let progressId = ''
    let finish!: (value: ContentResponse) => void
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 3)
      if (message.type === MessageType.DownloadFiles) { progressId = message.payload.progressId!; return new Promise(resolve => { finish = resolve }) }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    for (const listener of listeners) listener({ channel: DOWNLOAD_PROGRESS_CHANNEL, id: progressId,
      progress: { phase: 'packing', done: 3, total: 3, failed: 1 } }, { id: 'test-extension' })
    await settle()
    const rainbow = document.querySelector('.check-rainbow')!
    expect(rainbow.textContent).toContain('入包 2/3')
    expect(rainbow.textContent).toContain('跳过 1')
    expect(rainbow.getAttribute('aria-valuenow')).toBe('99')
    expect(rainbow.textContent).toContain('正在保存压缩包')
    finish({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'result.zip', fileCount: 3, notice: '成功 2 个，跳过 1 个；详情见失败清单。' } } })
    await settle()
    expect(rainbow.getAttribute('aria-valuenow')).toBe('100')
    expect(rainbow.textContent).toContain('入包 2/3')
    expect(rainbow.textContent).toContain('跳过 1')
    expect(rainbow.textContent).not.toContain('入包 3/3')
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).toContain('成功 2 个，跳过 1 个')
  })
  it('原名下载也显示入包进度，暂停保留计数且拒绝迟到的进度', async () => {
    type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void
    const listeners = new Set<Listener>()
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: {
      addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn)
    } } })
    let payload: Extract<ContentRequest, { type: 'DOWNLOAD_FILES' }>['payload'] | undefined
    let finish!: (value: ContentResponse) => void
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 4)
      if (message.type === MessageType.DownloadFiles) { payload = message.payload; return new Promise(resolve => { finish = resolve }) }
      if (message.type === MessageType.PauseDownload) return { type: MessageType.PauseDownloadResult, payload: { ok: true } }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    const panel = document.querySelector('[aria-label="文件导出"]')!
    const listener = [...listeners][0]
    const progress = { channel: DOWNLOAD_PROGRESS_CHANNEL, id: payload!.progressId, progress: { phase: 'packing', done: 2, total: 4 } }
    listener(progress, { id: 'test-extension' }); await settle()
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('50')
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('附件原名')
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('取名 使用附件原名')
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('下载 等待接收')
    listener({ ...progress, progress: { phase: 'downloading', done: 0, total: 1, receivedBytes: 76_021_760 } }, { id: 'test-extension' }); await settle()
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('下载 已接收 72.5 MB（总大小待确认）')
    expect(document.querySelector('.check-rainbow')?.textContent).not.toContain('下载 50%')
    expect(panel.textContent).not.toContain('附件原名')
    button('暂停下载').click(); await settle()
    expect(panel.querySelector('[role="status"]')).toBeNull()
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('50')
    expect(document.querySelector('.check-rainbow')?.textContent).toContain('下载已暂停')
    listener({ ...progress, progress: { phase: 'packing', done: 4, total: 4 } }, { id: 'test-extension' }); await settle()
    expect(document.querySelector('.check-rainbow')?.getAttribute('aria-valuenow')).toBe('50')
    expect(button('下载已选').disabled).toBe(true)
    expect(button('继续下载').disabled).toBe(false)
    expect(listeners.size).toBe(0)
    finish({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'late.zip', fileCount: 4, notice: '' } } }); await settle()
    expect(panel.textContent).not.toContain('导出完成')
  })
  it('暂停必须等后台确认再开放继续，确认失败时可重试', async () => {
    let confirm!: (response: ContentResponse) => void
    let finish!: (response: ContentResponse) => void
    mount(async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 1)
      if (message.type === MessageType.DownloadFiles) return new Promise(resolve => { finish = resolve })
      if (message.type === MessageType.PauseDownload) return new Promise(resolve => { confirm = resolve })
      return { type: MessageType.Error, payload: { message: 'unused' } }
    })
    button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle(); button('暂停下载').click(); await settle()
    expect(button('继续下载').disabled).toBe(true)
    confirm({ type: MessageType.Error, payload: { message: '扩展后台没有在时限内返回。' } }); await settle()
    expect(button('继续下载').disabled).toBe(true)
    expect(document.querySelector('[aria-label="文件导出"] [role="status"]')?.textContent).toContain('扩展后台没有在时限内返回。')
    button('重新确认暂停').click(); await settle()
    expect(button('继续下载').disabled).toBe(true)
    confirm({ type: MessageType.PauseDownloadResult, payload: { ok: true } }); await settle()
    expect(button('继续下载').disabled).toBe(false)
    expect(document.body.textContent).not.toContain('重新确认暂停')
    finish({ type: MessageType.Error, payload: { message: 'old result' } }); await settle()
  })
  it('翻页完成后保留彩虹条直到下一次查询，不能两秒后自动消失', async () => {
    vi.useFakeTimers()
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 100)
      : { type: MessageType.Error, payload: { message: 'unused' } })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    expect(taskCheckProgress.status).toBe('done')
    await vi.advanceTimersByTimeAsync(5000)
    expect(taskCheckProgress.visible).toBe(true)
    expect(taskCheckProgress.percent).toBe(100)
    button('测试查询').click(); await settle()
    expect(taskCheckProgress.visible).toBe(false)
  })
  it('默认用100条查询，复用已读页，1597条只补15页且完成数量正确', async () => {
    const calls: Extract<ContentRequest, { type: 'SEARCH_FILES' }>[] = []
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      calls.push(message)
      return reply(message)
    })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    expect(calls[0].payload.query.pageSize).toBe(100)
    expect(calls).toHaveLength(16)
    expect(calls.slice(1).map(call => call.payload.query.pageIndex).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 2))
    expect(calls.slice(1).every(call => call.payload.batch === true && call.payload.query.pageSize === 100)).toBe(true)
    expect(Object.keys(selected.value)).toHaveLength(1597)
    expect(document.body.textContent).toContain('已全选 1597 个文件。')
  })

  it('查询20条已有结果时，全选切换到100条并创建匹配布局的查询来源', async () => {
    const calls: Extract<ContentRequest, { type: 'SEARCH_FILES' }>[] = []
    mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      calls.push(message)
      const response = reply(message, 240)
      if (response.type === MessageType.SearchFilesResult && response.payload.ok && message.payload.query.pageSize === 100) {
        response.payload.data.querySessionId = '22222222-2222-4222-8222-222222222222'
      }
      return response
    })
    const pageSize = document.querySelector<HTMLSelectElement>('select[aria-label="每页数量"]') ?? document.querySelector<HTMLSelectElement>('select')
    // 初次查询前选20，保留用户在旧页面得到的布局。
    if (pageSize) { pageSize.value = '20'; pageSize.dispatchEvent(new Event('change', { bubbles: true })); await settle() }
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    expect(calls[0].payload.query.pageSize).toBe(20)
    expect(calls.slice(1).map(call => [call.payload.query.pageIndex, call.payload.query.pageSize])).toEqual([[1, 100], [2, 100], [3, 100]])
    expect(calls[1].payload.continuation).toBeUndefined()
    expect(calls[1].payload.batch).toBeUndefined()
    expect(calls.slice(2).every(call => call.payload.continuation?.querySessionId === '22222222-2222-4222-8222-222222222222')).toBe(true)
    const traversedCalls = calls.length
    button('下一页').click(); await settle(); button('上一页').click(); await settle()
    expect(calls).toHaveLength(traversedCalls)
    expect(document.body.textContent).toContain('file-1.pdf')
  })

  it('重新查询后忽略旧批次的在途页，不把旧文件重新勾入', async () => {
    const pending: { message: Extract<ContentRequest, { type: 'SEARCH_FILES' }>; resolve: (value: ContentResponse) => void }[] = []
    let searches = 0
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      if (!message.payload.batch) { searches++; return reply(message, searches === 1 ? 900 : 1) }
      return new Promise(resolve => pending.push({ message, resolve }))
    })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    expect(pending.length).toBeGreaterThan(0)
    button('测试查询').click(); await settle()
    for (const { message, resolve } of pending) resolve(reply(message, 900))
    await settle()
    expect(Object.keys(selected.value)).toHaveLength(0)
    expect(document.body.textContent).not.toContain('已全选')
  })

  it('全选过程中点取消全选，晚到的页不能重新恢复已取消选择', async () => {
    const pending: { message: Extract<ContentRequest, { type: 'SEARCH_FILES' }>; resolve: (value: ContentResponse) => void }[] = []
    const selected = mount(async message => {
      if (message.type !== MessageType.SearchFiles) return { type: MessageType.Error, payload: { message: 'unused' } }
      if (!message.payload.batch) return reply(message, 900)
      return new Promise(resolve => pending.push({ message, resolve }))
    })
    button('测试查询').click(); await settle()
    button('全选所有').click(); await settle()
    button('取消全选所有').click(); await settle()
    for (const { message, resolve } of pending) resolve(reply(message, 900))
    await settle()
    expect(Object.keys(selected.value)).toHaveLength(0)
  })
})


describe('file query durable remount', () => {
  it('会话 epoch 更新不能让待回放的只读工作面被跳过', async () => {
    const request: MessageBridge['request'] = async message => message.type === MessageType.SearchFiles
      ? reply(message, 1) : { type: MessageType.Error, payload: { message: 'unused' } }
    mount(request); button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    app!.unmount(); app = undefined; await settle(); document.body.innerHTML = ''
    let release!: () => void
    recoveryGate.read = new Promise(resolve => { release = resolve })
    const epoch = ref(0)
    const selected = mount(request, ref(true), epoch); await settle()
    epoch.value++; await settle(); release(); recoveryGate.read = null; await settle()
    expect(Object.keys(selected.value)).toHaveLength(1)
    expect(document.body.textContent).toContain('已恢复本地查询与选择')
  })
  it('restores result/selection read-only without querying, clears orphan progress, then explicitly revalidates', async () => {
    let queries = 0
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) { queries++; return reply(message, 4) }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }
    const selected = mount(request)
    button('测试查询').click(); await settle()
    button('全选本页').click(); await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)
    taskCheckProgress.label = '下载文件'; taskCheckProgress.status = 'run'; taskCheckProgress.visible = true
    app!.unmount(); app = undefined; await settle(); document.body.innerHTML = ''
    const restored = mount(request); await settle()
    expect(queries).toBe(1)
    expect(Object.keys(restored.value)).toHaveLength(4)
    expect(document.body.textContent).toContain('只读工作面')
    expect(taskCheckProgress.visible).toBe(false)
    expect(button('下载已选').disabled).toBe(true)
    button('刷新').click(); await settle()
    expect(queries).toBe(2)
    expect(Object.keys(restored.value)).toHaveLength(4)
    expect(button('下载已选').disabled).toBe(false)
  })
  it('durably saves immutable task before production and restores failed attempts as paused', async () => {
    let taskId = ''
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) return reply(message, 2)
      if (message.type === MessageType.DownloadFiles) {
        const saved = [...recoveryRows.values()].find(value => Boolean((value as { activeTask?: unknown }).activeTask)) as { activeTask: { id: string; items: unknown[] } }
        expect(saved.activeTask.items).toHaveLength(2)
        expect(saved.activeTask.id).toBe(message.payload.taskId)
        if (taskId) expect(message.payload.taskId).toBe(taskId)
        taskId = message.payload.taskId!
        return { type: MessageType.DownloadFilesResult, payload: { ok: false, error: { code: 'NETWORK_ERROR', message: 'interrupted' } } }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }
    mount(request); button('测试查询').click(); await settle(); button('全选本页').click(); await settle()
    button('下载已选').click(); await settle()
    expect(taskId).not.toBe('')
    expect(button('继续下载').disabled).toBe(false)
    app!.unmount(); app = undefined; await settle(); document.body.innerHTML = ''
    mount(request); await settle()
    expect(button('继续下载').disabled).toBe(true)
    button('刷新').click(); await settle(); button('继续下载').click(); await settle()
    expect(document.body.textContent).toContain('下载已暂停')
  })

  it('勾选所有账单：仅勾选符合「账单号+我方案号+事项+账单日期」命名的账单文件', async () => {
    const mixedFiles = [
      { fileId: 'b-1', fileName: '202605182 PA2510821PCT-EP 答复欧洲检索报告 20261110.pdf', caseVolume: 'PA2510821PCT-EP', fileNo: 'NO1' },
      { fileId: 'b-2', fileName: 'Credit Memo PA2310398CN-US RCE退款20261111.pdf', caseVolume: 'PA2310398CN-US', fileNo: 'NO2' },
      { fileId: 'not-1', fileName: 'PA2631801CN-HAGUE 海牙外观缴费通知书.pdf', caseVolume: 'PA2631801CN-HAGUE', fileNo: 'NO3' },
      { fileId: 'not-2', fileName: '云图发票.pdf', caseVolume: 'PA2631761CN-US', fileNo: 'NO4' },
      { fileId: 'not-3', fileName: '案例费用清单-云图.xls', caseVolume: 'PA2631801CN-HAGUE', fileNo: 'NO5' }
    ]
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) {
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              pageIndex: 1,
              pageSize: 100,
              total: 5,
              totalPages: 1,
              querySessionId: 'sess-bill-1',
              items: mixedFiles
            }
          }
        }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }

    const selected = mount(request)
    button('测试查询').click()
    await settle()

    expect(button('只选所有账单')).toBeDefined()
    button('只选所有账单').click()
    await settle()

    // 只有 b-1 和 b-2 被勾选，not-1/not-2/not-3 不被勾选
    expect(Object.keys(selected.value)).toHaveLength(2)
    expect(selected.value['b-1']).toBeDefined()
    expect(selected.value['b-2']).toBeDefined()
    expect(selected.value['not-1']).toBeUndefined()
    expect(selected.value['not-2']).toBeUndefined()
    expect(selected.value['not-3']).toBeUndefined()
    expect(document.body.textContent).toContain('已选 2 个文件')
    expect(document.body.textContent).toContain('已勾选 2 个账单文件')
  })

  it('P1-B 集合语义测试：已有全部文件选中时，点击「只选所有账单」应清除所有非账单文件', async () => {
    const mixedFiles = [
      { fileId: 'b-1', fileName: '202605182 PA2510821PCT-EP 答复欧洲检索报告 20261110.pdf', caseVolume: 'PA2510821PCT-EP', fileNo: 'NO1' },
      { fileId: 'b-2', fileName: 'Credit Memo PA2310398CN-US RCE退款20261111.pdf', caseVolume: 'PA2310398CN-US', fileNo: 'NO2' },
      { fileId: 'not-1', fileName: 'PA2631801CN-HAGUE 海牙外观缴费通知书.pdf', caseVolume: 'PA2631801CN-HAGUE', fileNo: 'NO3' },
      { fileId: 'not-2', fileName: '云图发票.pdf', caseVolume: 'PA2631761CN-US', fileNo: 'NO4' }
    ]
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) {
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              pageIndex: 1,
              pageSize: 100,
              total: 4,
              totalPages: 1,
              querySessionId: 'sess-bill-2',
              items: mixedFiles
            }
          }
        }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }

    const selected = mount(request)
    button('测试查询').click()
    await settle()

    // 1. 先全选本页（此时包括两个非账单 not-1 和 not-2）
    button('全选本页').click()
    await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)

    // 2. 点击「只选所有账单」
    button('只选所有账单').click()
    await settle()

    // 3. 必须断言非账单被清除，仅剩下 2 个账单
    expect(Object.keys(selected.value)).toHaveLength(2)
    expect(selected.value['b-1']).toBeDefined()
    expect(selected.value['b-2']).toBeDefined()
    expect(selected.value['not-1']).toBeUndefined()
    expect(selected.value['not-2']).toBeUndefined()

    // 4. 再点击「全选所有」切换为全部文件
    button('全选所有').click()
    await settle()
    expect(Object.keys(selected.value)).toHaveLength(4)
  })

  it('P1-B 集合语义测试：多页部分失败及重试，全程绝不污染非账单文件', async () => {
    let failPage2 = true
    const page1Items = [
      { fileId: 'p1-b', fileName: '1262526 PA2510173PCT-US IDS3账单 20261105.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F1' },
      { fileId: 'p1-not', fileName: '云图发票.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F2' }
    ]
    const page2Items = [
      { fileId: 'p2-b', fileName: '603814 PA2410192PCT-EP 缴纳第六年维持费 20261101.PDF', caseVolume: 'PA2410192PCT-EP', fileNo: 'F3' },
      { fileId: 'p2-not', fileName: 'PA2410192PCT-EP 缴费通知书.pdf', caseVolume: 'PA2410192PCT-EP', fileNo: 'F4' }
    ]
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) {
        const page = message.payload.query.pageIndex
        if (page === 2 && failPage2) {
          return { type: MessageType.Error, payload: { message: '登录已失效。' } }
        }
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              pageIndex: page,
              pageSize: 100,
              total: 101,
              totalPages: 2,
              querySessionId: 'sess-paged-bill',
              items: page === 1 ? page1Items : page2Items
            }
          }
        }
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }

    const selected = mount(request)
    button('测试查询').click()
    await settle()

    button('只选所有账单').click()
    await settle()

    // 第2页失败，第1页账单勾选成功，非账单不被勾选
    expect(Object.keys(selected.value)).toHaveLength(1)
    expect(selected.value['p1-b']).toBeDefined()
    expect(selected.value['p1-not']).toBeUndefined()

    // 重试第2页
    failPage2 = false
    const retryBtn = Array.from(document.querySelectorAll('button')).find(n => n.textContent?.includes('重试'))
    expect(retryBtn).toBeDefined()
    retryBtn!.click()
    await settle()

    // 重试成功后，最终包含 p1-b 和 p2-b，绝无 p1-not 或 p2-not
    expect(Object.keys(selected.value)).toHaveLength(2)
    expect(selected.value['p1-b']).toBeDefined()
    expect(selected.value['p2-b']).toBeDefined()
    expect(selected.value['p1-not']).toBeUndefined()
    expect(selected.value['p2-not']).toBeUndefined()
  })

  it('正在翻页过程中行复选框与全选本页按钮禁用，且防误触不中断批量翻页', async () => {
    let pendingResolve: ((res: ContentResponse) => void) | null = null
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) {
        const page = message.payload.query.pageIndex
        if (page === 1) {
          return {
            type: MessageType.SearchFilesResult,
            payload: {
              ok: true,
              data: {
                pageIndex: 1,
                pageSize: 100,
                total: 200,
                totalPages: 2,
                querySessionId: 'sess-lock',
                items: [{ fileId: 'f1', fileName: 'PA2510173PCT-US 账单 20261105.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F1' }]
              }
            }
          }
        }
        // 第2页挂起
        return new Promise(resolve => { pendingResolve = resolve })
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }

    const selected = mount(request)
    button('测试查询').click()
    await settle()

    button('全选所有').click()
    await settle()

    // 此时正在批量翻页
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('table input[type="checkbox"]'))
    expect(checkboxes.length).toBeGreaterThan(0)
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true)
    }

    const selectCurBtn = button('全选本页')
    expect(selectCurBtn.disabled).toBe(true)

    // 存在「停止翻页」按钮
    const stopBtn = Array.from(document.querySelectorAll('button')).find(n => n.textContent?.includes('停止翻页'))
    expect(stopBtn).toBeDefined()

    // 释放第2页
    expect(pendingResolve).not.toBeNull()
    pendingResolve!({
      type: MessageType.SearchFilesResult,
      payload: {
        ok: true,
        data: {
          pageIndex: 2,
          pageSize: 100,
          total: 200,
          totalPages: 2,
          querySessionId: 'sess-lock',
          items: [{ fileId: 'f2', fileName: 'PA2510173PCT-US 账单2 20261105.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F2' }]
        }
      }
    })
    await settle()

    expect(Object.keys(selected.value)).toHaveLength(2)
  })

  it('正在翻页过程中点击「停止翻页」可安全中止翻页', async () => {
    let pendingResolve: ((res: ContentResponse) => void) | null = null
    const request: MessageBridge['request'] = async message => {
      if (message.type === MessageType.SearchFiles) {
        const page = message.payload.query.pageIndex
        if (page === 1) {
          return {
            type: MessageType.SearchFilesResult,
            payload: {
              ok: true,
              data: {
                pageIndex: 1,
                pageSize: 100,
                total: 200,
                totalPages: 2,
                querySessionId: 'sess-stop',
                items: [{ fileId: 'f1', fileName: 'PA2510173PCT-US 账单 20261105.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F1' }]
              }
            }
          }
        }
        return new Promise(resolve => { pendingResolve = resolve })
      }
      return { type: MessageType.Error, payload: { message: 'unused' } }
    }

    mount(request)
    button('测试查询').click()
    await settle()

    button('全选所有').click()
    await settle()

    const stopBtn = Array.from(document.querySelectorAll('button')).find(n => n.textContent?.includes('停止翻页'))
    expect(stopBtn).toBeDefined()
    stopBtn!.click()
    await settle()

    // 停止后提示已停止翻页，停止翻页按钮消失
    const stopBtnAfter = Array.from(document.querySelectorAll('button')).find(n => n.textContent?.includes('停止翻页'))
    expect(stopBtnAfter).toBeUndefined()
    expect(document.body.textContent).toContain('已停止翻页')

    // 即使第2页再回来，也不会重新激活已停止的批次
    const resolveLater = pendingResolve as ((res: ContentResponse) => void) | null
    if (resolveLater) {
      resolveLater({
        type: MessageType.SearchFilesResult,
        payload: {
          ok: true,
          data: {
            pageIndex: 2,
            pageSize: 100,
            total: 200,
            totalPages: 2,
            querySessionId: 'sess-stop',
            items: [{ fileId: 'f2', fileName: 'PA2510173PCT-US 账单2 20261105.pdf', caseVolume: 'PA2510173PCT-US', fileNo: 'F2' }]
          }
        }
      })
      await settle()
    }
  })

  it('顶部分页与每页数量、刷新按钮同组收拢到右侧 .file-results-tools 内', async () => {
    mount(async message => message.type === MessageType.SearchFiles ? reply(message, 250) : { type: MessageType.Error, payload: { message: 'unused' } })
    button('测试查询').click()
    await settle()

    const tools = document.querySelector('.file-results > .section-heading .file-results-tools')
    expect(tools).not.toBeNull()
    const nav = tools!.querySelector('nav[aria-label="文件顶部分页"].toolbar-pagination')
    const pageSizeEl = tools!.querySelector('label.page-size')
    const refreshBtn = tools!.querySelector('button.text-button')
    expect(nav).not.toBeNull()
    expect(pageSizeEl).not.toBeNull()
    expect(refreshBtn?.textContent?.trim()).toBe('刷新')
    expect(Array.from(tools!.children)).toEqual([nav, pageSizeEl, refreshBtn])
  })
})
