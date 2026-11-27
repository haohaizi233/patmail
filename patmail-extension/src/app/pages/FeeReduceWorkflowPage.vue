<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createRecoveryClient } from '../../recovery/client'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { createWorkflowBridge } from '../services/full-page-bridge'
import { confirmDialog, infoDialog } from '../dialog'
import { taskCheckSnapshot, type TaskCheckStatus } from '../check-progress'
import { useTopProgress, type TopProgress } from '../composables/useTopProgress'
import { useWriteSwitch } from '../../settings/use-write-switch'
import { readXlsxRows } from '../../customer/xlsx-table'
import { MessageType } from '../../shared/message'
import { isRecord } from '../../shared/guards'
import { accountScopeMatches, sameOperatorId, scopeFromConnection, type ExpectedAccountScope } from '../../shared/connection'
import { useWorkspace } from '../composables/useWorkspace'
import { feeInspectionJournal } from '../../workflow/fee-reduce-inspection-recovery'
import type {
  FeeReduceCaseInspectItem,
  FeeReduceReviewerOption,
  FeeReduceReviewerStrategy,
  FeeReduceSubmitRequest
} from '../../api/fee-reduce-types'
import {
  extractCaseVolumesFromSheet,
  parseCaseVolumeText,
  pickFeeReduceReviewer
} from '../../workflow/fee-reduce-input'

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

interface FeeReduceRowState {
  item: FeeReduceCaseInspectItem
  checked: boolean
  overrideReviewerId: string
  execStatus: 'idle' | 'running' | 'submitted' | 'failed' | 'unconfirmed' | 'queued' | 'skipped'
  execMessage: string
  account: ExpectedAccountScope
  filingId: string
  warnings: string[]
}

type SubmitOutcome = Awaited<ReturnType<typeof runSingleRow>>
const outcomeCode: Record<SubmitOutcome, string> = { submitted: 's', skipped: 'k', failed: 'f', verify: 'v', not_sent: 'n' }

const bridge = createWorkflowBridge('fee-reduce')
const recovery = createRecoveryClient()
const { connection } = useWorkspace()

const volumeInput = ref('')
const sheetName = ref('')
const sheetRows = ref<string[][]>([])
const sheetHeaders = ref<string[]>([])
const sheetColumnIndex = ref(0)

const inspecting = ref(false)
const loadingReviewers = ref(false)
const executing = ref(false)
const restoring = ref(false)
const restoredInspection = ref(false)
let disposed = false
let reviewVolumes = new Set<string>()
onBeforeUnmount(() => { disposed = true })
const statusNotice = ref('')
const errorNotice = ref('')
const progress = ref<TopProgress>({ visible: false, done: 0, total: 0, percent: 0, eta: '', status: 'idle', label: '', summary: '', detail: '' })
useTopProgress(computed(() => progress.value), computed(() => props.isActive))
const { open: writeOpen, setOpen: setWriteOpen } = useWriteSwitch()

const reviewers = ref<FeeReduceReviewerOption[]>([])
const reviewerAccount = ref<ExpectedAccountScope | null>(null)
const reviewerNodeName = ref('流程人员初核')
const reviewerStrategy = ref<FeeReduceReviewerStrategy>('first')
const defaultReviewerId = ref('')
const remark = ref('同意')
const oaName = ref('')
const concurrency = ref('6')

const rows = reactive<FeeReduceRowState[]>([])
const pausedBatch = ref<{ account: ExpectedAccountScope; rows: FeeReduceRowState[]; journalId: string } | null>(null)
const actionsLocked = computed(() => inspecting.value || executing.value || restoring.value)
const selectionLocked = computed(() => actionsLocked.value || restoredInspection.value || !!pausedBatch.value)
const recoveryScope = (account: ExpectedAccountScope) => JSON.stringify(['fee-reduce-batch', account.easyOrigin, account.operatorId.trim().toLowerCase()])
const cursorScope = (scope: string, id: string) => `${scope}:cursor:${id}`
const inspectionJournal = (account: ExpectedAccountScope) => feeInspectionJournal(recovery, `${recoveryScope(account)}:inspection`)
const recoveryPlaceholder = (caseVolume: string, account: ExpectedAccountScope, uncertain: boolean): FeeReduceRowState => ({
  item: { caseVolume, caseId: '', caseName: '', appNo: '', procId: '', procName: '', procStatus: '', state: 'error', reason: '恢复的批次需要先重新检索。' },
  checked: false, overrideReviewerId: '', execStatus: uncertain ? 'unconfirmed' : 'queued',
  execMessage: uncertain ? '刷新前回执待核对，请先重新检索。' : '本件尚未派发，请先重新检索。',
  account, filingId: '', warnings: []
})

async function beginBatch(account: ExpectedAccountScope, payloads: FeeReduceSubmitRequest[]) {
  const scope = recoveryScope(account)
  const previous = await recovery.get('workflow-desk', scope)
  let oldCursor: string | undefined
  if (previous !== null && !(isRecord(previous) && previous.forgotten === true)) {
    if (!isRecord(previous) || previous.kind !== 'fee-reduce-batch-v1' || typeof previous.id !== 'string') {
      throw new Error('无法识别上一次费减批次，请先核对恢复记录。')
    }
    oldCursor = cursorScope(scope, previous.id)
    const last = await recovery.get('workflow-desk', oldCursor)
    if (!isRecord(last) || !batchFinished(last, Array.isArray(previous.entries) ? previous.entries.length : 0)) {
      throw new Error('上一次费减批次仍需重新检索，请先处理恢复记录。')
    }
  }
  const id = crypto.randomUUID()
  const cursor = cursorScope(scope, id)
  const outcomes = Array.from({ length: payloads.length }, () => '.')
  const persist = (nextIndex: number) =>
    recovery.put('workflow-desk', cursor, { nextIndex, outcomes: outcomes.join('') })
  await persist(0)
  await recovery.put('workflow-desk', scope, {
    kind: 'fee-reduce-batch-v1', id, startedAt: Date.now(),
    entries: payloads.map(payload => ({ caseVolume: payload.caseVolume, overrideReviewerId: payload.overrideReviewerId ?? '' }))
  })
  if (oldCursor) void recovery.forget('workflow-desk', oldCursor).catch(() => undefined)
  return { outcomes, persist, id }
}

function batchFinished(cursor: Record<string, unknown>, count: number): boolean {
  return typeof cursor.outcomes === 'string' && cursor.outcomes.length === count && /^[skf]+$/.test(cursor.outcomes)
}

async function clearBatch(account: ExpectedAccountScope, id: string): Promise<void> {
  const scope = recoveryScope(account)
  const saved = await recovery.get('workflow-desk', scope)
  if (!isRecord(saved) || saved.kind !== 'fee-reduce-batch-v1' || saved.id !== id) {
    throw new Error('当前批次账本已变化，请重新打开费减工作台。')
  }
  await recovery.forget('workflow-desk', scope)
  await recovery.forget('workflow-desk', cursorScope(scope, id)).catch(() => undefined)
}
const canRecheckPaused = computed(() => {
  const current = scopeFromConnection(connection.value)
  const previous = pausedBatch.value?.account
  return current && previous && current.easyOrigin === previous.easyOrigin && sameOperatorId(current.operatorId, previous.operatorId)
})
const resultPageSize = 20
const resultPage = ref(1)
const showMissingOnly = ref(false)
const missingRows = computed(() => rows.filter(row => row.item.state === 'not_found'))
const tableRows = computed(() => showMissingOnly.value ? missingRows.value : rows)
const resultPageCount = computed(() => Math.max(1, Math.ceil(tableRows.value.length / resultPageSize)))
const visibleRows = computed(() => {
  const start = (resultPage.value - 1) * resultPageSize
  return tableRows.value.slice(start, start + resultPageSize)
})

function toggleMissingOnly() {
  showMissingOnly.value = !showMissingOnly.value
  resultPage.value = 1
}

const concurrencyOptions = [
  { value: '6', label: '6 路并发（默认）' },
  { value: '4', label: '4 路并发' },
  { value: '2', label: '2 路并发' },
  { value: '1', label: '1 路串行' }
]

const strategyOptions = [
  { value: 'first', label: '默认首位候选人' },
  { value: 'least_busy', label: '待办件数最少' },
  { value: 'specific', label: '指定初核人' }
]

const reviewerOptions = computed(() =>
  reviewers.value.map(r => ({
    value: r.userId,
    label: r.count === null ? r.name : `${r.name} (${r.count})`
  }))
)

const sheetColumnOptions = computed(() =>
  sheetHeaders.value.map((label, idx) => ({
    value: String(idx),
    label
  }))
)

const parsedVolumes = computed(() => parseCaseVolumeText(volumeInput.value))

const counts = computed(() => {
  let completed = 0
  let ready = 0
  let other = 0
  let submitted = 0
  for (const r of rows) {
    if (r.item.state === 'completed') completed += 1
    else if (r.item.state === 'ready') ready += 1
    else other += 1
    if (r.execStatus === 'submitted') submitted += 1
  }
  return { total: rows.length, completed, ready, other, submitted }
})

const selectedRows = computed(() => rows.filter(r => r.checked && r.item.state === 'ready' &&
  r.execStatus !== 'submitted' && r.execStatus !== 'unconfirmed'))

const resolvedDefaultReviewer = computed(() =>
  pickFeeReduceReviewer(reviewers.value, reviewerStrategy.value, defaultReviewerId.value)
)

function effectiveReviewerLabel(row: FeeReduceRowState): string {
  const picked = pickFeeReduceReviewer(
    reviewers.value,
    reviewerStrategy.value,
    defaultReviewerId.value,
    row.overrideReviewerId || undefined
  )
  if (!picked) return row.overrideReviewerId || reviewerStrategy.value === 'specific' ? '指定初核人不可用' : '未读取'
  return picked.count === null ? picked.name : `${picked.name} (${picked.count})`
}

function stateBadgeText(row: FeeReduceRowState): string {
  if (row.execStatus === 'running') return '递交中…'
  if (row.execStatus === 'submitted') return '已提交初核'
  if (row.execStatus === 'unconfirmed') return '待核对'
  if (row.execStatus === 'failed') return '递交失败'
  if (row.execStatus === 'queued') return '未派发'
  if (row.execStatus === 'skipped') return '已跳过'
  switch (row.item.state) {
    case 'completed':
      return `已完成（${row.item.procStatus}）`
    case 'ready':
      return '待递交（撰写中）'
    case 'not_found':
      return '未查到案件'
    case 'missing_proc':
      return '无费减事项'
    case 'other_status':
      return `跳过（${row.item.procStatus || '空状态'}）`
    default:
      return '查询异常'
  }
}

function stateBadgeClass(row: FeeReduceRowState): string {
  if (row.execStatus === 'queued') return 'badge-muted'
  if (row.execStatus === 'skipped') return 'badge-done'
  if (row.execStatus === 'submitted' || row.item.state === 'completed') return 'badge-done'
  if (row.execStatus === 'failed' || row.execStatus === 'unconfirmed' || row.item.state === 'error' || row.item.state === 'not_found') return 'badge-warn'
  if (row.execStatus === 'running' || row.item.state === 'ready') return 'badge-ready'
  return 'badge-muted'
}

async function loadReviewers(): Promise<void> {
  const account = scopeFromConnection(connection.value)
  if (!account) return
  if (reviewerAccount.value && !accountScopeMatches(connection.value, reviewerAccount.value)) {
    reviewers.value = []
    defaultReviewerId.value = ''
    reviewerAccount.value = null
  }
  loadingReviewers.value = true
  try {
    const res = await bridge.request({ type: MessageType.ReadFeeReduceReviewers })
    if (!accountScopeMatches(connection.value, account)) return
    if (res.type === MessageType.ReadFeeReduceReviewersResult && res.payload.ok) {
      reviewerAccount.value = account
      reviewers.value = res.payload.data.reviewers
      reviewerNodeName.value = res.payload.data.nodeName || '流程人员初核'
      if (!defaultReviewerId.value && reviewers.value.length) {
        defaultReviewerId.value = reviewers.value[0].userId
      }
      if (!statusNotice.value) statusNotice.value = res.payload.data.message
    } else if (res.type === MessageType.ReadFeeReduceReviewersResult && !res.payload.ok) {
      errorNotice.value = res.payload.error.message
    } else if (res.type === MessageType.Error) {
      errorNotice.value = res.payload.message
    }
  } finally {
    loadingReviewers.value = false
  }
}

async function onUploadSheet(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  errorNotice.value = ''
  try {
    const buffer = await file.arrayBuffer()
    const parsed = await readXlsxRows(buffer)
    if (!parsed.length) {
      errorNotice.value = '表格中没有读到有效行。'
      return
    }
    sheetName.value = file.name
    sheetRows.value = parsed
    const extracted = extractCaseVolumesFromSheet(parsed)
    sheetHeaders.value = extracted.headers
    sheetColumnIndex.value = extracted.detectedColumn
    volumeInput.value = extracted.volumes.join('\n')
    statusNotice.value = `已从「${file.name}」第 ${extracted.detectedColumn + 1} 列提取 ${extracted.volumes.length} 个我方文号。`
  } catch (err) {
    errorNotice.value = err instanceof Error ? err.message : '读取 Excel 失败。'
  }
}

function onChangeSheetColumn(value: string): void {
  const idx = Number(value)
  if (!Number.isInteger(idx) || idx < 0 || !sheetRows.value.length) return
  sheetColumnIndex.value = idx
  const extracted = extractCaseVolumesFromSheet(sheetRows.value, idx)
  volumeInput.value = extracted.volumes.join('\n')
  statusNotice.value = `已切换至第 ${idx + 1} 列，提取 ${extracted.volumes.length} 个我方文号。`
}

function startProgress(label: string, total: number, detail: string) {
  const startedAt = Date.now()
  const update = (done: number, status: TaskCheckStatus, message = detail) => {
    const snapshot = taskCheckSnapshot(done, total, startedAt, Date.now(), status)
    progress.value = { ...snapshot, visible: true, status, label, summary: `${label} ${snapshot.done}/${snapshot.total} 件`, detail: message }
  }
  update(0, 'run')
  return update
}

async function inspectAll(recheckPaused = false): Promise<void> {
  if (restoring.value || inspecting.value || executing.value) return
  if (pausedBatch.value && (!recheckPaused || !canRecheckPaused.value)) return
  errorNotice.value = ''
  statusNotice.value = ''
  const recoveryBatch = recheckPaused ? pausedBatch.value : null
  const priorRows = recoveryBatch?.rows
  const overrides = new Map(priorRows?.map(row => [row.item.caseVolume.toUpperCase(), row.overrideReviewerId]))
  const uncertain = new Set(reviewVolumes)
  for (const row of priorRows ?? []) {
    if (row.execStatus === 'unconfirmed') uncertain.add(row.item.caseVolume.toUpperCase())
  }
  const volumes = priorRows ? priorRows.map(row => row.item.caseVolume) : parsedVolumes.value
  if (!volumes.length) {
    errorNotice.value = '请先输入或导入至少一个我方文号。'
    return
  }
  const account = scopeFromConnection(connection.value)
  if (!account) {
    errorNotice.value = '请先连接已登录的 EASY 账号。'
    return
  }
  inspecting.value = true
  restoredInspection.value = false
  showMissingOnly.value = false
  resultPage.value = 1
  rows.splice(0, rows.length)
  const updateProgress = startProgress('费减检索', volumes.length, '正在检索案件与处理状态')
  const journal = inspectionJournal(account)
  let batch: Awaited<ReturnType<typeof journal.begin>> | undefined
  let nextPage = 0
  let done = 0
  try {
    batch = await journal.begin(volumes, [...uncertain])
    if (!reviewers.value.length || !reviewerAccount.value || !accountScopeMatches(connection.value, reviewerAccount.value)) {
      await loadReviewers()
    }
    const chunkSize = 48
    for (let i = 0; i < volumes.length; i += chunkSize) {
      if (disposed) return
      if (!accountScopeMatches(connection.value, account)) throw new Error('EASY 账号已切换，请重新检索。')
      const chunk = volumes.slice(i, i + chunkSize)
      const res = await bridge.request({
        type: MessageType.InspectFeeReduceCases,
        payload: { caseVolumes: chunk, expectedScope: account }
      })
      if (disposed) return
      if (!accountScopeMatches(connection.value, account)) throw new Error('EASY 账号已切换，请重新检索。')
      if (res.type === MessageType.InspectFeeReduceCasesResult && res.payload.ok) {
        const items = res.payload.data.items
        if (items.length !== chunk.length) throw new Error('费减检索返回的案件数与请求不符，请重新检索。')
        await journal.append(batch.plan, nextPage, items)
        nextPage++
        if (disposed) return
        rows.push(
          ...items.map((item): FeeReduceRowState => {
            const key = item.caseVolume.toUpperCase()
            if (item.state === 'completed') uncertain.delete(key)
            const needsReview = uncertain.has(key)
            return {
              item,
              checked: item.state === 'ready' && !needsReview,
              overrideReviewerId: overrides.get(key) ?? '',
              execStatus: needsReview ? 'unconfirmed' : 'idle',
              execMessage: needsReview ? '上次递交回执未确认，请先到 EASY 核对。' : '',
              account,
              filingId: '',
              warnings: []
            }
          })
        )
        done += chunk.length
        updateProgress(done, 'run')
      } else if (res.type === MessageType.InspectFeeReduceCasesResult && !res.payload.ok) {
        throw new Error(res.payload.error.message)
      } else if (res.type === MessageType.Error) {
        throw new Error(res.payload.message)
      } else {
        throw new Error('检索未返回有效结果。')
      }
    }
    await journal.finish(batch.plan, nextPage, 'done')
    if (disposed) return
    if (recoveryBatch) await clearBatch(account, recoveryBatch.journalId)
    reviewVolumes = uncertain
    pausedBatch.value = null
    statusNotice.value = `检索完成：共 ${counts.value.total} 件，已完成 ${counts.value.completed} 件，待递交（撰写中）${counts.value.ready} 件。`
    updateProgress(done, 'done', `已完成 ${counts.value.completed} 件，待递交 ${counts.value.ready} 件`)
  } catch (err) {
    if (disposed) return
    if (batch) await journal.finish(batch.plan, nextPage, 'failed').catch(() => undefined)
    restoredInspection.value = true
    errorNotice.value = err instanceof Error ? err.message : '检索失败。'
    updateProgress(done, 'fail', errorNotice.value)
  } finally {
    if (batch?.previous) void journal.prune(batch.previous).catch(() => undefined)
    inspecting.value = false
  }
}

function submitRequest(row: FeeReduceRowState): FeeReduceSubmitRequest {
  return {
    caseVolume: row.item.caseVolume,
    caseId: row.item.caseId,
    procId: row.item.procId,
    oaName: oaName.value.trim(),
    remark: remark.value.trim() || '同意',
    reviewerStrategy: reviewerStrategy.value,
    defaultReviewerId: defaultReviewerId.value || undefined,
    overrideReviewerId: row.overrideReviewerId || undefined,
    expectedScope: row.account
  }
}

async function runSingleRow(row: FeeReduceRowState, payload: FeeReduceSubmitRequest): Promise<'submitted' | 'skipped' | 'failed' | 'not_sent' | 'verify'> {
  if (!accountScopeMatches(connection.value, row.account)) {
    row.execMessage = '原 EASY 账号连接已变化，本件未派发。'
    return 'not_sent'
  }
  row.execStatus = 'running'
  row.execMessage = '正在执行校验、XML 转档与流程提交…'
  row.warnings = []
  const res = await bridge.request({
    type: MessageType.SubmitFeeReduceFiling,
    payload
  }).catch((err: unknown) => ({
    type: MessageType.Error,
    payload: { message: err instanceof Error ? err.message : '提交未返回有效结果。', feeBatchPause: 'verify' }
  } as const))
  if (res.type === MessageType.SubmitFeeReduceFilingResult && res.payload.ok) {
    const { data } = res.payload
    row.execMessage = data.message
    row.checked = false
    if (data.outcome === 'already_completed') {
      row.item = { ...row.item, state: 'completed', procStatus: data.procStatus }
      row.execStatus = 'idle'
      return 'skipped'
    }
    row.execStatus = 'submitted'
    row.filingId = data.filingId
    row.warnings = data.warnings
    return 'submitted'
  }
  if (res.type === MessageType.SubmitFeeReduceFilingResult && !res.payload.ok) {
    row.execMessage = res.payload.error.message
  } else if (res.type === MessageType.Error) {
    row.execMessage = res.payload.message === 'STALE_CONTEXT' ? 'EASY 账号已切换，请重新检索。' : res.payload.message
  } else {
    row.execMessage = '提交未返回有效结果。'
  }
  const errorCode = res.type === MessageType.SubmitFeeReduceFilingResult && !res.payload.ok ? res.payload.error.code : undefined
  const pause = res.type === MessageType.Error ? res.payload.feeBatchPause
    : errorCode === 'SESSION_EXPIRED' || errorCode === 'FLOW_STATUS_UNVERIFIED' ? 'verify' : undefined
  if (pause) {
    row.execStatus = pause === 'verify' ? 'unconfirmed' : 'idle'
    if (pause === 'verify') row.checked = false
    return pause
  }
  row.execStatus = 'failed'
  return 'failed'
}

async function executeSelected(): Promise<void> {
  if (disposed || restoring.value || restoredInspection.value || pausedBatch.value || inspecting.value || executing.value) return
  if (!writeOpen.value) {
    await infoDialog({
      title: '写开关未开启',
      message: '请先打开写开关，再执行费用减缓递交与流程提交。'
    })
    return
  }
  const targets = selectedRows.value.map(row => ({ row, payload: submitRequest(row) }))
  if (!targets.length) {
    errorNotice.value = '没有勾选待递交（撰写中）的案件。'
    return
  }
  if (targets.some(({ row }) => !accountScopeMatches(connection.value, row.account))) {
    errorNotice.value = 'EASY 账号已切换，请重新检索。'
    return
  }
  if (targets.some(({ payload }) => payload.reviewerStrategy === 'specific' &&
      !payload.defaultReviewerId && !payload.overrideReviewerId)) {
    errorNotice.value = '请为使用「指定初核人」的案件选择审核人。'
    return
  }
  const workerCount = Math.max(1, Math.min(Number(concurrency.value) || 6, targets.length))
  const defaultLabel = resolvedDefaultReviewer.value
    ? `${resolvedDefaultReviewer.value.name}${resolvedDefaultReviewer.value.count === null ? '' : `(${resolvedDefaultReviewer.value.count})`}`
    : '候选首位'
  const confirmed = await confirmDialog({
    title: '确认批量递交请求费用减缓',
    message: `将对已勾选的 ${targets.length} 件「撰写中」案件按 ${workerCount} 路并发执行：校验 → 创建费用减缴请求递交单 → XML 转档 → 提交至「${reviewerNodeName.value}」（默认：${defaultLabel}）。确认继续？`,
    confirmLabel: '开始递交'
  })
  if (!confirmed || disposed || restoring.value || restoredInspection.value || pausedBatch.value || inspecting.value || executing.value) return
  if (targets.some(({ row }) => !rows.includes(row) || !accountScopeMatches(connection.value, row.account))) {
    errorNotice.value = '案件列表或 EASY 账号已变化，请重新确认。'
    return
  }

  const account = targets[0].row.account
  executing.value = true
  let journal: Awaited<ReturnType<typeof beginBatch>>
  try {
    journal = await beginBatch(account, targets.map(target => target.payload))
  } catch (err) {
    executing.value = false
    errorNotice.value = err instanceof Error ? err.message : '批次恢复记录未能保存，未开始递交。'
    await restoreBatch(account)
    return
  }

  errorNotice.value = ''
  const updateProgress = startProgress('费减递交', targets.length, '正在校验、XML 转档与流程提交')
  let okCount = 0
  let skippedCount = 0
  let failCount = 0
  let verifyCount = 0
  let pauseReason = ''
  let nextIndex = 0
  const unfinished = new Set(targets.map(({ row }) => row))
  try {
    async function runWorker(): Promise<void> {
      while (!disposed && !pauseReason && nextIndex < targets.length) {
        if (!writeOpen.value || !accountScopeMatches(connection.value, targets[0].row.account)) {
          pauseReason = 'EASY 连接或写开关已变化。'
          return
        }
        const idx = nextIndex
        nextIndex += 1
        try {
          // Persist the queue cursor before permitting this worker to dispatch.
          await journal.persist(nextIndex)
        } catch {
          pauseReason ||= '批次发出位置写入 WAL 失败，已暂停派发。'
          return
        }
        if (disposed || pauseReason) return
        const { row, payload } = targets[idx]
        const outcome = await runSingleRow(row, payload)
        journal.outcomes[idx] = outcomeCode[outcome]
        try {
          await journal.persist(nextIndex)
        } catch {
          row.execStatus = 'unconfirmed'
          row.checked = false
          row.execMessage = '回执未能写入恢复账本，请重新检索核对。'
          verifyCount += 1
          pauseReason ||= row.execMessage
          return
        }
        if (outcome === 'submitted' || outcome === 'skipped' || outcome === 'failed') unfinished.delete(row)
        if (outcome === 'submitted') okCount += 1
        else if (outcome === 'skipped') skippedCount += 1
        else if (outcome === 'failed') failCount += 1
        else {
          if (outcome === 'verify') verifyCount += 1
          pauseReason ||= row.execMessage || 'EASY 连接已中断。'
        }
        updateProgress(okCount + skippedCount + failCount, pauseReason ? 'hold' : 'run',
          pauseReason || `已成功 ${okCount} 件${skippedCount ? `，跳过 ${skippedCount} 件` : ''}，失败 ${failCount} 件`)
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    if (disposed) return
    if (pauseReason) {
      const completed = okCount + skippedCount + failCount
      if (unfinished.size) pausedBatch.value = { account, rows: [...unfinished], journalId: journal.id }
      statusNotice.value = `批次已暂停。已提交 ${okCount} 件，跳过 ${skippedCount} 件，失败 ${failCount} 件，待核对 ${verifyCount} 件，未派发 ${targets.length - completed - verifyCount} 件。${pauseReason}`
      updateProgress(completed, 'hold', statusNotice.value)
      return
    }
    statusNotice.value = `执行结束：成功 ${okCount} 件${skippedCount ? `，跳过 ${skippedCount} 件` : ''}${failCount ? `，失败 ${failCount} 件，请查看各行结果` : ''}。`
    updateProgress(okCount + skippedCount + failCount, failCount ? 'fail' : 'done', statusNotice.value)
  } catch (error) {
    errorNotice.value = error instanceof Error ? error.message : '批次收尾记录未能保存。'
    updateProgress(okCount + skippedCount + failCount, 'hold', errorNotice.value)
  } finally {
    executing.value = false
  }
}

async function retryRow(row: FeeReduceRowState): Promise<void> {
  if (disposed || restoring.value || restoredInspection.value || pausedBatch.value) return
  if (!writeOpen.value) {
    await infoDialog({
      title: '写开关未开启',
      message: '请先打开写开关后再重试。'
    })
    return
  }
  if (inspecting.value || executing.value) return
  executing.value = true
  const updateProgress = startProgress('费减重试', 1, '正在重新执行流程提交')
  try {
    const payload = submitRequest(row)
    const journal = await beginBatch(row.account, [payload])
    await journal.persist(1)
    if (disposed) return
    const outcome = await runSingleRow(row, payload)
    journal.outcomes[0] = outcomeCode[outcome]
    await journal.persist(1)
    if (disposed) return
    if (outcome === 'verify' || outcome === 'not_sent') {
      pausedBatch.value = { account: row.account, rows: [row], journalId: journal.id }
      statusNotice.value = `重试已暂停。${row.execMessage}`
      updateProgress(0, 'hold', statusNotice.value)
      return
    }
    updateProgress(1, outcome === 'failed' ? 'fail' : 'done', row.execMessage)
  } catch (error) {
    errorNotice.value = error instanceof Error ? error.message : '重试批次未能保存。'
    updateProgress(0, 'hold', errorNotice.value)
  } finally {
    executing.value = false
    if (errorNotice.value) await restoreBatch(row.account)
  }
}

function toggleAllReady(checked: boolean): void {
  if (restoring.value || restoredInspection.value || pausedBatch.value || inspecting.value || executing.value) return
  for (const row of rows) {
    if (row.item.state === 'ready' && row.execStatus !== 'submitted' && row.execStatus !== 'unconfirmed') {
      row.checked = checked
    }
  }
}

async function restoreBatch(account: ExpectedAccountScope, inspectionStartedAt = 0): Promise<boolean> {
  const scope = recoveryScope(account)
  try {
    const saved = await recovery.get('workflow-desk', scope)
    if (!isRecord(saved) || saved.kind !== 'fee-reduce-batch-v1' || typeof saved.id !== 'string' ||
        !Array.isArray(saved.entries)) return false
    const cursor = await recovery.get('workflow-desk', cursorScope(scope, saved.id))
    if (disposed || pausedBatch.value || inspecting.value || executing.value || !accountScopeMatches(connection.value, account)) return false
    const nextIndex = isRecord(cursor) && typeof cursor.nextIndex === 'number' &&
      Number.isSafeInteger(cursor.nextIndex) && cursor.nextIndex >= 0 ? cursor.nextIndex : saved.entries.length
    const codes = isRecord(cursor) && typeof cursor.outcomes === 'string' ? cursor.outcomes : ''
    const finished = isRecord(cursor) && batchFinished(cursor, saved.entries.length)
    if (finished && typeof saved.startedAt === 'number' && saved.startedAt < inspectionStartedAt) return false
    const pending: FeeReduceRowState[] = []
    const totals = { submitted: 0, skipped: 0, failed: 0, unconfirmed: 0, queued: 0 }
    const restored = saved.entries.flatMap((entry: unknown, idx) => {
      if (!isRecord(entry) || typeof entry.caseVolume !== 'string' || !entry.caseVolume) return []
      const code = codes[idx]
      const row = recoveryPlaceholder(entry.caseVolume, account, code === 'v' || (code !== 'n' && idx < nextIndex))
      row.overrideReviewerId = typeof entry.overrideReviewerId === 'string' ? entry.overrideReviewerId : ''
      if (code === 's' || code === 'k' || code === 'f') {
        const status = code === 's' ? 'submitted' : code === 'k' ? 'skipped' : 'failed'
        row.execStatus = status
        row.execMessage = code === 's' ? '已记录成功回执。' : code === 'k' ? '原站已确认跳过。' : '刷新前已记录失败回执，重新检索后可重试。'
        totals[status]++
      } else {
        if (row.execStatus === 'unconfirmed') totals.unconfirmed++
        else totals.queued++
        pending.push(row)
      }
      return [row]
    })
    if (!restored.length) return false
    rows.splice(0, rows.length, ...restored)
    if (pending.length) pausedBatch.value = { account, rows: pending, journalId: saved.id }
    restoredInspection.value = true
    const detail = `已提交 ${totals.submitted} 件，跳过 ${totals.skipped} 件，失败 ${totals.failed} 件，待核对 ${totals.unconfirmed} 件，未派发 ${totals.queued} 件。`
    statusNotice.value = pending.length
      ? `已恢复上次费减批次，派发已暂停。${detail}请重新检索本批未完成案件。`
      : `已恢复上次费减批次结果。${detail}`
    const update = startProgress('费减递交', restored.length, detail)
    update(totals.submitted + totals.skipped + totals.failed, pending.length ? 'hold' : totals.failed ? 'fail' : 'done', detail)
    volumeInput.value = restored.map(row => row.item.caseVolume).join('\n')
    return true
  } catch (error) {
    if (!disposed && accountScopeMatches(connection.value, account)) {
      errorNotice.value = error instanceof Error ? error.message : '无法读取费减批次账本。'
    }
    return false
  }
}

async function restoreProgress(account: ExpectedAccountScope): Promise<void> {
  try {
    const journal = inspectionJournal(account)
    const latest = await journal.read()
    if (disposed || !accountScopeMatches(connection.value, account)) return
    reviewVolumes = new Set(latest?.reviewVolumes)
    for (const item of latest?.rows ?? []) {
      if (item.state === 'completed') reviewVolumes.delete(item.caseVolume.toUpperCase())
    }
    if (await restoreBatch(account, latest?.startedAt)) return
    if (!latest || disposed || !accountScopeMatches(connection.value, account)) return
    volumeInput.value = latest.volumes.join('\n')
    rows.splice(0, rows.length, ...latest.rows.map((item): FeeReduceRowState => {
      const needsReview = reviewVolumes.has(item.caseVolume.toUpperCase())
      return {
        item, checked: false, overrideReviewerId: '', execStatus: needsReview ? 'unconfirmed' : 'idle',
        execMessage: needsReview ? '上次递交回执未确认，请先到 EASY 核对。' : '', account, filingId: '', warnings: []
      }
    }))
    restoredInspection.value = true
    const detail = `已保留 ${latest.rows.length}/${latest.volumes.length} 件检索结果。重新检索后可递交。`
    const state = latest.state === 'running' ? 'hold' : latest.state === 'done' ? 'done' : 'fail'
    statusNotice.value = `${state === 'hold' ? '上次检索已中断。' : state === 'done' ? '已恢复上次检索结果。' : '上次检索未完成。'}${detail}`
    const update = startProgress('费减检索', latest.volumes.length, detail)
    update(latest.rows.length, state, statusNotice.value)
  } catch (error) {
    if (!disposed && accountScopeMatches(connection.value, account)) {
      errorNotice.value = error instanceof Error ? error.message : '无法读取上次费减进度。'
      await restoreBatch(account)
    }
  }
}

onMounted(() => { void loadReviewers() })
let restoredScope = ''
watch([() => scopeFromConnection(connection.value), inspecting, executing, restoring], async ([account, busyInspect, busyExecute, busyRestore]) => {
  if (!account || busyInspect || busyExecute || busyRestore || disposed) return
  const scope = recoveryScope(account)
  if (scope === restoredScope) return
  if (restoredScope) {
    rows.splice(0, rows.length)
    pausedBatch.value = null
    reviewVolumes = new Set()
    volumeInput.value = ''
    statusNotice.value = ''
    errorNotice.value = ''
    restoredInspection.value = false
    showMissingOnly.value = false
    resultPage.value = 1
    progress.value = { ...progress.value, visible: false }
  }
  restoring.value = true
  try {
    await restoreProgress(account)
    if (accountScopeMatches(connection.value, account)) restoredScope = scope
  } finally {
    restoring.value = false
  }
}, { immediate: true })
</script>

<template>
  <section class="card fee-reduce-page">
    <div v-if="!props.embedded" class="card-head">
      <button type="button" class="workflow-back-btn" @click="$emit('back')">回到工作流</button>
      <h2>请求费用减缓</h2>
    </div>

    <div class="fr-banner">
      <div class="fr-switch-row">
        <strong>写开关状态：</strong>
        <span :class="writeOpen ? 'badge-done' : 'badge-warn'" class="fr-pill">
          {{ writeOpen ? '已开启（可执行递交）' : '已关闭（仅可检索）' }}
        </span>
        <button type="button" class="ghost" :disabled="executing" @click="setWriteOpen(!writeOpen)">
          {{ writeOpen ? '关闭写开关' : '打开写开关' }}
        </button>
      </div>
      <div class="fr-meta">
        <span>递交类型：手续办理 → 费用减缴请求 (100008)</span>
        <span>下一节点：{{ reviewerNodeName }}</span>
      </div>
    </div>

    <div class="fr-grid">
      <div class="fr-input-box">
        <div class="fr-label-row">
          <label for="fr-volumes">我方文号（支持换行、分号、逗号分隔，当前 {{ parsedVolumes.length }} 个）</label>
          <label class="fr-upload-btn">
            <input type="file" accept=".xlsx" @change="onUploadSheet" />
            <span>导入 Excel</span>
          </label>
        </div>
        <textarea
          id="fr-volumes"
          v-model="volumeInput"
          rows="5"
          placeholder="例如：&#10;PE26115584CND&#10;PE26115585CND"
        />
        <div v-if="sheetHeaders.length > 1" class="fr-sheet-bar">
          <span>已导入：{{ sheetName }}</span>
          <label>
            文号所在列
            <ThemeSelect
              :model-value="String(sheetColumnIndex)"
              :options="sheetColumnOptions"
              @update:model-value="onChangeSheetColumn(String($event))"
            />
          </label>
        </div>
      </div>

      <div class="fr-config-box">
        <div class="fr-field">
          <label>初核人选择策略</label>
          <ThemeSelect v-model="reviewerStrategy" :options="strategyOptions" />
        </div>
        <div class="fr-field">
          <label>默认初核人（{{ reviewerNodeName }}）</label>
          <div class="fr-inline">
            <ThemeSelect
              v-model="defaultReviewerId"
              :options="reviewerOptions"
              placeholder="选择默认初核人"
              empty-text="请先登录 EASY 并刷新"
            />
            <button type="button" class="ghost" :disabled="loadingReviewers" @click="loadReviewers">
              {{ loadingReviewers ? '读取中…' : '刷新' }}
            </button>
          </div>
        </div>
        <div class="fr-field">
          <label>办理意见</label>
          <input v-model="remark" type="text" maxlength="200" placeholder="同意" />
        </div>
        <div class="fr-field">
          <label>申请人或专利权人（可选，留空默认第一申请人）</label>
          <input v-model="oaName" type="text" maxlength="200" placeholder="不填时默认为第一申请人" />
        </div>
        <div class="fr-field">
          <label>执行并发数</label>
          <ThemeSelect v-model="concurrency" :options="concurrencyOptions" />
        </div>
      </div>
    </div>

    <div class="fr-actions">
      <button v-if="pausedBatch" type="button" class="solid" :disabled="!canRecheckPaused || actionsLocked" @click="inspectAll(true)">
        重新检索本批未完成（{{ pausedBatch.rows.length }}）
      </button>
      <button type="button" class="solid" :disabled="actionsLocked || !!pausedBatch" @click="inspectAll()">
        {{ inspecting ? '检索中…' : restoredInspection && !pausedBatch ? '重新检索案件与处理状态' : '检索案件与处理状态' }}
      </button>
      <button
        type="button"
        class="solid"
        :disabled="selectionLocked || selectedRows.length === 0"
        @click="executeSelected"
      >
        {{ executing ? '批量递交中…' : `递交已勾选（${selectedRows.length}）` }}
      </button>
      <button type="button" class="ghost" :disabled="selectionLocked || !counts.ready" @click="toggleAllReady(true)">
        全选撰写中
      </button>
      <button type="button" class="ghost" :disabled="selectionLocked || !counts.ready" @click="toggleAllReady(false)">
        取消全选
      </button>
    </div>
    <p v-if="pausedBatch && !canRecheckPaused" class="fr-notice">
      请重新连接本批次原来的 EASY 系统和账号，再检索未完成案件。
    </p>

    <p v-if="restoring" class="hint" role="status">正在读取上次费减进度…</p>
    <p v-else-if="statusNotice" class="hint" role="status">{{ statusNotice }}</p>
    <p v-if="errorNotice" class="fr-error">{{ errorNotice }}</p>

    <div v-if="rows.length" class="fr-summary">
      <span>总计：<b>{{ counts.total }}</b></span>
      <span>已完成（递交中/完成）：<b class="text-done">{{ counts.completed }}</b></span>
      <span>待递交（撰写中）：<b class="text-ready">{{ counts.ready }}</b></span>
      <span>已提交初核：<b class="text-done">{{ counts.submitted }}</b></span>
      <span>其他状态：<b>{{ counts.other - missingRows.length }}</b></span>
      <button v-if="missingRows.length" type="button" class="ghost" :aria-pressed="showMissingOnly" @click="toggleMissingOnly">
        {{ showMissingOnly ? '查看全部' : `只看未查到（${missingRows.length}）` }}
      </button>
    </div>

    <nav v-if="resultPageCount > 1" class="fr-pagination" aria-label="费减结果分页">
      <button type="button" class="ghost" :disabled="resultPage <= 1" @click="resultPage--">上一页</button>
      <span>第 {{ resultPage }} / {{ resultPageCount }} 页 · 每页 {{ resultPageSize }} 件</span>
      <button type="button" class="ghost" :disabled="resultPage >= resultPageCount" @click="resultPage++">下一页</button>
    </nav>

    <div v-if="rows.length" class="fr-table-wrap">
      <table class="fr-table">
        <thead>
          <tr>
            <th style="width: 44px;">选</th>
            <th>我方文号</th>
            <th>案件名称 / 申请号</th>
            <th>处理状态</th>
            <th>初核人</th>
            <th>执行结果</th>
            <th style="width: 90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.item.caseVolume">
            <td>
              <input
                v-model="row.checked"
                type="checkbox"
                :disabled="row.item.state !== 'ready' || row.execStatus === 'submitted' || row.execStatus === 'unconfirmed' || selectionLocked"
              />
            </td>
            <td class="mono">{{ row.item.caseVolume }}</td>
            <td>
              <div>{{ row.item.caseName || '—' }}</div>
              <small v-if="row.item.appNo" class="muted">{{ row.item.appNo }}</small>
            </td>
            <td>
              <span class="fr-pill" :class="stateBadgeClass(row)">{{ stateBadgeText(row) }}</span>
            </td>
            <td>
              <ThemeSelect
                v-if="row.item.state === 'ready' && row.execStatus !== 'submitted' && !selectionLocked"
                v-model="row.overrideReviewerId"
                :options="[{ value: '', label: `跟随默认 (${effectiveReviewerLabel(row)})` }, ...reviewerOptions]"
              />
              <span v-else class="muted">—</span>
            </td>
            <td>
              <div>{{ row.execMessage || row.item.reason }}</div>
              <small v-if="row.filingId" class="muted mono">filing_id: {{ row.filingId }}</small>
              <div v-for="(warn, idx) in row.warnings" :key="idx" class="fr-warn-line">提示：{{ warn }}</div>
            </td>
            <td>
              <button
                v-if="row.execStatus === 'failed'"
                type="button"
                class="ghost"
                :disabled="selectionLocked"
                @click="retryRow(row)"
              >
                重试
              </button>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.fee-reduce-page { display: flex; flex-direction: column; gap: 14px; }
.fr-banner { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--panel-soft, rgba(127,127,127,0.08)); font-size: 13px; }
.fr-switch-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fr-meta { display: flex; gap: 16px; flex-wrap: wrap; opacity: 0.85; }
.fr-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
@media (max-width: 900px) { .fr-grid { grid-template-columns: 1fr; } }
.fr-input-box, .fr-config-box { display: flex; flex-direction: column; gap: 10px; }
.fr-label-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.fr-input-box textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border, #d0d7de); font-family: monospace; font-size: 13px; resize: vertical; }
.fr-upload-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border, #d0d7de); cursor: pointer; font-size: 12px; font-weight: 500; }
.fr-upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.fr-sheet-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
.fr-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.fr-field input { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border, #d0d7de); }
.fr-inline { display: flex; gap: 8px; align-items: center; }
.fr-inline > :first-child { flex: 1; }
.fr-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.fr-summary { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; }
.fr-error { color: #cf222e; font-size: 13px; margin: 0; }
.fr-warn-line { color: #9a6700; font-size: 12px; margin-top: 2px; }
.fr-table-wrap { overflow-x: auto; }
.fr-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; font-size: 13px; }
.fr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fr-table th, .fr-table td { padding: 8px 10px; border-bottom: 1px solid var(--border, #e5e7eb); text-align: left; vertical-align: top; }
.fr-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-done { background: rgba(26, 127, 55, 0.12); color: #1a7f37; }
.badge-ready { background: rgba(9, 105, 218, 0.12); color: #0969da; }
.badge-warn { background: rgba(207, 34, 46, 0.12); color: #cf222e; }
.badge-muted { background: rgba(127, 127, 127, 0.12); color: #57606a; }
.text-done { color: #1a7f37; }
.text-ready { color: #0969da; }
.mono { font-family: monospace; }
.muted { opacity: 0.72; }
</style>
