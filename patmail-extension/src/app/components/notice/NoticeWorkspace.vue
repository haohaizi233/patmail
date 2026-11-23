<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { NormalizedDictionary } from '../../../api/dictionaries'
import { choicesFromDictionary } from '../../../api/dictionaries/picker-catalog'
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
  NoticeHandExcelQuery,
  NoticeHandHisQuery,
  NoticeHandQuery,
  NoticeImportQuery,
  NoticeInitData,
  NoticeNolaiutoQuery,
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
}>(), {
  bridge: undefined
})

const activeTab = ref<NoticeTabId>('import')
const initData = ref<NoticeInitData | null>(null)
const userOptions = ref<TreeOption[]>([])
const loadingInit = ref(false)
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

// Detail modal
const detailOpen = ref(false)
const detailRow = ref<NoticeRow | null>(null)
const detailInfo = ref<Record<string, unknown> | null>(null)
const detailLoading = ref(false)

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

function readUserTreeFromPicker(dictionaries: Record<string, NormalizedDictionary>): TreeOption[] {
  const dict = dictionaries.user
  if (!dict) return []
  return choicesFromDictionary(dict).map(c => ({
    value: c.value,
    label: c.label,
    ...(c.parent ? { parent: c.parent } : {})
  }))
}

async function loadInit(force = false): Promise<void> {
  if (!props.bridge) return
  loadingInit.value = true
  try {
    const [initResp, pickerResp] = await Promise.all([
      props.bridge.request({ type: MessageType.LoadNoticeInit }),
      props.bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'picker', force } })
    ])
    if (initResp.type === MessageType.LoadNoticeInitResult && initResp.payload.ok) {
      initData.value = initResp.payload.data
      if (!queries.download.startTime && initResp.payload.data.defaultTzsStartDate) {
        queries.download.startTime = initResp.payload.data.defaultTzsStartDate
      }
      if (!queries.replay.account && initResp.payload.data.cpcAccounts.length > 0) {
        queries.replay.account = initResp.payload.data.cpcAccounts[0].value
      }
    } else if (initResp.type === MessageType.LoadNoticeInitResult && !initResp.payload.ok) {
      statusError.value = initResp.payload.error.message
    } else if (initResp.type === MessageType.Error) {
      statusError.value = initResp.payload.message
    }

    if (
      pickerResp.type === MessageType.DictionaryResult &&
      pickerResp.payload.ok &&
      pickerResp.payload.data.kind === 'picker'
    ) {
      userOptions.value = readUserTreeFromPicker(pickerResp.payload.data.dictionaries)
    }
  } finally {
    loadingInit.value = false
  }
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
  if (result.counts && initData.value) {
    if (typeof result.counts.handCount === 'number') initData.value.handCount = result.counts.handCount
    if (typeof result.counts.nolaiutoCount === 'number') initData.value.nolaiutoCount = result.counts.nolaiutoCount
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

async function inspectRow(row: NoticeRow): Promise<void> {
  detailRow.value = row
  detailInfo.value = null
  detailOpen.value = true
  const oaId = typeof row.oa_id === 'string' ? row.oa_id.trim() : ''
  if (!oaId) return
  detailLoading.value = true
  try {
    const res = await sendAction({
      action: 'getNoticeDetail',
      oaId,
      ctrlProcId: typeof row.ctrl_proc_id === 'string' ? row.ctrl_proc_id : ''
    })
    if (res?.detail) detailInfo.value = res.detail
  } finally {
    detailLoading.value = false
  }
}

function patchQuery(targetTab: NoticeTabId, key: string, value: string | boolean): void {
  const target = queries[targetTab] as unknown as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value
  }
}

onMounted(async () => {
  await loadInit(false)
  await runSearch('import', false)
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
      @refresh-init="loadInit(true)"
      @upload-excel="handleExcelUpload"
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

    <NoticeResultTable
      :tab="activeTab"
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
      @open-easy="triggerAction('openEasyTab')"
    />

    <div v-if="detailOpen" class="mask app-dialog" @click.self="detailOpen = false">
      <div class="dialog with-table">
        <header>
          <h3>来文详情</h3>
          <button type="button" aria-label="关闭" @click="detailOpen = false">×</button>
        </header>
        <p v-if="detailLoading" class="hint">正在读取原站来文详情…</p>
        <div class="dialog-table notice-detail-scroll">
          <table>
            <tbody>
              <tr v-for="[k, v] in Object.entries(detailInfo ?? detailRow ?? {})" :key="k">
                <th style="width: 180px">{{ k }}</th>
                <td>{{ v == null ? '' : String(v) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <button type="button" class="solid" @click="detailOpen = false">关闭</button>
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
