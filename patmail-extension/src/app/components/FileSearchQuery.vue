<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, watch, computed } from 'vue'
import type { FileSearchQuery } from '../../api/file-search-params'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import { assessQueryScope, fileSearchValueLimit, isFileSearchBusinessField } from '../../api/file-search-params'
import { coerceFileSearchQuery } from '../../api/message-guards'
import type { FileSearchResult, PatentFile } from '../../api/file-search-types'
import { selectPage, toSelectedFile, toggleSelected, type SelectedPatentFile } from '../../mail'
import { fieldLabel } from '../../query/field-registry'
import { paintTaskCheckProgress, resetTaskCheckProgress, taskCheckProgress } from '../check-progress'
import { runPagedFetch, type PageFetchResult } from '../page-pool'
import QueryTemplateSection from '../../floating/QueryTemplateSection.vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { MessageType, type MessageBridge } from '../../shared/message'
import { DownloadNameValidationError, type FileDownloadSelection } from '../../mail/download-name'
import { downloadNameText } from '../../mail/download-name'
import { DOWNLOAD_PROGRESS_CHANNEL, isDownloadProgress } from '../../shared/download-progress'
import { newUuid } from '../../utils/uuid'
import { templateArchiveName } from '../../api/file-download'
import { isRecord } from '../../shared/guards'

const props = withDefaults(defineProps<{
  userId: string
  origin: string
  canSearch: boolean
  seed?: Record<string, string> | null
  seedToken?: number
  selectable?: boolean
  epoch?: number
}>(), { seed: null, seedToken: 0, selectable: false, epoch: 0 })

const selected = defineModel<Record<string, SelectedPatentFile>>('selected', { default: () => ({}) })

const emit = defineEmits<{
  searched: [query: FileSearchQuery]
  'download-name': [selection: FileDownloadSelection | null, problem: string]
  plan: []
  review: []
}>()

const bridge = inject<MessageBridge>('bridge')
const queryForm = ref<InstanceType<typeof QueryTemplateSection> | null>(null)
const downloadSelection = ref<FileDownloadSelection | null>(null)
const stripAppNoDot = ref(true)
const downloading = ref(false)
let disposed = false
let releaseDownloadProgress: (() => void) | null = null
let downloadWait: AbortController | null = null
const toolbarNotice = ref('')
/** 按钮悬浮提示：下载用的名称是点的一刻读表单当前值，查询之后改也不用重新查。 */
const downloadTitle = computed(() => {
  const name = downloadNameText(downloadSelection.value)
  return name ? `按「${name}」生成文件名；下载时读取表单当前值` : '用查询结果里的附件原名打包下载'
})
const searchTimeoutMs = ref<FileSearchTimeoutMs>(60_000)
// 原站每次都重跑整套筛选；实测20条与100条都约16秒，默认100避免重复五倍的慢查询。
const pageSize = ref(100)
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' }
]
const resultColumns = [
  { key: 'fileName', label: '附件名称', width: '15%' },
  { key: 'fileStatus', label: '处理状态', width: '6%' },
  { key: 'caseVolume', label: '我方文号', width: '10%' },
  { key: 'customerVolume', label: '客户文号', width: '10%' },
  { key: 'caseName', label: '案件名称', width: '11%' },
  { key: 'officialPostDate', label: '官方发文日', width: '8%' },
  { key: 'fileDescription', label: '文件描述', width: '10%' },
  { key: 'ctrlProc', label: '处理事项', width: '6%' },
  { key: 'applicationType', label: '申请类型', width: '5%' },
  { key: 'fileType', label: '文件类型', width: '5%' },
  { key: 'uploadTime', label: '上传时间', width: '7%' }
] as const
const querySessionId = ref('')
const sourceNotice = ref('')
const searchState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
const searchMessage = ref('')
const result = ref<FileSearchResult | null>(null)
const pageAllSelected = computed(() => {
  const items = result.value?.items ?? []
  return items.length > 0 && items.every(file => Boolean(selected.value[file.fileId]))
})
const resultsSection = ref<HTMLElement | null>(null)
const lastQuery = ref<FileSearchQuery | null>(null)
const resultTemplateName = ref('')
let generation = 0

function messageForError(code: string, message: string): string {
  if (code === 'SESSION_EXPIRED') return 'EASY 登录已失效，请在原网站重新登录后检测。'
  if (code === 'AUTH_UNKNOWN') return '无法确认当前登录状态，请重试。'
  if (code === 'REQUEST_TIMEOUT') return `原网站查询太慢，没有在 ${searchTimeoutMs.value / 60_000} 分钟内返回。可以把超时时间调长，或把我方文号、申请号写具体一点再查。`
  if (code === 'NETWORK_ERROR') return '网络异常，请检查 EASY 网站连接。'
  return message || '请求失败，请稍后重试。'
}

/** 超长条件不能悄悄丢：丢掉后查询会退化成全库，宁可这次不查。 */
function fieldsFor(query: FileSearchQuery): { fields: Record<string, string>; oversized: string[] } {
  const fields: Record<string, string> = {}
  const oversized: string[] = []
  for (const [key, value] of Object.entries(query.resolvedFields ?? {})) {
    if (!isFileSearchBusinessField(key) || typeof value !== 'string') continue
    if (value.length > fileSearchValueLimit(key)) {
      oversized.push(fieldLabel(key))
      continue
    }
    fields[key] = value
  }
  if (query.caseVolume?.trim()) fields.case_volume = query.caseVolume.trim()
  if (fields.is_close !== undefined) {
    fields.is_close = fields.is_close.trim() === '1' || fields.is_close.trim() === '否' ? '1' : ''
  }
  return { fields, oversized }
}

function reloadExtension(): void {
  const runtime = (globalThis as { chrome?: { runtime?: { reload?: () => void } } }).chrome?.runtime
  if (typeof runtime?.reload === 'function') {
    runtime.reload()
    return
  }
  searchMessage.value = '当前页面不能直接重载扩展。请到扩展管理页重新加载 PatMail。'
}

async function showResults(): Promise<void> {
  await nextTick()
  const section = resultsSection.value
  const viewport = section?.closest<HTMLElement>('.body')
  if (section && viewport) {
    viewport.scrollTop += section.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  }
}

async function executeSearch(query: FileSearchQuery, run: 'start' | 'continue' = 'start', timeoutMs?: FileSearchTimeoutMs, templateName?: string): Promise<void> {
  if (timeoutMs !== undefined) searchTimeoutMs.value = fileSearchTimeoutMs(timeoutMs)
  if (!bridge || !props.canSearch) return
  stopBulk()
  const { fields, oversized } = fieldsFor(query)
  if (oversized.length) {
    searchState.value = 'error'
    searchMessage.value = `${oversized.join('、')}太长，这次没有查询：条件被丢掉会退化成全库查询。把编号列表拆短一点再查。`
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
  const resolvedEnough = assessQueryScope(fields).sufficient
  if (!resolvedEnough && ![query.caseVolume, query.applicationNo, query.customerName, query.fileName, query.fileDescriptionId].some(value => value?.trim())) {
    searchState.value = 'error'
    searchMessage.value = '请输入查询条件。'
    result.value = null
    lastQuery.value = null
    void showResults()
    return
  }
  const current = ++generation
  const queryTemplateName = templateName ?? (run === 'start' ? queryForm.value?.currentSearchTemplateName?.() ?? '' : resultTemplateName.value)
  const next = coerceFileSearchQuery({ ...query, resolvedFields: fields, pageIndex: query.pageIndex || 1, pageSize: query.pageSize || pageSize.value }) ?? {
    resolvedFields: fields, pageIndex: 1, pageSize: pageSize.value
  }
  lastQuery.value = next
  emit('searched', next)
  searchState.value = 'loading'
  searchMessage.value = ''
  toolbarNotice.value = ''
  result.value = null
  try {
    const continuation = run === 'continue' && querySessionId.value ? { querySessionId: querySessionId.value } : undefined
    const response = await bridge.request({ type: MessageType.SearchFiles, payload: continuation ? { query: next, continuation, timeoutMs: searchTimeoutMs.value } : { query: next, timeoutMs: searchTimeoutMs.value } })
    if (current !== generation) return
    if (response.type !== MessageType.SearchFilesResult) {
      searchState.value = 'error'
      searchMessage.value = response.type === MessageType.Error ? response.payload.message : '文件查询返回了意外结果。'
      void showResults()
      return
    }
    if (!response.payload.ok) {
      searchState.value = 'error'
      searchMessage.value = messageForError(response.payload.error.code, response.payload.error.message)
      void showResults()
      return
    }
    result.value = response.payload.data
    resultTemplateName.value = queryTemplateName
    sourceNotice.value = response.payload.data.sourceMessage ?? ''
    if (response.payload.data.sourceCode === 'QUERY_SESSION_INVALID' || response.payload.data.sourceCode === 'QUERY_LAYOUT_CHANGED') querySessionId.value = ''
    else if (response.payload.data.querySessionId) querySessionId.value = response.payload.data.querySessionId
    if (run === 'start') selected.value = {}
    searchState.value = result.value.total === 0 ? 'empty' : 'success'
    void showResults()
  } catch {
    if (current !== generation) return
    searchState.value = 'error'
    searchMessage.value = '文件查询通信失败，请重试。'
    void showResults()
  }
}

function rowNo(index: number): number {
  const page = result.value?.pageIndex ?? 1
  const size = result.value?.pageSize ?? pageSize.value
  return (page - 1) * size + index + 1
}
function cellText(file: PatentFile, key: typeof resultColumns[number]['key']): string {
  return file[key]?.trim() ?? ''
}
function togglePage(event: Event): void {
  stopBulk()
  const items = result.value?.items ?? []
  const on = (event.target as HTMLInputElement).checked
  selected.value = selectPage(selected.value, items.map(file => toSelectedFile(file, selected.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}
function refresh(): void {
  if (lastQuery.value) void executeSearch({ ...lastQuery.value }, 'continue')
}
function changePageSize(): void {
  if (!lastQuery.value || !props.canSearch || ![20, 50, 100].includes(pageSize.value)) return
  void executeSearch({ ...lastQuery.value, pageIndex: 1, pageSize: pageSize.value }, 'start', undefined, resultTemplateName.value)
}
function page(delta: number): void {
  if (!lastQuery.value || !result.value || searchState.value === 'loading') return
  const next = lastQuery.value.pageIndex + delta
  if (next < 1 || next > result.value.totalPages) return
  void executeSearch({ ...lastQuery.value, pageIndex: next }, 'continue')
}
function clearView(): void {
  stopBulk()
  generation += 1
  result.value = null
  lastQuery.value = null
  resultTemplateName.value = ''
  querySessionId.value = ''
  sourceNotice.value = ''
  toolbarNotice.value = ''
  searchState.value = 'idle'
  searchMessage.value = ''
  selected.value = {}
}

function onDownloadName(selection: FileDownloadSelection | null, problem = ''): void {
  downloadSelection.value = selection
  emit('download-name', selection, problem)
}

/** 勾选的文件按下载名称打包下载；包里文件名的申请号校验点已去掉。 */
async function downloadSelected(): Promise<void> {
  const files = Object.values(selected.value)
  if (!bridge || !files.length || downloading.value || selectingAll.value) return
  if (files.some(file => !file.fileNo?.trim())) {
    toolbarNotice.value = '有文件缺文件编号，没有打包下载。换个查询条件重新查一次再选。'
    return
  }
  let selection: FileDownloadSelection | null
  try {
    selection = queryForm.value ? queryForm.value.currentDownloadSelection() : downloadSelection.value
  } catch (error) {
    toolbarNotice.value = error instanceof DownloadNameValidationError ? error.message : '没有读到下载名称，请重新选择。'
    return
  }
  downloading.value = true
  const wait = downloadWait = new AbortController()
  toolbarNotice.value = '正在生成下载名称并打包…'
  const startedAt = Date.now()
  const progressId = newUuid()
  resetTaskCheckProgress()
  if (selection) paintTaskCheckProgress(0, files.length, startedAt, 'run', '生成下载名称')
  const runtime = globalThis.chrome?.runtime
  let namedFiles = selection ? 0 : files.length
  let packedFiles = 0
  let nativeBytes = 0
  const onProgress = (message: unknown, sender: chrome.runtime.MessageSender): void => {
    if (disposed || sender.id !== runtime?.id || !isRecord(message) || message.channel !== DOWNLOAD_PROGRESS_CHANNEL ||
      message.id !== progressId || !isDownloadProgress(message.progress)) return
    const progress = message.progress
    if (progress.phase === 'naming') namedFiles = Math.max(namedFiles, progress.done)
    if (progress.phase === 'packing') packedFiles = Math.max(packedFiles, progress.done)
    if (progress.phase === 'downloading') nativeBytes = Math.max(nativeBytes, progress.receivedBytes ?? 0)
    toolbarNotice.value = `流水下载：已命名 ${namedFiles}/${files.length}，已入包 ${packedFiles}/${files.length}；浏览器已接收 ${(nativeBytes / 1024 / 1024).toFixed(1)} MB。`
    // 流水各阶段会交错上报；彩虹条只显示名称解析，不能被入包或浏览器字节进度覆盖。
    if (selection && progress.phase === 'naming') {
      paintTaskCheckProgress(namedFiles, files.length, startedAt, namedFiles >= files.length ? 'done' : 'run', '生成下载名称')
    }
  }
  try {
    runtime?.onMessage?.addListener(onProgress)
    releaseDownloadProgress = () => {
      try { runtime?.onMessage?.removeListener(onProgress) } catch { /* 扩展已重载 */ }
    }
    // 下载名称不进查询：点下载的一刻再取一次表单当前值，查询之后改模板或固定字符都按新的来。
    const response = await bridge.request({
      type: MessageType.DownloadFiles,
      payload: {
        items: files.map(file => ({ fileId: file.fileId, fileNo: file.fileNo?.trim() ?? '', fileName: file.fileName })),
        selection,
        stripAppNoDot: stripAppNoDot.value,
        archiveName: templateArchiveName(resultTemplateName.value),
        stream: true,
        progressId
      }
    }, wait.signal)
    if (response.type !== MessageType.DownloadFilesResult) {
      toolbarNotice.value = response.type === MessageType.Error ? response.payload.message : '下载返回了意外结果。'
      return
    }
    if (!response.payload.ok) {
      toolbarNotice.value = messageForError(response.payload.error.code, response.payload.error.message)
      return
    }
    const data = response.payload.data
    toolbarNotice.value = `${data.fileName}（${data.fileCount} 个文件${stripAppNoDot.value ? '，文件名里申请号已去掉校验点' : ''}）。${data.notice}`
  } catch {
    toolbarNotice.value = '下载通信失败，请重试。'
  } finally {
    releaseDownloadProgress?.()
    releaseDownloadProgress = null
    if (downloadWait === wait) downloadWait = null
    downloading.value = false
    if (!disposed && selection && namedFiles < files.length) {
      paintTaskCheckProgress(namedFiles, files.length, startedAt, 'fail', '生成下载名称')
    }
  }
}

/** 全选本页 / 取消全选本页：只动当前页的行，其他页已选的不受影响。 */
function selectCurrentPage(on: boolean): void {
  stopBulk()
  const items = result.value?.items ?? []
  if (!items.length) return
  selected.value = selectPage(selected.value, items.map(file => toSelectedFile(file, selected.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}
function clearSelection(): void {
  stopBulk()
  selected.value = {}
}
function toggleFile(file: PatentFile): void {
  stopBulk()
  selected.value = toggleSelected(selected.value, toSelectedFile(file, selected.value[file.fileId]?.customerProfileId, querySessionId.value))
}

/** 全选所有进行中把「预计几点完成」也写在按钮旁，翻页快时彩虹条一闪而过也看得到。 */
const pagingHint = computed(() => selectingAll.value
  ? (taskCheckProgress.eta ? `（全选所有进行中，预计 ${taskCheckProgress.eta} 完成）` : '（全选所有进行中…）')
  : '')

/** 全选所有翻页的进度：彩虹条动词换成「翻页」。并发拉页时哪页先回不一定，按读回的页数计。 */
const paging = { startedAt: 0, total: 0, done: 0 }

function paintPaging(status: 'run' | 'done' | 'fail'): void {
  paintTaskCheckProgress(paging.done, paging.total, paging.startedAt, status, '翻页')
}

function tickPage(): void {
  paging.done += 1
  paintPaging(paging.done >= paging.total ? 'done' : 'run')
}

function describeMissed(pages: number[]): string {
  return `第 ${pages.slice(0, 8).join('、')}${pages.length > 8 ? ' 等' : ''} 页`
}

const BULK_PAGE_SIZE = 100
interface BulkRead {
  generation: number
  query: FileSearchQuery
  querySessionId: string
  totalPages: number
  timeoutMs: number
  controller: AbortController
  interrupted: boolean
  reason: string
  completed: Set<number>
  selection: Record<string, SelectedPatentFile>
}
let activeBulk: BulkRead | null = null
let retryBulk: BulkRead | null = null
function bulkCurrent(bulk: BulkRead): boolean {
  return activeBulk === bulk && bulk.generation === generation && !bulk.controller.signal.aborted
}
function stopBulk(): void {
  activeBulk?.controller.abort()
  activeBulk = null
  retryBulk = null
  selectingAll.value = false
  failedPages.value = []
  if (taskCheckProgress.label === '翻页') resetTaskCheckProgress()
}

/** 批次固定查询条件、来源和布局；不读取后续手工查询改变的响应式值。 */
async function readBulkPage(bulk: BulkRead, page: number, fresh = false): Promise<{ ok: true; data: FileSearchResult } | { ok: false; session: boolean }> {
  if (!bridge || !bulkCurrent(bulk)) return { ok: false, session: true }
  try {
    const response = await bridge.request({
      type: MessageType.SearchFiles,
      payload: {
        query: { ...bulk.query, pageIndex: page, pageSize: BULK_PAGE_SIZE },
        ...(!fresh && bulk.querySessionId ? { continuation: { querySessionId: bulk.querySessionId } } : {}),
        timeoutMs: bulk.timeoutMs,
        // 创建来源的第一页走普通取消槽；后续已绑定来源的页才免取消并发。
        // 否则晚到的旧首包仍会在后台创建新来源，使用户刚发起的同布局查询失效。
        ...(fresh ? {} : { batch: true as const })
      }
    })
    if (!bulkCurrent(bulk)) return { ok: false, session: true }
    if (response.type === MessageType.SearchFilesResult && response.payload.ok) {
      const data = response.payload.data
      if (data.sourceCode === 'QUERY_SESSION_INVALID' || data.sourceCode === 'QUERY_LAYOUT_CHANGED'
        || data.pageSize !== BULK_PAGE_SIZE || data.pageIndex !== page
        || (!fresh && data.querySessionId && data.querySessionId !== bulk.querySessionId)) {
        bulk.interrupted = true
        bulk.reason = '查询运行或分页布局已变化，请重新查询后再全选。'
        return { ok: false, session: true }
      }
      return { ok: true, data }
    }
    const message = response.type === MessageType.SearchFilesResult && !response.payload.ok
      ? messageForError(response.payload.error.code, response.payload.error.message)
      : response.type === MessageType.Error ? response.payload.message : '这一页没有返回结果。'
    const session = /登录|会话已变化|尚未确认|尚未连接|标签页已失效/.test(message)
    if (session) { bulk.interrupted = true; bulk.reason = message }
    return { ok: false, session }
  } catch {
    return { ok: false, session: false }
  }
}

function collectPages(bulk: BulkRead, pages: number[]): Promise<number[]> {
  return runPagedFetch(pages, async page => {
    const result = await readBulkPage(bulk, page)
    return result.ok
      ? { ok: true, rows: result.data.items.map(file => toSelectedFile(file, undefined, bulk.querySessionId)) }
      : result
  }, {
    signal: bulk.controller.signal,
    // 边拉边勾上，已选数字跟着涨；selectPage 会保留已经绑好的客户。
    onPage: (page, rows) => {
      if (!bulkCurrent(bulk)) return
      // defineModel 的受控 prop 要等父组件渲染后才回流；同一轮并发响应不能各自基于旧 prop 覆盖。
      bulk.selection = selectPage({ ...bulk.selection, ...selected.value }, rows, true)
      selected.value = bulk.selection
      bulk.completed.add(page)
      tickPage()
    }
  })
}

/** 全选所有：并发把每一页的行拉回来勾上（6 路把请求打满），翻页时顶栏有进度条；下载数量不设上限。
 * 有漏的自动兜一轮，再不行留按钮补。 */
const selectingAll = ref(false)
const failedPages = ref<number[]>([])
async function selectAllPages(): Promise<void> {
  const summary = result.value
  if (!bridge || !lastQuery.value || !summary || selectingAll.value || downloading.value) return
  const bulk: BulkRead = {
    generation, query: { ...lastQuery.value, ...(lastQuery.value.resolvedFields ? { resolvedFields: { ...lastQuery.value.resolvedFields } } : {}), pageSize: BULK_PAGE_SIZE },
    querySessionId: summary.pageSize === BULK_PAGE_SIZE ? querySessionId.value : '',
    totalPages: Math.max(1, Math.ceil(summary.total / BULK_PAGE_SIZE)), timeoutMs: searchTimeoutMs.value,
    controller: new AbortController(), interrupted: false, reason: '', completed: new Set(), selection: { ...selected.value }
  }
  activeBulk = bulk
  retryBulk = null
  selectingAll.value = true
  failedPages.value = []
  toolbarNotice.value = ''
  try {
    paging.startedAt = Date.now()
    paging.total = bulk.totalPages
    paging.done = 0
    paintPaging('run')
    let first = summary
    if (summary.pageSize !== BULK_PAGE_SIZE || !bulk.querySessionId) {
      const loaded = await readBulkPage(bulk, 1, true)
      if (!bulkCurrent(bulk)) return
      if (!loaded.ok) {
        toolbarNotice.value = bulk.reason || '没有读到100条分页的第一页，请重试全选。'
        paintPaging('fail')
        return
      }
      first = loaded.data
      bulk.querySessionId = first.querySessionId ?? ''
      if (!bulk.querySessionId) {
        toolbarNotice.value = '没有确认这次全选的查询来源，请重新查询。'
        paintPaging('fail')
        return
      }
      bulk.totalPages = Math.max(1, first.totalPages)
      paging.total = bulk.totalPages
      // 采用新布局，后续手工翻页也沿用同一查询来源，不能把20条来源混进100条布局。
      result.value = first
      pageSize.value = BULK_PAGE_SIZE
      lastQuery.value = { ...bulk.query, pageIndex: 1 }
      querySessionId.value = bulk.querySessionId
    }
    bulk.selection = selectPage(bulk.selection, first.items.map(file => toSelectedFile(file, undefined, bulk.querySessionId)), true)
    selected.value = bulk.selection
    bulk.completed.add(first.pageIndex)
    tickPage()
    const all = Array.from({ length: bulk.totalPages }, (_, index) => index + 1).filter(page => !bulk.completed.has(page))
    let missed = await collectPages(bulk, all)
    if (!bulkCurrent(bulk)) return
    if (missed.length && !bulk.interrupted) missed = await collectPages(bulk, missed)
    if (!bulkCurrent(bulk)) return
    failedPages.value = missed
    retryBulk = missed.length ? bulk : null
    paintPaging(missed.length ? 'fail' : 'done')
    toolbarNotice.value = bulk.interrupted ? `${bulk.reason} 还有 ${missed.length} 页未读完。` : missed.length
      ? `全选所有有 ${missed.length} 页没读到（${describeMissed(missed)}）。已勾上的不受影响，点「重试没读到的页」补齐。`
      : `已全选 ${Object.keys(bulk.selection).length} 个文件。`
  } catch {
    if (!bulkCurrent(bulk)) return
    paintPaging('fail')
    toolbarNotice.value = '翻页取行失败，没有全选。'
  } finally {
    if (activeBulk === bulk) selectingAll.value = false
  }
}

/** 容灾补齐：只重拉没读到的页，已勾上的不动。 */
async function retryFailedPages(): Promise<void> {
  const bulk = retryBulk
  const pages = failedPages.value
  if (!bridge || !bulk || !bulkCurrent(bulk) || selectingAll.value || downloading.value || !pages.length) return
  bulk.interrupted = false
  bulk.reason = ''
  selectingAll.value = true
  try {
    // 重试这一轮自己的页数和起点，不然接在上一轮 100% 后面就再也算不出预计完成时间。
    paging.startedAt = Date.now()
    paging.total = pages.length
    paging.done = 0
    paintPaging('run')
    let missed = await collectPages(bulk, pages)
    if (!bulkCurrent(bulk)) return
    if (missed.length && !bulk.interrupted) missed = await collectPages(bulk, missed)
    if (!bulkCurrent(bulk)) return
    failedPages.value = missed
    retryBulk = missed.length ? bulk : null
    paintPaging(missed.length ? 'fail' : 'done')
    toolbarNotice.value = missed.length
      ? `还有 ${missed.length} 页没读到（${describeMissed(missed)}）。已勾上的不受影响，可以再试。`
      : '没读到的页都补齐了。'
  } catch {
    if (!bulkCurrent(bulk)) return
    paintPaging('fail')
    toolbarNotice.value = '翻页取行失败。'
  } finally {
    if (activeBulk === bulk) selectingAll.value = false
  }
}

watch(() => props.epoch, () => { clearView() })
watch(() => props.seedToken, () => {
  if (!props.seedToken || !props.seed) return
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(props.seed)) {
    const text = value.trim()
    if (!text || text.length > fileSearchValueLimit(key)) continue
    if (key === 'is_close') {
      if (text === '1' || text === '否') fields.is_close = '1'
      continue
    }
    fields[key] = text
  }
  void executeSearch({ resolvedFields: fields, pageIndex: 1, pageSize: pageSize.value }, 'start', searchTimeoutMs.value)
})

onBeforeUnmount(() => {
  disposed = true
  downloadWait?.abort()
  downloadWait = null
  releaseDownloadProgress?.()
  releaseDownloadProgress = null
  stopBulk()
  generation += 1
  if (bridge) void bridge.request({ type: MessageType.CancelFileSearch })
})
</script>

<template>
  <div class="file-search-query">
    <p class="hint">结案默认包含在结果里。更多案件条件里的「是否包含结案」选「否」，结案文件才不会出现。不要把那种空结果当成库里没有。</p>
    <QueryTemplateSection
      ref="queryForm"
      :bridge="bridge"
      :can-search="canSearch"
      :user-id="userId"
      :origin="origin"
      mode="history"
      :manage="false"
      :page-size="pageSize"
      :seed="seed"
      :seed-token="seedToken"
      @search="(query, timeoutMs) => executeSearch(query, 'start', timeoutMs)"
      @download-name="onDownloadName"
    />
    <slot />
    <section ref="resultsSection" class="card file-results" aria-label="查询结果">
      <div class="section-heading">
        <strong>查询结果</strong>
        <label class="page-size">每页数量
          <ThemeSelect v-model="pageSize" :disabled="!canSearch || searchState === 'loading'" :options="pageSizeOptions" @change="changePageSize" />
        </label>
        <button type="button" class="text-button" :disabled="!canSearch || !lastQuery || searchState === 'loading'" @click="refresh">刷新</button>
      </div>
      <div v-if="result" class="result-toolbar">
        <span>共 {{ result.total }} 个文件</span>
      </div>
      <p v-if="searchState === 'idle'" class="hint">输入条件后查询文件。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在查询…</p>
      <p v-else-if="searchState === 'error'" class="error" role="alert">{{ searchMessage }}</p>
      <button v-if="searchState === 'error' && searchMessage.includes('没有接住')" type="button" class="solid tiny" @click="reloadExtension">重新加载扩展</button>
      <p v-else-if="searchState === 'empty'" class="hint" role="status">没有符合条件的文件。结案仍会查到；若把「是否包含结案」选成了「否」，结案文件不会出现。</p>
      <template v-else-if="result">
        <p v-if="sourceNotice" class="hint" role="status">{{ sourceNotice }}</p>
        <div v-if="selectable" class="result-toolbar">
          <button type="button" class="ghost" :disabled="!result || searchState === 'loading'" @click="selectCurrentPage(true)">全选本页</button>
          <button type="button" class="ghost" :disabled="!result || Object.keys(selected).length === 0" @click="selectCurrentPage(false)">取消全选本页</button>
          <button type="button" class="ghost" :disabled="!result || selectingAll || downloading" @click="selectAllPages">{{ selectingAll ? '正在全选…' : '全选所有' }}</button>
          <button type="button" class="ghost" :disabled="Object.keys(selected).length === 0" @click="clearSelection">取消全选所有</button>
          <button v-if="failedPages.length" type="button" class="ghost" :disabled="selectingAll || downloading" @click="retryFailedPages">重试没读到的 {{ failedPages.length }} 页</button>
          <span class="hint">已选 {{ Object.keys(selected).length }} 个文件{{ pagingHint }}</span>
          <label class="download-opt" title="勾上后文件名里的申请号去掉校验点：202610026334.9 变 2026100263349，扩展名不动"><input v-model="stripAppNoDot" type="checkbox" />申请号去点</label>
          <button type="button" class="solid tiny" :disabled="Object.keys(selected).length === 0 || downloading || selectingAll" :title="downloadTitle" @click="downloadSelected">{{ downloading ? '正在打包下载…' : '下载已选' }}</button>
        </div>
        <p v-if="toolbarNotice" class="hint" role="status">{{ toolbarNotice }}</p>
        <div class="table-scroll">
          <table class="grid">
            <colgroup>
              <col v-if="selectable" class="check" />
              <col class="seq" />
              <col v-for="column in resultColumns" :key="column.key" :style="{ width: column.width }" />
            </colgroup>
            <thead>
              <tr>
                <th v-if="selectable" class="check">
                  <input type="checkbox" aria-label="当前页全选" :checked="pageAllSelected" @change="togglePage" />
                </th>
                <th class="seq">序号</th>
                <th v-for="column in resultColumns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(file, index) in result.items" :key="file.fileId" :class="{ 'is-selected': Boolean(selected[file.fileId]) }">
                <td v-if="selectable" class="check">
                  <input type="checkbox" :aria-label="file.fileName" :checked="Boolean(selected[file.fileId])" @change="toggleFile(file)" />
                </td>
                <td class="seq">{{ rowNo(index) }}</td>
                <td v-for="column in resultColumns" :key="column.key">
                  <span class="clip" v-hint.clip="cellText(file, column.key)">{{ cellText(file, column.key) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="文件分页">
          <button type="button" :disabled="result.pageIndex <= 1" @click="page(-1)">上一页</button>
          <span>第 {{ result.pageIndex }} / {{ result.totalPages }} 页</span>
          <button type="button" :disabled="result.pageIndex >= result.totalPages" @click="page(1)">下一页</button>
        </nav>
      </template>
    </section>
  </div>
</template>
