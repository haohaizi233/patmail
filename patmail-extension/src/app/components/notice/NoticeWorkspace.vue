<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ThemeSelect from '../../../shell/components/ThemeSelect.vue'
import {
  hasCachedNoticeOptions,
  mergeNoticeInitData,
  peekNoticeInitCache,
  readNoticeInitCache,
  saveNoticeInitCache
} from '../../../query/notice-init-cache'
import {
  NOTICE_MAIL_STYLE_OPTIONS,
  NOTICE_TABS,
  createDefaultNoticeCertQuery,
  createDefaultNoticeDownloadQuery,
  createDefaultNoticeHandExcelQuery,
  createDefaultNoticeHandHisQuery,
  createDefaultNoticeHandQuery,
  createDefaultNoticeImportQuery,
  createDefaultNoticeNolaiutoQuery,
  createDefaultNoticeReplayQuery,
  filterNoticeRowsByKeyword,
  noticeRowKey
} from '../../../api/notice-params'
import type {
  NoticeActionRequest,
  NoticeActionResult,
  NoticeCertQuery,
  NoticeDownloadQuery,
  NoticeFileTypeNode,
  NoticeHandExcelQuery,
  NoticeHandHisQuery,
  NoticeHandQuery,
  NoticeImportQuery,
  NoticeInitData,
  NoticeNolaiutoQuery,
  NoticeOptionItem,
  NoticeReplayQuery,
  NoticeRow,
  NoticeSearchRequest,
  NoticeTabId,
  NoticeUploadProcessDetailRow,
  NoticeUploadProcessRow
} from '../../../api/notice-types'
import { MessageType, type MessageBridge } from '../../../shared/message'
import { isRecord } from '../../../shared/guards'
import {
  NOTICE_STATUS_CHANNEL,
  isNoticeTaskStatusEvent,
  type NoticeTaskStatusEvent
} from '../../../shared/notice-status'
import { newUuid } from '../../../utils/uuid'
import { useTopProgress, type TopProgress } from '../../composables/useTopProgress'
import type { TreeOption } from '../../../query/option-tree'
import { confirmDialog, infoDialog } from '../../dialog'
import NoticeActionBar from './NoticeActionBar.vue'
import NoticeDetailModal, { type NoticeDetailEditableKey } from './NoticeDetailModal.vue'
import NoticeExportModal from './NoticeExportModal.vue'
import NoticeFilterForm from './NoticeFilterForm.vue'
import NoticeResultTable from './NoticeResultTable.vue'

const props = withDefaults(defineProps<{
  bridge?: MessageBridge
  userId?: string
  isActive?: boolean
}>(), {
  bridge: undefined,
  userId: '',
  isActive: true
})

const cacheUserKey = computed(() => props.userId.trim() || '__default__')
let initRunSeq = 0

function txt(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? '是' : '否'
  return ''
}

const activeTab = ref<NoticeTabId>('import')
const initData = ref<NoticeInitData | null>(null)
const userOptions = ref<TreeOption[]>([])
const loadingInit = ref(false)
const backgroundLoading = ref(false)
const busyAction = ref('')
const statusMessage = ref('')
const statusError = ref('')
const filterFormRef = ref<InstanceType<typeof NoticeFilterForm> | null>(null)

const noticeTaskBar = reactive({
  visible: false,
  status: 'idle' as 'idle' | 'run' | 'hold' | 'done' | 'fail',
  label: '',
  stage: '',
  summary: '',
  detail: '',
  startedAt: 0,
  elapsedSec: 0
})
let noticeTickTimer: ReturnType<typeof setInterval> | null = null
let removeNoticeStatusListener: (() => void) | null = null

function stopNoticeTimer(): void {
  if (noticeTickTimer !== null) {
    clearInterval(noticeTickTimer)
    noticeTickTimer = null
  }
}

function detachNoticeStatusListener(): void {
  removeNoticeStatusListener?.()
  removeNoticeStatusListener = null
}

function dismissNoticeTaskBar(): void {
  if (noticeTaskBar.status === 'run') return
  stopNoticeTimer()
  noticeTaskBar.visible = false
}

const noticeTopProgress = computed<TopProgress>(() => ({
  visible: noticeTaskBar.visible,
  mode: 'state',
  done: 0,
  total: 0,
  percent: 0,
  eta: '',
  status: noticeTaskBar.status,
  label: noticeTaskBar.label,
  stage: noticeTaskBar.stage,
  summary: noticeTaskBar.summary,
  detail: noticeTaskBar.detail,
  elapsed: noticeTaskBar.visible ? `已用时 ${noticeTaskBar.elapsedSec}s` : '',
  onDismiss: dismissNoticeTaskBar
}))
useTopProgress(noticeTopProgress, computed(() => props.isActive !== false))

const queries = reactive<{
  import: NoticeImportQuery
  download: NoticeDownloadQuery
  cert: NoticeCertQuery
  replay: NoticeReplayQuery
  hand: NoticeHandQuery
  handHis: NoticeHandHisQuery
  nolaiuto: NoticeNolaiutoQuery
  handExcel: NoticeHandExcelQuery
}>({
  import: createDefaultNoticeImportQuery(),
  download: createDefaultNoticeDownloadQuery(),
  cert: createDefaultNoticeCertQuery(),
  replay: createDefaultNoticeReplayQuery(),
  hand: createDefaultNoticeHandQuery(),
  handHis: createDefaultNoticeHandHisQuery(),
  nolaiuto: createDefaultNoticeNolaiutoQuery(),
  handExcel: createDefaultNoticeHandExcelQuery()
})

interface TabTableState {
  rows: NoticeRow[]
  total: number
  selectedKeys: string[]
  loading: boolean
  loadingLabel: string
  loadedOnce: boolean
  errorMessage: string
  needCpcLogin?: boolean
  loginMessage?: string
}

const createTableState = (): TabTableState => ({
  rows: [],
  total: 0,
  selectedKeys: [],
  loading: false,
  loadingLabel: '',
  loadedOnce: false,
  errorMessage: ''
})

const tableStates = reactive<Record<NoticeTabId, TabTableState>>({
  import: createTableState(),
  download: createTableState(),
  cert: createTableState(),
  replay: createTableState(),
  hand: createTableState(),
  handHis: createTableState(),
  nolaiuto: createTableState(),
  handExcel: createTableState()
})

const currentState = computed(() => tableStates[activeTab.value])
const currentQuery = computed(() => queries[activeTab.value])

const displayedRows = computed(() => {
  const rows = currentState.value.rows
  if (activeTab.value === 'hand') return filterNoticeRowsByKeyword(rows, queries.hand.keyword)
  if (activeTab.value === 'handHis') return filterNoticeRowsByKeyword(rows, queries.handHis.keyword)
  if (activeTab.value === 'nolaiuto') return filterNoticeRowsByKeyword(rows, queries.nolaiuto.keyword)
  return rows
})

// Detail modal (4 页签可编辑弹窗，对齐 Notice.aspx)
const detailOpen = ref(false)
const detailRow = ref<NoticeRow | null>(null)
const detailFees = ref<Record<string, unknown>[]>([])
const detailHebo = ref<Record<string, unknown>[]>([])
const detailDuibi = ref<Record<string, unknown>[]>([])
const detailLoading = ref(false)
const detailSaving = ref(false)
const detailMessage = ref('')
const detailMessageTone = ref<'ok' | 'error'>('ok')
const detailEditable = ref(false)
const detailForm = reactive({
  oaId: '',
  importId: '',
  ctrlProc: '',
  caseId: '',
  caseVolume: '',
  chargeDept: '',
  picName: '',
  oaCode: '',
  oaDate: '',
  oaTypeId: '',
  oaTypeName: '',
  oaDesc: '',
  intDueDate: '',
  cusDueDate: '',
  legalDueDate: '',
  examiner: '',
  examinerTel: '',
  examinerDept: '',
  issueNo: '',
  issueDate: '',
  certificateNo: '',
  customerName: '',
  remark: ''
})
const caseSearchKeyword = ref('')
const caseSearchOptions = ref<NoticeOptionItem[]>([])
const caseSearching = ref(false)
const caseSearchSearched = ref(false)

// AppNo file list modal (对齐 NoHandFileList.aspx)
const appFilesOpen = ref(false)
const appFilesLoading = ref(false)
const appFilesBusy = ref(false)
const appFilesMode = ref<'hand' | 'del'>('hand')
const appFilesAppNo = ref('')
const appFilesTargetId = ref('')
const appFilesRows = ref<NoticeRow[]>([])
const detailFileTypes = ref<NoticeFileTypeNode[]>([])

const detailFileTypeTreeOptions = computed<TreeOption[]>(() => {
  const nodes = detailFileTypes.value.length > 0 ? detailFileTypes.value : (initData.value?.detailFileTypes ?? [])
  return nodes.map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
})

function alignDetailOaTypeId(rawId: string): string {
  const trimmed = rawId.trim()
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  const matched = detailFileTypeTreeOptions.value.find(opt => opt.value.toUpperCase() === upper)
  return matched ? matched.value : trimmed
}

// Export modal (IhgAdvExport)
const exportModalOpen = ref(false)
const flaggedRowKeys = ref<string[]>([])
const activeExportAccountLabel = computed(() => {
  if (activeTab.value === 'cert') return applyAccountLabel(queries.cert.account)
  if (activeTab.value === 'replay') return applyAccountLabel(queries.replay.account)
  return ''
})

// MailCustomer style modal
const mailStyleModalOpen = ref(false)
const pickedMailStyle = ref<'1' | '2' | '3'>('1')
const pendingMailOaIds = ref<string[]>([])

// MultUpload modal (上传 CPC / 国防官文多文件队列弹窗)
const MAX_UPLOAD_ZIP_BYTES = 50 * 1024 * 1024
const uploadModalOpen = ref(false)
const uploadKind = ref<'cpc' | 'gf'>('cpc')
const uploadQueue = ref<File[]>([])
const uploadDragging = ref(false)
const uploadPickerInput = ref<HTMLInputElement | null>(null)

// UploadProcess + UploadProcessDetail two-level modals
const processModalOpen = ref(false)
const processRows = ref<NoticeUploadProcessRow[]>([])
const processTotal = ref(0)
const processPageIndex = ref(1)
const processPageSize = 10
const processLoading = ref(false)
const processTotalPages = computed(() => Math.max(1, Math.ceil(processTotal.value / processPageSize)))

const UPLOAD_PROCESS_DETAIL_STATUS_OPTIONS = [
  { value: '-1', label: '---' },
  { value: '1', label: '上传成功' },
  { value: '2', label: '文件合并' },
  { value: '3', label: '上传失败' }
] as const

const processDetailModalOpen = ref(false)
const processDetailRecordId = ref('')
const processDetailZipName = ref('')
const processDetailStatus = ref<'-1' | '1' | '2' | '3'>('-1')
const processDetailRows = ref<NoticeUploadProcessDetailRow[]>([])
const processDetailTotal = ref(0)
const processDetailPageIndex = ref(1)
const processDetailPageSize = 10
const processDetailLoading = ref(false)
const processDetailTotalPages = computed(() => Math.max(1, Math.ceil(processDetailTotal.value / processDetailPageSize)))

function tabBadge(id: NoticeTabId): string {
  if (!initData.value) return ''
  if (id === 'hand' && initData.value.handCount > 0) return `(${initData.value.handCount})`
  if (id === 'nolaiuto' && initData.value.nolaiutoCount > 0) return `(${initData.value.nolaiutoCount})`
  return ''
}

function mapUsersToTree(nodes: readonly NoticeFileTypeNode[]): TreeOption[] {
  return nodes.map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
}

function createEmptyInitData(): NoticeInitData {
  return {
    applyTypes: [],
    agencies: [],
    directions: [],
    applyTags: [],
    branches: [],
    countries: [],
    fileTypes: [],
    users: [],
    cpcAccounts: [],
    defaultTzsStartDate: '2023-01-01',
    handCount: 0,
    nolaiutoCount: 0,
    warnings: []
  }
}

function applyInitDefaults(data: NoticeInitData): void {
  if (!queries.download.startTime && data.defaultTzsStartDate) {
    queries.download.startTime = data.defaultTzsStartDate
  }
  if (!queries.replay.account && data.cpcAccounts.length > 0) {
    queries.replay.account = data.cpcAccounts[0].value
  }
}

function persistNoticeCache(): void {
  if (!initData.value) return
  void saveNoticeInitCache(cacheUserKey.value, {
    initData: initData.value,
    userOptions: userOptions.value
  })
}

async function refreshCountsSilently(seq = initRunSeq): Promise<void> {
  if (!props.bridge) return
  try {
    const resp = await props.bridge.request({
      type: MessageType.NoticeAction,
      payload: { action: 'refreshCounts' }
    })
    if (seq !== initRunSeq) return
    if (
      resp.type === MessageType.NoticeActionResult &&
      resp.payload.ok &&
      resp.payload.data.counts
    ) {
      const target = initData.value ?? createEmptyInitData()
      const { handCount, nolaiutoCount } = resp.payload.data.counts
      initData.value = {
        ...target,
        handCount: typeof handCount === 'number' ? handCount : target.handCount,
        nolaiutoCount: typeof nolaiutoCount === 'number' ? nolaiutoCount : target.nolaiutoCount
      }
      persistNoticeCache()
    }
  } catch {
    // 后台静默更新计数失败时不打扰当前操作
  }
}

async function loadInit(options: { silent?: boolean } = {}): Promise<void> {
  if (!props.bridge) return
  const { silent = false } = options
  const seq = initRunSeq
  const userKey = cacheUserKey.value
  const hadCachedBefore = hasCachedNoticeOptions(initData.value) || userOptions.value.length > 0
  if (!silent) loadingInit.value = true
  try {
    const initResp = await props.bridge.request({ type: MessageType.LoadNoticeInit })
    if (seq !== initRunSeq || userKey !== cacheUserKey.value) return

    if (initResp.type === MessageType.LoadNoticeInitResult && initResp.payload.ok) {
      const merged = mergeNoticeInitData(initData.value, initResp.payload.data, {
        preserveCounts: true,
        silent: silent || hadCachedBefore
      })
      initData.value = merged
      if (merged.users.length > 0) {
        userOptions.value = mapUsersToTree(merged.users)
      }
      applyInitDefaults(merged)
      persistNoticeCache()
    } else if (!silent && !hadCachedBefore) {
      if (initResp.type === MessageType.LoadNoticeInitResult && !initResp.payload.ok) {
        statusError.value = initResp.payload.error.message
      } else if (initResp.type === MessageType.Error) {
        statusError.value = initResp.payload.message
      }
    }

    if (!silent) {
      await refreshCountsSilently(seq)
    }
  } finally {
    if (!silent) loadingInit.value = false
  }
}

async function bootstrapWorkspace(): Promise<void> {
  const seq = (initRunSeq += 1)
  const userKey = cacheUserKey.value
  const memHit = peekNoticeInitCache(userKey)
  const cached = memHit ?? (await readNoticeInitCache(userKey))
  if (seq !== initRunSeq) return

  if (cached && hasCachedNoticeOptions(cached.initData)) {
    initData.value = cached.initData
    userOptions.value = cached.initData.users.length > 0 ? mapUsersToTree(cached.initData.users) : cached.userOptions
    applyInitDefaults(cached.initData)

    await runSearch('import', false)
    if (seq !== initRunSeq) return

    backgroundLoading.value = true
    void (async () => {
      try {
        await loadInit({ silent: true })
        if (seq !== initRunSeq) return
        await refreshCountsSilently(seq)
      } finally {
        if (seq === initRunSeq) backgroundLoading.value = false
      }
    })()
    return
  }

  // 首次无缓存冷启动：先完成已错峰的轻量字典加载（约 1 秒）填满下拉并写入缓存，再拉首屏表格与慢计数。
  initData.value = null
  userOptions.value = []
  backgroundLoading.value = true
  try {
    await loadInit({ silent: true })
  } finally {
    if (seq === initRunSeq) backgroundLoading.value = false
  }
  if (seq !== initRunSeq) return
  await runSearch('import', false)
  if (seq !== initRunSeq) return
  void refreshCountsSilently(seq)
}

function buildSearchRequest(tab: NoticeTabId): NoticeSearchRequest {
  switch (tab) {
    case 'import':
      return { tab: 'import', query: { ...queries.import } }
    case 'download':
      return { tab: 'download', query: { ...queries.download } }
    case 'cert':
      return { tab: 'cert', query: { ...queries.cert } }
    case 'replay':
      return { tab: 'replay', query: { ...queries.replay } }
    case 'hand':
      return { tab: 'hand', query: { ...queries.hand } }
    case 'handHis':
      return { tab: 'handHis', query: { ...queries.handHis } }
    case 'nolaiuto':
      return { tab: 'nolaiuto', query: { ...queries.nolaiuto } }
    case 'handExcel':
      return { tab: 'handExcel', query: { ...queries.handExcel } }
  }
}

async function runSearch(tab: NoticeTabId = activeTab.value, resetPage = false, force = false): Promise<void> {
  if (!props.bridge) return
  const state = tableStates[tab]
  // 任务执行期间由任务态持有 loading，避免重复查询与其完成后的自动刷新互相覆盖。
  if (state.loading && !force) return
  if (resetPage) queries[tab].pageIndex = 1
  state.loading = true
  state.errorMessage = ''
  state.needCpcLogin = false
  state.loginMessage = ''
  statusError.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.SearchNotice,
      payload: buildSearchRequest(tab)
    })
    if (resp.type === MessageType.Error) {
      statusError.value = resp.payload.message
      state.errorMessage = resp.payload.message
      return
    }
    if (resp.type !== MessageType.SearchNoticeResult) {
      statusError.value = '来文查询返回了意外响应。'
      state.errorMessage = statusError.value
      return
    }
    if (!resp.payload.ok) {
      statusError.value = resp.payload.error.message
      state.errorMessage = resp.payload.error.message
      return
    }
    state.rows = resp.payload.data.rows
    state.total = resp.payload.data.total
    state.loadedOnce = true
    state.errorMessage = ''
    state.needCpcLogin = resp.payload.data.needCpcLogin
    state.loginMessage = resp.payload.data.loginMessage
    state.selectedKeys = []
    if (tab === 'import') flaggedRowKeys.value = []
  } finally {
    // 任务态刷新列表时仍由任务持有 loading，任务结束后统一释放。
    if (!state.loadingLabel.trim()) state.loading = false
  }
}

function selectTab(tab: NoticeTabId): void {
  activeTab.value = tab
  statusMessage.value = ''
  statusError.value = ''
  if (!tableStates[tab].loadedOnce && tab !== 'replay' && tab !== 'cert') {
    void runSearch(tab, false)
  }
}

function resetTabQuery(): void {
  const t = activeTab.value
  switch (t) {
    case 'import':
      queries.import = createDefaultNoticeImportQuery()
      break
    case 'download':
      queries.download = createDefaultNoticeDownloadQuery(initData.value?.defaultTzsStartDate ?? '')
      break
    case 'cert':
      queries.cert = createDefaultNoticeCertQuery()
      break
    case 'replay':
      queries.replay = createDefaultNoticeReplayQuery(initData.value?.cpcAccounts[0]?.value ?? '')
      break
    case 'hand':
      queries.hand = createDefaultNoticeHandQuery()
      break
    case 'handHis':
      queries.handHis = createDefaultNoticeHandHisQuery()
      break
    case 'nolaiuto':
      queries.nolaiuto = createDefaultNoticeNolaiutoQuery()
      break
    case 'handExcel':
      queries.handExcel = createDefaultNoticeHandExcelQuery()
      break
  }
  void runSearch(t, false)
}

function onPageChange(nextPage: number): void {
  currentQuery.value.pageIndex = nextPage
  void runSearch(activeTab.value, false)
}

function onSizeChange(nextSize: number): void {
  currentQuery.value.pageSize = nextSize
  currentQuery.value.pageIndex = 1
  void runSearch(activeTab.value, false)
}

function selectedRowsForTab(tab: NoticeTabId): NoticeRow[] {
  const set = new Set(tableStates[tab].selectedKeys)
  return tableStates[tab].rows.filter(r => set.has(noticeRowKey(tab, r)))
}

async function sendAction(req: NoticeActionRequest): Promise<NoticeActionResult | null> {
  if (!props.bridge) return null
  const resp = await props.bridge.request({
    type: MessageType.NoticeAction,
    payload: req
  })
  if (resp.type === MessageType.Error) {
    statusError.value = resp.payload.message
    return null
  }
  if (resp.type !== MessageType.NoticeActionResult) {
    statusError.value = '操作返回了意外响应。'
    return null
  }
  if (!resp.payload.ok) {
    statusError.value = resp.payload.error.message
    return null
  }
  const result = resp.payload.data
  if (result.counts) {
    const target = initData.value ?? createEmptyInitData()
    initData.value = {
      ...target,
      handCount: typeof result.counts.handCount === 'number' ? result.counts.handCount : target.handCount,
      nolaiutoCount: typeof result.counts.nolaiutoCount === 'number' ? result.counts.nolaiutoCount : target.nolaiutoCount
    }
    persistNoticeCache()
  }
  return result
}

function applyAccountLabel(accountId: string): string {
  return initData.value?.cpcAccounts.find(a => a.value === accountId)?.label ?? ''
}

async function handleImportFlow(mailSales: 'N' | 'Y'): Promise<void> {
  flaggedRowKeys.value = []
  const rows = selectedRowsForTab('import')
  const oaIds = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  if (!oaIds.length) {
    await infoDialog({ title: '提示', message: '请选择要导入的来文' })
    return
  }

  const closeRule = initData.value?.closeCaseRule ?? '1'
  const closeImport = initData.value?.closeCaseImportNotice ?? '0'
  const finishedRows = rows.filter(r => Number(r.is_finish) === 1)
  const finishedIds = finishedRows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  const finishedKeys = finishedRows.map(r => noticeRowKey('import', r)).filter(Boolean)
  const handleClosed =
    finishedIds.length > 0 && ((closeRule === '1' && closeImport === '1') || closeRule !== '1')

  if (handleClosed) {
    flaggedRowKeys.value = finishedKeys
    tableStates.import.selectedKeys = finishedKeys
    if (closeRule !== '1') {
      const yesClosed = await confirmDialog({
        title: '提示',
        warn: true,
        confirmLabel: '确定',
        cancelLabel: '取消',
        message: '您导入的通知书包含结案的案件请确认。\n注:结案的案件，导入通知书时不再产生新的任务，只会导入文件！'
      })
      if (!yesClosed) return
    }
    busyAction.value = mailSales === 'Y' ? 'importEmail' : 'importNotice'
    try {
      const closedRes = await sendAction({ action: 'importCloseCase', oaIds: finishedIds })
      if (closedRes) {
        if (closedRes.ok) {
          statusMessage.value = closedRes.message
        } else {
          statusError.value = closedRes.message
          await infoDialog({ title: '提示', message: closedRes.message })
        }
      }
      await runSearch('import', false)
    } finally {
      busyAction.value = ''
    }
    return
  }

  const invalidRows = rows.filter(r => !String(r.case_volume ?? '').trim())
  if (invalidRows.length > 0) {
    const invalidKeys = new Set(invalidRows.map(r => noticeRowKey('import', r)).filter(Boolean))
    flaggedRowKeys.value = [...invalidKeys]
    tableStates.import.selectedKeys = tableStates.import.selectedKeys.filter(k => !invalidKeys.has(k))
    await infoDialog({ title: '提示', message: '红框处我方文号不正确' })
    return
  }

  const actionKey = mailSales === 'Y' ? 'importEmail' : 'importNotice'
  busyAction.value = actionKey
  try {
    const check = await sendAction({ action: 'importCheck', oaIds })
    if (!check) return
    if (check.checkWarnings && check.checkWarnings.length > 0) {
      const cont = await confirmDialog({
        title: '提示',
        warn: true,
        confirmLabel: '继续导入',
        cancelLabel: '取消',
        message: `${check.checkWarnings.join('\n')}\n\n是否还继续导入系统？`
      })
      if (!cont) return
    }

    const res = await sendAction({ action: 'importNotice', oaIds, mailSales, checkName: false })
    if (!res) return
    if (res.isErrorFee) {
      const goLimit = await confirmDialog({
        title: '提示',
        message: '存在不一致的费用，是否查看？',
        confirmLabel: '查看',
        cancelLabel: '关闭'
      })
      if (goLimit && typeof location !== 'undefined') {
        location.hash = '/limits'
      }
    }
    if (res.ok) statusMessage.value = res.message
    else statusError.value = res.message
    await infoDialog({ title: '提示', message: res.message })
    await runSearch('import', false)
  } finally {
    busyAction.value = ''
  }
}

async function runSelectedOaAction(
  busyKey: string,
  emptyMsg: string,
  buildReq: (ids: string[]) => NoticeActionRequest,
  tab: NoticeTabId = activeTab.value
): Promise<void> {
  const rows = selectedRowsForTab(tab)
  const ids = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  if (!ids.length) {
    await infoDialog({ title: '提示', message: emptyMsg })
    return
  }
  busyAction.value = busyKey
  statusError.value = ''
  try {
    const res = await sendAction(buildReq(ids))
    if (!res) return
    if (res.ok) statusMessage.value = res.message
    else statusError.value = res.message
    await runSearch(tab, false)
  } finally {
    busyAction.value = ''
  }
}

async function confirmAndRunOaAction(
  busyKey: string,
  title: string,
  emptyMsg: string,
  confirmMsg: string,
  buildReq: (ids: string[]) => NoticeActionRequest,
  tab: NoticeTabId = activeTab.value,
  warn = false
): Promise<void> {
  const rows = selectedRowsForTab(tab)
  const ids = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  if (!ids.length) {
    await infoDialog({ title: '提示', message: emptyMsg })
    return
  }
  const ok = await confirmDialog({ title, message: confirmMsg.replace('{count}', String(ids.length)), confirmLabel: '确定', cancelLabel: '取消', warn })
  if (!ok) return
  busyAction.value = busyKey
  statusError.value = ''
  try {
    const res = await sendAction(buildReq(ids))
    if (!res) return
    if (res.ok) statusMessage.value = res.message
    else statusError.value = res.message
    await runSearch(tab, false)
  } finally {
    busyAction.value = ''
  }
}

async function triggerAction(action: string): Promise<void> {
  statusError.value = ''
  if (action === 'search') {
    await runSearch(activeTab.value, true)
    return
  }
  if (action === 'refresh') {
    await runSearch(activeTab.value, false)
    return
  }
  if (action === 'openEasyTab') {
    busyAction.value = 'openEasyTab'
    try {
      const res = await sendAction({ action: 'openEasyNoticeTab' })
      if (res) {
        if (res.ok) statusMessage.value = res.message
        else statusError.value = res.message
      }
    } finally {
      busyAction.value = ''
    }
    return
  }
  if (action === 'export') {
    const tab = activeTab.value
    if (tab !== 'import' && tab !== 'download' && tab !== 'cert' && tab !== 'replay') return
    exportModalOpen.value = true
    return
  }

  switch (action) {
    case 'importNotice':
      await handleImportFlow('N')
      return
    case 'importEmail':
      await handleImportFlow('Y')
      return
    case 'reMatch':
      await runSelectedOaAction('reMatch', '请选择要更新的数据', ids => ({
        action: 'reMatchNotice',
        oaIds: ids
      }))
      return
    case 'updateDone':
      await confirmAndRunOaAction(
        'updateDone',
        '提示',
        '请选择要更新的数据',
        '确定要更新状态？更新后通知书将不会导入系统中哦！',
        ids => ({ action: 'updateProcessStatus', oaIds: ids }),
        activeTab.value,
        true
      )
      return
    case 'markNolaiuto':
      await runSelectedOaAction('markNolaiuto', '请选择要修改的数据', ids => ({
        action: 'changeNolaiuto',
        oaIds: ids,
        value: '1'
      }))
      return
    case 'restoreNolaiuto':
      await runSelectedOaAction(
        'restoreNolaiuto',
        '请选择要修改的数据',
        ids => ({ action: 'changeNolaiuto', oaIds: ids, value: '0' }),
        'nolaiuto'
      )
      return
    case 'updateCaseName':
      await confirmAndRunOaAction(
        'updateCaseName',
        '提示',
        '请选择要更新的案件名称',
        '确认更新案件名称？',
        ids => ({
          action: 'updateCaseName',
          oaIds: ids
        })
      )
      return
    case 'recover':
      await confirmAndRunOaAction(
        'recover',
        '提示',
        '请选择要更新的数据',
        '确定要更新状态',
        ids => ({ action: 'recoveryProcessStatus', oaIds: ids }),
        activeTab.value
      )
      return
    case 'recoverAnalyse':
      await confirmAndRunOaAction(
        'recoverAnalyse',
        '提示',
        '请选择要更新的数据',
        '更新来文状态为未处理状态，并将来文返回递交助手重新分析',
        ids => ({ action: 'recoveryStatusAnalyse', oaIds: ids }),
        'handHis',
        true
      )
      return
    case 'mailCustomer': {
      const rows = selectedRowsForTab('import')
      const ids = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
      if (!ids.length) {
        await infoDialog({ title: '提示', message: '请选择要发文客户的来文' })
        return
      }
      pendingMailOaIds.value = ids
      mailStyleModalOpen.value = true
      return
    }
    case 'openUploadCpc':
      openUploadModal('cpc')
      return
    case 'openUploadGf':
      openUploadModal('gf')
      return
    case 'viewUploadProcess':
      await loadUploadProcessList(1)
      return
    case 'updateHandExcel': {
      const rows = selectedRowsForTab('handExcel')
      const docNos = rows.map(r => String(r.doc_no ?? '').trim()).filter(Boolean)
      if (!docNos.length) {
        await infoDialog({ title: '提示', message: '请先勾选要更新处理状态的清单记录！' })
        return
      }
      const yes = await confirmDialog({
        title: '更新清单处理状态',
        message: `确认更新勾选的 ${docNos.length} 条清单记录的处理状态？`,
        confirmLabel: '确定',
        cancelLabel: '取消'
      })
      if (!yes) return
      busyAction.value = 'updateHandExcel'
      try {
        const res = await sendAction({ action: 'updateHandExcel', docNos })
        if (res) {
          statusMessage.value = res.message
          await runSearch('handExcel', false)
        }
      } finally {
        busyAction.value = ''
      }
      return
    }
    case 'deleteTzs': {
      const rows = selectedRowsForTab('download')
      const fids = rows.map(r => String(r.fid ?? '').trim()).filter(Boolean)
      if (!fids.length) {
        await infoDialog({ title: '提示', message: '请先勾选要删除的通知书文件！' })
        return
      }
      const yes = await confirmDialog({
        title: '删除通知书文件',
        warn: true,
        message: `确定删除勾选的 ${fids.length} 条通知书文件？删除后如需重新下载请前往「来文二次下载」。`,
        confirmLabel: '确定删除',
        cancelLabel: '取消'
      })
      if (!yes) return
      busyAction.value = 'deleteTzs'
      try {
        const res = await sendAction({ action: 'deleteDownloadOa', fids })
        if (res) {
          statusMessage.value = res.message
          await runSearch('download', false)
        }
      } finally {
        busyAction.value = ''
      }
      return
    }
function stageTextForNoticeEvent(ev: NoticeTaskStatusEvent): string {
  switch (ev.phase) {
    case 'checking_login':
      return '核对 CPC 登录'
    case 'submitting':
      return '提交原站请求'
    case 'polling':
      return ev.pollAttempt && ev.pollAttempt > 0
        ? `轮询状态 (${ev.pollAttempt}/${ev.maxPolls ?? 20})`
        : '原站已受理'
    case 'syncing_rows':
      return '同步解析明细'
    case 'done':
      return '原站处理完成'
    case 'background':
      return '后台继续处理'
    case 'need_login':
      return '需扫码登录'
    case 'error':
      return '执行异常'
  }
}

async function runPollingNoticeAction(options: {
  busyKey: string
  label: string
  tab: 'download' | 'cert' | 'replay'
  request: Extract<NoticeActionRequest, { action: 'fetchTzsList' | 'downloadTzsList' | 'fetchCertList' | 'downloadCertList' }>
  onAfterSuccess?: (res: NoticeActionResult) => Promise<void>
}): Promise<void> {
  const progressId = newUuid()
  const tracker: { lastEvent: NoticeTaskStatusEvent | null } = { lastEvent: null }

  detachNoticeStatusListener()
  stopNoticeTimer()
  statusMessage.value = ''
  statusError.value = ''
  const tableState = tableStates[options.tab]
  tableState.errorMessage = ''
  tableState.needCpcLogin = false
  tableState.loginMessage = ''
  // 任务态即表格加载态：任务执行中查询按钮禁用，未加载列表显示进度而不是“请点击查询”。
  tableState.loading = true
  tableState.loadingLabel = options.label

  noticeTaskBar.visible = true
  noticeTaskBar.status = 'run'
  noticeTaskBar.label = options.label
  noticeTaskBar.stage = '准备请求'
  noticeTaskBar.summary = ''
  noticeTaskBar.detail = '正在通过已绑定 EASY 标签页发起原站请求…'
  noticeTaskBar.startedAt = Date.now()
  noticeTaskBar.elapsedSec = 0

  noticeTickTimer = setInterval(() => {
    noticeTaskBar.elapsedSec = Math.max(0, Math.floor((Date.now() - noticeTaskBar.startedAt) / 1000))
  }, 1000)

  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined
  if (runtime?.onMessage) {
    const listener = (packet: unknown, sender: chrome.runtime.MessageSender): void => {
      if (sender.id !== runtime.id || !isRecord(packet)) return
      if (packet.channel !== NOTICE_STATUS_CHANNEL || packet.id !== progressId) return
      if (!isNoticeTaskStatusEvent(packet.status)) return
      const ev = packet.status
      tracker.lastEvent = ev
      noticeTaskBar.stage = stageTextForNoticeEvent(ev)
      noticeTaskBar.summary = ev.call ?? ''
      noticeTaskBar.detail = ev.serverMessage
    }
    runtime.onMessage.addListener(listener)
    removeNoticeStatusListener = () => runtime.onMessage.removeListener(listener)
  }

  busyAction.value = options.busyKey
  try {
    const res = await sendAction({ ...options.request, progressId })
    if (!res) {
      noticeTaskBar.status = 'fail'
      noticeTaskBar.stage = '请求未完成'
      noticeTaskBar.summary = tracker.lastEvent?.call ?? ''
      noticeTaskBar.detail = statusError.value || 'EASY 通道未返回结果。'
      if (tableStates[options.tab].rows.length === 0) {
        tableStates[options.tab].errorMessage = noticeTaskBar.detail
      }
      return
    }
    if (res.needCpcLogin) {
      tableStates[options.tab].needCpcLogin = true
      tableStates[options.tab].loginMessage = res.message
      statusError.value = res.message
      noticeTaskBar.status = 'hold'
      noticeTaskBar.stage = '需扫码登录'
      noticeTaskBar.summary = 'CPC 登录态过期'
      noticeTaskBar.detail = res.message
      return
    }
    if (!res.ok) {
      statusError.value = res.message
      noticeTaskBar.status = 'fail'
      noticeTaskBar.stage = '执行失败'
      noticeTaskBar.summary = tracker.lastEvent?.call ?? ''
      noticeTaskBar.detail = res.message
      if (tableStates[options.tab].rows.length === 0) {
        tableStates[options.tab].errorMessage = res.message
      }
      return
    }

    noticeTaskBar.stage = '刷新列表'
    noticeTaskBar.summary = '同步界面数据'
    noticeTaskBar.detail = res.message
    if (options.onAfterSuccess) {
      await options.onAfterSuccess(res)
    } else {
      await runSearch(options.tab, false, true)
    }

    const isBackground = tracker.lastEvent?.phase === 'background'
    noticeTaskBar.status = isBackground ? 'hold' : 'done'
    noticeTaskBar.stage = isBackground ? '后台处理中' : '已完成'

    if (options.request.action === 'downloadTzsList' && options.tab === 'download') {
      if (isBackground) {
        noticeTaskBar.summary = '原站后台仍在解析'
        noticeTaskBar.detail = res.message
      } else {
        noticeTaskBar.summary = '已同步至「导入来文」'
        noticeTaskBar.detail =
          queries.download.status === 'unprocess' && tableStates.download.rows.length === 0
            ? `${res.message} 未解析队列已清空，请到「导入来文」继续导入，或改选「已解析」查询`
            : `${res.message} 已解析官文已进入「导入来文」待导入列表`
      }
    } else if (options.request.action === 'downloadTzsList' && options.tab === 'replay') {
      noticeTaskBar.summary = isBackground ? '后台解析中' : '二次解析完成'
      noticeTaskBar.detail = `${res.message}（成功入库记录可在「导入来文」查看）`
    } else if (options.request.action === 'downloadCertList') {
      noticeTaskBar.summary = isBackground ? '后台解析中' : '证书解析完成'
      noticeTaskBar.detail = res.message
    } else {
      noticeTaskBar.summary = tracker.lastEvent?.call ?? '同步完成'
      noticeTaskBar.detail = res.message
    }
    statusMessage.value = noticeTaskBar.detail
  } finally {
    detachNoticeStatusListener()
    stopNoticeTimer()
    noticeTaskBar.elapsedSec = Math.max(0, Math.floor((Date.now() - noticeTaskBar.startedAt) / 1000))
    busyAction.value = ''
    tableState.loading = false
    tableState.loadingLabel = ''
  }
}

    case 'fetchTzsList': {
      const q = queries.download
      await runPollingNoticeAction({
        busyKey: 'fetchTzsList',
        label: '获取官文列表',
        tab: 'download',
        request: {
          action: 'fetchTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status
        }
      })
      return
    }
    case 'downloadAllTzs':
    case 'downloadCheckedTzs': {
      const checkedOnly = action === 'downloadCheckedTzs'
      const rows = selectedRowsForTab('download')
      const fids = rows.map(r => String(r.fid ?? '').trim()).filter(Boolean)
      const xlh = rows.map(r => String(r.fawenxlh ?? '').trim())
      if (checkedOnly && !fids.length) {
        await infoDialog({ title: '提示', message: '请先勾选要下载解析的通知书文件！' })
        return
      }
      const q = queries.download
      await runPollingNoticeAction({
        busyKey: action,
        label: checkedOnly ? `下载解析 (${fids.length} 条)` : '下载解析全部官文',
        tab: 'download',
        request: {
          action: 'downloadTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          ...(checkedOnly ? { fids, xlh } : {}),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status
        }
      })
      return
    }
    case 'fetchCertList': {
      const q = queries.cert
      await runPollingNoticeAction({
        busyKey: 'fetchCertList',
        label: '获取电子证书列表',
        tab: 'cert',
        request: {
          action: 'fetchCertList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status,
          xlh: q.xlh
        }
      })
      return
    }
    case 'downloadAllCert':
    case 'downloadCheckedCert': {
      const checkedOnly = action === 'downloadCheckedCert'
      const rows = selectedRowsForTab('cert')
      const fids = rows.map(r => String(r.fid ?? '').trim()).filter(Boolean)
      const xlh = rows.map(r => String(r.fawenxlh ?? '').trim())
      if (checkedOnly && !fids.length) {
        await infoDialog({ title: '提示', message: '请先勾选要下载的电子证书记录！' })
        return
      }
      const q = queries.cert
      await runPollingNoticeAction({
        busyKey: action,
        label: checkedOnly ? `解析证书 (${fids.length} 条)` : '下载解析全部证书',
        tab: 'cert',
        request: {
          action: 'downloadCertList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          ...(checkedOnly ? { fids, xlh } : {})
        }
      })
      return
    }
    case 'replayDownload': {
      const rows = selectedRowsForTab('replay')
      const fids = rows.map(r => String(r.fid ?? '').trim()).filter(Boolean)
      const xlh = rows.map(r => String(r.fawenxlh ?? '').trim())
      if (!fids.length) {
        await infoDialog({ title: '提示', message: '请先勾选要二次下载分析的通知书文件！' })
        return
      }
      const q = queries.replay
      await runPollingNoticeAction({
        busyKey: 'replayDownload',
        label: `二次下载分析 (${fids.length} 条)`,
        tab: 'replay',
        request: {
          action: 'downloadTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          fids,
          xlh,
          startTime: q.startTime,
          endTime: q.endTime,
          isReplay: true
        },
        onAfterSuccess: async res => {
          if (res.statusRows?.length) {
            const map = new Map(res.statusRows.map(item => [String(item.fid ?? ''), item]))
            for (const r of tableStates.replay.rows) {
              const updated = map.get(String(r.fid ?? ''))
              if (updated) {
                r.status = updated.status
                r.remark = updated.remark
              }
            }
          } else {
            await runSearch('replay', false, true)
          }
        }
      })
    }
  }
}

async function confirmMailCustomer(): Promise<void> {
  if (!pendingMailOaIds.value.length) return
  mailStyleModalOpen.value = false
  busyAction.value = 'mailCustomer'
  try {
    const res = await sendAction({
      action: 'mailCustomer',
      oaIds: pendingMailOaIds.value,
      mailStyle: pickedMailStyle.value
    })
    if (res) {
      if (res.ok) statusMessage.value = res.message
      else statusError.value = res.message
      await infoDialog({ title: '提示', message: res.message })
      await runSearch('import', false)
    }
  } finally {
    busyAction.value = ''
  }
}

function openUploadModal(kind: 'cpc' | 'gf'): void {
  uploadKind.value = kind
  uploadQueue.value = []
  uploadDragging.value = false
  uploadModalOpen.value = true
}

function triggerUploadFilePicker(): void {
  if (uploadPickerInput.value) {
    uploadPickerInput.value.value = ''
    uploadPickerInput.value.click()
  }
}

async function addUploadFiles(fileList: FileList | null): Promise<void> {
  if (!fileList?.length) return
  const next = [...uploadQueue.value]
  for (const file of Array.from(fileList)) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      await infoDialog({ title: '提示', message: '只支持上传下列文件格式: zip' })
      continue
    }
    if (file.size > MAX_UPLOAD_ZIP_BYTES) {
      await infoDialog({ title: '提示', message: `文件「${file.name}」超过 50MB 限制，不能添加。` })
      continue
    }
    const exists = next.some(item => item.name === file.name && item.size === file.size)
    if (!exists) next.push(file)
  }
  uploadQueue.value = next
}

function onUploadFilesPicked(e: Event): void {
  const input = e.target as HTMLInputElement
  void addUploadFiles(input.files)
  input.value = ''
}

function onUploadDrop(e: DragEvent): void {
  e.preventDefault()
  uploadDragging.value = false
  void addUploadFiles(e.dataTransfer?.files ?? null)
}

function removeQueuedUploadFile(index: number): void {
  uploadQueue.value = uploadQueue.value.filter((_, idx) => idx !== index)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function submitUploadQueue(): Promise<void> {
  if (!uploadQueue.value.length) {
    await infoDialog({ title: '提示', message: '请先添加至少一个 `.zip` 官文压缩包。' })
    return
  }
  busyAction.value = 'uploadCpc'
  statusError.value = ''
  try {
    const encodedFiles = await Promise.all(
      uploadQueue.value.map(async file => ({
        fileName: file.name,
        mimeType: file.type || 'application/zip',
        base64: await fileToBase64(file)
      }))
    )
    const first = encodedFiles[0]
    const res = await sendAction({
      action: 'uploadCpcZip',
      kind: uploadKind.value,
      fileName: first.fileName,
      mimeType: first.mimeType,
      base64: first.base64,
      files: encodedFiles
    })
    if (res) {
      if (res.ok) {
        uploadModalOpen.value = false
        uploadQueue.value = []
        statusMessage.value = res.message
        if (res.uploadTips) {
          await infoDialog({ title: '提示', message: res.uploadTips })
        }
        await runSearch('import', false)
      } else {
        statusError.value = res.message
        await infoDialog({ title: '提示', message: res.message })
      }
    }
  } finally {
    busyAction.value = ''
  }
}

async function loadUploadProcessList(page = processPageIndex.value): Promise<void> {
  processLoading.value = true
  processModalOpen.value = true
  busyAction.value = 'viewUploadProcess'
  try {
    const res = await sendAction({
      action: 'getUploadProcessList',
      pageIndex: page,
      pageSize: processPageSize
    })
    if (res?.uploadProcessRows) {
      processRows.value = res.uploadProcessRows
      processTotal.value = res.uploadProcessTotal ?? res.uploadProcessRows.length
      processPageIndex.value = page
    }
  } finally {
    processLoading.value = false
    busyAction.value = ''
  }
}

async function loadUploadProcessDetailList(page = processDetailPageIndex.value): Promise<void> {
  if (!processDetailRecordId.value) return
  processDetailLoading.value = true
  try {
    const res = await sendAction({
      action: 'getUploadProcessDetailList',
      recordId: processDetailRecordId.value,
      status: processDetailStatus.value,
      pageIndex: page,
      pageSize: processDetailPageSize
    })
    if (res?.uploadProcessDetailRows) {
      processDetailRows.value = res.uploadProcessDetailRows
      processDetailTotal.value = res.uploadProcessDetailTotal ?? res.uploadProcessDetailRows.length
      processDetailPageIndex.value = page
    }
  } finally {
    processDetailLoading.value = false
  }
}

async function openProcessDetail(row: NoticeUploadProcessRow): Promise<void> {
  processDetailRecordId.value = row.id
  processDetailZipName.value = row.zipFileName
  processDetailStatus.value = '-1'
  processDetailPageIndex.value = 1
  processDetailRows.value = []
  processDetailTotal.value = 0
  processDetailModalOpen.value = true
  await loadUploadProcessDetailList(1)
}

function onProcessDetailStatusChange(next: string): void {
  if (next === '-1' || next === '1' || next === '2' || next === '3') {
    processDetailStatus.value = next
    void loadUploadProcessDetailList(1)
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

async function handleExcelUpload(file: File): Promise<void> {
  if (!props.bridge) return
  busyAction.value = 'uploadExcel'
  statusError.value = ''
  try {
    const base64 = await fileToBase64(file)
    const resp = await props.bridge.request({
      type: MessageType.UploadNoticeExcel,
      payload: {
        fileName: file.name,
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64
      }
    })
    if (resp.type === MessageType.Error) {
      statusError.value = resp.payload.message
    } else if (resp.type === MessageType.UploadNoticeExcelResult) {
      if (resp.payload.ok && resp.payload.data.ok) {
        statusMessage.value = resp.payload.data.message
        filterFormRef.value?.clearPickedExcel()
        await runSearch('handExcel', false)
      } else {
        statusError.value = resp.payload.ok ? resp.payload.data.message : resp.payload.error.message
      }
    }
  } finally {
    busyAction.value = ''
  }
}

function resetDetailForm(row: NoticeRow, detail: Record<string, unknown> | null): void {
  const src = detail ?? row
  detailForm.oaId = txt(src.oa_id || row.oa_id)
  detailForm.importId = txt(src.import_id)
  detailForm.ctrlProc = txt(src.ctrl_proc_zh_cn || src.ctrl_proc || row.ctrl_proc)
  detailForm.caseId = txt(src.case_id || row.case_id)
  detailForm.caseVolume = txt(src.case_volume || row.case_volume)
  detailForm.chargeDept = txt(src.dept_name)
  detailForm.picName = txt(src.i_cn_name || src.f_cn_name || src.cn_name || row.pic)
  detailForm.oaCode = txt(src.oa_code || row.oa_code || row.file_desc_code)
  detailForm.oaDate = txt(src.FaWenRQ || row.FaWenRQ)
  detailForm.oaTypeId = alignDetailOaTypeId(txt(src.oa_type_id))
  detailForm.oaTypeName = txt(src.oa_name || row.oa_name)
  detailForm.oaDesc = txt(src.notice_Content || row.remark)
  detailForm.intDueDate = txt(src.i_int_due_date || src.int_due_date)
  detailForm.cusDueDate = txt(src.i_cus_due_date || src.cus_due_date)
  detailForm.legalDueDate = txt(src.i_legal_due_date || src.legal_due_date)
  detailForm.examiner = txt(src.Examiner)
  detailForm.examinerTel = txt(src.ExaminerTel)
  detailForm.examinerDept = txt(src.ExaminerDept)
  detailForm.issueNo = txt(src.issue_no || row.issue_no)
  detailForm.issueDate = txt(src.issue_date || row.issue_date)
  detailForm.certificateNo = txt(src.certificate_no || row.certificate_no)
  detailForm.customerName = txt(src.customer_name || row.customer_name)
  detailForm.remark = txt(src.remark || row.remark)
}

async function inspectRow(row: NoticeRow): Promise<void> {
  detailRow.value = row
  detailFees.value = []
  detailHebo.value = []
  detailDuibi.value = []
  detailMessage.value = ''
  detailMessageTone.value = 'ok'
  caseSearchKeyword.value = ''
  caseSearchOptions.value = []
  caseSearchSearched.value = false
  const ps = row.process_status
  detailEditable.value =
    (activeTab.value === 'import' && queries.import.status === '0') &&
    (ps === '0' || ps === 0 || ps === undefined || ps === null || ps === '')
  resetDetailForm(row, null)
  detailOpen.value = true

  const oaId = txt(row.oa_id).trim()
  if (!oaId) return
  detailLoading.value = true
  try {
    const res = await sendAction({
      action: 'getNoticeDetail',
      oaId,
      ctrlProcId: txt(row.ctrl_proc_id)
    })
    if (res) {
      if (res.detailFileTypes?.length) detailFileTypes.value = res.detailFileTypes
      if (res.detail) resetDetailForm(row, res.detail)
      else detailForm.oaTypeId = alignDetailOaTypeId(detailForm.oaTypeId)
      detailFees.value = res.detailFees ?? []
      detailHebo.value = res.detailHebo ?? []
      detailDuibi.value = res.detailDuibi ?? []
    }
  } finally {
    detailLoading.value = false
  }
}

function updateDetailField({ key, value }: { key: NoticeDetailEditableKey; value: string }): void {
  detailForm[key] = value
}

async function searchDetailCases(): Promise<void> {
  const kw = caseSearchKeyword.value.trim() || detailForm.caseVolume.trim()
  if (!kw) return
  caseSearching.value = true
  try {
    const res = await sendAction({ action: 'searchNoticeCases', keyword: kw })
    caseSearchOptions.value = res?.caseOptions ?? []
    caseSearchSearched.value = true
  } finally {
    caseSearching.value = false
  }
}

async function pickDetailCase(opt: NoticeOptionItem): Promise<void> {
  detailForm.caseId = opt.value
  detailForm.caseVolume = opt.label
  caseSearchKeyword.value = ''
  caseSearchOptions.value = []
  caseSearchSearched.value = false
  const meta = await sendAction({ action: 'getCaseMeta', caseId: opt.value })
  if (meta?.chargeDept) detailForm.chargeDept = meta.chargeDept
}

async function saveDetail(): Promise<void> {
  if (!detailForm.caseId.trim()) {
    detailMessageTone.value = 'error'
    detailMessage.value = '请先检索并关联我方文号对应的案件。'
    return
  }
  detailSaving.value = true
  detailMessage.value = ''
  try {
    const res = await sendAction({
      action: 'saveNoticeDetail',
      oaId: detailForm.oaId,
      importId: detailForm.importId,
      oaDate: detailForm.oaDate,
      oaTypeId: detailForm.oaTypeId,
      caseId: detailForm.caseId,
      issueNo: detailForm.issueNo,
      issueDate: detailForm.issueDate,
      certificateNo: detailForm.certificateNo
    })
    if (res?.ok) {
      detailMessageTone.value = 'ok'
      detailMessage.value = res.message
      await runSearch(activeTab.value, false)
    } else if (res) {
      detailMessageTone.value = 'error'
      detailMessage.value = res.message
    }
  } finally {
    detailSaving.value = false
  }
}

async function openAppNoFiles(row: NoticeRow): Promise<void> {
  const appNo = txt(row.ShenQingH || row.zhuanlisqh).trim()
  if (!appNo) return
  appFilesMode.value = activeTab.value === 'download' ? 'del' : 'hand'
  appFilesAppNo.value = appNo
  appFilesTargetId.value = activeTab.value === 'download' ? txt(row.fid).trim() : txt(row.oa_id).trim()
  appFilesRows.value = []
  appFilesOpen.value = true
  appFilesLoading.value = true
  try {
    const res = await sendAction({ action: 'getAppNoFiles', appNo })
    appFilesRows.value = res?.caseFiles ?? []
  } finally {
    appFilesLoading.value = false
  }
}

async function handleAppFileAction(): Promise<void> {
  if (!appFilesTargetId.value) return
  const isDel = appFilesMode.value === 'del'
  const ok = await confirmDialog({
    title: isDel ? '删除确认' : '更新状态确认',
    warn: isDel,
    confirmLabel: isDel ? '确定删除' : '确定标记',
    cancelLabel: '取消',
    message: isDel
      ? '确定删除该通知书文件吗？删除后如需重新下载请前往「来文二次下载」操作。'
      : '确定标记此异常通知书为已处理吗？'
  })
  if (!ok) return
  appFilesBusy.value = true
  try {
    const res = isDel
      ? await sendAction({ action: 'deleteDownloadOa', fids: [appFilesTargetId.value] })
      : await sendAction({ action: 'updateProcessStatus', oaIds: [appFilesTargetId.value] })
    if (res?.ok) {
      statusMessage.value = res.message
      appFilesOpen.value = false
      await runSearch(activeTab.value, false)
    } else if (res) {
      statusError.value = res.message
    }
  } finally {
    appFilesBusy.value = false
  }
}

function onImportStatusChange(): void {
  tableStates.import.selectedKeys = []
  flaggedRowKeys.value = []
  void runSearch('import', true)
}

function patchQuery(targetTab: NoticeTabId, key: string, value: string | boolean): void {
  const target = queries[targetTab] as unknown as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value
  }
}

watch(() => props.userId, (next, prev) => {
  if (next !== prev) void bootstrapWorkspace()
})

onMounted(() => {
  void bootstrapWorkspace()
})

onBeforeUnmount(() => {
  detachNoticeStatusListener()
  stopNoticeTimer()
})
</script>

<template>
  <div class="notice-workspace">
    <div class="tabs workflow-view-tabs notice-tabs" role="tablist" aria-label="来文管理页签">
      <button
        v-for="tab in NOTICE_TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :class="{ on: activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}<span v-if="tabBadge(tab.id)" class="notice-tab-count">{{ tabBadge(tab.id) }}</span>
      </button>
    </div>

    <div v-if="initData?.warnings?.length" class="card notice-warn-strip">
      部分热加载字典提示：{{ initData.warnings.join('；') }}
    </div>

    <p v-if="statusError" class="card notice-status-bar is-error">{{ statusError }}</p>
    <p v-else-if="statusMessage" class="card notice-status-bar is-ok">{{ statusMessage }}</p>

    <NoticeFilterForm
      ref="filterFormRef"
      :tab="activeTab"
      :init-data="initData"
      :user-options="userOptions"
      :background-loading="backgroundLoading"
      :loading-init="loadingInit"
      :loading-search="currentState.loading"
      :uploading-excel="busyAction === 'uploadExcel'"
      :import-query="queries.import"
      :download-query="queries.download"
      :cert-query="queries.cert"
      :replay-query="queries.replay"
      :hand-query="queries.hand"
      :hand-his-query="queries.handHis"
      :nolaiuto-query="queries.nolaiuto"
      :hand-excel-query="queries.handExcel"
      @search="runSearch(activeTab, true)"
      @reset="resetTabQuery"
      @refresh-init="loadInit({ silent: false })"
      @upload-excel="handleExcelUpload"
      @status-change="onImportStatusChange"
      @patch-query="patchQuery"
    />

    <NoticeActionBar
      :tab="activeTab"
      :import-status="queries.import.status"
      :selected-count="currentState.selectedKeys.length"
      :busy-action="busyAction"
      :notice-gf-enabled="Boolean(initData?.noticeGfEnabled)"
      @trigger="triggerAction"
    />

    <div v-if="activeTab === 'import'" class="card notice-import-tips">
      <p>1. 查询栏位中案件名称标记为<span class="notice-tip-red">红色</span>的代表通知书中的发明名称与实际系统中的案件名称不一致。</p>
      <p>2. 案件名称中<span class="notice-tip-blue">蓝色背景</span>代表该通知书匹配到多个申请号案件，系统匹配到其中一个；导入通知书时请留意；已经结案的案件导入时不再产生新任务，只会导入文件。</p>
    </div>

    <NoticeResultTable
      :tab="activeTab"
      :import-status="queries.import.status"
      :rows="displayedRows"
      :total="currentState.total"
      :page-index="currentQuery.pageIndex"
      :page-size="currentQuery.pageSize"
      :selected-keys="currentState.selectedKeys"
      :flagged-keys="flaggedRowKeys"
      :loading="currentState.loading"
      :loading-label="currentState.loadingLabel"
      :loaded-once="currentState.loadedOnce"
      :error-message="currentState.errorMessage"
      :need-cpc-login="currentState.needCpcLogin"
      :login-message="currentState.loginMessage"
      @update:selected-keys="currentState.selectedKeys = $event"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @inspect="inspectRow"
      @inspect-app-no="openAppNoFiles"
      @open-easy="triggerAction('openEasyTab')"
      @retry="runSearch(activeTab, false)"
    />

    <NoticeDetailModal
      v-model:case-search-keyword="caseSearchKeyword"
      :open="detailOpen"
      :editable="detailEditable"
      :loading="detailLoading"
      :saving="detailSaving"
      :message="detailMessage"
      :message-tone="detailMessageTone"
      :form="detailForm"
      :fees="detailFees"
      :hebo="detailHebo"
      :duibi="detailDuibi"
      :file-type-options="detailFileTypeTreeOptions"
      :case-search-options="caseSearchOptions"
      :case-searching="caseSearching"
      :case-search-searched="caseSearchSearched"
      @close="detailOpen = false"
      @save="saveDetail"
      @search-case="searchDetailCases"
      @pick-case="pickDetailCase"
      @update-field="updateDetailField"
    />

    <div v-if="appFilesOpen" class="mask app-dialog" @click.self="appFilesOpen = false">
      <div class="dialog with-table">
        <header>
          <h3>案件官文列表（申请号：{{ appFilesAppNo }}）</h3>
          <button type="button" aria-label="关闭" @click="appFilesOpen = false">×</button>
        </header>
        <p v-if="appFilesLoading" class="hint">正在加载该申请号下已有官文记录…</p>
        <div class="dialog-table">
          <table>
            <thead>
              <tr>
                <th>附件名称</th>
                <th>文件类型</th>
                <th>文件描述</th>
                <th>官方发文日</th>
                <th>上传者</th>
                <th>上传日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!appFilesLoading && appFilesRows.length === 0">
                <td colspan="6">该申请号下暂无已入库官文记录</td>
              </tr>
              <tr v-for="(item, i) in appFilesRows" :key="txt(item.file_id) || i">
                <td>{{ txt(item.file_name) }}</td>
                <td>{{ txt(item.file_type) }}</td>
                <td>{{ txt(item.file_desc) }}</td>
                <td>{{ txt(item.post_date) }}</td>
                <td>{{ txt(item.cn_name) }}</td>
                <td>{{ txt(item.upload_time) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <button type="button" class="ghost" @click="appFilesOpen = false">关闭</button>
          <button
            v-if="appFilesTargetId"
            type="button"
            class="solid"
            :disabled="appFilesBusy"
            @click="handleAppFileAction"
          >
            {{ appFilesMode === 'del' ? '删除该通知书' : '标记此通知书为已处理' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="mailStyleModalOpen" class="mask app-dialog" @click.self="mailStyleModalOpen = false">
      <div class="dialog">
        <header>
          <h3>选择发文模式</h3>
          <button type="button" aria-label="关闭" @click="mailStyleModalOpen = false">×</button>
        </header>
        <div class="notice-mail-styles">
          <label v-for="opt in NOTICE_MAIL_STYLE_OPTIONS" :key="opt.value" class="notice-radio-row">
            <input v-model="pickedMailStyle" type="radio" name="noticeMailStyle" :value="opt.value" />
            <span>{{ opt.label }}</span>
          </label>
        </div>
        <footer>
          <button type="button" class="ghost" @click="mailStyleModalOpen = false">取消</button>
          <button type="button" class="solid" @click="confirmMailCustomer">创建发文草稿</button>
        </footer>
      </div>
    </div>

    <div v-if="uploadModalOpen" class="mask app-dialog" @click.self="busyAction !== 'uploadCpc' && (uploadModalOpen = false)">
      <div class="dialog with-table notice-upload-dialog">
        <header>
          <h3>{{ uploadKind === 'gf' ? '上传国防官文' : '上传CPC官文' }}</h3>
          <button
            type="button"
            v-hint="'关闭上传窗口'"
            aria-label="关闭"
            :disabled="busyAction === 'uploadCpc'"
            @click="uploadModalOpen = false"
          >
            ×
          </button>
        </header>

        <input
          ref="uploadPickerInput"
          class="sr-only"
          type="file"
          accept=".zip"
          multiple
          @change="onUploadFilesPicked"
        />

        <div
          class="notice-upload-dropzone"
          :class="{ 'is-dragging': uploadDragging }"
          @dragover.prevent="uploadDragging = true"
          @dragleave.prevent="uploadDragging = false"
          @drop="onUploadDrop"
        >
          <p class="notice-upload-title">将 `.zip` 官文压缩包拖放到此处，或点击选择文件（支持一次添加多个压缩包同批次上传）</p>
          <div class="notice-upload-toolbar">
            <button type="button" class="solid tiny" :disabled="busyAction === 'uploadCpc'" @click="triggerUploadFilePicker">
              添加文件
            </button>
            <button
              type="button"
              class="ghost tiny"
              :disabled="!uploadQueue.length || busyAction === 'uploadCpc'"
              @click="uploadQueue = []"
            >
              清空队列
            </button>
            <span class="notice-upload-tip">温馨提示：单个文件不能超过 50MB，仅支持 .zip 格式</span>
          </div>
        </div>

        <div class="dialog-table notice-detail-scroll">
          <table>
            <thead>
              <tr>
                <th style="width: 56px">序号</th>
                <th>压缩包文件名</th>
                <th style="width: 110px">文件大小</th>
                <th style="width: 84px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="uploadQueue.length === 0">
                <td colspan="4">队列暂无文件，请点击「添加文件」或拖拽 `.zip` 至上方区域</td>
              </tr>
              <tr v-for="(file, idx) in uploadQueue" :key="`${file.name}-${file.size}-${idx}`">
                <td>{{ idx + 1 }}</td>
                <td><span class="clip" v-hint.clip="file.name">{{ file.name }}</span></td>
                <td>{{ formatFileSize(file.size) }}</td>
                <td>
                  <button
                    type="button"
                    class="go"
                    :disabled="busyAction === 'uploadCpc'"
                    @click="removeQueuedUploadFile(idx)"
                  >
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer>
          <button
            type="button"
            class="ghost"
            :disabled="busyAction === 'uploadCpc'"
            @click="loadUploadProcessList(1)"
          >
            查看上传进度
          </button>
          <button type="button" class="ghost" :disabled="busyAction === 'uploadCpc'" @click="uploadModalOpen = false">
            取消
          </button>
          <button
            type="button"
            class="solid"
            :disabled="uploadQueue.length === 0 || busyAction === 'uploadCpc'"
            @click="submitUploadQueue"
          >
            {{ busyAction === 'uploadCpc' ? '正在上传解析…' : `开始上传 (${uploadQueue.length})` }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="processModalOpen" class="mask app-dialog" @click.self="processModalOpen = false">
      <div class="dialog with-table notice-process-dialog">
        <header>
          <h3>上传进度</h3>
          <button type="button" v-hint="'关闭上传进度'" aria-label="关闭" @click="processModalOpen = false">×</button>
        </header>
        <p v-if="processLoading" class="hint">正在读取原站上传解析进度…</p>
        <div class="dialog-table notice-detail-scroll">
          <table>
            <thead>
              <tr>
                <th style="width: 56px">序号</th>
                <th>压缩包名称</th>
                <th style="width: 96px">状态</th>
                <th style="width: 90px">上传进度</th>
                <th style="width: 76px">成功数量</th>
                <th style="width: 76px">失败数量</th>
                <th style="width: 76px">合并数量</th>
                <th style="width: 68px">总数</th>
                <th style="width: 140px">上传时间</th>
                <th style="width: 84px">上传人</th>
                <th style="width: 100px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!processLoading && processRows.length === 0">
                <td colspan="11">暂无上传进度记录</td>
              </tr>
              <tr v-for="item in processRows" :key="item.id">
                <td>{{ item.sn }}</td>
                <td><span class="clip" v-hint.clip="item.zipFileName">{{ item.zipFileName }}</span></td>
                <td>{{ item.status }}</td>
                <td>{{ item.process }}</td>
                <td>{{ item.successNum }}</td>
                <td>{{ item.failNum }}</td>
                <td>{{ item.mergeNum }}</td>
                <td>{{ item.totalNum }}</td>
                <td>{{ item.createTime }}</td>
                <td>{{ item.uploader }}</td>
                <td>
                  <button
                    type="button"
                    class="go"
                    v-hint="'查看上传详细'"
                    @click="openProcessDetail(item)"
                  >
                    查看上传详细
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager notice-modal-pager">
          <span>共 {{ processTotal }} 条</span>
          <div class="notice-pager-controls">
            <button type="button" :disabled="processPageIndex <= 1 || processLoading" @click="loadUploadProcessList(processPageIndex - 1)">上一页</button>
            <span>第 {{ processPageIndex }} / {{ processTotalPages }} 页</span>
            <button type="button" :disabled="processPageIndex >= processTotalPages || processLoading" @click="loadUploadProcessList(processPageIndex + 1)">下一页</button>
          </div>
        </div>
        <footer>
          <button type="button" class="ghost" :disabled="processLoading" @click="loadUploadProcessList(processPageIndex)">刷新</button>
          <button type="button" class="solid" @click="processModalOpen = false">关闭</button>
        </footer>
      </div>
    </div>

    <div v-if="processDetailModalOpen" class="mask app-dialog" @click.self="processDetailModalOpen = false">
      <div class="dialog with-table notice-process-dialog">
        <header>
          <h3>上传进度详情{{ processDetailZipName ? ` — ${processDetailZipName}` : '' }}</h3>
          <button type="button" v-hint="'关闭上传进度详情'" aria-label="关闭" @click="processDetailModalOpen = false">×</button>
        </header>
        <div class="notice-process-detail-filter">
          <span class="notice-field-label">处理状态：</span>
          <div class="notice-detail-status-select">
            <ThemeSelect
              :model-value="processDetailStatus"
              :options="[...UPLOAD_PROCESS_DETAIL_STATUS_OPTIONS]"
              :disabled="processDetailLoading"
              @update:model-value="onProcessDetailStatusChange(String($event))"
            />
          </div>
        </div>
        <p v-if="processDetailLoading" class="hint">正在读取压缩包内文件处理明细…</p>
        <div class="dialog-table notice-detail-scroll">
          <table>
            <thead>
              <tr>
                <th style="width: 56px">序号</th>
                <th>通知书文件</th>
                <th style="width: 92px">状态</th>
                <th>提示信息</th>
                <th style="width: 144px">更新时间</th>
                <th style="width: 84px">上传人</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!processDetailLoading && processDetailRows.length === 0">
                <td colspan="6">暂无明细记录</td>
              </tr>
              <tr
                v-for="item in processDetailRows"
                :key="item.id"
                :class="{ 'is-upload-failed': item.status === '上传失败' }"
              >
                <td>{{ item.sn }}</td>
                <td><span class="clip" v-hint.clip="item.fileName">{{ item.fileName }}</span></td>
                <td>{{ item.status }}</td>
                <td><span class="clip" v-hint.clip="item.message">{{ item.message }}</span></td>
                <td>{{ item.updateTime }}</td>
                <td>{{ item.uploader }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager notice-modal-pager">
          <span>共 {{ processDetailTotal }} 条</span>
          <div class="notice-pager-controls">
            <button type="button" :disabled="processDetailPageIndex <= 1 || processDetailLoading" @click="loadUploadProcessDetailList(processDetailPageIndex - 1)">上一页</button>
            <span>第 {{ processDetailPageIndex }} / {{ processDetailTotalPages }} 页</span>
            <button type="button" :disabled="processDetailPageIndex >= processDetailTotalPages || processDetailLoading" @click="loadUploadProcessDetailList(processDetailPageIndex + 1)">下一页</button>
          </div>
        </div>
        <footer>
          <button type="button" class="ghost" :disabled="processDetailLoading" @click="loadUploadProcessDetailList(processDetailPageIndex)">刷新</button>
          <button type="button" class="solid" @click="processDetailModalOpen = false">关闭</button>
        </footer>
      </div>
    </div>

    <NoticeExportModal
      :open="exportModalOpen"
      :tab="activeTab === 'download' || activeTab === 'cert' || activeTab === 'replay' ? activeTab : 'import'"
      :bridge="bridge"
      :import-query="queries.import"
      :download-query="queries.download"
      :cert-query="queries.cert"
      :replay-query="queries.replay"
      :account-label="activeExportAccountLabel"
      @close="exportModalOpen = false"
      @exported="statusMessage = $event"
    />
  </div>
</template>
