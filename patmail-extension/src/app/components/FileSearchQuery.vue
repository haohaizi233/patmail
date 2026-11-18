<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, reactive, watch, computed } from 'vue'
import type { FileSearchQuery } from '../../api/file-search-params'
import { fileSearchTimeoutMs, type FileSearchTimeoutMs } from '../../api/file-search-params'
import { assessQueryScope, fileSearchValueLimit, isFileSearchBusinessField } from '../../api/file-search-params'
import { coerceFileSearchQuery } from '../../api/message-guards'
import type { FileSearchResult, PatentFile } from '../../api/file-search-types'
import { isBillPatentFile, selectPage, toSelectedFile, type SelectedPatentFile } from '../../mail'
import { caseScope, deduplicateNamedFiles, newestFirstSelected } from '../../mail/deduplicate'
import { createDownloadNamePreview, type DownloadNamePreviewState } from '../services/download-name-preview'
import { createFileSearchPageCache } from '../services/file-search-page-cache'
import { fieldLabel } from '../../query/field-registry'
import { paintTaskCheckProgress, resetTaskCheckProgress, taskCheckProgress, taskCheckSnapshot } from '../check-progress'
import { runPagedFetch } from '../page-pool'
import QueryTemplateSection from '../../floating/QueryTemplateSection.vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { downloadFilesRequestIssue, MessageType, type MessageBridge } from '../../shared/message'
import { DownloadNameValidationError, type FileDownloadSelection } from '../../mail/download-name'
import { downloadNameText } from '../../mail/download-name'
import { DOWNLOAD_PROGRESS_CHANNEL, isDownloadProgress } from '../../shared/download-progress'
import { newUuid } from '../../utils/uuid'
import { templateArchiveName } from '../../api/file-download'
import { isRecord } from '../../shared/guards'
import { recallRecovery, rememberRecovery } from '../../recovery/wal-ledger'
import { fileQueryOwner, fileQueryScope, restoredFileQuery, type FileQuerySnapshot, type FileQueryTask } from '../../recovery/file-query'
import { chooseBrowserDownloadTarget, releaseBrowserDownloadTarget } from '../../browser-download/target'

const props = withDefaults(defineProps<{
  userId: string
  origin: string
  canSearch: boolean
  seed?: Record<string, string> | null
  seedToken?: number
  selectable?: boolean
  showMailActions?: boolean
  epoch?: number
  recoverySurface?: string
}>(), { seed: null, seedToken: 0, selectable: false, showMailActions: true, epoch: 0, recoverySurface: 'file-query' })

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
const candidateSelection = ref<Record<string, SelectedPatentFile>>({ ...selected.value })
const namePreview = ref<DownloadNamePreviewState>({ names: {}, done: 0, total: 0, pending: false, error: '' })
const stripAppNoDot = ref(true)
const deduplicate = ref(true)
const downloading = ref(false)
const choosingTarget = ref(false)
let downloadAttempt = 0
let disposed = false
let releaseDownloadProgress: (() => void) | null = null
let downloadWait: AbortController | null = null
const toolbarNotice = ref('')
const downloadConnectionRecovered = ref(false)
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
const pageCache = createFileSearchPageCache()
const pageAllSelected = computed(() => {
  const items = result.value?.items ?? []
  const candidates = filterSelection(selectPage(candidateSelection.value, items.map(file => toSelectedFile(file)), true))
  const eligible = items.filter(file => candidates[file.fileId])
  return eligible.length > 0 && eligible.every(file => Boolean(selected.value[file.fileId]))
})
function filterSelection(files: Record<string, SelectedPatentFile>): Record<string, SelectedPatentFile> {
  const names = downloadSelection.value ? namePreview.value.names : Object.fromEntries(Object.values(files).map(file => [file.fileId, file.fileName]))
  return deduplicate.value ? deduplicateNamedFiles(files, names, stripAppNoDot.value) : files
}
function updateWinners(): void { selected.value = filterSelection(candidateSelection.value) }
const preview = bridge ? createDownloadNamePreview(bridge, state => { namePreview.value = state; updateWinners() }) : null
// Parent actions can update bindings or replace the selected records.
watch(selected, value => {
  const winners = filterSelection(candidateSelection.value)
  if (JSON.stringify(value) === JSON.stringify(winners)) return
  if (!Object.keys(value).length) { candidateSelection.value = {}; return }
  const next = { ...candidateSelection.value }
  for (const id of Object.keys(winners)) if (!value[id]) delete next[id]
  candidateSelection.value = { ...next, ...value }
}, { deep: true })
function changeDeduplicate(): void {
  updateWinners()
  scheduleSurface()
}
const resultsSection = ref<HTMLElement | null>(null)
const lastQuery = ref<FileSearchQuery | null>(null)
const resultTemplateName = ref('')
let generation = 0
let searchGeneration = 0

const recoveryNotice = ref('')
const needsRevalidation = ref(false)
function refreshNamePreview(): void {
  preview?.refresh(Object.keys(candidateSelection.value), downloadSelection.value, deduplicate.value && !downloading.value && !needsRevalidation.value && props.canSearch)
  updateWinners()
}
watch([candidateSelection, downloadSelection, stripAppNoDot, deduplicate, downloading, needsRevalidation, () => props.canSearch], refreshNamePreview, { deep: true, flush: 'sync' })
watch(querySessionId, () => { pageCache.clear(); preview?.clear(); refreshNamePreview() }, { flush: 'sync' })
const activeTask = ref<FileQueryTask | null>(null)
const pauseConfirmation = ref<{ taskId: string; pending: boolean; problem: string } | null>(null)
const pauseBlocked = computed(() => Boolean(pauseConfirmation.value?.taskId === activeTask.value?.id &&
  (pauseConfirmation.value?.pending || pauseConfirmation.value?.problem)))
// 暂停文案仍写入恢复账本，底部只保留需要处理的提示；常规进度统一由顶栏显示。
const actionNotice = computed(() => {
  if (downloading.value) return ''
  const notice = (toolbarNotice.value || activeTask.value?.notice || '').split(/\s+\|\s+(?:Error|DOMException):/)[0] ?? ''
  if (activeTask.value?.status === 'paused' && !pauseBlocked.value) {
    const recovery = !props.canSearch ? '请先恢复 EASY 连接。'
      : needsRevalidation.value ? '请先点击结果区的“刷新”验证查询，再继续下载。'
        : '请点击“继续下载”确认并恢复任务。'
    // 仅兼容旧的纯受理超时；流任务已返回的初始化/写入/检查点错误必须保留阶段。
    if (/^扩展后台没有在时限内返回。\s*(?:缓存已保留，请继续下载。)?$/.test(notice)) {
      return `上次下载的后台回执尚未确认，任务已保留。${recovery}`
    }
    if (props.canSearch && downloadConnectionRecovered.value && /登录|会话|尚未连接|尚未确认.*(?:账号|身份|用户)|无法确认.*身份/.test(notice)) {
      return `EASY 已连接，上次下载尚未完成，任务已保留。${recovery}`
    }
  }
  return notice === '下载已暂停，浏览器缓存已保留。可以继续下载。' || notice === '正在确认暂停，浏览器缓存会保留。' ? '' : notice
})
const exportProgress = ref({ named: 0, packed: 0, failed: 0, deduplicated: 0, bytes: 0, totalBytes: 0, startedAt: 0 })
const exportPercent = computed(() => {
  const task = activeTask.value
  if (!task) return 0
  if (task.status === 'done') return 100
  return Math.min(99, Math.round((exportProgress.value.packed + exportProgress.value.failed + exportProgress.value.deduplicated) / task.items.length * 1000) / 10)
})
const exportEta = computed(() => {
  const task = activeTask.value
  const progress = exportProgress.value
  return task?.status === 'running' && progress.startedAt
    ? taskCheckSnapshot(progress.packed + progress.failed + progress.deduplicated, task.items.length, progress.startedAt, Date.now(), 'run').eta : ''
})
const exportStatus = computed(() => pauseConfirmation.value?.taskId === activeTask.value?.id && pauseConfirmation.value?.pending ? '正在暂停下载…'
  : activeTask.value?.status === 'done' ? '导出完成'
  : activeTask.value?.status === 'paused' ? '下载已暂停'
  : exportProgress.value.packed + exportProgress.value.failed + exportProgress.value.deduplicated >= (activeTask.value?.items.length ?? Infinity) ? '正在保存压缩包…'
    : exportProgress.value.named < (activeTask.value?.items.length ?? Infinity) ? '正在取名、入包…' : '正在入包…')
function downloadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
watch([exportProgress, () => activeTask.value?.status, () => pauseConfirmation.value?.pending], () => {
  const task = activeTask.value
  const progress = exportProgress.value
  if (!task || !progress.startedAt || !props.canSearch || disposed) return
  const total = task.items.length
  const named = task.status === 'done' ? total : progress.named
  const download = task.status === 'done' ? `已保存${progress.bytes ? `（${downloadBytes(progress.bytes)}）` : ''}`
    : progress.totalBytes ? `${downloadBytes(progress.bytes)} / ${downloadBytes(progress.totalBytes)}（${Math.min(100, Math.round(progress.bytes / progress.totalBytes * 1000) / 10)}%）`
      : progress.bytes ? `已接收 ${downloadBytes(progress.bytes)}（总大小待确认）` : '等待接收'
  // 两行分工跟着流程走：第一行是阶段加「预计几点完成入包」，第二行只排「取名 / 入包 / 浏览器下载」的分步计数，
  // 每步按发生先后出现一次，不再把预计塞在下载字节后面导致截断。
  const summary = `${exportStatus.value}${exportEta.value ? ` · 预计 ${exportEta.value} 完成入包处理` : ''}`
  const detail = `${task.selection ? `取名 ${named}/${total}` : '取名 使用附件原名'} · 入包 ${progress.packed}/${total}${progress.failed ? ` · 跳过 ${progress.failed}` : ''}${progress.deduplicated ? ` · 同名去重 ${progress.deduplicated}` : ''} · 浏览器下载 ${download}`
  paintTaskCheckProgress(task.status === 'done' ? total : progress.packed + progress.failed + progress.deduplicated, total, progress.startedAt,
    task.status === 'done' ? 'done' : task.status === 'paused' ? 'hold' : 'run', '下载文件', Date.now(), detail, summary)
  // 入包结束还需等待浏览器确认保存，顶部彩虹条不能提前到100%。
  taskCheckProgress.percent = exportPercent.value
}, { flush: 'sync' })
const readPages = ref<number[]>([])
let recoveryReady = false
let recoveryGeneration = 0
let recoveryTimer: ReturnType<typeof setTimeout> | undefined
let snapshotScope = ''
let snapshotOwner: [string, string, string] | null = null
const snapshotIdentity = computed(() => props.userId && props.origin ? fileQueryScope(props.origin, props.userId, props.recoverySurface) : '')
function surfaceSnapshot(): FileQuerySnapshot | null {
  if (!snapshotOwner) return null
  return JSON.parse(JSON.stringify({
    version: 1, owner: snapshotOwner, query: lastQuery.value, result: result.value, selected: selected.value, candidateSelection: candidateSelection.value,
    form: queryForm.value?.recoveryState?.() ?? null, downloadSelection: downloadSelection.value,
    stripAppNoDot: stripAppNoDot.value, deduplicate: deduplicate.value, pageSize: pageSize.value, templateName: resultTemplateName.value,
    readPages: readPages.value, activeTask: activeTask.value
  }))
}
async function protectSurface(): Promise<void> {
  if (!recoveryReady || !snapshotScope) throw new Error('恢复账本尚未就绪，当前工作尚未保护。')
  const snapshot = surfaceSnapshot()
  if (!snapshot) throw new Error('尚未确认工作面所属账号。')
  try {
    await rememberRecovery('file-query', snapshotScope, snapshot)
    recoveryNotice.value = ''
  } catch (error) {
    recoveryNotice.value = error instanceof Error ? error.message : '工作面未保护，请保留本页并重试。'
    throw error
  }
}
function scheduleSurface(): void {
  if (!recoveryReady) return
  if (recoveryTimer) clearTimeout(recoveryTimer)
  recoveryTimer = setTimeout(() => { void protectSurface().catch(() => {}) }, 150)
}
watch([selected, candidateSelection], () => { if (recoveryReady) void protectSurface().catch(() => {}) }, { deep: true })
watch([stripAppNoDot, downloadSelection], scheduleSurface, { deep: true })
async function confirmDownloadPause(): Promise<void> {
  const task = activeTask.value
  if (!task || !bridge) return
  const confirmation = reactive({ taskId: task.id, pending: true, problem: '' })
  pauseConfirmation.value = confirmation
  try {
    const response = await bridge.request({ type: MessageType.PauseDownload, payload: { taskId: task.id, ...(task.backend ? { backend: task.backend } : {}) } })
    if (response.type !== MessageType.PauseDownloadResult || !response.payload.ok) {
      throw new Error(response.type === MessageType.Error ? response.payload.message : '后台没有确认暂停。')
    }
    if (activeTask.value?.id !== task.id || pauseConfirmation.value !== confirmation) return
    toolbarNotice.value = '下载已暂停，浏览器缓存已保留。可以继续下载。'
  } catch (error) {
    if (activeTask.value?.id !== task.id || pauseConfirmation.value !== confirmation) return
    confirmation.problem = error instanceof Error ? error.message : '后台没有确认暂停。'
    toolbarNotice.value = `${confirmation.problem} 请重新确认暂停，确认后可继续下载；缓存已保留。`
  } finally {
    confirmation.pending = false
    if (activeTask.value?.id === task.id && pauseConfirmation.value === confirmation) {
      task.notice = toolbarNotice.value
      void protectSurface().catch(() => {})
    }
  }
}
function pauseActiveDownload(): void {
  const task = activeTask.value
  if (!task || task.status !== 'running') return
  task.status = 'paused'
  void protectSurface().catch(() => {})
  void confirmDownloadPause()
}
function pauseDownload(): void {
  pauseActiveDownload()
  downloadAttempt++
  downloadWait?.abort()
  releaseDownloadProgress?.(); releaseDownloadProgress = null
  downloading.value = false
  toolbarNotice.value = '正在确认暂停，浏览器缓存会保留。'
  if (activeTask.value) activeTask.value.notice = toolbarNotice.value
  void protectSurface().catch(() => {})
}
watch(() => props.canSearch, allowed => {
  if (allowed) {
    downloadConnectionRecovered.value = activeTask.value?.status === 'paused'
    return
  }
  downloadConnectionRecovered.value = false
  stopBulk()
  generation += 1
  pauseActiveDownload()
  downloadWait?.abort()
  if (activeTask.value?.status === 'running') activeTask.value.status = 'paused'
  needsRevalidation.value = Boolean(result.value)
  if (taskCheckProgress.label === '下载文件' || taskCheckProgress.label === '翻页') resetTaskCheckProgress()
  scheduleSurface()
})
defineExpose({ protectSurface })

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

function queryNeedsRevalidation(data: FileSearchResult): boolean {
  return ['QUERY_SESSION_INVALID', 'QUERY_LAYOUT_CHANGED', 'QUERY_SESSION_REVALIDATION_REQUIRED'].includes(data.sourceCode ?? '')
}

async function executeSearch(query: FileSearchQuery, run: 'start' | 'continue' = 'start', timeoutMs?: FileSearchTimeoutMs, templateName?: string): Promise<void> {
  if (timeoutMs !== undefined) searchTimeoutMs.value = fileSearchTimeoutMs(timeoutMs)
  if (!bridge || !props.canSearch) return
  searchGeneration += 1
  stopBulk()
  const preserveRecoveredSelection = needsRevalidation.value && run === 'continue'
  if (needsRevalidation.value) { querySessionId.value = ''; run = 'start' }
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
  if (run === 'start') { pageCache.clear(); preview?.clear() }
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
    // 与全选遍历共用查询来源；同一查询的翻页及刷新保留在途取名请求。
    const response = await bridge.request({ type: MessageType.SearchFiles, payload: {
      query: next, timeoutMs: searchTimeoutMs.value,
      ...(continuation ? { continuation, batch: true } : {})
    } })
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
    const revalidate = queryNeedsRevalidation(response.payload.data)
    if (revalidate) { querySessionId.value = ''; pageCache.clear() }
    else if (response.payload.data.querySessionId) querySessionId.value = response.payload.data.querySessionId
    if (!revalidate) pageCache.set(response.payload.data)
    if (run === 'start' && !preserveRecoveredSelection) candidateSelection.value = {}
    needsRevalidation.value = revalidate
    readPages.value = [...new Set([...readPages.value, result.value.pageIndex])]
    await rememberRecovery('file-query', `${snapshotScope}:page:${querySessionId.value}:${result.value.pageIndex}`, result.value).catch(error => { recoveryNotice.value = String(error) })
    await protectSurface().catch(() => {})
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
  if (needsRevalidation.value || !props.canSearch) return
  stopBulk()
  const items = result.value?.items ?? []
  const on = (event.target as HTMLInputElement).checked
  candidateSelection.value = selectPage(candidateSelection.value, items.map(file => toSelectedFile(file, candidateSelection.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}
function refresh(): void {
  if (!lastQuery.value) return
  pageCache.clear()
  void executeSearch({ ...lastQuery.value }, 'continue')
}
function changePageSize(): void {
  if (!lastQuery.value || !props.canSearch || ![20, 50, 100].includes(pageSize.value)) return
  void executeSearch({ ...lastQuery.value, pageIndex: 1, pageSize: pageSize.value }, 'start', undefined, resultTemplateName.value)
}
function page(delta: number): void {
  if (!props.canSearch || !lastQuery.value || !result.value || searchState.value === 'loading') return
  const next = lastQuery.value.pageIndex + delta
  if (next < 1 || next > result.value.totalPages) return
  const cached = !needsRevalidation.value && pageCache.get(querySessionId.value, lastQuery.value.pageSize, next)
  if (cached) {
    // 全选已读到的完整页直接供表格使用，不再占用 EASY 请求或重置下载进度。
    result.value = cached
    lastQuery.value = { ...lastQuery.value, pageIndex: next }
    sourceNotice.value = cached.sourceMessage ?? ''
    searchState.value = cached.total ? 'success' : 'empty'
    searchMessage.value = ''
    emit('searched', lastQuery.value)
    scheduleSurface()
    void showResults()
    return
  }
  void executeSearch({ ...lastQuery.value, pageIndex: next }, 'continue')
}
function clearView(): void {
  stopBulk()
  pageCache.clear()
  generation += 1
  result.value = null
  lastQuery.value = null
  resultTemplateName.value = ''
  querySessionId.value = ''
  sourceNotice.value = ''
  toolbarNotice.value = ''
  searchState.value = 'idle'
  searchMessage.value = ''
  candidateSelection.value = {}
  deduplicate.value = true
}

function onDownloadName(selection: FileDownloadSelection | null, problem = ''): void {
  downloadSelection.value = selection
  emit('download-name', selection, problem)
}

/** 勾选的文件按下载名称打包下载；包里文件名的申请号校验点已去掉。 */
async function downloadSelected(resume = false, saveAsNew = false): Promise<void> {
  const frozen = resume ? activeTask.value : null
  const files = frozen ? frozen.items : newestFirstSelected(candidateSelection.value)
  if (!bridge || !props.canSearch || needsRevalidation.value || !files.length || downloading.value || choosingTarget.value || selectingAll.value || pauseBlocked.value) return
  if (frozen && frozen.backend !== 'browser') { toolbarNotice.value = '这是旧版下载任务，不能在新模式直接继续。请保留旧版完成，或丢弃后重新下载；旧缓存不会自动迁入浏览器。'; return }
  if (!resume && activeTask.value && activeTask.value.status !== 'done') { toolbarNotice.value = '还有暂停的下载，请先继续或丢弃该任务。'; return }
  if (files.some(file => !file.fileNo?.trim())) {
    toolbarNotice.value = '有文件缺文件编号，没有打包下载。换个查询条件重新查一次再选。'
    return
  }
  let selection: FileDownloadSelection | null
  try {
    selection = frozen ? frozen.selection : queryForm.value ? queryForm.value.currentDownloadSelection() : downloadSelection.value
    if (!frozen && selection) {
      selection = { ...selection }
      if (selection.newFilename && selection.fileNameType) delete selection.templateId
    }
  } catch (error) {
    toolbarNotice.value = error instanceof DownloadNameValidationError ? error.message : '没有读到下载名称，请重新选择。'
    return
  }
  const task = reactive<FileQueryTask>(frozen ?? { backend: 'browser', id: newUuid(), items: files.map(file => ({ fileId: file.fileId, fileNo: file.fileNo?.trim() ?? '', fileName: file.fileName })), selection, deduplicate: deduplicate.value, resolvedNames: preview?.snapshot(files.map(file => file.fileId), selection) ?? {}, caseScopes: Object.fromEntries(Object.values(candidateSelection.value).map(file => [file.fileId, caseScope(file)])), stripAppNoDot: stripAppNoDot.value, archiveName: templateArchiveName(resultTemplateName.value), status: 'paused', notice: '' })
  const adoptPreviewNames = () => {
    if (!frozen) Object.assign(task.resolvedNames ??= {}, preview?.snapshot(task.items.map(file => file.fileId), selection) ?? {})
  }
  const startingScope = snapshotScope
  const issue = downloadFilesRequestIssue({ items: task.items, selection, stripAppNoDot: task.stripAppNoDot })
  if (issue) { toolbarNotice.value = issue; return }
  const startingGeneration = generation
  let browserTarget: string
  choosingTarget.value = true
  try { browserTarget = await chooseBrowserDownloadTarget(task.id, JSON.stringify([new URL(props.origin).origin, props.userId]), task.archiveName) }
  catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) toolbarNotice.value = error instanceof Error ? error.message : '浏览器下载尚未启动。'
    return
  } finally { choosingTarget.value = false }
  if (disposed || !props.canSearch || snapshotScope !== startingScope || generation !== startingGeneration) { void releaseBrowserDownloadTarget(task.id).catch(() => {}); return }
  adoptPreviewNames()
  activeTask.value = task
  try { await protectSurface() } catch { void releaseBrowserDownloadTarget(task.id).catch(() => {}); toolbarNotice.value = '下载尚未启动：工作面没有持久保存。'; return }
  if (disposed || !props.canSearch || needsRevalidation.value || snapshotScope !== startingScope ||
    generation !== startingGeneration || activeTask.value?.id !== task.id) { void releaseBrowserDownloadTarget(task.id).catch(() => {}); return }
  // 保存位置选择及恢复账本写入期间，预热仍可能完成；在交给下载器前再次接收成果。
  adoptPreviewNames()
  task.status = 'running'
  downloadConnectionRecovered.value = false
  const attempt = ++downloadAttempt
  downloading.value = true
  const wait = downloadWait = new AbortController()
  toolbarNotice.value = ''
  const startedAt = Date.now()
  resetTaskCheckProgress()
  const knownNameCount = selection ? task.items.filter(file => Boolean(task.resolvedNames?.[file.fileId])).length : files.length
  exportProgress.value = { named: knownNameCount, packed: 0, failed: 0, deduplicated: 0, bytes: 0, totalBytes: 0, startedAt }
  const progressId = newUuid()
  const runtime = globalThis.chrome?.runtime
  const removeProgress = () => { try { runtime?.onMessage?.removeListener(onProgress) } catch { /* 页面已关闭 */ } }
  let namedFiles = knownNameCount
  let processedFiles = 0
  let failedFiles = 0
  let deduplicatedFiles = 0
  let nativeBytes = 0
  let nativeTotalBytes = 0
  const onProgress = (message: unknown, sender: chrome.runtime.MessageSender): void => {
    if (disposed || wait.signal.aborted || downloadAttempt !== attempt || activeTask.value?.id !== task.id || sender.id !== runtime?.id || !isRecord(message) || message.channel !== DOWNLOAD_PROGRESS_CHANNEL ||
      message.id !== progressId || !isDownloadProgress(message.progress)) return
    const progress = message.progress
    if (progress.phase === 'naming') namedFiles = Math.max(namedFiles, progress.done)
    if (progress.phase === 'packing') {
      processedFiles = Math.max(processedFiles, progress.done)
      failedFiles = Math.max(failedFiles, progress.failed ?? 0)
      deduplicatedFiles = Math.max(deduplicatedFiles, progress.deduplicated ?? 0)
    }
    if (progress.phase === 'downloading') {
      nativeBytes = Math.max(nativeBytes, progress.receivedBytes ?? 0)
      nativeTotalBytes = Math.max(nativeTotalBytes, progress.totalBytes ?? 0)
    }
    exportProgress.value = { named: namedFiles, packed: Math.max(0, processedFiles - failedFiles - deduplicatedFiles), failed: failedFiles, deduplicated: deduplicatedFiles, bytes: nativeBytes, totalBytes: nativeTotalBytes, startedAt }
  }
  try {
    runtime?.onMessage?.addListener(onProgress)
    releaseDownloadProgress = removeProgress
    // 下载名称不进查询：点下载的一刻再取一次表单当前值，查询之后改模板或固定字符都按新的来。
    const response = await bridge.request({
      type: MessageType.DownloadFiles,
      payload: {
        items: task.items,
        ...(task.deduplicate ? { deduplicate: true as const } : {}),
        ...(task.resolvedNames ? { resolvedNames: task.resolvedNames } : {}),
        ...(task.caseScopes ? { caseScopes: task.caseScopes } : {}),
        taskId: task.id,
        browserTarget,
        ...(saveAsNew ? { saveAsNew: true as const } : {}),
        selection,
        stripAppNoDot: task.stripAppNoDot,
        archiveName: task.archiveName,
        stream: true,
        progressId
      }
    }, wait.signal)
    if (disposed || wait.signal.aborted || downloadAttempt !== attempt || activeTask.value?.id !== task.id) return
    if (response.type !== MessageType.DownloadFilesResult) {
      toolbarNotice.value = response.type === MessageType.Error ? response.payload.message : '下载返回了意外结果。'
      return
    }
    if (!response.payload.ok) {
      toolbarNotice.value = messageForError(response.payload.error.code, response.payload.error.message)
      return
    }
    task.status = 'done'
    const data = response.payload.data
    toolbarNotice.value = data.notice
  } catch (error) {
    if (disposed || downloadAttempt !== attempt || activeTask.value?.id !== task.id) return
    toolbarNotice.value = error instanceof Error ? `${error.message} 缓存已保留，请继续下载。` : '下载通信中断，缓存已保留，请继续下载。'
  } finally {
    removeProgress()
    if (releaseDownloadProgress === removeProgress) releaseDownloadProgress = null
    if (downloadAttempt !== attempt) return
    if (activeTask.value?.id !== task.id) return
    releaseDownloadProgress?.()
    releaseDownloadProgress = null
    if (downloadWait === wait) downloadWait = null
    downloading.value = false
    if (task.status !== 'done') task.status = 'paused'
    task.notice = toolbarNotice.value
    void protectSurface().catch(() => {})
  }
}

async function discardDownloadTask(): Promise<void> {
  const task = activeTask.value
  if (!bridge || !task || downloading.value || !props.canSearch || pauseBlocked.value) return
  try {
    const response = task.backend === 'browser'
      ? await bridge.request({ type: MessageType.DiscardDownload, payload: { taskId: task.id, backend: task.backend } })
      : { type: MessageType.DiscardDownloadResult, payload: { ok: true as const } }
    if (response.type !== MessageType.DiscardDownloadResult || !response.payload.ok) {
      toolbarNotice.value = response.type === MessageType.Error ? response.payload.message : '下载任务没有丢弃，请重试。'
      return
    }
    activeTask.value = null
    if (taskCheckProgress.label === '下载文件') resetTaskCheckProgress()
    await releaseBrowserDownloadTarget(task.id).catch(() => {})
    await protectSurface()
    toolbarNotice.value = ''
  } catch (error) {
    toolbarNotice.value = error instanceof Error ? error.message : '下载任务没有丢弃，请重试。'
  }
}

/** 全选本页 / 取消全选本页：只动当前页的行，其他页已选的不受影响。 */
function selectCurrentPage(on: boolean): void {
  if (needsRevalidation.value || !props.canSearch) return
  stopBulk()
  const items = result.value?.items ?? []
  if (!items.length) return
  candidateSelection.value = selectPage(candidateSelection.value, items.map(file => toSelectedFile(file, candidateSelection.value[file.fileId]?.customerProfileId, querySessionId.value)), on)
}
function clearSelection(): void {
  if (needsRevalidation.value || !props.canSearch) return
  stopBulk()
  candidateSelection.value = {}
}
function toggleFile(file: PatentFile): void {
  if (needsRevalidation.value || !props.canSearch) return
  stopBulk()
  candidateSelection.value = selectPage(candidateSelection.value, [toSelectedFile(file, candidateSelection.value[file.fileId]?.customerProfileId, querySessionId.value)], !selected.value[file.fileId])
}

/** 全选所有进行中把「预计几点完成」也写在按钮旁，翻页快时彩虹条一闪而过也看得到。 */
const selectingBillsOnly = ref(false)
const pagingHint = computed(() => selectingAll.value
  ? (taskCheckProgress.eta ? `（${selectingBillsOnly.value ? '只选所有账单' : '全选所有'}进行中，预计 ${taskCheckProgress.eta} 完成）` : `（${selectingBillsOnly.value ? '只选所有账单' : '全选所有'}进行中…）`)
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
  billsOnly?: boolean
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
  selectingBillsOnly.value = false
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
    if (!bulkCurrent(bulk) || bulk.interrupted) return { ok: false, session: true }
    if (response.type === MessageType.SearchFilesResult && response.payload.ok) {
      const data = response.payload.data
      if (queryNeedsRevalidation(data)
        || data.pageSize !== BULK_PAGE_SIZE || data.pageIndex !== page
        || (!fresh && data.querySessionId && data.querySessionId !== bulk.querySessionId)) {
        bulk.interrupted = true
        needsRevalidation.value = true
        querySessionId.value = ''
        pageCache.clear()
        bulk.reason = '查询运行或分页布局已变化，请重新查询后再全选。'
        return { ok: false, session: true }
      }
      pageCache.set(data)
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
      const targetRows = bulk.billsOnly ? rows.filter(isBillPatentFile) : rows
      const baseSelection = bulk.billsOnly ? bulk.selection : { ...bulk.selection, ...candidateSelection.value }
      bulk.selection = selectPage(baseSelection, targetRows, true)
      candidateSelection.value = bulk.selection
      bulk.completed.add(page)
      readPages.value = [...new Set([...readPages.value, page])]
      scheduleSurface()
      tickPage()
    }
  })
}

/** 全选所有 / 只选所有账单：并发把每一页的行拉回来勾上（6 路把请求打满），翻页时顶栏有进度条；下载数量不设上限。
 * 有漏的自动兜一轮，再不行留按钮补。 */
const selectingAll = ref(false)
const failedPages = ref<number[]>([])
async function selectAllPages(billsOnly = false): Promise<void> {
  if (needsRevalidation.value || !props.canSearch) return
  const summary = result.value
  if (!bridge || !lastQuery.value || !summary || selectingAll.value || downloading.value) return
  const bulk: BulkRead = {
    generation, query: { ...lastQuery.value, ...(lastQuery.value.resolvedFields ? { resolvedFields: { ...lastQuery.value.resolvedFields } } : {}), pageSize: BULK_PAGE_SIZE },
    querySessionId: summary.pageSize === BULK_PAGE_SIZE ? querySessionId.value : '',
    totalPages: Math.max(1, Math.ceil(summary.total / BULK_PAGE_SIZE)), timeoutMs: searchTimeoutMs.value,
    controller: new AbortController(), interrupted: false, reason: '', completed: new Set(),
    selection: billsOnly ? {} : { ...candidateSelection.value },
    billsOnly
  }
  activeBulk = bulk
  retryBulk = null
  selectingAll.value = true
  selectingBillsOnly.value = billsOnly
  failedPages.value = []
  toolbarNotice.value = ''
  if (billsOnly) {
    // 账单过滤模式：清除旧选择，确立最终集合的账单纯洁性
    candidateSelection.value = {}
  }
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
        toolbarNotice.value = bulk.reason || (billsOnly ? '没有读到100条分页的第一页，请重试只选账单。' : '没有读到100条分页的第一页，请重试全选。')
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
    // 新布局改变查询来源时 watcher 会清缓存，采用来源后再保留它的第一页。
    pageCache.set(first)
    const firstItems = billsOnly ? first.items.filter(isBillPatentFile) : first.items
    bulk.selection = selectPage(bulk.selection, firstItems.map(file => toSelectedFile(file, undefined, bulk.querySessionId)), true)
    candidateSelection.value = bulk.selection
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
    const actionLabel = billsOnly ? '只选账单' : '全选所有'
    toolbarNotice.value = bulk.interrupted ? `${bulk.reason} 还有 ${missed.length} 页未读完。` : missed.length
      ? `${actionLabel}有 ${missed.length} 页没读到（${describeMissed(missed)}）。已勾上的不受影响，点「重试没读到的页」补齐。`
      : billsOnly
        ? `已勾选 ${Object.keys(bulk.selection).length} 个账单文件。`
        : `已全选 ${Object.keys(bulk.selection).length} 个文件。`
  } catch {
    if (!bulkCurrent(bulk)) return
    paintPaging('fail')
    toolbarNotice.value = billsOnly ? '翻页取行失败，没有勾选账单。' : '翻页取行失败，没有全选。'
  } finally {
    if (activeBulk === bulk) {
      selectingAll.value = false
      selectingBillsOnly.value = false
    }
  }
}

/** 容灾补齐：只重拉没读到的页，已勾上的不动。 */
async function retryFailedPages(): Promise<void> {
  if (needsRevalidation.value || !props.canSearch) return
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

watch(snapshotIdentity, async scope => {
  pageCache.clear()
  preview?.clear()
  const current = ++recoveryGeneration
  releaseDownloadProgress?.()
  releaseDownloadProgress = null
  pauseActiveDownload()
  downloadWait?.abort()
  downloading.value = false
  if (taskCheckProgress.label === '下载文件') resetTaskCheckProgress()
  if (recoveryReady && snapshotScope) void protectSurface().catch(() => {})
  recoveryReady = false
  snapshotScope = scope
  snapshotOwner = scope ? fileQueryOwner(props.origin, props.userId, props.recoverySurface) : null
  if (!scope) return
  clearView()
  activeTask.value = null
  exportProgress.value = { named: 0, packed: 0, failed: 0, deduplicated: 0, bytes: 0, totalBytes: 0, startedAt: 0 }
  readPages.value = []
  try {
    const initialGeneration = searchGeneration
    const saved = await recallRecovery('file-query', scope)
    if (current !== recoveryGeneration || disposed) return
    const restored = restoredFileQuery(saved, props.origin, props.userId, props.recoverySurface)
    if (restored && searchGeneration === initialGeneration) {
      lastQuery.value = restored.query
      result.value = restored.result
      deduplicate.value = restored.deduplicate ?? true
      candidateSelection.value = restored.candidateSelection ?? restored.selected
      pageSize.value = restored.pageSize ?? 100
      resultTemplateName.value = restored.templateName ?? ''
      stripAppNoDot.value = restored.stripAppNoDot ?? true
      downloadSelection.value = restored.downloadSelection
      activeTask.value = restored.activeTask
      downloadConnectionRecovered.value = props.canSearch && restored.activeTask?.status === 'paused'
      if (restored.activeTask?.status === 'paused' && /正在确认暂停|重新确认暂停/.test(restored.activeTask.notice)) {
        pauseConfirmation.value = { taskId: restored.activeTask.id, pending: false, problem: '上次暂停尚未确认。' }
      }
      readPages.value = restored.readPages ?? []
      querySessionId.value = ''
      searchState.value = restored.result ? (restored.result.total ? 'success' : 'empty') : 'idle'
      needsRevalidation.value = true
      await nextTick()
      queryForm.value?.restoreRecoveryState?.(restored.form)
      if (restored.query) emit('searched', restored.query)
      emit('download-name', restored.downloadSelection, '')
    }
    recoveryReady = true
  } catch (error) {
    if (current === recoveryGeneration) recoveryNotice.value = error instanceof Error ? error.message : '恢复账本不可用。'
  }
}, { immediate: true })

watch(() => props.epoch, () => { stopBulk(); generation += 1 })
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
  preview?.cancel()
  if (recoveryTimer) clearTimeout(recoveryTimer)
  pauseActiveDownload()
  if (activeTask.value) void releaseBrowserDownloadTarget(activeTask.value.id).catch(() => {})
  void protectSurface().catch(() => {})
  if (taskCheckProgress.label === '下载文件' || taskCheckProgress.label === '翻页') resetTaskCheckProgress()
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
    <p v-if="recoveryNotice" class="hint" role="alert">工作面未保护：{{ recoveryNotice }}</p>
    <p v-if="needsRevalidation" class="hint" role="status">已恢复本地查询与选择，当前为只读工作面。请确认同一账号后点击刷新重新验证查询；不会自动查询或发文。</p>
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
      @recovery-change="scheduleSurface"
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
      <section v-if="selectable && (result || activeTask)" class="file-export" aria-label="文件导出">
        <div class="file-export-actions">
          <label class="download-opt" v-hint="'勾上后文件名里的申请号去掉校验点：202610026334.9 变 2026100263349，扩展名不动'"><input v-model="stripAppNoDot" type="checkbox" :disabled="Boolean(activeTask && activeTask.status !== 'done') || choosingTarget" />申请号去点</label>
          <button type="button" class="solid tiny" :disabled="Object.keys(selected).length === 0 || !canSearch || needsRevalidation || downloading || choosingTarget || selectingAll || Boolean(activeTask && activeTask.status !== 'done')" v-hint="downloadTitle" @click="downloadSelected(false)">{{ choosingTarget ? '请选择保存位置…' : downloading ? '导出中…' : '下载已选' }}</button>
          <template v-if="activeTask && activeTask.status !== 'done'">
            <button v-if="activeTask.status === 'running'" type="button" class="ghost" @click="pauseDownload">暂停下载</button>
            <button v-else type="button" class="ghost" :disabled="!canSearch || needsRevalidation || downloading || choosingTarget || selectingAll || pauseBlocked" @click="downloadSelected(true)">继续下载</button>
            <button v-if="/不支持原记录续传|原下载记录已被清除|无法读取浏览器下载记录/.test(activeTask.notice)" type="button" class="ghost" :disabled="!canSearch || needsRevalidation || downloading || choosingTarget || selectingAll" @click="downloadSelected(true, true)">从缓存另存为新文件</button>
            <button v-if="pauseConfirmation?.taskId === activeTask.id && pauseConfirmation.problem" type="button" class="ghost" :disabled="pauseConfirmation.pending || !canSearch" @click="confirmDownloadPause">重新确认暂停</button>
            <button type="button" class="ghost file-export-discard" :disabled="!canSearch || downloading || choosingTarget || pauseBlocked" @click="discardDownloadTask">丢弃下载任务</button>
          </template>
        </div>
        <p v-if="activeTask && activeTask.status !== 'done' && activeTask.items.length !== Object.keys(selected).length" class="hint">下载任务沿用启动时的 {{ activeTask.items.length }} 个附件；当前查询已选 {{ Object.keys(selected).length }} 个文件。</p>
        <p v-if="actionNotice" class="file-export-notice" role="status">{{ actionNotice }}</p>
      </section>
      <p v-if="searchState === 'idle'" class="hint">输入条件后查询文件。</p>
      <p v-else-if="searchState === 'loading'" class="hint" role="status">正在查询…</p>
      <p v-else-if="searchState === 'error'" class="error" role="alert">{{ searchMessage }}</p>
      <button v-if="searchState === 'error' && searchMessage.includes('没有接住')" type="button" class="solid tiny" @click="reloadExtension">重新加载扩展</button>
      <p v-else-if="searchState === 'empty'" class="hint" role="status">没有符合条件的文件。结案仍会查到；若把「是否包含结案」选成了「否」，结案文件不会出现。</p>
      <template v-else-if="result">
        <p v-if="sourceNotice" class="hint" role="status">{{ sourceNotice }}</p>
        <div v-if="selectable" class="result-toolbar">
          <label class="deduplicate-opt" v-hint="'同一案件内按最终下载名称合并重复版本，doc/docx 视为同类，保留上传时间最新的文件'"><input v-model="deduplicate" type="checkbox" :disabled="needsRevalidation || !canSearch || downloading || choosingTarget || selectingAll" @change="changeDeduplicate" />同名文件仅保留最新</label>
          <button type="button" class="ghost" :disabled="needsRevalidation || !canSearch || !result || searchState === 'loading'" @click="selectCurrentPage(true)">全选本页</button>
          <button type="button" class="ghost" :disabled="needsRevalidation || !canSearch || !result || Object.keys(selected).length === 0" @click="selectCurrentPage(false)">取消全选本页</button>
          <button type="button" class="ghost" :disabled="needsRevalidation || !canSearch || !result || selectingAll || downloading" @click="selectAllPages(false)">{{ selectingAll && !selectingBillsOnly ? '正在全选…' : '全选所有' }}</button>
          <button type="button" class="ghost" :disabled="needsRevalidation || !canSearch || !result || selectingAll || downloading" v-hint="'将清除当前已选的非账单文件，仅勾选本次查询范围内识别出的账单'" @click="selectAllPages(true)">{{ selectingAll && selectingBillsOnly ? '正在只选账单…' : '只选所有账单' }}</button>
          <button type="button" class="ghost" :disabled="Object.keys(selected).length === 0" @click="clearSelection">取消全选所有</button>
          <button v-if="showMailActions" type="button" class="ghost" :disabled="needsRevalidation || !canSearch || Object.keys(selected).length === 0" @click="emit('review')">查看已选</button>
          <button v-if="showMailActions" type="button" class="ghost" :disabled="needsRevalidation || !canSearch || Object.keys(selected).length === 0" @click="emit('plan')">生成发文计划</button>
          <button v-if="failedPages.length" type="button" class="ghost" :disabled="needsRevalidation || !canSearch || selectingAll || downloading" @click="retryFailedPages">重试没读到的 {{ failedPages.length }} 页</button>
          <span class="hint">已选 {{ Object.keys(selected).length }} 个文件{{ pagingHint }}</span>
        </div>
        <p v-if="selectable && deduplicate" class="hint">全选按上传时间保留最新，跨页全选需读取所有页。仅合并同一案件最终下载名称相同的文件，doc/docx 视为同类，原名中的 (2) 等字符保留。</p>
        <p v-if="selectable && deduplicate && downloadSelection && (namePreview.pending || namePreview.error)" class="hint" role="status">下载名称预览 {{ namePreview.done }}/{{ namePreview.total }}{{ namePreview.error ? `：${namePreview.error}；未确认名称的文件仍保留，下载时重试。` : '，正在按最终名称更新选择；可直接下载。' }}</p>
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
                  <input type="checkbox" aria-label="当前页全选" :disabled="needsRevalidation || !canSearch" :checked="pageAllSelected" @change="togglePage" />
                </th>
                <th class="seq">序号</th>
                <th v-for="column in resultColumns" :key="column.key">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(file, index) in result.items" :key="file.fileId" :class="{ 'is-selected': Boolean(selected[file.fileId]) }">
                <td v-if="selectable" class="check">
                  <input type="checkbox" :aria-label="file.fileName" :disabled="needsRevalidation || !canSearch" :checked="Boolean(selected[file.fileId])" @change="toggleFile(file)" />
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
          <button type="button" :disabled="result.pageIndex <= 1 || searchState === 'loading'" @click="page(-1)">上一页</button>
          <span>第 {{ result.pageIndex }} / {{ result.totalPages }} 页</span>
          <button type="button" :disabled="result.pageIndex >= result.totalPages || searchState === 'loading'" @click="page(1)">下一页</button>
        </nav>
      </template>
    </section>
  </div>
</template>

<style scoped>
.deduplicate-opt { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
.file-export {
  --export-line: color-mix(in srgb, var(--pink, #ff4f93) 24%, var(--card, #fff));
  --export-radius: 16px;
  display: grid; gap: 8px; margin: 12px 0; min-width: 0;
}
.file-export-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-export-actions .download-opt { display: inline-flex; align-items: center; gap: 5px; margin-right: auto; font-size: 12px; }
.file-export-actions button { border-radius: var(--export-radius); min-height: 34px; padding: 0 16px; font: inherit; font-size: 12px; font-weight: 700; }
.file-export-actions .ghost { border: 1px solid var(--export-line); background: var(--card, #fff); color: var(--pink, #ff4f93); }
.file-export-actions .file-export-discard { color: var(--sub, #8d97b0); }
.file-export-actions button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
.file-export-actions button:focus-visible { outline: 2px solid var(--focus, #9b3060); outline-offset: 3px; }
.file-export-actions button:not(:disabled):hover { filter: brightness(.97); }
.file-export-notice { margin: 0; color: var(--text, #243056); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 600px) { .file-export-actions .download-opt { width: 100%; } }
</style>
