<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../shell/components/WDatePicker.vue'
import {
  NOTICE_ORDERBY_OPTIONS,
  NOTICE_REPLAY_APPLY_TYPE_OPTIONS,
  NOTICE_UNGET_STATUS_OPTIONS,
  NOTICE_YES_NO_OPTIONS,
  createDefaultNoticeDownloadQuery,
  createDefaultNoticeImportQuery,
  createDefaultNoticeReplayQuery
} from '../../api/notice-params'
import type {
  NoticeDownloadQuery,
  NoticeImportQuery,
  NoticeInitData,
  NoticeReplayQuery
} from '../../api/notice-types'
import { downloadXlsxSheets } from '../../customer/xlsx-table'
import { isQueryGuid } from '../../query/query-validator'
import { createRecoveryClient } from '../../recovery/client'
import type { TreeOption } from '../../query/option-tree'
import { isRecord } from '../../shared/guards'
import { MessageType, type DualSystemStatusSnapshot, type MessageBridge } from '../../shared/message'
import type { CustomerMode } from '../../settings/customer-mode'
import { confirmDialog, infoDialog } from '../dialog'
import {
  checkDualEasySystems,
  createWorkflowBridge,
  openDualEasyLogin
} from '../services/full-page-bridge'
import {
  buildUnimportedUnionSheet,
  formatSystemSetLabel,
  type MergedReplayCheckRecord
} from '../../workflow/pct-notice-excel'
import {
  adaptImportQueryForSystem,
  createInitialSystemPipelineProgress,
  mergeCpcAccounts,
  runStep1ExportUnimportedUnion,
  runSystemParallelPipeline,
  type PctNoticeStepStatus,
  type Step1UnionResult,
  type SystemPipelineProgress,
  type UnifiedCpcAccount
} from '../../workflow/pct-notice-runner'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    isActive?: boolean
  }>(),
  { embedded: false, isActive: true }
)

defineEmits<{
  back: []
}>()

const STORAGE_KEY = 'patmail.pctNoticeWorkflow.params.v1'

const largeBridge: MessageBridge = createWorkflowBridge('pct-notice', 'large')
const smeBridge: MessageBridge = createWorkflowBridge('pct-notice', 'sme')

const checkingSystems = ref(false)
const dualStatus = ref<DualSystemStatusSnapshot | null>(null)
const largeInit = ref<NoticeInitData | null>(null)
const smeInit = ref<NoticeInitData | null>(null)
const loadingInit = ref(false)
const initError = ref('')

const syncDownloadDateWithReplay = ref(true)
const showMoreImportFields = ref(false)
const selectedAccountKeys = ref<string[]>([])

const defaultReplay = createDefaultNoticeReplayQuery()
const replayQuery = reactive<Omit<NoticeReplayQuery, 'account' | 'pageIndex' | 'pageSize'>>({
  applyType: '2',
  applyNo: defaultReplay.applyNo,
  caseName: defaultReplay.caseName,
  noticeName: defaultReplay.noticeName,
  xlh: defaultReplay.xlh,
  startTime: defaultReplay.startTime,
  endTime: defaultReplay.endTime
})

const defaultDownload = createDefaultNoticeDownloadQuery()
const downloadQuery = reactive<Omit<NoticeDownloadQuery, 'account' | 'pageIndex' | 'pageSize'>>({
  casename: defaultDownload.casename,
  appno: defaultDownload.appno,
  startTime: defaultDownload.startTime,
  endTime: defaultDownload.endTime,
  status: 'unprocess'
})

const defaultImport = createDefaultNoticeImportQuery()
const importQuery = reactive<Omit<NoticeImportQuery, 'pageIndex' | 'pageSize'>>({
  ...defaultImport,
  status: '0'
})

const recovery = createRecoveryClient()
type CloseRules = { closeCaseRule: string; closeCaseImportNotice: string }
type PctBatch = {
  id: string
  accounts: UnifiedCpcAccount[]
  replay: typeof replayQuery
  download: typeof downloadQuery
  importNotice: typeof importQuery
  smeImportNotice: typeof importQuery
  largeRules: CloseRules
  smeRules: CloseRules
  exportDispatched: boolean
  finished?: boolean
  progress?: { step1Status: PctNoticeStepStatus; step1Detail: string; large: SystemPipelineProgress; sme: SystemPipelineProgress }
}
const savedBatch = ref<PctBatch | null>(null)
const canResumeBatch = computed(() => Boolean(savedBatch.value && !savedBatch.value.finished))
const starting = ref(false)
let disposed = false

function batchScope(snap: DualSystemStatusSnapshot): string {
  return JSON.stringify(['pct-notice-batch', snap.large.origin, snap.large.operatorId.toLowerCase(),
    snap.sme.origin, snap.sme.operatorId.toLowerCase()])
}

function matchesQuery<T extends object>(value: unknown, shape: T): value is T {
  return isRecord(value) && Object.keys(value).length === Object.keys(shape).length &&
    Object.entries(shape).every(([key, expected]) => typeof value[key] === typeof expected)
}

function closeRules(data: NoticeInitData | null): CloseRules {
  return { closeCaseRule: data?.closeCaseRule ?? '1', closeCaseImportNotice: data?.closeCaseImportNotice ?? '0' }
}

async function readSavedBatch(snap: DualSystemStatusSnapshot): Promise<PctBatch | null> {
  const value = await recovery.get('workflow-desk', batchScope(snap))
  if (!value || (isRecord(value) && value.forgotten === true)) return null
  if (!isRecord(value) || typeof value.id !== 'string' || !isQueryGuid(value.id) ||
      typeof value.exportDispatched !== 'boolean' || !Array.isArray(value.accounts) || !value.accounts.length ||
      !value.accounts.every((account: unknown): account is UnifiedCpcAccount => isRecord(account) &&
        typeof account.key === 'string' && typeof account.label === 'string' &&
        (account.largeId === undefined || typeof account.largeId === 'string') &&
        (account.smeId === undefined || typeof account.smeId === 'string') &&
        Boolean(account.largeId || account.smeId)) ||
      !matchesQuery(value.replay, replayQuery) || !matchesQuery(value.download, downloadQuery) ||
      !matchesQuery(value.importNotice, importQuery) || value.importNotice.status !== '0' ||
      !matchesQuery(value.smeImportNotice, importQuery) || value.smeImportNotice.status !== '0' ||
      !matchesQuery(value.largeRules, closeRules(null)) || !matchesQuery(value.smeRules, closeRules(null))) {
    throw new Error('PCT 批次恢复记录无效，请核对上一次执行。')
  }
  const progress = isRecord(value.progress) ? value.progress : undefined
  return { id: value.id, exportDispatched: value.exportDispatched, accounts: value.accounts,
    finished: value.finished === true,
    replay: value.replay, download: value.download, importNotice: value.importNotice,
    smeImportNotice: value.smeImportNotice, largeRules: value.largeRules, smeRules: value.smeRules,
    progress: progress && typeof progress.step1Status === 'string' && typeof progress.step1Detail === 'string' &&
      matchesQuery(progress.large, createInitialSystemPipelineProgress('large')) && progress.large.mode === 'large' && Array.isArray(progress.large.logs) &&
      matchesQuery(progress.sme, createInitialSystemPipelineProgress('sme')) && progress.sme.mode === 'sme' && Array.isArray(progress.sme.logs)
      ? progress as PctBatch['progress'] : undefined }
}

function loadSavedParams(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (Array.isArray(parsed.selectedAccountKeys)) {
      selectedAccountKeys.value = parsed.selectedAccountKeys.filter((v): v is string => typeof v === 'string')
    }
    if (typeof parsed.syncDownloadDateWithReplay === 'boolean') {
      syncDownloadDateWithReplay.value = parsed.syncDownloadDateWithReplay
    }
    if (parsed.replayQuery && typeof parsed.replayQuery === 'object') {
      Object.assign(replayQuery, parsed.replayQuery)
    }
    if (parsed.downloadQuery && typeof parsed.downloadQuery === 'object') {
      Object.assign(downloadQuery, parsed.downloadQuery)
    }
    if (parsed.importQuery && typeof parsed.importQuery === 'object') {
      Object.assign(importQuery, parsed.importQuery, { status: '0' })
    }
  } catch { /* ignore */ }
}

function saveParams(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedAccountKeys: selectedAccountKeys.value,
        syncDownloadDateWithReplay: syncDownloadDateWithReplay.value,
        replayQuery: { ...replayQuery },
        downloadQuery: { ...downloadQuery },
        importQuery: { ...importQuery, status: '0' }
      })
    )
  } catch { /* ignore */ }
}

loadSavedParams()
watch([selectedAccountKeys, syncDownloadDateWithReplay, replayQuery, downloadQuery, importQuery], saveParams, { deep: true })

watch(
  [() => replayQuery.startTime, () => replayQuery.endTime, syncDownloadDateWithReplay],
  ([start, end, synced]) => {
    if (!synced) return
    downloadQuery.startTime = start
    downloadQuery.endTime = end
  },
  { immediate: true }
)

const unifiedAccounts = computed<UnifiedCpcAccount[]>(() =>
  mergeCpcAccounts(largeInit.value?.cpcAccounts ?? [], smeInit.value?.cpcAccounts ?? [])
)

const selectedAccounts = computed(() => {
  const picked = new Set(selectedAccountKeys.value)
  return unifiedAccounts.value.filter(acc => picked.has(acc.key))
})

const applyTypeOptions = computed(() => [
  { value: '', label: '全部申请类型' },
  ...(largeInit.value?.applyTypes ?? []).map(item => ({ value: item.value, label: item.label }))
])

const agencyOptions = computed(() => [
  { value: '', label: '全部代理机构' },
  ...(largeInit.value?.agencies ?? []).map(item => ({ value: item.value, label: item.label }))
])

const fileTypeTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.fileTypes ?? []).map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
)

const directionTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.directions ?? []).map(item => ({ value: item.value, label: item.label }))
)

const tagTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.applyTags ?? []).map(item => ({ value: item.value, label: item.label }))
)

const branchTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.branches ?? []).map(item => ({ value: item.value, label: item.label }))
)

const countryTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.countries ?? []).map(item => ({
    value: item.value,
    label: item.label,
    ...(item.parent ? { parent: item.parent } : {})
  }))
)

const userTreeOptions = computed<TreeOption[]>(() =>
  (largeInit.value?.users ?? []).map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
)

function treeStatus(list: readonly unknown[]): 'loading' | 'ready' | 'empty' {
  if (list.length > 0) return 'ready'
  if (loadingInit.value) return 'loading'
  return 'empty'
}

function toggleAccount(key: string, checked: boolean): void {
  const next = new Set(selectedAccountKeys.value)
  if (checked) next.add(key)
  else next.delete(key)
  selectedAccountKeys.value = [...next]
}

function selectAllAccounts(): void {
  selectedAccountKeys.value = unifiedAccounts.value.map(a => a.key)
}

function clearAllAccounts(): void {
  selectedAccountKeys.value = []
}

async function loadDualInit(force = false): Promise<void> {
  if (!dualStatus.value?.allReady) return
  if (!force && largeInit.value && smeInit.value) return
  loadingInit.value = true
  initError.value = ''
  try {
    const [largeRes, smeRes] = await Promise.all([
      largeBridge.request({ type: MessageType.LoadNoticeInit }),
      smeBridge.request({ type: MessageType.LoadNoticeInit })
    ])
    if (largeRes.type === MessageType.LoadNoticeInitResult && largeRes.payload.ok) {
      largeInit.value = largeRes.payload.data
    } else {
      initError.value = largeRes.type === MessageType.Error
        ? `大客户字典加载失败：${largeRes.payload.message}`
        : '大客户字典加载失败。'
    }
    if (smeRes.type === MessageType.LoadNoticeInitResult && smeRes.payload.ok) {
      smeInit.value = smeRes.payload.data
    } else if (!initError.value) {
      initError.value = smeRes.type === MessageType.Error
        ? `中小客户字典加载失败：${smeRes.payload.message}`
        : '中小客户字典加载失败。'
    }
    if (selectedAccountKeys.value.length === 0 && unifiedAccounts.value.length > 0) {
      selectAllAccounts()
    }
    if (!syncDownloadDateWithReplay.value && !downloadQuery.startTime && largeInit.value?.defaultTzsStartDate) {
      downloadQuery.startTime = largeInit.value.defaultTzsStartDate
    }
  } finally {
    loadingInit.value = false
  }
}

async function silentCheckDualSystems(): Promise<DualSystemStatusSnapshot | null> {
  if (checkingSystems.value || running.value || disposed) return null
  checkingSystems.value = true
  try {
    const snap = await checkDualEasySystems()
    if (disposed) return null
    const previous = dualStatus.value
    if (previous && snap && batchScope(previous) !== batchScope(snap)) {
      largeInit.value = null
      smeInit.value = null
    }
    dualStatus.value = snap
    if (snap?.allReady) {
      void loadDualInit(false)
      if (!running.value) {
        savedBatch.value = await readSavedBatch(snap).catch((error: unknown) => {
          runError.value = error instanceof Error ? error.message : 'PCT 批次账本不可用。'
          return null
        })
        restoreBatchProgress(savedBatch.value)
      }
    } else if (previous && snap && batchScope(previous) !== batchScope(snap)) {
      savedBatch.value = null
      restoreBatchProgress(null)
    }
    return snap
  } finally {
    checkingSystems.value = false
  }
}

async function openLogin(mode: CustomerMode): Promise<void> {
  await openDualEasyLogin(mode)
}

onMounted(() => {
  if (props.isActive) {
    void silentCheckDualSystems()
  }
})

watch(
  () => props.isActive,
  active => {
    if (active && !checkingSystems.value) {
      void silentCheckDualSystems()
    }
  }
)

const running = ref(false)
const runError = ref('')
const step1Status = ref<PctNoticeStepStatus>('idle')
const step1Detail = ref('等待执行')
const step1Result = ref<Step1UnionResult | null>(null)
const step1Logs = ref<string[]>([])
const largeProgress = ref<SystemPipelineProgress>(createInitialSystemPipelineProgress('large'))
const smeProgress = ref<SystemPipelineProgress>(createInitialSystemPipelineProgress('sme'))
let activeController: AbortController | null = null
let activeRunId: string | null = null

function restoreBatchProgress(batch: PctBatch | null): void {
  const progress = batch?.progress
  step1Result.value = null
  step1Logs.value = []
  if (!progress) {
    step1Status.value = 'idle'
    step1Detail.value = batch ? '上次批次已保存；阶段进度不可用，续办前将核验写入回执。' : '等待执行'
    largeProgress.value = createInitialSystemPipelineProgress('large')
    smeProgress.value = createInitialSystemPipelineProgress('sme')
    return
  }
  step1Status.value = progress.step1Status === 'running' ? 'paused' : progress.step1Status
  step1Detail.value = progress.step1Status === 'running' ? `页面刷新时中断：${progress.step1Detail}` : progress.step1Detail
  const restoreSystem = (saved: SystemPipelineProgress): SystemPipelineProgress => ({
    ...saved,
    step4Status: saved.step4Status === 'running' ? 'paused' : saved.step4Status,
    step5Status: saved.step5Status === 'running' ? 'paused' : saved.step5Status,
    step6Status: saved.step6Status === 'running' ? 'paused' : saved.step6Status,
    step4Detail: saved.step4Status === 'running' ? `页面刷新时中断：${saved.step4Detail}` : saved.step4Detail,
    step5Detail: saved.step5Status === 'running' ? `页面刷新时中断：${saved.step5Detail}` : saved.step5Detail,
    step6Detail: saved.step6Status === 'running' ? `页面刷新时中断：${saved.step6Detail}` : saved.step6Detail
  })
  largeProgress.value = restoreSystem(progress.large)
  smeProgress.value = restoreSystem(progress.sme)
}

function snapshotProgress(): NonNullable<PctBatch['progress']> {
  return { step1Status: step1Status.value, step1Detail: step1Detail.value,
    large: { ...largeProgress.value, logs: [] }, sme: { ...smeProgress.value, logs: [] } }
}

function persistProgress(runId: string, scope: string, batch: PctBatch): void {
  if (activeRunId !== runId) return
  const next = { ...batch, progress: snapshotProgress() }
  if (JSON.stringify(savedBatch.value?.progress) === JSON.stringify(next.progress)) return
  savedBatch.value = next
  void recovery.put('workflow-desk', scope, next).catch(() => {
    if (activeRunId === runId) runError.value = '阶段进度未能写入恢复账本，刷新后将显示最后一次已保存的进度。'
  })
}

onBeforeUnmount(() => {
  disposed = true
  activeRunId = null
  activeController?.abort()
})

const precheckOk = computed(() => Boolean(dualStatus.value?.allReady))
const writeOpen = computed(() => Boolean(dualStatus.value?.writeSwitchOpen))

const previewRows = computed<MergedReplayCheckRecord[]>(() =>
  step1Result.value ? step1Result.value.mergedRows.slice(0, 200) : []
)

function downloadUnionExcel(): void {
  if (!step1Result.value) return
  const sheetRows = buildUnimportedUnionSheet(step1Result.value.mergedRows)
  const dateStamp = new Date().toISOString().slice(0, 10)
  downloadXlsxSheets(
    [{ name: '未导入核对清单并集', rows: sheetRows, freezeHeader: true }],
    `PCT来文未导入核对清单并集_${dateStamp}.xlsx`
  )
}

function statusBadgeLabel(status: PctNoticeStepStatus): string {
  switch (status) {
    case 'running':
      return '执行中'
    case 'done':
      return '已完成'
    case 'error':
      return '失败'
    case 'paused':
      return '已暂停'
    case 'skipped':
      return '已跳过'
    default:
      return '待执行'
  }
}

async function executeStep1Only(): Promise<void> {
  if (running.value || starting.value || checkingSystems.value || disposed) return
  starting.value = true
  try {
    await runStep1Only()
  } finally {
    starting.value = false
  }
}

async function runStep1Only(): Promise<void> {
  const snap = await silentCheckDualSystems()
  if (!snap?.allReady) {
    await infoDialog({ title: '预准备未通过', message: '请先确保大客户与中小客户系统均在线后再执行。' })
    return
  }
  await loadDualInit(false)
  if (disposed) return
  if (selectedAccounts.value.length === 0) {
    await infoDialog({ title: '提示', message: '请至少勾选一个收文账号。' })
    return
  }

  activeController = new AbortController()
  running.value = true
  runError.value = ''
  step1Status.value = 'running'
  step1Detail.value = '正在并行导出双系统来文二次下载清单…'
  step1Logs.value = []
  try {
    const res = await runStep1ExportUnimportedUnion({
      largeBridge,
      smeBridge,
      accounts: selectedAccounts.value,
      replayQuery: { ...replayQuery },
      onLog: (mode, msg) => {
        step1Logs.value.push(`[${mode === 'large' ? '大客户' : '中小客户'}] ${msg}`)
      },
      signal: activeController.signal
    })
    if (disposed) return
    step1Result.value = res
    step1Status.value = 'done'
    step1Detail.value = `大客户未导入 ${res.large.unimportedRows} 条 · 中小客户未导入 ${res.sme.unimportedRows} 条 · 并集 ${res.mergedRows.length} 条`
    downloadUnionExcel()
  } catch (error) {
    step1Status.value = 'error'
    runError.value = error instanceof Error ? error.message : '导出未导入并集清单失败。'
    step1Detail.value = runError.value
  } finally {
    running.value = false
    activeController = null
  }
}

async function executeFullWorkflow(): Promise<void> {
  if (running.value || starting.value || checkingSystems.value || disposed) return
  starting.value = true
  try {
    await runFullWorkflow()
  } finally {
    starting.value = false
  }
}

async function runFullWorkflow(): Promise<void> {
  const snap = await silentCheckDualSystems()
  if (!snap?.allReady) {
    await infoDialog({ title: '预准备未通过', message: '请先确保大客户与中小客户系统均在线后再执行。' })
    return
  }
  if (!snap.writeSwitchOpen) {
    await infoDialog({ title: '写开关未开启', message: '全流程会执行删除待下载、二次分析与导入系统等写操作，请先在「系统设置」开启写开关。' })
    return
  }
  await loadDualInit(false)
  if (disposed) return
  let batch: PctBatch
  const scope = batchScope(snap)
  let resuming = false
  try {
    const stored = await readSavedBatch(snap)
    const previous = stored?.finished ? null : stored
    if (!previous && selectedAccounts.value.length === 0) {
      await infoDialog({ title: '提示', message: '请至少勾选一个收文账号。' })
      return
    }
    resuming = previous !== null
    if (!previous && (!largeInit.value || !smeInit.value)) {
      throw new Error('两套系统的字典或导入规则未加载，请刷新预准备后再执行。')
    }
    batch = previous ?? {
      id: crypto.randomUUID(), accounts: selectedAccounts.value.map(account => ({ ...account })),
      replay: { ...replayQuery }, download: { ...downloadQuery },
      importNotice: { ...importQuery, status: '0' },
      smeImportNotice: adaptImportQueryForSystem(importQuery, largeInit.value, smeInit.value),
      largeRules: closeRules(largeInit.value), smeRules: closeRules(smeInit.value), exportDispatched: false
    }
  } catch (error) {
    runError.value = error instanceof Error ? error.message : 'PCT 批次账本不可用。'
    return
  }
  const confirmed = await confirmDialog({
    title: resuming ? '确认续办上次 PCT 批次？' : '确认执行「pct官文下载上传」全流程？',
    message: resuming ? `将使用上次确认的条件和 ${batch.accounts.length} 个收文账号续办。已确认的目标会跳过，回执未确认的写操作会停止派发。`
      : `已勾选 ${batch.accounts.length} 个收文账号，将执行：\n1. 双系统并行导出未导入核对清单并取并集\n2. 双系统并行清理来文下载中 PCT/ 开头官文\n3. 来文二次下载全量分析（含已导入与未导入）\n4. 导入来文两轮全选导入系统`,
    confirmLabel: resuming ? '续办' : '开始执行',
    cancelLabel: '取消'
  })
  if (!confirmed || disposed || running.value) return

  activeController = new AbortController()
  activeRunId = batch.id
  running.value = true
  runError.value = ''
  step1Status.value = 'running'
  step1Detail.value = '正在并行导出双系统来文二次下载清单…'
  step1Logs.value = []
  largeProgress.value = createInitialSystemPipelineProgress('large')
  smeProgress.value = createInitialSystemPipelineProgress('sme')
  batch = { ...batch, progress: snapshotProgress() }

  let checkpointOpened = false
  try {
    await recovery.put('workflow-desk', scope, batch)
    checkpointOpened = true
    if (activeRunId !== batch.id) return
    savedBatch.value = batch
    if (!batch.exportDispatched) {
      const res = await runStep1ExportUnimportedUnion({
        largeBridge,
        smeBridge,
        accounts: batch.accounts,
        replayQuery: batch.replay,
        onLog: (mode, msg) => {
          if (activeRunId !== batch.id) return
          step1Logs.value.push(`[${mode === 'large' ? '大客户' : '中小客户'}] ${msg}`)
        },
        signal: activeController.signal
      })
      if (activeRunId !== batch.id) return
      step1Result.value = res
      step1Status.value = 'done'
      step1Detail.value = `大客户未导入 ${res.large.unimportedRows} 条 · 中小客户未导入 ${res.sme.unimportedRows} 条 · 并集 ${res.mergedRows.length} 条`
      batch = { ...batch, exportDispatched: true, progress: snapshotProgress() }
      await recovery.put('workflow-desk', scope, batch)
      if (activeRunId !== batch.id) return
      savedBatch.value = batch
      downloadUnionExcel()
    } else {
      step1Status.value = 'skipped'
      step1Detail.value = '上次批次已启动清单下载，可单独重新导出。'
      persistProgress(batch.id, scope, batch)
    }

    const results = await Promise.allSettled([
      runSystemParallelPipeline({
        mode: 'large',
        bridge: largeBridge,
        accounts: batch.accounts,
        replayQuery: batch.replay,
        downloadQuery: batch.download,
        importQuery: batch.importNotice,
        initData: batch.largeRules,
        walOwner: { runId: batch.id, origin: snap.large.origin, operatorId: snap.large.operatorId },
        onProgress: next => { if (activeRunId === batch.id) { largeProgress.value = next; persistProgress(batch.id, scope, batch) } },
        signal: activeController.signal
      }),
      runSystemParallelPipeline({
        mode: 'sme',
        bridge: smeBridge,
        accounts: batch.accounts,
        replayQuery: batch.replay,
        downloadQuery: batch.download,
        importQuery: batch.smeImportNotice,
        initData: batch.smeRules,
        walOwner: { runId: batch.id, origin: snap.sme.origin, operatorId: snap.sme.operatorId },
        onProgress: next => { if (activeRunId === batch.id) { smeProgress.value = next; persistProgress(batch.id, scope, batch) } },
        signal: activeController.signal
      })
    ])
    if (activeRunId !== batch.id) return
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason instanceof Error ? failed.reason : new Error('PCT 批次未全部完成。')
    const complete = { ...batch, finished: true, progress: snapshotProgress() }
    await recovery.put('workflow-desk', scope, complete)
    if (activeRunId === batch.id) savedBatch.value = complete
  } catch (error) {
    if (activeRunId !== batch.id) return
    if (step1Status.value === 'running') {
      step1Status.value = 'error'
      step1Detail.value = error instanceof Error ? error.message : '第一步执行失败'
    }
    runError.value = error instanceof Error ? error.message : '工作流执行失败。'
    if (checkpointOpened) persistProgress(batch.id, scope, batch)
  } finally {
    if (activeRunId === batch.id) {
      running.value = false
      activeController = null
      activeRunId = null
    }
  }
}

function abortExecution(): void {
  activeController?.abort()
}
</script>

<template>
  <div class="pct-notice-page">
    <!-- 预准备状态栏（后台静默检查） -->
    <section class="card precheck-card">
      <div class="section-head">
        <div>
          <h3>预准备检查（后台静默检测）</h3>
          <p class="hint">工作流要求大客户与中小客户系统同时在线；执行全流程需开启写开关。</p>
        </div>
        <button type="button" class="ghost" :disabled="checkingSystems || running || starting" @click="silentCheckDualSystems">
          {{ checkingSystems ? '正在检测…' : '重新检测' }}
        </button>
      </div>

      <div class="precheck-grid">
        <div class="precheck-item" :class="{ ok: dualStatus?.large.ready, fail: dualStatus && !dualStatus.large.ready }">
          <div class="precheck-title">
            <b>大客户系统</b>
            <span class="pill">{{ dualStatus?.large.ready ? '在线' : '未就绪' }}</span>
          </div>
          <p>{{ dualStatus?.large.message || '正在后台静默检测大客户系统…' }}</p>
          <div v-if="dualStatus && !dualStatus.large.ready" class="precheck-actions">
            <button type="button" class="solid tiny" @click="openLogin('large')">打开大客户系统登录</button>
          </div>
        </div>

        <div class="precheck-item" :class="{ ok: dualStatus?.sme.ready, fail: dualStatus && !dualStatus.sme.ready }">
          <div class="precheck-title">
            <b>中小客户系统</b>
            <span class="pill">{{ dualStatus?.sme.ready ? '在线' : '未就绪' }}</span>
          </div>
          <p>{{ dualStatus?.sme.message || '正在后台静默检测中小客户系统…' }}</p>
          <div v-if="dualStatus && !dualStatus.sme.ready" class="precheck-actions">
            <button type="button" class="solid tiny" @click="openLogin('sme')">打开中小客户系统登录</button>
          </div>
        </div>

        <div class="precheck-item" :class="{ ok: writeOpen, warn: dualStatus && !writeOpen }">
          <div class="precheck-title">
            <b>全局写开关</b>
            <span class="pill">{{ writeOpen ? '已开启' : '未开启' }}</span>
          </div>
          <p>{{ writeOpen ? '可执行删除 PCT/、二次分析与导入系统。' : '当前为只读模式：可先导出第一步并集清单；执行全流程需到「系统设置」开启写开关。' }}</p>
        </div>
      </div>

      <div v-if="dualStatus && !dualStatus.allReady" class="guide-banner">
        <strong>预准备不通过指引：</strong>
        <span>请分别点击上方未就绪系统的「打开登录」按钮完成登录（或刷新已打开的 EASY 页面），然后点击「重新检测」。</span>
      </div>
      <p v-if="initError" class="hint warn">{{ initError }}</p>
    </section>

    <!-- 参数配置区 -->
    <section class="card params-card">
      <div class="section-head">
        <h3>1. 收文账号（多选遍历）</h3>
        <div class="inline-actions">
          <button type="button" class="ghost tiny" :disabled="!precheckOk || loadingInit || running" @click="loadDualInit(true)">
            {{ loadingInit ? '加载中…' : '刷新账号与字典' }}
          </button>
          <button type="button" class="ghost tiny" :disabled="unifiedAccounts.length === 0 || running" @click="selectAllAccounts">全选</button>
          <button type="button" class="ghost tiny" :disabled="selectedAccountKeys.length === 0 || running" @click="clearAllAccounts">清空</button>
        </div>
      </div>
      <p class="hint">原站为单选下拉框，此处已改为勾选框，运行时将依次遍历所有勾选的收文账号。</p>
      <div v-if="unifiedAccounts.length > 0" class="account-checks">
        <label v-for="acc in unifiedAccounts" :key="acc.key" class="account-chip">
          <input
            type="checkbox"
            :checked="selectedAccountKeys.includes(acc.key)"
            :disabled="running"
            @change="toggleAccount(acc.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ acc.label }}</span>
          <small v-if="!acc.largeId" class="only-tag">仅中小</small>
          <small v-else-if="!acc.smeId" class="only-tag">仅大客户</small>
        </label>
      </div>
      <p v-else class="hint">{{ precheckOk ? (loadingInit ? '正在加载双系统收文账号…' : '未读取到可用收文账号。') : '双系统均在线后自动加载收文账号列表。' }}</p>
    </section>

    <section class="card params-card">
      <h3>2. 「来文二次下载」与「来文下载」查询条件</h3>
      <div class="sub-block">
        <h4>来文二次下载条件（用于步骤 1 导出并集 &amp; 步骤 5 全量分析）</h4>
        <div class="form-grid">
          <label class="field">
            <span>申请类型</span>
            <ThemeSelect
              :model-value="replayQuery.applyType"
              :options="[...NOTICE_REPLAY_APPLY_TYPE_OPTIONS]"
              :disabled="running"
              @update:model-value="replayQuery.applyType = String($event) as '' | '1' | '2' | '3'"
            />
          </label>
          <label class="field">
            <span>发文日期</span>
            <div class="date-pair">
              <WDatePicker v-model="replayQuery.startTime" :max="replayQuery.endTime" placeholder="开始日期" />
              <span>到</span>
              <WDatePicker v-model="replayQuery.endTime" :min="replayQuery.startTime" placeholder="结束日期" />
            </div>
          </label>
          <label class="field">
            <span>申请号</span>
            <input v-model="replayQuery.applyNo" type="text" placeholder="请输入申请号" :disabled="running" />
          </label>
          <label class="field">
            <span>发明创造名称</span>
            <input v-model="replayQuery.caseName" type="text" placeholder="请输入发明创造名称" :disabled="running" />
          </label>
          <label class="field">
            <span>来文名称</span>
            <input v-model="replayQuery.noticeName" type="text" placeholder="请输入通知书名称" :disabled="running" />
          </label>
          <label class="field">
            <span>发文序号</span>
            <input v-model="replayQuery.xlh" type="text" placeholder="请输入发文序列号" :disabled="running" />
          </label>
        </div>
      </div>

      <div class="sub-block">
        <div class="section-head">
          <h4>来文下载条件（用于步骤 4 删除 PCT/ 开头官文）</h4>
          <label class="page-check">
            <input v-model="syncDownloadDateWithReplay" type="checkbox" :disabled="running" />
            <span>发文日期与「来文二次下载」同步</span>
          </label>
        </div>
        <div class="form-grid">
          <label class="field">
            <span>下载状态</span>
            <ThemeSelect
              :model-value="downloadQuery.status"
              :options="[...NOTICE_UNGET_STATUS_OPTIONS]"
              :disabled="running"
              @update:model-value="downloadQuery.status = String($event) as '' | 'unprocess' | 'process'"
            />
          </label>
          <label class="field">
            <span>发文日期</span>
            <div class="date-pair">
              <WDatePicker v-model="downloadQuery.startTime" :max="downloadQuery.endTime" placeholder="开始日期" />
              <span>到</span>
              <WDatePicker v-model="downloadQuery.endTime" :min="downloadQuery.startTime" placeholder="结束日期" />
            </div>
          </label>
          <label class="field">
            <span>申请号</span>
            <input v-model="downloadQuery.appno" type="text" placeholder="请输入申请号" :disabled="running" />
          </label>
          <label class="field">
            <span>发明创造名称</span>
            <input v-model="downloadQuery.casename" type="text" placeholder="请输入发明创造名称" :disabled="running" />
          </label>
        </div>
      </div>
    </section>

    <section class="card params-card">
      <div class="section-head">
        <h3>3. 「导入来文」查询条件（步骤 6 两轮导入，固定查未处理）</h3>
        <button type="button" class="ghost tiny" @click="showMoreImportFields = !showMoreImportFields">
          {{ showMoreImportFields ? '收起更多条件' : '展开更多条件' }}
        </button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>官方发文日</span>
          <div class="date-pair">
            <WDatePicker v-model="importQuery.post_date_s" :max="importQuery.post_date_e" placeholder="开始日期" />
            <span>到</span>
            <WDatePicker v-model="importQuery.post_date_e" :min="importQuery.post_date_s" placeholder="结束日期" />
          </div>
        </label>
        <label class="field">
          <span>下载日期</span>
          <div class="date-pair">
            <WDatePicker v-model="importQuery.xiazairq_s" :max="importQuery.xiazairq_e" placeholder="开始日期" />
            <span>到</span>
            <WDatePicker v-model="importQuery.xiazairq_e" :min="importQuery.xiazairq_s" placeholder="结束日期" />
          </div>
        </label>
        <label class="field">
          <span>来文分析日期</span>
          <div class="date-pair">
            <WDatePicker v-model="importQuery.update_time_s" :max="importQuery.update_time_e" placeholder="开始日期" />
            <span>到</span>
            <WDatePicker v-model="importQuery.update_time_e" :min="importQuery.update_time_s" placeholder="结束日期" />
          </div>
        </label>
        <label class="field">
          <span>申请类型</span>
          <ThemeSelect
            :model-value="importQuery.apply_type"
            :options="applyTypeOptions"
            :disabled="running"
            @update:model-value="importQuery.apply_type = String($event)"
          />
        </label>
        <label class="field">
          <span>来文类型</span>
          <TreeOptionSelect
            :model-value="importQuery.filedesc"
            :options="fileTypeTreeOptions"
            :status="treeStatus(fileTypeTreeOptions)"
            empty-text="选择来文类型"
            @update:model-value="importQuery.filedesc = $event"
          />
        </label>
        <label class="field">
          <span>申请号</span>
          <textarea v-model="importQuery.app_no" rows="2" placeholder="多个用分号/空格/换行分隔" :disabled="running" />
        </label>
        <label class="field">
          <span>我方文号</span>
          <div class="textarea-wrap">
            <textarea v-model="importQuery.case_volume" rows="2" placeholder="多个用分号/空格/换行分隔" :disabled="running" />
            <label class="page-check">
              <input v-model="importQuery.is_fuzzy_query_case_volume" type="checkbox" :disabled="running" />
              <span>模糊查询</span>
            </label>
          </div>
        </label>
      </div>

      <div v-if="showMoreImportFields" class="form-grid extra-grid">
        <label class="field">
          <span>客户名称</span>
          <input v-model="importQuery.customer_name" type="text" placeholder="请输入客户名称" :disabled="running" />
        </label>
        <label class="field">
          <span>客户代码</span>
          <input v-model="importQuery.customer_code" type="text" placeholder="请输入客户代码" :disabled="running" />
        </label>
        <label class="field">
          <span>申请人</span>
          <input v-model="importQuery.applicant_name" type="text" placeholder="请输入申请人" :disabled="running" />
        </label>
        <label class="field">
          <span>第一申请人行政区划</span>
          <input v-model="importQuery.app_area_name" type="text" placeholder="例如：广东省深圳市" :disabled="running" />
        </label>
        <label class="field">
          <span>代理机构</span>
          <ThemeSelect :model-value="importQuery.agency_id" :options="agencyOptions" @update:model-value="importQuery.agency_id = String($event)" />
        </label>
        <label class="field">
          <span>案件流向</span>
          <TreeOptionSelect :model-value="importQuery.flow_direction" :options="directionTreeOptions" :status="treeStatus(directionTreeOptions)" empty-text="选择案件流向" @update:model-value="importQuery.flow_direction = $event" />
        </label>
        <label class="field">
          <span>分析人员</span>
          <TreeOptionSelect :model-value="importQuery.assayer" :options="userTreeOptions" :status="treeStatus(userTreeOptions)" empty-text="选择分析人员" @update:model-value="importQuery.assayer = $event" />
        </label>
        <label class="field">
          <span>业务助理</span>
          <TreeOptionSelect :model-value="importQuery.sales_help" :options="userTreeOptions" :status="treeStatus(userTreeOptions)" empty-text="选择业务助理" @update:model-value="importQuery.sales_help = $event" />
        </label>
        <label class="field">
          <span>所属分部</span>
          <TreeOptionSelect :model-value="importQuery.branch_dept_id" :options="branchTreeOptions" :status="treeStatus(branchTreeOptions)" empty-text="选择所属分部" @update:model-value="importQuery.branch_dept_id = $event" />
        </label>
        <label class="field">
          <span>专利标签</span>
          <TreeOptionSelect :model-value="importQuery.apply_tags_id" :options="tagTreeOptions" :status="treeStatus(tagTreeOptions)" empty-text="选择专利标签" @update:model-value="importQuery.apply_tags_id = $event" />
        </label>
        <label class="field">
          <span>客户国家(地区)</span>
          <TreeOptionSelect :model-value="importQuery.customer_country" :options="countryTreeOptions" :status="treeStatus(countryTreeOptions)" empty-text="选择国家(地区)" @update:model-value="importQuery.customer_country = $event" />
        </label>
        <label class="field">
          <span>外部案源人</span>
          <input v-model="importQuery.introducer" type="text" placeholder="请输入外部案源人" :disabled="running" />
        </label>
        <label class="field">
          <span>优先审查</span>
          <ThemeSelect :model-value="importQuery.is_speed_checkd" :options="[...NOTICE_YES_NO_OPTIONS]" @update:model-value="importQuery.is_speed_checkd = String($event) as '' | '1' | '0'" />
        </label>
        <label class="field">
          <span>预审案件</span>
          <ThemeSelect :model-value="importQuery.hearing_the_case" :options="[...NOTICE_YES_NO_OPTIONS]" @update:model-value="importQuery.hearing_the_case = String($event) as '' | '1' | '0'" />
        </label>
        <label class="field">
          <span>案件中是否导入</span>
          <ThemeSelect :model-value="importQuery.files_is_case" :options="[...NOTICE_YES_NO_OPTIONS]" @update:model-value="importQuery.files_is_case = String($event) as '' | '1' | '0'" />
        </label>
        <label class="field">
          <span>排序栏位</span>
          <ThemeSelect :model-value="importQuery.orderby" :options="[...NOTICE_ORDERBY_OPTIONS]" @update:model-value="importQuery.orderby = String($event) as NoticeImportQuery['orderby']" />
        </label>
      </div>
    </section>

    <!-- 执行控制 -->
    <section class="card action-bar">
      <div class="action-buttons">
        <button type="button" class="ghost" :disabled="starting || checkingSystems || running || !precheckOk || selectedAccounts.length === 0" @click="executeStep1Only">
          仅导出未导入并集清单（第一步）
        </button>
        <button type="button" class="solid" :disabled="starting || checkingSystems || running || !precheckOk || !writeOpen || (!canResumeBatch && selectedAccounts.length === 0)" @click="executeFullWorkflow">
          {{ running ? '正在执行…' : canResumeBatch ? '续办上次全流程' : '开始执行全流程（1 → 4 → 5 → 6）' }}
        </button>
        <button v-if="running" type="button" class="ghost warn-btn" @click="abortExecution">中止执行</button>
      </div>
      <p v-if="runError" class="hint warn">{{ runError }}</p>
    </section>

    <!-- 第一步结果与预览 -->
    <section class="card progress-card">
      <div class="section-head">
        <h3>第一步：来文二次下载未导入并集清单</h3>
        <div class="inline-actions">
          <span class="step-badge" :class="step1Status">{{ statusBadgeLabel(step1Status) }}</span>
          <button v-if="step1Result" type="button" class="ghost tiny" @click="downloadUnionExcel">重新下载并集 Excel</button>
        </div>
      </div>
      <p class="hint">{{ step1Detail }}</p>
      <div v-if="step1Logs.length" class="log-box">
        <div v-for="(line, idx) in step1Logs" :key="idx" class="log-line">{{ line }}</div>
      </div>
      <div v-if="previewRows.length" class="preview-table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>来源系统</th>
              <th>收文账号</th>
              <th>来文名称</th>
              <th>发文序列号</th>
              <th>官方发文日</th>
              <th>申请号</th>
              <th>发明创造名称</th>
              <th>是否导入系统</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.key">
              <td>{{ formatSystemSetLabel(row.systems) }}</td>
              <td>{{ row.account || row.accountLabels.join('、') }}</td>
              <td>{{ row.noticeName }}</td>
              <td>{{ row.fawenxlh }}</td>
              <td>{{ row.postDate }}</td>
              <td>{{ row.applyNo }}</td>
              <td>{{ row.caseName }}</td>
              <td>{{ row.importStatus }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 双系统并行进度监控 -->
    <div class="dual-progress-grid">
      <section v-for="prog in [largeProgress, smeProgress]" :key="prog.mode" class="card progress-card">
        <h3>{{ prog.mode === 'large' ? '大客户系统并行通道' : '中小客户系统并行通道' }}</h3>
        <div class="step-row">
          <span>步骤 4 · 来文下载删 PCT/</span>
          <span class="step-badge" :class="prog.step4Status">{{ statusBadgeLabel(prog.step4Status) }}</span>
          <small>{{ prog.step4Detail }}</small>
        </div>
        <div class="step-row">
          <span>步骤 5 · 来文二次下载全量分析</span>
          <span class="step-badge" :class="prog.step5Status">{{ statusBadgeLabel(prog.step5Status) }}</span>
          <small>{{ prog.step5Detail }}</small>
        </div>
        <div class="step-row">
          <span>步骤 6 · 导入来文两轮全选导入</span>
          <span class="step-badge" :class="prog.step6Status">{{ statusBadgeLabel(prog.step6Status) }}</span>
          <small>{{ prog.step6Detail }}</small>
        </div>
        <div v-if="prog.logs.length" class="log-box">
          <div v-for="(line, idx) in prog.logs" :key="idx" class="log-line">{{ line }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pct-notice-page { display: flex; flex-direction: column; gap: 16px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.inline-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.precheck-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
.precheck-item { border: 1px solid var(--line, #e2e8f0); border-radius: 10px; padding: 12px; background: var(--surface-soft, #f8fafc); }
.precheck-item.ok { border-color: #86efac; background: #f0fdf4; }
.precheck-item.fail { border-color: #fca5a5; background: #fef2f2; }
.precheck-item.warn { border-color: #fde047; background: #fefce8; }
.precheck-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.precheck-item p { margin: 0; font-size: 13px; color: var(--ink-2, #475569); }
.precheck-actions { margin-top: 8px; }
.pill { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(15, 23, 42, 0.08); }
.guide-banner { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; font-size: 13px; }
.account-checks { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.account-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--line, #e2e8f0); border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; }
.only-tag { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
.sub-block { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line, #e2e8f0); }
.sub-block h4 { margin: 0 0 10px; font-size: 14px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.extra-grid { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line, #e2e8f0); }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.field > span { font-weight: 600; color: var(--ink-2, #334155); }
.date-pair { display: flex; align-items: center; gap: 6px; }
.textarea-wrap { display: flex; flex-direction: column; gap: 6px; }
.action-bar { display: flex; flex-direction: column; gap: 8px; }
.action-buttons { display: flex; flex-wrap: wrap; gap: 10px; }
.dual-progress-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.step-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 8px 0; border-bottom: 1px solid var(--line, #f1f5f9); align-items: center; }
.step-row small { grid-column: 1 / -1; color: var(--ink-3, #64748b); }
.step-badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; color: #475569; }
.step-badge.running { background: #dbeafe; color: #1d4ed8; }
.step-badge.done { background: #dcfce7; color: #15803d; }
.step-badge.error { background: #fee2e2; color: #b91c1c; }
.step-badge.paused { background: #fef3c7; color: #92400e; }
.log-box { margin-top: 10px; max-height: 180px; overflow-y: auto; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-family: ui-monospace, monospace; }
.log-line { line-height: 1.5; }
.preview-table-wrap { margin-top: 12px; max-height: 320px; overflow: auto; }
.hint.warn { color: #b91c1c; }
</style>
