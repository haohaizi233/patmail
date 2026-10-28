import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FileSearchQuery from '../../../src/app/components/FileSearchQuery.vue'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import type { SelectedPatentFile } from '../../../src/mail'
import { resetTaskCheckProgress, taskCheckProgress } from '../../../src/app/check-progress'
import { DOWNLOAD_PROGRESS_CHANNEL } from '../../../src/shared/download-progress'
const templateLabel = vi.hoisted(() => ({ value: '模板甲' }))
const downloadRecipe = vi.hoisted(() => ({ value: null as { newFilename: string; fileNameType: string } | null }))

const recoveryRows = vi.hoisted(() => new Map<string, unknown>())
const recoveryGate = vi.hoisted(() => ({ wait: null as Promise<void> | null, read: null as Promise<void> | null }))
vi.mock('../../../src/recovery/wal-ledger', () => ({
  recallRecovery: async (_slot: string, scope: string) => { if (recoveryGate.read) await recoveryGate.read; return recoveryRows.get(scope) ?? null },
  rememberRecovery: async (_slot: string, scope: string, payload: unknown) => { recoveryRows.set(scope, JSON.parse(JSON.stringify(payload))); if (recoveryGate.wait) await recoveryGate.wait }
}))

vi.mock('../../../src/floating/QueryTemplateSection.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['pageSize'], emits: ['search'], setup(props, { emit, expose }) {
    expose({ currentDownloadSelection: () => downloadRecipe.value, currentSearchTemplateName: () => templateLabel.value })
    return () => h('button', { onClick: () => emit('search', {
      resolvedFields: { case_volume: 'AUDIT' }, pageIndex: 1, pageSize: props.pageSize
    }) }, '测试查询')
  } }) }
})
vi.mock('../../../src/shell/components/ThemeSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue'], setup(props, { emit }) {
    return () => h('select', { 'aria-label': '每页数量', value: props.modelValue,
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value)
    }, props.options.map((option: { value: number; label: string }) => h('option', { value: option.value }, option.label)))
  } }) }
})

let app: App | undefined
afterEach(() => { recoveryGate.wait = null; recoveryGate.read = null; app?.unmount(); recoveryRows.clear(); app = undefined; document.body.innerHTML = ''; resetTaskCheckProgress(); downloadRecipe.value = null; templateLabel.value = '模板甲'; vi.useRealTimers(); vi.unstubAllGlobals() })
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
function mount(request: MessageBridge['request'], allowed = ref(true), epoch = ref(0)) {
  const selected = ref<Record<string, SelectedPatentFile>>({})
  app = createApp({ render: () => h(FileSearchQuery, {
    userId: 'test', origin: 'http://183.36.43.66:88', canSearch: allowed.value, selectable: true, epoch: epoch.value,
    selected: selected.value, 'onUpdate:selected': value => { selected.value = value }
  }) })
  app.provide('bridge', { request })
  app.directive('hint', {})
  app.mount(document.body.appendChild(document.createElement('div')))
  return selected
}

describe('文件全选的批量分页', () => {
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
    expect(messages).toContainEqual({ type: MessageType.PauseDownload, payload: { taskId: task.payload.taskId } })
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
  it('命名与下载交错时只显示名称解析进度，结束后保留状态并清理监听', async () => {
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
    expect(taskCheckProgress.label).toBe('生成下载名称')
    expect(download!.message.payload.archiveName).toBe('模板甲.zip')
    expect(download!.message.payload.stream).toBe(true)
    expect(listeners.size).toBe(1)
    const progress = { channel: DOWNLOAD_PROGRESS_CHANNEL, id: download!.message.payload.progressId, progress: { phase: 'naming', done: 40, total: 100 } }
    for (const fn of listeners) fn({ ...progress, id: 'other-download' }, { id: 'test-extension' })
    expect(taskCheckProgress.done).toBe(0)
    for (const fn of listeners) fn(progress, { id: 'test-extension' })
    expect(taskCheckProgress.done).toBe(40)
    const namingSnapshot = { ...taskCheckProgress }
    for (const phase of [
      { phase: 'packing', done: 10, total: 100 },
      { phase: 'downloading', done: 0, total: 1, receivedBytes: 1024, totalBytes: 8192 },
      { phase: 'saving', done: 0, total: 1 }
    ]) {
      for (const fn of listeners) fn({ ...progress, progress: phase }, { id: 'test-extension' })
      expect({ ...taskCheckProgress }).toEqual(namingSnapshot)
    }
    for (const fn of listeners) fn({ ...progress, progress: { phase: 'naming', done: 100, total: 100 } }, { id: 'test-extension' })
    expect(taskCheckProgress.label).toBe('生成下载名称')
    expect(taskCheckProgress.status).toBe('done')
    download!.resolve({ type: MessageType.DownloadFilesResult, payload: { ok: true, data: { fileName: 'download.zip', fileCount: 100, notice: '' } } })
    await settle()
    expect(taskCheckProgress.status).toBe('done')
    expect(taskCheckProgress.label).toBe('生成下载名称')
    expect(taskCheckProgress.visible).toBe(true)
    expect(listeners.size).toBe(0)
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
      return reply(message, 240)
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
    expect(calls.slice(2).every(call => call.payload.continuation?.querySessionId === '11111111-1111-4111-8111-111111111111')).toBe(true)
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
    taskCheckProgress.label = '生成下载名称'; taskCheckProgress.status = 'run'; taskCheckProgress.visible = true
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
})
