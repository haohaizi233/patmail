<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import TreeOptionSelect from '../../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../../shell/components/WDatePicker.vue'
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
  NoticeExportTab,
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
  NoticeUploadProcessRow
} from '../../../api/notice-types'
import { MessageType, type MessageBridge } from '../../../shared/message'
import type { TreeOption } from '../../../query/option-tree'
import { confirmDialog, infoDialog } from '../../dialog'
import NoticeActionBar from './NoticeActionBar.vue'
import NoticeFilterForm from './NoticeFilterForm.vue'
import NoticeResultTable from './NoticeResultTable.vue'

const props = withDefaults(defineProps<{
  bridge?: MessageBridge
  userId?: string
}>(), {
  bridge: undefined,
  userId: ''
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
  loadedOnce: boolean
  needCpcLogin?: boolean
  loginMessage?: string
}

const createTableState = (): TabTableState => ({
  rows: [],
  total: 0,
  selectedKeys: [],
  loading: false,
  loadedOnce: false
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
const detailTab = ref<'charge' | 'fee' | 'hebo' | 'duibi'>('charge')
const detailRow = ref<NoticeRow | null>(null)
const detailFees = ref<Record<string, unknown>[]>([])
const detailHebo = ref<Record<string, unknown>[]>([])
const detailDuibi = ref<Record<string, unknown>[]>([])
const detailLoading = ref(false)
const detailSaving = ref(false)
const detailMessage = ref('')
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

// AppNo file list modal (对齐 NoHandFileList.aspx)
const appFilesOpen = ref(false)
const appFilesLoading = ref(false)
const appFilesBusy = ref(false)
const appFilesMode = ref<'hand' | 'del'>('hand')
const appFilesAppNo = ref('')
const appFilesTargetId = ref('')
const appFilesRows = ref<NoticeRow[]>([])

const detailFileTypeTreeOptions = computed<TreeOption[]>(() =>
  (initData.value?.fileTypes ?? []).map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
)

// MailCustomer style modal
const mailStyleModalOpen = ref(false)
const pickedMailStyle = ref<'1' | '2' | '3'>('1')
const pendingMailOaIds = ref<string[]>([])

// UploadProcess modal
const processModalOpen = ref(false)
const processRows = ref<NoticeUploadProcessRow[]>([])

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

async function runSearch(tab: NoticeTabId = activeTab.value, resetPage = false): Promise<void> {
  if (!props.bridge) return
  if (resetPage) queries[tab].pageIndex = 1
  const state = tableStates[tab]
  state.loading = true
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
      return
    }
    if (resp.type !== MessageType.SearchNoticeResult) {
      statusError.value = '来文查询返回了意外响应。'
      return
    }
    if (!resp.payload.ok) {
      statusError.value = resp.payload.error.message
      return
    }
    state.rows = resp.payload.data.rows
    state.total = resp.payload.data.total
    state.loadedOnce = true
    state.needCpcLogin = resp.payload.data.needCpcLogin
    state.loginMessage = resp.payload.data.loginMessage
    state.selectedKeys = []
  } finally {
    state.loading = false
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
  const rows = selectedRowsForTab('import')
  const oaIds = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  if (!oaIds.length) {
    await infoDialog({ title: '提示', message: '请先勾选要导入的来文！' })
    return
  }

  const missingVolume = rows.some(r => !String(r.case_volume ?? '').trim())
  if (missingVolume) {
    await infoDialog({ title: '无法导入', message: '勾选记录中存在“我方文号”为空的数据，请先补全匹配后再导入。' })
    return
  }

  const finishedIds = rows.filter(r => Number(r.is_finish) === 1).map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  const openIds = rows.filter(r => Number(r.is_finish) !== 1).map(r => String(r.oa_id ?? '').trim()).filter(Boolean)

  if (finishedIds.length > 0) {
    const yesClosed = await confirmDialog({
      title: '结案案件导入确认',
      warn: true,
      confirmLabel: '仅导入文件',
      cancelLabel: '取消',
      message: `所选记录中有 ${finishedIds.length} 件处于结案状态，导入时仅导入文件到案件不再产生新任务，是否继续？`
    })
    if (!yesClosed) return
    busyAction.value = mailSales === 'Y' ? 'importEmail' : 'importNotice'
    try {
      const closedRes = await sendAction({ action: 'importCloseCase', oaIds: finishedIds })
      if (closedRes) statusMessage.value = closedRes.message
    } finally {
      busyAction.value = ''
    }
    if (!openIds.length) {
      await runSearch('import', false)
      return
    }
  }

  const actionKey = mailSales === 'Y' ? 'importEmail' : 'importNotice'
  busyAction.value = actionKey
  try {
    const check = await sendAction({ action: 'importCheck', oaIds: openIds })
    if (!check) return
    if (check.checkWarnings && check.checkWarnings.length > 0) {
      const cont = await confirmDialog({
        title: '导入系统确认',
        warn: true,
        confirmLabel: '仍继续导入',
        cancelLabel: '取消',
        message: `${check.checkWarnings.join('\n')}\n\n是否仍继续导入系统？`
      })
      if (!cont) return
    } else {
      const cont = await confirmDialog({
        title: mailSales === 'Y' ? '导入并邮寄确认' : '导入系统确认',
        confirmLabel: '确定导入',
        cancelLabel: '取消',
        message: `确认导入已勾选的 ${openIds.length} 条来文记录吗？`
      })
      if (!cont) return
    }

    const res = await sendAction({ action: 'importNotice', oaIds: openIds, mailSales, checkName: false })
    if (!res) return
    if (res.ok) statusMessage.value = res.message
    else statusError.value = res.message
    if (res.isErrorFee) {
      await infoDialog({ title: '费用差异提示', message: '原站提示存在不一致的费用，可前往「期限监控」核对退费监控项。' })
    }
    await runSearch('import', false)
  } finally {
    busyAction.value = ''
  }
}

async function confirmAndRunOaAction(
  busyKey: string,
  title: string,
  confirmMsg: string,
  buildReq: (ids: string[]) => NoticeActionRequest,
  tab: NoticeTabId = activeTab.value,
  warn = false
): Promise<void> {
  const rows = selectedRowsForTab(tab)
  const ids = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
  if (!ids.length) {
    await infoDialog({ title: '提示', message: '请先勾选要操作的数据！' })
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
    if (!props.bridge) return
    busyAction.value = 'export'
    try {
      const exportPayload =
        tab === 'import'
          ? { tab: 'import' as NoticeExportTab, query: { ...queries.import } }
          : tab === 'download'
            ? { tab: 'download' as NoticeExportTab, query: { ...queries.download } }
            : tab === 'cert'
              ? { tab: 'cert' as NoticeExportTab, query: { ...queries.cert } }
              : { tab: 'replay' as NoticeExportTab, query: { ...queries.replay } }
      const resp = await props.bridge.request({
        type: MessageType.ExportNotice,
        payload: exportPayload as never
      })
      if (resp.type === MessageType.Error) {
        statusError.value = resp.payload.message
      } else if (resp.type === MessageType.ExportNoticeResult) {
        if (resp.payload.ok) statusMessage.value = resp.payload.data.message
        else statusError.value = resp.payload.error.message
      }
    } finally {
      busyAction.value = ''
    }
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
      await confirmAndRunOaAction('reMatch', '重新匹配案件', '确认重新匹配勾选的 {count} 条未处理来文？', ids => ({
        action: 'reMatchNotice',
        oaIds: ids
      }))
      return
    case 'updateDone':
      await confirmAndRunOaAction(
        'updateDone',
        '更新状态为已完成',
        '确定要更新勾选的 {count} 条来文状态吗？更新后通知书将不会导入系统中！',
        ids => ({ action: 'updateProcessStatus', oaIds: ids }),
        activeTab.value,
        true
      )
      return
    case 'markNolaiuto':
      await confirmAndRunOaAction('markNolaiuto', '添加到无需导入来文', '确认将勾选的 {count} 条来文标记为“无需导入来文”？', ids => ({
        action: 'changeNolaiuto',
        oaIds: ids,
        value: '1'
      }))
      return
    case 'restoreNolaiuto':
      await confirmAndRunOaAction(
        'restoreNolaiuto',
        '恢复到导入来文',
        '确认将勾选的 {count} 条记录恢复到“导入来文”队列？',
        ids => ({ action: 'changeNolaiuto', oaIds: ids, value: '0' }),
        'nolaiuto'
      )
      return
    case 'updateCaseName':
      await confirmAndRunOaAction('updateCaseName', '更新案件名称', '确认更新勾选的 {count} 条来文的案件名称？', ids => ({
        action: 'updateCaseName',
        oaIds: ids
      }))
      return
    case 'recover':
      await confirmAndRunOaAction(
        'recover',
        '恢复未处理',
        '确定将勾选的 {count} 条记录恢复为未处理状态？',
        ids => ({ action: 'recoveryProcessStatus', oaIds: ids }),
        activeTab.value
      )
      return
    case 'recoverAnalyse':
      await confirmAndRunOaAction(
        'recoverAnalyse',
        '恢复并重新分析',
        '确认更新勾选的 {count} 条来文状态为未处理，并返还递交助手重新分析？',
        ids => ({ action: 'recoveryStatusAnalyse', oaIds: ids }),
        'handHis',
        true
      )
      return
    case 'mailCustomer': {
      const rows = selectedRowsForTab('import')
      const ids = rows.map(r => String(r.oa_id ?? '').trim()).filter(Boolean)
      if (!ids.length) {
        await infoDialog({ title: '提示', message: '请先勾选要发文给客户的来文！' })
        return
      }
      pendingMailOaIds.value = ids
      mailStyleModalOpen.value = true
      return
    }
    case 'viewUploadProcess': {
      busyAction.value = 'viewUploadProcess'
      try {
        const res = await sendAction({ action: 'getUploadProcessList', pageIndex: 1, pageSize: 20 })
        if (res?.uploadProcessRows) {
          processRows.value = res.uploadProcessRows
          processModalOpen.value = true
        }
      } finally {
        busyAction.value = ''
      }
      return
    }
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
    case 'fetchTzsList': {
      busyAction.value = 'fetchTzsList'
      try {
        const q = queries.download
        const res = await sendAction({
          action: 'fetchTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status
        })
        if (res) {
          if (res.needCpcLogin) {
            tableStates.download.needCpcLogin = true
            tableStates.download.loginMessage = res.message
            statusError.value = res.message
          } else if (res.ok) {
            statusMessage.value = res.message
            await runSearch('download', false)
          } else {
            statusError.value = res.message
          }
        }
      } finally {
        busyAction.value = ''
      }
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
      busyAction.value = action
      try {
        const q = queries.download
        const res = await sendAction({
          action: 'downloadTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          ...(checkedOnly ? { fids, xlh } : {}),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status
        })
        if (res) {
          if (res.needCpcLogin) {
            tableStates.download.needCpcLogin = true
            tableStates.download.loginMessage = res.message
            statusError.value = res.message
          } else if (res.ok) {
            statusMessage.value = res.message
            await runSearch('download', false)
          } else {
            statusError.value = res.message
          }
        }
      } finally {
        busyAction.value = ''
      }
      return
    }
    case 'fetchCertList': {
      busyAction.value = 'fetchCertList'
      try {
        const q = queries.cert
        const res = await sendAction({
          action: 'fetchCertList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          casename: q.casename,
          appno: q.appno,
          startTime: q.startTime,
          endTime: q.endTime,
          status: q.status,
          xlh: q.xlh
        })
        if (res) {
          if (res.needCpcLogin) {
            tableStates.cert.needCpcLogin = true
            tableStates.cert.loginMessage = res.message
            statusError.value = res.message
          } else if (res.ok) {
            statusMessage.value = res.message
            await runSearch('cert', false)
          } else {
            statusError.value = res.message
          }
        }
      } finally {
        busyAction.value = ''
      }
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
      busyAction.value = action
      try {
        const q = queries.cert
        const res = await sendAction({
          action: 'downloadCertList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          ...(checkedOnly ? { fids, xlh } : {})
        })
        if (res) {
          if (res.needCpcLogin) {
            tableStates.cert.needCpcLogin = true
            tableStates.cert.loginMessage = res.message
            statusError.value = res.message
          } else if (res.ok) {
            statusMessage.value = res.message
            await runSearch('cert', false)
          } else {
            statusError.value = res.message
          }
        }
      } finally {
        busyAction.value = ''
      }
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
      busyAction.value = 'replayDownload'
      try {
        const q = queries.replay
        const res = await sendAction({
          action: 'downloadTzsList',
          account: q.account,
          accountLabel: applyAccountLabel(q.account),
          fids,
          xlh,
          startTime: q.startTime,
          endTime: q.endTime,
          isReplay: true
        })
        if (res) {
          if (res.needCpcLogin) {
            tableStates.replay.needCpcLogin = true
            tableStates.replay.loginMessage = res.message
            statusError.value = res.message
          } else if (res.ok) {
            statusMessage.value = res.message
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
              await runSearch('replay', false)
            }
          } else {
            statusError.value = res.message
          }
        }
      } finally {
        busyAction.value = ''
      }
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
      await runSearch('import', false)
    }
  } finally {
    busyAction.value = ''
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

async function handleCpcZipUpload(kind: 'cpc' | 'gf', file: File): Promise<void> {
  const yes = await confirmDialog({
    title: kind === 'gf' ? '上传国防官文确认' : '上传 CPC 官文确认',
    message: `确认上传文件「${file.name}」到原站进行解析导入吗？`,
    confirmLabel: '开始上传',
    cancelLabel: '取消'
  })
  if (!yes) return
  busyAction.value = 'uploadCpc'
  statusError.value = ''
  try {
    const base64 = await fileToBase64(file)
    const res = await sendAction({
      action: 'uploadCpcZip',
      kind,
      fileName: file.name,
      mimeType: file.type || 'application/zip',
      base64
    })
    if (res) {
      if (res.ok) statusMessage.value = res.message
      else statusError.value = res.message
      await runSearch('import', false)
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
  detailForm.oaTypeId = txt(src.oa_type_id)
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
  detailTab.value = 'charge'
  detailFees.value = []
  detailHebo.value = []
  detailDuibi.value = []
  detailMessage.value = ''
  caseSearchKeyword.value = ''
  caseSearchOptions.value = []
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
      if (res.detail) resetDetailForm(row, res.detail)
      detailFees.value = res.detailFees ?? []
      detailHebo.value = res.detailHebo ?? []
      detailDuibi.value = res.detailDuibi ?? []
    }
  } finally {
    detailLoading.value = false
  }
}

async function searchDetailCases(): Promise<void> {
  const kw = caseSearchKeyword.value.trim() || detailForm.caseVolume.trim()
  if (!kw) return
  caseSearching.value = true
  try {
    const res = await sendAction({ action: 'searchNoticeCases', keyword: kw })
    caseSearchOptions.value = res?.caseOptions ?? []
  } finally {
    caseSearching.value = false
  }
}

async function pickDetailCase(opt: NoticeOptionItem): Promise<void> {
  detailForm.caseId = opt.value
  detailForm.caseVolume = opt.label
  caseSearchOptions.value = []
  const meta = await sendAction({ action: 'getCaseMeta', caseId: opt.value })
  if (meta?.chargeDept) detailForm.chargeDept = meta.chargeDept
}

async function saveDetail(): Promise<void> {
  if (!detailForm.caseId.trim()) {
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
      detailMessage.value = res.message
      await runSearch(activeTab.value, false)
    } else if (res) {
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
      @trigger="triggerAction"
      @upload-cpc="handleCpcZipUpload"
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
      :loading="currentState.loading"
      :need-cpc-login="currentState.needCpcLogin"
      :login-message="currentState.loginMessage"
      @update:selected-keys="currentState.selectedKeys = $event"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @inspect="inspectRow"
      @inspect-app-no="openAppNoFiles"
      @open-easy="triggerAction('openEasyTab')"
    />

    <div v-if="detailOpen" class="mask app-dialog" @click.self="detailOpen = false">
      <div class="dialog with-table notice-detail-dialog">
        <header>
          <h3>来文详细信息{{ detailEditable ? '（可编辑关联案件与来文信息）' : '' }}</h3>
          <button type="button" aria-label="关闭" @click="detailOpen = false">×</button>
        </header>

        <div class="tabs notice-detail-tabs" role="tablist">
          <button type="button" :class="{ on: detailTab === 'charge' }" @click="detailTab = 'charge'">处理信息</button>
          <button type="button" :class="{ on: detailTab === 'fee' }" @click="detailTab = 'fee'">官费信息 ({{ detailFees.length }})</button>
          <button type="button" :class="{ on: detailTab === 'hebo' }" @click="detailTab = 'hebo'">核驳信息 ({{ detailHebo.length }})</button>
          <button type="button" :class="{ on: detailTab === 'duibi' }" @click="detailTab = 'duibi'">对比文件 ({{ detailDuibi.length }})</button>
        </div>

        <p v-if="detailLoading" class="hint">正在读取原站来文详情与关联信息…</p>
        <p v-if="detailMessage" class="notice-status-inline-ok">{{ detailMessage }}</p>

        <div v-if="detailTab === 'charge'" class="notice-detail-scroll">
          <div class="notice-form-2col notice-detail-grid">
            <label class="notice-field">
              <span class="notice-field-label">处理事项</span>
              <input :value="detailForm.ctrlProc" type="text" disabled />
            </label>
            <div class="notice-field">
              <span class="notice-field-label">我方文号</span>
              <div v-if="detailEditable" class="notice-case-picker">
                <div class="notice-inline-pair">
                  <input
                    v-model="caseSearchKeyword"
                    type="text"
                    :placeholder="detailForm.caseVolume || '输入我方文号关键词搜索关联'"
                    @keydown.enter.prevent="searchDetailCases"
                  />
                  <button type="button" class="ghost" :disabled="caseSearching" @click="searchDetailCases">
                    {{ caseSearching ? '检索中…' : '查找案件' }}
                  </button>
                </div>
                <small v-if="detailForm.caseVolume" class="notice-picked-case">当前关联：{{ detailForm.caseVolume }}</small>
                <div v-if="caseSearchOptions.length > 0" class="notice-case-dropdown">
                  <button
                    v-for="opt in caseSearchOptions"
                    :key="opt.value"
                    type="button"
                    class="notice-case-option"
                    @click="pickDetailCase(opt)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
              <input v-else :value="detailForm.caseVolume" type="text" disabled />
            </div>

            <label class="notice-field">
              <span class="notice-field-label">承办部门</span>
              <input :value="detailForm.chargeDept" type="text" disabled />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">处理人</span>
              <input :value="detailForm.picName" type="text" disabled />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">来文编号</span>
              <input :value="detailForm.oaCode" type="text" disabled />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">官方发文日</span>
              <WDatePicker v-model="detailForm.oaDate" :disabled="!detailEditable" placeholder="选择发文日" />
            </label>

            <div class="notice-field">
              <span class="notice-field-label">来文名称</span>
              <TreeOptionSelect
                v-if="detailEditable && detailFileTypeTreeOptions.length > 0"
                :model-value="detailForm.oaTypeId"
                :options="detailFileTypeTreeOptions"
                :multiple="false"
                empty-text="暂无来文类型"
                @update:model-value="detailForm.oaTypeId = $event"
              />
              <input v-else :value="detailForm.oaTypeName" type="text" disabled />
            </div>
            <label class="notice-field">
              <span class="notice-field-label">来文备注</span>
              <input :value="detailForm.oaDesc" type="text" disabled />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">内部期限</span>
              <input :value="detailForm.intDueDate" type="text" disabled />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">客户期限</span>
              <input :value="detailForm.cusDueDate" type="text" disabled />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">官方期限</span>
              <input :value="detailForm.legalDueDate" type="text" disabled />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">审查员</span>
              <input :value="detailForm.examiner" type="text" disabled />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">审查员电话</span>
              <input :value="detailForm.examinerTel" type="text" disabled />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">审查部门</span>
              <input :value="detailForm.examinerDept" type="text" disabled />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">公告号</span>
              <input v-model="detailForm.issueNo" type="text" :disabled="!detailEditable" />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">公告日</span>
              <WDatePicker v-model="detailForm.issueDate" :disabled="!detailEditable" placeholder="选择公告日" />
            </label>

            <label class="notice-field">
              <span class="notice-field-label">证书号</span>
              <input v-model="detailForm.certificateNo" type="text" :disabled="!detailEditable" />
            </label>
            <label class="notice-field">
              <span class="notice-field-label">客户名称</span>
              <input :value="detailForm.customerName" type="text" disabled />
            </label>
          </div>
        </div>

        <div v-else-if="detailTab === 'fee'" class="dialog-table notice-detail-scroll">
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>费用类型</th>
                <th>费用子类</th>
                <th>费用</th>
                <th>费用期限</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="detailFees.length === 0">
                <td colspan="6">暂无官费信息</td>
              </tr>
              <tr v-for="(item, i) in detailFees" :key="txt(item.oa_fee_id) || i">
                <td>{{ txt(item.sn) || i + 1 }}</td>
                <td>{{ txt(item.fee_type) }}</td>
                <td>{{ txt(item.fee_sub_type) }}</td>
                <td>{{ txt(item.amount) }}</td>
                <td>{{ txt(item.legal_due_date) }}</td>
                <td>{{ txt(item.description) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="detailTab === 'hebo'" class="notice-detail-scroll">
          <div class="dialog-table">
            <table>
              <thead>
                <tr>
                  <th>权利要求项</th>
                  <th>引用法条</th>
                  <th>审查结果</th>
                  <th>审查类型</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="detailHebo.length === 0">
                  <td colspan="4">暂无核驳明细</td>
                </tr>
                <tr v-for="(item, i) in detailHebo" :key="txt(item.reject_id) || i">
                  <td>{{ txt(item.reject_claims) }}</td>
                  <td>{{ txt(item.reject_law) }}</td>
                  <td>{{ txt(item.reject_file) }}</td>
                  <td>{{ txt(item.review_type) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <label class="notice-field">
            <span class="notice-field-label">审查结论</span>
            <textarea :value="detailForm.remark" rows="3" disabled class="notice-textarea" />
          </label>
        </div>

        <div v-else class="dialog-table notice-detail-scroll">
          <table>
            <thead>
              <tr>
                <th>国别</th>
                <th>对比文件号</th>
                <th>公开日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="detailDuibi.length === 0">
                <td colspan="3">暂无对比文件</td>
              </tr>
              <tr v-for="(item, i) in detailDuibi" :key="txt(item.oa_ids_id) || i">
                <td>{{ txt(item.country) }}</td>
                <td>{{ txt(item.file_no) }}</td>
                <td>{{ txt(item.pub_date) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer>
          <button type="button" class="ghost" @click="detailOpen = false">取消</button>
          <button
            v-if="detailEditable && detailTab === 'charge'"
            type="button"
            class="solid"
            :disabled="detailSaving"
            @click="saveDetail"
          >
            {{ detailSaving ? '保存中…' : '保存修改' }}
          </button>
        </footer>
      </div>
    </div>

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

    <div v-if="processModalOpen" class="mask app-dialog" @click.self="processModalOpen = false">
      <div class="dialog with-table">
        <header>
          <h3>CPC / 国防官文上传进度</h3>
          <button type="button" aria-label="关闭" @click="processModalOpen = false">×</button>
        </header>
        <div class="dialog-table">
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>压缩包名称</th>
                <th>状态</th>
                <th>进度</th>
                <th>成功</th>
                <th>失败</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="processRows.length === 0">
                <td colspan="6">暂无上传进度记录</td>
              </tr>
              <tr v-for="item in processRows" :key="item.id">
                <td>{{ item.sn }}</td>
                <td>{{ item.zipFileName }}</td>
                <td>{{ item.status }}</td>
                <td>{{ item.process }}</td>
                <td>{{ item.successNum }}</td>
                <td>{{ item.failNum }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <button type="button" class="solid" @click="processModalOpen = false">关闭</button>
        </footer>
      </div>
    </div>
  </div>
</template>
