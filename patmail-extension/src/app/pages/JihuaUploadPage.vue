<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { bg } from '../../shell/assets'
import { createJihuaRepository } from '../../jihua/repository'
import { createJihuaTask, mergeInventory, scanDirectory } from '../../jihua/inventory'
import { MATERIALS, materialByKey, materialForType } from '../../jihua/materials'
import { connectJihuaTab, listJihuaTabs } from '../../jihua/transport'
import { JihuaRunner } from '../../jihua/runner'
import type { JihuaRepository, JihuaRow, JihuaSession, JihuaTask, JihuaTaskSummary, JihuaTransport, LocalDirectoryHandle, Material, SourceRoot } from '../../jihua/types'
import { confirmDialog } from '../dialog'
import { paintTaskCheckProgress, resetTaskCheckProgress, taskCheckProgress } from '../check-progress'

const emit = defineEmits<{ back: [] }>()

const LOCK_NAME = 'patmail-jihua-upload'
const OA_ORIGIN = 'https://oa.jihualab.net'
const PAGE_SIZE = 50
const EXTENSIONS = ['pdf', 'doc', 'docx'] as const
type Extension = typeof EXTENSIONS[number]
type Action = 'load' | 'scan' | 'connect' | 'reset' | 'prepare' | 'recovery' | 'run' | 'cancel' | 'history' | ''
type TabChoice = { id: number; title: string }
type DirectoryPicker = (options?: { mode?: 'read' }) => Promise<LocalDirectoryHandle>

const repository: JihuaRepository = createJihuaRepository()
const task = shallowRef<JihuaTask | null>(null)
const roots = ref<SourceRoot[]>([])
const tabs = ref<TabChoice[]>([])
const selectedTabId = ref<number | null>(null)
const transport = shallowRef<JihuaTransport | null>(null)
const action = ref<Action>('load')
const bootError = ref('')
const errorMessage = ref('')
const notice = ref('')
const sessionMessage = ref('')
const sessionState = ref<'idle' | 'loading' | 'connected' | 'mismatch' | 'error'>('idle')
const loading = computed(() => action.value === 'load')
const scanCount = ref(0)
const scanFileCount = ref(0)
const storedHandleCount = ref(0)
const extensions = reactive(new Set<Extension>(EXTENSIONS))
const selectionOverrides = reactive(new Map<string, boolean>())
const materialOverrides = reactive(new Map<string, string>())
const appFilter = ref('')
const statusFilter = ref('all')
const filePage = ref(1)
const groupPage = ref(1)
const localRunning = ref(false)
const otherWorkbenchRunning = ref(false)
const pauseRequested = ref(false)
const scannerProgressText = ref('')
const taskHistory = ref<JihuaTaskSummary[]>([])
const selectedHistoryId = ref('')

let activeRunner: InstanceType<typeof JihuaRunner> | null = null
let uiMutationQueue: Promise<void> = Promise.resolve()
let progressTimer: number | undefined
let scanPaintTimer: number | undefined
let pendingScanCount = 0
let lastScanPaintAt = 0
let runStartedAt = 0
let initialized = false
let firstActivation = true
let operationGeneration = 0
let operationController: AbortController | null = null
let runningCompletion: Promise<void> | null = null
let controlChannel: BroadcastChannel | undefined

const taskStatusLabel: Record<JihuaTask['status'], string> = {
  ready: '待上传', running: '正在上传', pausing: '正在暂停', paused: '已暂停，可继续', completed: '处理结束', failed: '有上传失败，可继续', cancelled: '已取消，记录已保留'
}
const rowStatusLabel: Record<JihuaRow['status'], string> = {
  pending: '待处理', checking: '正在核对案件', uploading: '正在上传', associating: '正在关联附件',
  verifying: '正在核对回执', success: '上传成功', failed: '上传失败', already: '已经传过', unmatched: '没匹配到', excluded: '已排除'
}
const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'checking', label: '正在核对案件' },
  { value: 'uploading', label: '正在上传' },
  { value: 'associating', label: '正在关联附件' },
  { value: 'verifying', label: '正在核对回执' },
  { value: 'success', label: '上传成功' },
  { value: 'failed', label: '上传失败' },
  { value: 'already', label: '已经传过' },
  { value: 'unmatched', label: '没匹配到' },
  { value: 'excluded', label: '已排除' }
]
const sessionTabOptions = computed(() => [
  { value: -1, label: tabs.value.length ? '选择标签页' : '没有找到打开的季华平台标签页' },
  ...tabs.value.map(tab => ({ value: tab.id, label: tab.title || `季华平台标签页 ${tab.id}` }))
])

const taskRows = computed(() => task.value?.rows ?? [])
const selectedCount = computed(() => taskRows.value.filter(isSelected).length)
const selectedRows = computed(() => taskRows.value.filter(isSelected))
const selectedRunnableCount = computed(() => selectedRows.value.filter(row => !['success', 'already', 'excluded'].includes(row.status)).length)
const busy = computed(() => Boolean(action.value) || localRunning.value || otherWorkbenchRunning.value)
const canEdit = computed(() => !busy.value)
const canNewTask = computed(() => !['reset', 'history', 'cancel'].includes(action.value))
const canCancel = computed(() => !['reset', 'history', 'cancel'].includes(action.value)
  && (Boolean(operationController) || localRunning.value || Boolean(task.value && !['completed', 'cancelled'].includes(task.value.status))))
const taskSummary = computed(() => {
  const summary = { success: 0, already: 0, failed: 0, unmatched: 0, pending: 0, unconfirmed: 0 }
  for (const row of taskRows.value) {
    if (row.status in summary && row.status !== 'excluded') summary[row.status as 'success' | 'already' | 'failed' | 'unmatched' | 'pending']++
    if (row.intent?.sent && !row.receipt) summary.unconfirmed++
  }
  return summary
})
const historyOptions = computed(() => taskHistory.value.map(item => ({
  value: item.id,
  label: `${new Date(item.createdAt).toLocaleString('zh-CN')} · ${item.rowCount} 个文件 · ${taskStatusLabel[item.status]}${item.unconfirmedCount ? ` · ${item.unconfirmedCount} 行待核对` : ''}`
})))
const sessionMatchesTask = computed(() => !task.value?.session || !transport.value || task.value.session.key === transport.value.session.key)
const invalidSelectedRows = computed(() => selectedRows.value.filter(row => !row.applicationNo.trim() || !materialByKey(materialForRow(row))))
const canRun = computed(() => Boolean(task.value && transport.value && task.value.roots.length && selectedRunnableCount.value > 0 && sessionMatchesTask.value && !busy.value))
const filterText = computed(() => appFilter.value.trim().toLocaleLowerCase())
const filteredRows = computed(() => {
  const needle = filterText.value
  return taskRows.value.filter(row => {
    const status = displayStatus(row)
    if (statusFilter.value !== 'all' && status !== statusFilter.value) return false
    if (!needle) return true
    return row.applicationNo.toLocaleLowerCase().includes(needle) || row.description.toLocaleLowerCase().includes(needle)
  })
})
const filePageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)))
const visibleRows = computed(() => filteredRows.value.slice((filePage.value - 1) * PAGE_SIZE, filePage.value * PAGE_SIZE))
const pageFrom = computed(() => filteredRows.value.length ? (filePage.value - 1) * PAGE_SIZE + 1 : 0)
const pageTo = computed(() => Math.min(filePage.value * PAGE_SIZE, filteredRows.value.length))
const appGroups = computed(() => {
  const grouped = new Map<string, { applicationNo: string; caseName: string; rows: JihuaRow[]; descriptions: Set<string>; selected: number }>()
  for (const row of taskRows.value) {
    const key = row.applicationNo || `unmatched:${row.rootId}:${row.caseName || row.fileName}`
    let group = grouped.get(key)
    if (!group) {
      group = { applicationNo: row.applicationNo, caseName: row.caseName, rows: [], descriptions: new Set(), selected: 0 }
      grouped.set(key, group)
    }
    group.rows.push(row)
    if (row.description) group.descriptions.add(row.description)
    if (isSelected(row)) group.selected++
  }
  return [...grouped.values()].sort((left, right) => left.applicationNo.localeCompare(right.applicationNo, 'zh-CN'))
})
const groupPageCount = computed(() => Math.max(1, Math.ceil(appGroups.value.length / PAGE_SIZE)))
const visibleGroups = computed(() => appGroups.value.slice((groupPage.value - 1) * PAGE_SIZE, groupPage.value * PAGE_SIZE))
const groupedFilesText = computed(() => `${appGroups.value.length} 个申请号组 · ${taskRows.value.length} 个文件名记录`)
const sessionMismatchText = computed(() => task.value?.session && transport.value && task.value.session.key !== transport.value.session.key
  ? `当前连接的季华平台登录会话与任务保存的会话不一致（${task.value.session.title || '原会话'}）。新建任务后才能切换会话。`
  : '')

function isSelected(row: JihuaRow): boolean {
  return selectionOverrides.has(row.id) ? selectionOverrides.get(row.id)! : row.selected
}

function applyLocalOverrides(current: JihuaTask): JihuaTask {
  const rowsById = new Map(current.rows.map(row => [row.id, row]))
  for (const [id, selected] of selectionOverrides) {
    const row = rowsById.get(id)
    if (row) row.selected = selected
  }
  for (const [id, materialKey] of materialOverrides) {
    const row = rowsById.get(id)
    if (row) row.materialKey = materialKey
  }
  return current
}

function discardOverridesMissingFromScan(rootId: string, current: JihuaTask, scannedIds: Set<string>): void {
  const rowsById = new Map(current.rows.map(row => [row.id, row]))
  for (const overrides of [selectionOverrides, materialOverrides]) {
    for (const id of overrides.keys()) {
      const row = rowsById.get(id)
      if (row?.rootId === rootId && !scannedIds.has(id)) overrides.delete(id)
    }
  }
}

function materialForRow(row: JihuaRow): string {
  return materialOverrides.get(row.id) ?? row.materialKey
}

function materialLocked(row: JihuaRow): boolean {
  return Boolean(row.intent?.sent || row.receipt)
}

function materialOptionsFor(row: JihuaRow): Material[] {
  const type = row.record?.type
  return type ? MATERIALS.map(item => materialForType(item, type)).filter((item): item is Material => Boolean(item)) : MATERIALS
}

function materialChoiceOptions(row: JihuaRow): Array<{ value: string; label: string }> {
  return [
    { value: '', label: '选择材料' },
    ...materialOptionsFor(row).map(material => ({ value: material.key, label: material.label }))
  ]
}

function displayStatus(row: JihuaRow): JihuaRow['status'] {
  if (row.intent?.sent && !row.receipt && row.status !== 'success' && row.status !== 'already') return 'verifying'
  return row.status
}

function statusLabel(row: JihuaRow): string {
  if (row.intent?.sent && !row.receipt && row.status !== 'success' && row.status !== 'already') return '回执待确认'
  return rowStatusLabel[row.status]
}

function rowDetail(row: JihuaRow): string {
  const parts = [row.error]
  if (row.record?.name) parts.push(`平台案件：${row.record.name}`)
  const ids = row.receipt?.attachments.map(item => item.ID).filter(Boolean) ?? []
  if (ids.length) parts.push(`附件ID：${ids.join('、')}`)
  if (row.intent?.sent && !row.receipt) parts.push(`请求 ${row.intent.requestId} 已发送，等待核对回执`)
  return parts.filter(Boolean).join(' · ')
}

function statusClass(row: JihuaRow): string {
  const status = displayStatus(row)
  if (status === 'success') return 'tone-green'
  if (status === 'already') return 'tone-blue'
  if (status === 'unmatched' || status === 'verifying') return 'tone-orange'
  if (status === 'uploading' || status === 'associating' || status === 'checking') return 'tone-purple'
  if (status === 'excluded') return 'tone-sky'
  return 'tone-pink'
}

function taskTone(status: JihuaTask['status']): string {
  if (status === 'completed') return 'tone-green'
  if (status === 'running' || status === 'pausing') return 'tone-purple'
  if (status === 'ready') return 'tone-blue'
  if (status === 'failed') return 'tone-pink'
  return 'tone-orange'
}

function sessionTone(): string {
  if (sessionState.value === 'connected') return 'tone-green'
  if (sessionState.value === 'mismatch' || sessionState.value === 'error') return 'tone-orange'
  if (sessionState.value === 'loading') return 'tone-purple'
  return 'tone-sky'
}

function setSelectedTab(value: string | number): void {
  const id = Number(value)
  selectedTabId.value = Number.isFinite(id) && id >= 0 ? id : null
}

function sameSession(left: JihuaSession | undefined, right: JihuaSession | undefined): boolean {
  return Boolean(left && right && left.key === right.key)
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

class UploadLockBusyError extends Error {}

function locks(): LockManager | undefined {
  return globalThis.navigator?.locks
}

function withUploadUiLock<T>(work: () => Promise<T> | T): Promise<T> {
  const run = uiMutationQueue.then(async () => {
    const manager = locks()
    if (!manager) throw new Error('当前浏览器不支持跨工作台任务锁，请更新 Chrome 或 Edge 后再试。')
    return manager.request(LOCK_NAME, { ifAvailable: true }, async lock => {
      if (!lock) throw new UploadLockBusyError('另一个工作台正在处理季华传文任务。请等它完成或暂停后再改。')
      return work()
    })
  })
  uiMutationQueue = run.then(() => undefined, () => undefined)
  return run
}

async function latestTaskFor(expectedId: string | null): Promise<JihuaTask | null> {
  const latest = await repository.load()
  if ((latest?.id ?? null) !== expectedId) {
    throw new Error('任务已在另一个工作台变化。请刷新当前页面后再继续，避免覆盖新进度。')
  }
  return latest
}

function showActionError(error: unknown, fallback: string): void {
  errorMessage.value = errorText(error, fallback)
  notice.value = ''
}

type ControlledAction = { generation: number; controller: AbortController }
function beginAction(value: Action): ControlledAction {
  operationController?.abort()
  const controller = new AbortController()
  operationController = controller
  action.value = value
  return { generation: ++operationGeneration, controller }
}
function isCurrentAction(operation: ControlledAction): boolean {
  return operation.generation === operationGeneration && !operation.controller.signal.aborted
}
function assertCurrentAction(operation: ControlledAction): void {
  if (!isCurrentAction(operation)) throw new DOMException('任务操作已取消。', 'AbortError')
}
function finishAction(operation: ControlledAction): void {
  if (operation.generation !== operationGeneration) return
  operationController = null
  action.value = ''
}
function controlled<T>(operation: ControlledAction, promise: Promise<T>): Promise<T> {
  const signal = operation.controller.signal
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('任务操作已取消。', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void promise.then(value => {
      cleanup()
      if (isCurrentAction(operation)) resolve(value)
      else reject(new DOMException('任务操作已取消。', 'AbortError'))
    }, error => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))) })
  })
}
function isAborted(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError' }

async function refreshHistory(): Promise<void> {
  taskHistory.value = await repository.listHistory()
  if (!taskHistory.value.some(item => item.id === selectedHistoryId.value)) selectedHistoryId.value = ''
}

function resetTaskView(next: JihuaTask): void {
  task.value = next
  selectionOverrides.clear()
  materialOverrides.clear()
  filePage.value = 1
  groupPage.value = 1
  appFilter.value = ''
  statusFilter.value = 'all'
  otherWorkbenchRunning.value = false
  bootError.value = ''
}

async function stopCurrentWork(): Promise<void> {
  const wasActive = Boolean(operationController || activeRunner || localRunning.value)
  operationController?.abort()
  operationController = null
  operationGeneration++
  if (scanPaintTimer !== undefined) { window.clearTimeout(scanPaintTimer); scanPaintTimer = undefined }
  if (sessionState.value === 'loading') sessionState.value = 'idle'
  if (activeRunner) {
    activeRunner.cancel()
    transport.value?.stopWaiting?.()
    transport.value = null
    sessionState.value = 'idle'
    sessionMessage.value = '任务已停止。继续上传前请重新连接季华平台。'
  }
  if (runningCompletion) await runningCompletion.catch(() => undefined)
  if (!wasActive && otherWorkbenchRunning.value && task.value) {
    controlChannel?.postMessage({ type: 'cancel', taskId: task.value.id })
    // The owning tab cooperatively cancels and releases its lease; never steal a live writer's lock.
    for (let attempt = 0; attempt < 20; attempt++) {
      const available = await locks()?.request(LOCK_NAME, { ifAvailable: true }, lock => Boolean(lock))
      if (available) { otherWorkbenchRunning.value = false; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  localRunning.value = false
  pauseRequested.value = false
}

async function cancelTask(): Promise<void> {
  if (!canCancel.value) return
  const expectedId = task.value?.id ?? null
  action.value = 'cancel'
  errorMessage.value = ''
  try {
    await stopCurrentWork()
    await withUploadUiLock(async () => {
      const latest = expectedId ? await latestTaskFor(expectedId) : await repository.load()
      if (!latest) return
      applyLocalOverrides(latest)
      if (latest.status !== 'completed') latest.status = 'cancelled'
      for (const row of latest.rows) if (['checking', 'uploading', 'associating', 'verifying'].includes(row.status)) {
        row.status = 'pending'
        row.error = row.receipt ? '已取消；附件回执已保留，恢复后先核对关联。' : row.intent?.sent ? '已取消；请求已经发送，恢复后先核对原回执。' : '已取消；文件尚未完成上传。'
      }
      latest.updatedAt = Date.now()
      await repository.save(latest)
      task.value = latest
      otherWorkbenchRunning.value = false
      notice.value = '已取消任务，已有结果和待核对回执均已保留。可以新建任务，或稍后继续。'
      publishUploadProgress()
    })
    await refreshHistory()
  } catch (error) { showActionError(error, '取消任务没有完成，请刷新任务后重试。') }
  finally { action.value = '' }
}

async function restoreHistoryTask(): Promise<void> {
  if (!selectedHistoryId.value || busy.value) return
  const expectedId = task.value?.id ?? null
  const historyId = selectedHistoryId.value
  action.value = 'history'
  errorMessage.value = ''
  try {
    await withUploadUiLock(async () => {
      const restored = await repository.restoreTask(historyId, expectedId)
      resetTaskView(restored)
      roots.value = await repository.getRoots()
      if (transport.value && restored.session && !sameSession(restored.session, transport.value.session)) {
        transport.value = null
        sessionState.value = 'idle'
      }
      notice.value = '已恢复历史任务；当前任务已保留在历史中。核对平台会话后可以继续。'
      publishUploadProgress()
    })
    await refreshHistory()
  } catch (error) { showActionError(error, '历史任务没有恢复。') }
  finally { action.value = '' }
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `root-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function picker(): DirectoryPicker | undefined {
  return (globalThis as typeof globalThis & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
}

function updateScanProgress(count: number): void {
  pendingScanCount = count
  const now = Date.now()
  if (now - lastScanPaintAt >= 100) {
    scanCount.value = count
    lastScanPaintAt = now
    return
  }
  if (scanPaintTimer !== undefined) return
  scanPaintTimer = window.setTimeout(() => {
    scanPaintTimer = undefined
    scanCount.value = pendingScanCount
    lastScanPaintAt = Date.now()
  }, Math.max(1, 100 - (now - lastScanPaintAt)))
}

async function existingRootFor(handle: LocalDirectoryHandle, savedRoots: SourceRoot[]): Promise<SourceRoot | undefined> {
  for (const root of savedRoots) {
    if (!root.handle.isSameEntry) continue
    try {
      if (await root.handle.isSameEntry(handle)) return root
    } catch {
      // A revoked old handle cannot prove identity; treat the picker result as a new root.
    }
  }
  return undefined
}

async function addFolder(): Promise<void> {
  if (!canEdit.value) return
  errorMessage.value = ''
  notice.value = ''
  if (!extensions.size) {
    errorMessage.value = '至少选择一种文件类型。'
    return
  }
  const choose = picker()
  if (!choose) {
    errorMessage.value = '当前浏览器不支持选择本地文件夹，请使用 Chrome 或 Edge 的工作台。'
    return
  }
  const expectedId = task.value?.id ?? null
  let handle: LocalDirectoryHandle
  try {
    // Call the picker directly from the user gesture before taking the async lock.
    handle = await choose({ mode: 'read' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    showActionError(error, '没有打开本地文件夹。')
    return
  }

  const operation = beginAction('scan')
  scannerProgressText.value = '正在读取文件名，不会打开文件内容。'
  scanCount.value = 0
  scanFileCount.value = 0
  storedHandleCount.value = 0
  pendingScanCount = 0
  lastScanPaintAt = 0
  try {
    await withUploadUiLock(async () => {
      const latest = await controlled(operation, latestTaskFor(expectedId))
      const savedRoots = await controlled(operation, repository.getRoots())
      const same = await controlled(operation, existingRootFor(handle, savedRoots))
      const root: SourceRoot = { id: same?.id ?? newId(), name: handle.name, handle }
      const result = await controlled(operation, scanDirectory(root, {
        extensions: [...extensions],
        signal: operation.controller.signal,
        onProgress: count => { if (isCurrentAction(operation)) updateScanProgress(count) }
      }))
      assertCurrentAction(operation)
      const archivedUploads = await controlled(operation, repository.findArchivedUploads(result.rows))
      const archivedById = new Map(archivedUploads.map(row => [row.id, row]))
      for (const row of result.rows) {
        const previous = archivedById.get(row.id)
        if (previous) {
          row.intent = previous.intent
          row.receipt = previous.receipt
          row.record = previous.record
        }
      }
      scanFileCount.value = result.scannedFiles
      const base = latest ?? createJihuaTask()
      discardOverridesMissingFromScan(root.id, base, new Set(result.rows.map(row => row.id)))
      applyLocalOverrides(base)
      // Store the directory and file handles before saving rows that refer to them.
      await repository.putRoot(root)
      let stored = 0
      for (const [id, fileHandle] of result.files) {
        assertCurrentAction(operation)
        await repository.putFile(id, fileHandle)
        stored++
        if (stored % 100 === 0) {
          storedHandleCount.value = stored
          await new Promise<void>(resolve => setTimeout(resolve, 0))
        }
      }
      storedHandleCount.value = stored
      assertCurrentAction(operation)
      const next = mergeInventory(base, result, root)
      if (!next.session && transport.value) next.session = transport.value.session
      await repository.save(next)
      assertCurrentAction(operation)
      task.value = next
      selectionOverrides.clear()
      materialOverrides.clear()
      filePage.value = 1
      groupPage.value = 1
      roots.value = await repository.getRoots()
      notice.value = same ? `已重新扫描「${root.name}」，原有回执和进度已保留。` : `已添加「${root.name}」。`
      scannerProgressText.value = `扫描 ${result.scannedFiles} 个文件名，保留 ${result.rows.length} 条记录，忽略 ${result.excludedFiles} 个其他类型。`
      if (result.errors.length) errorMessage.value = `有 ${result.errors.length} 条文件名需要核对。可在下方筛选「没匹配到」。`
    })
  } catch (error) {
    if (!isAborted(error) && isCurrentAction(operation)) showActionError(error, '文件夹扫描失败。')
  } finally {
    finishAction(operation)
    if (scanPaintTimer !== undefined) window.clearTimeout(scanPaintTimer)
    scanPaintTimer = undefined
    scanCount.value = pendingScanCount
    if (!scannerProgressText.value.startsWith('扫描 ')) scannerProgressText.value = ''
  }
}

function toggleExtension(extension: Extension, event: Event): void {
  if (!canEdit.value) return
  const checked = (event.target as HTMLInputElement).checked
  if (checked) extensions.add(extension)
  else extensions.delete(extension)
}

async function editSelection(rowsToEdit: JihuaRow[], selected: boolean): Promise<void> {
  if (!task.value || !canEdit.value) return
  const expectedId = task.value.id
  try {
    await withUploadUiLock(async () => {
      await latestTaskFor(expectedId)
      for (const row of rowsToEdit) selectionOverrides.set(row.id, selected)
      errorMessage.value = ''
    })
  } catch (error) {
    showActionError(error, '选中状态没有更新。')
  }
}

async function editMaterial(row: JihuaRow, value: string): Promise<void> {
  if (!task.value || !canEdit.value || materialLocked(row)) return
  const expectedId = task.value.id
  try {
    await withUploadUiLock(async () => {
      await latestTaskFor(expectedId)
      materialOverrides.set(row.id, value)
      errorMessage.value = ''
    })
  } catch (error) {
    showActionError(error, '材料类型没有更新。')
  }
}

function selectFiltered(selected: boolean): void {
  void editSelection(filteredRows.value, selected)
}

function selectGroup(group: { rows: JihuaRow[] }, selected: boolean): void {
  void editSelection(group.rows, selected)
}

async function refreshTabs(): Promise<void> {
  sessionState.value = sessionState.value === 'connected' ? 'connected' : 'loading'
  try {
    const available = await listJihuaTabs()
    tabs.value = available
    if (selectedTabId.value == null || !available.some(item => item.id === selectedTabId.value)) {
      selectedTabId.value = available[0]?.id ?? null
    }
    if (!transport.value) sessionState.value = 'idle'
  } catch (error) {
    if (!transport.value) sessionState.value = 'error'
    sessionMessage.value = errorText(error, '没有读取到已打开的季华平台标签页。')
  }
}

async function connectSelectedTab(): Promise<void> {
  if (selectedTabId.value == null || busy.value) return
  const operation = beginAction('connect')
  sessionState.value = 'loading'
  sessionMessage.value = ''
  errorMessage.value = ''
  try {
    const nextTransport = await controlled(operation, connectJihuaTab(selectedTabId.value))
    await controlled(operation, nextTransport.checkSession())
    transport.value = nextTransport
    const existing = task.value
    if (existing?.session && !sameSession(existing.session, nextTransport.session)) {
      sessionState.value = 'mismatch'
      sessionMessage.value = sessionMismatchText.value || '当前季华平台登录会话与已保存任务不同。请先新建任务再切换会话。'
      return
    }
    if (existing) {
      await withUploadUiLock(async () => {
        const latest = await controlled(operation, latestTaskFor(existing.id))
        if (!latest) throw new Error('没有找到当前任务。')
        latest.session = nextTransport.session
        latest.updatedAt = Date.now()
        await repository.save(latest)
        assertCurrentAction(operation)
        task.value = latest
      })
    }
    sessionState.value = 'connected'
    sessionMessage.value = `已连接「${nextTransport.session.title || '季华平台'}」的登录会话。`
  } catch (error) {
    if (!isAborted(error) && isCurrentAction(operation)) {
      sessionState.value = 'error'
      sessionMessage.value = errorText(error, '连接季华平台会话失败。')
    }
  } finally {
    finishAction(operation)
  }
}

function openOa(): void {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: { tabs?: { create?: (options: { url: string; active: boolean }) => Promise<unknown> } } }).chrome
  if (chromeApi?.tabs?.create) {
    void chromeApi.tabs.create({ url: OA_ORIGIN, active: true }).catch(() => { window.open(OA_ORIGIN, '_blank', 'noopener,noreferrer') })
    return
  }
  window.open(OA_ORIGIN, '_blank', 'noopener,noreferrer')
}

function unresolvedIntents(current: JihuaTask): JihuaRow[] {
  return current.rows.filter(row => row.intent?.sent && !row.receipt)
}

async function confirmUnknownUpload(row: JihuaRow): Promise<void> {
  if (!task.value || busy.value || !row.intent?.sent || row.receipt) return
  const expectedId = task.value.id
  const requestId = row.intent.requestId
  let confirmedByUser = false
  try {
    confirmedByUser = await confirmDialog({
      title: '核实附件后重试',
      message: `原请求 ${requestId} 已经发出，但没有收到可确认的回执。请先在季华平台检查「${row.fileName}」是否已经上传或关联。只有确认原请求没有生成附件，或你接受可能产生重复附件的风险后，才继续。确认后会清除原请求编号，下一次执行会新建上传请求。`,
      confirmLabel: '我已核实并接受重复风险',
      cancelLabel: '继续保留原请求',
      warn: true,
      table: {
        headers: ['申请号', '文件名', '原请求编号', '当前情况'],
        rows: [[row.applicationNo || '未识别', row.fileName, requestId, row.error || '请求已发出，回执尚未确认']]
      }
    })
  } catch (error) {
    showActionError(error, '没有记录人工核实结果。')
    return
  }
  if (!confirmedByUser) return

  action.value = 'recovery'
  errorMessage.value = ''
  notice.value = ''
  try {
    await withUploadUiLock(async () => {
      const latest = await latestTaskFor(expectedId)
      if (!latest) throw new Error('任务已被清除，不能重试这个文件。')
      if (latest.status === 'running' || latest.status === 'pausing') throw new UploadLockBusyError('另一个工作台正在运行这个任务。')
      applyLocalOverrides(latest)
      const target = latest.rows.find(item => item.id === row.id)
      if (!target) throw new Error('文件行已从任务中移除，请刷新任务后再试。')
      if (target.receipt) throw new Error('最新任务已经有上传回执，不能清除或重试。')
      if (!target.intent?.sent || target.intent.requestId !== requestId) throw new Error('上传请求状态已变化，请刷新任务后重新核实。')
      target.intent = undefined
      target.status = 'pending'
      target.error = '用户已人工核实季华平台并确认接受可能重复上传的风险；允许创建新的上传请求。'
      target.updatedAt = Date.now()
      latest.status = 'paused'
      latest.updatedAt = Date.now()
      await repository.save(latest)
      task.value = latest
      selectionOverrides.clear()
      materialOverrides.clear()
      notice.value = '已记录人工核实。继续上传时会创建新的请求编号；如果平台已有附件，请不要再次上传。'
    })
  } catch (error) {
    showActionError(error, '没有清除未确认的上传请求。')
  } finally {
    action.value = ''
  }
}

async function createNewTask(): Promise<void> {
  if (!canNewTask.value) return
  const old = task.value
  if (old) {
    const unresolved = unresolvedIntents(old).length
    const yes = await confirmDialog({
      title: '保留当前任务并新建',
      message: `当前任务会完整保留到历史，包含文件夹、勾选、结果和回执。${unresolved ? `其中 ${unresolved} 行已发送但回执待核对，恢复旧任务时会先核对，不会自动重传。` : ''}正在进行的本地操作将停止。`,
      confirmLabel: '保留并新建', cancelLabel: '继续当前任务'
    })
    if (!yes) return
  }
  const expectedId = old?.id ?? null
  action.value = 'reset'
  errorMessage.value = ''
  try {
    await stopCurrentWork()
    await withUploadUiLock(async () => {
      const latest = old ? await latestTaskFor(expectedId) : await repository.load()
      if (latest) {
        applyLocalOverrides(latest)
        await repository.save(latest)
      }
      const next = createJihuaTask()
      if (transport.value) next.session = transport.value.session
      await repository.archiveAndCreate(latest?.id ?? null, next)
      resetTaskView(next)
      roots.value = []
      clearJihuaProgress()
      scannerProgressText.value = ''
      notice.value = old ? '已新建任务，原任务已完整保留在历史中。选择本地文件夹开始扫描。' : '已新建任务。选择本地文件夹开始扫描。'
    })
    await refreshHistory()
  } catch (error) {
    showActionError(error, '新任务没有创建。')
  } finally {
    action.value = ''
  }
}

function clearJihuaProgress(): void {
  if (['季华传文', '计划实验室-文件导入'].includes(taskCheckProgress.label)) resetTaskCheckProgress()
}

async function ensureSourcePermissions(operation: ControlledAction): Promise<void> {
  const current = task.value
  if (!current) throw new Error('先扫描一个本地文件夹。')
  if (!current.roots.length) throw new Error('任务没有可读取的文件夹，请重新添加来源目录。')
  for (const item of current.roots) {
    assertCurrentAction(operation)
    const root = roots.value.find(candidate => candidate.id === item.id)
    if (!root) throw new Error(`找不到文件夹「${item.name}」的本机授权。请重新添加这个目录。`)
    const permission = await controlled(operation, Promise.resolve(root.handle.requestPermission?.({ mode: 'read' })))
    if (permission === 'granted') continue
    const existing = await controlled(operation, Promise.resolve(root.handle.queryPermission?.({ mode: 'read' })))
    if (existing !== 'granted') throw new Error(`没有取得「${item.name}」的读取许可。请在此按钮操作中重新授权目录。`)
  }
}

function scheduledRender(next: JihuaTask): void {
  task.value = next
  if (progressTimer !== undefined) return
  progressTimer = window.setTimeout(() => {
    progressTimer = undefined
    if (task.value) {
      triggerRef(task)
      publishUploadProgress()
    }
  }, 100)
}

function publishUploadProgress(): void {
  const current = task.value
  if (!current) return
  if (current.status === 'ready') {
    clearJihuaProgress()
    return
  }
  const selected = current.rows.filter(isSelected)
  const counted = selected.length ? selected : current.rows
  const done = counted.filter(row => ['success', 'failed', 'already', 'unmatched', 'excluded'].includes(row.status)).length
  const total = counted.length
  const active = current.rows.find(row => ['checking', 'uploading', 'associating', 'verifying'].includes(row.status))
  const success = counted.filter(row => row.status === 'success').length
  const failed = counted.filter(row => row.status === 'failed').length
  const already = counted.filter(row => row.status === 'already').length
  const unmatched = counted.filter(row => row.status === 'unmatched').length
  const activePhase = active ? `${active.applicationNo || active.fileName} · ${rowStatusLabel[active.status]}`
    : `已经传过 ${already} · 没匹配到 ${unmatched} · ${taskStatusLabel[current.status]}`
  const summary = `已处理 ${done}/${total} 行 · 成功 ${success} · 失败 ${failed}`
  const state = current.status === 'running' || current.status === 'pausing' ? 'run'
    : current.status === 'paused' || current.status === 'cancelled' ? 'hold'
      : current.status === 'completed' ? 'done' : 'fail'
  paintTaskCheckProgress(done, total, runStartedAt || current.updatedAt, state, '计划实验室-文件导入', Date.now(), activePhase, summary)
}

async function refreshTask(): Promise<void> {
  if (localRunning.value || (action.value && action.value !== 'load')) return
  const generation = operationGeneration
  const loaded = await repository.load()
  if (localRunning.value || generation !== operationGeneration) return
  const changedTask = (loaded?.id ?? null) !== (task.value?.id ?? null)
  if (changedTask) {
    // Refresh is a read of the durable task. Discard only this tab's unsaved selection overrides.
    selectionOverrides.clear()
    materialOverrides.clear()
    filePage.value = 1
    groupPage.value = 1
    appFilter.value = ''
    statusFilter.value = 'all'
  }
  if (!loaded) {
    task.value = null
    roots.value = []
    otherWorkbenchRunning.value = false
    publishUploadProgress()
    return
  }
  task.value = loaded
  roots.value = await repository.getRoots()
  if (generation !== operationGeneration) return
  otherWorkbenchRunning.value = false
  if (loaded.status === 'running' || loaded.status === 'pausing') {
    try {
      const restored = await withUploadUiLock(async () => {
        const latest = await latestTaskFor(loaded.id)
        if (generation !== operationGeneration) throw new DOMException('任务操作已取消。', 'AbortError')
        if (!latest) return null
        if (latest.status === 'running' || latest.status === 'pausing') {
          latest.status = 'paused'
          for (const row of latest.rows) if (['checking', 'uploading', 'associating', 'verifying'].includes(row.status)) {
            row.status = 'pending'
            row.error = row.receipt ? '任务已恢复为暂停，附件回执已保留。' : row.intent?.sent ? '任务已恢复为暂停；继续时先核对原请求回执。' : '任务已恢复为暂停，可以继续或新建。'
          }
          latest.updatedAt = Date.now()
          await repository.save(latest)
        }
        return latest
      })
      if (restored) task.value = restored
    } catch (error) {
      if (error instanceof UploadLockBusyError) otherWorkbenchRunning.value = true
      else throw error
    }
  }
  await refreshHistory()
  publishUploadProgress()
}

async function initialize(): Promise<void> {
  const operation = beginAction('load')
  bootError.value = ''
  try {
    const [loaded, storedRoots] = await controlled(operation, Promise.all([repository.load(), repository.getRoots()]))
    roots.value = storedRoots
    task.value = loaded
    otherWorkbenchRunning.value = false
    if (loaded && (loaded.status === 'running' || loaded.status === 'pausing')) await refreshTask()
    await controlled(operation, refreshHistory())
    publishUploadProgress()
    initialized = true
    void refreshTabs()
  } catch (error) {
    if (!isAborted(error) && isCurrentAction(operation)) bootError.value = errorText(error, '无法读取本机上传任务。')
  } finally {
    finishAction(operation)
  }
}

async function prepareSelectedTask(operation: ControlledAction): Promise<JihuaTask> {
  const expectedId = task.value?.id ?? null
  action.value = 'prepare'
  try {
    return await withUploadUiLock(async () => {
      const latest = await controlled(operation, latestTaskFor(expectedId))
      if (!latest) throw new Error('任务已被清除，请先新建任务。')
      if (latest.status === 'running' || latest.status === 'pausing') throw new UploadLockBusyError('另一个工作台正在运行这个任务。')
      applyLocalOverrides(latest)
      latest.updatedAt = Date.now()
      if (transport.value) {
        if (latest.session && latest.session.key !== transport.value.session.key) throw new Error('季华平台登录会话与任务不一致，请新建任务后再切换会话。')
        latest.session = transport.value.session
      }
      await repository.save(latest)
      assertCurrentAction(operation)
      task.value = latest
      selectionOverrides.clear()
      materialOverrides.clear()
      return latest
    })
  } finally {
    if (isCurrentAction(operation)) action.value = 'run'
  }
}

async function startOrResume(): Promise<void> {
  if (!canRun.value || !transport.value || !task.value) return
  errorMessage.value = ''
  notice.value = ''
  const operation = beginAction('run')
  let runner: InstanceType<typeof JihuaRunner> | undefined
  pauseRequested.value = false
  try {
    // Permission requests happen directly from this click before the background task starts.
    await controlled(operation, ensureSourcePermissions(operation))
    await controlled(operation, transport.value.checkSession())
    const prepared = await prepareSelectedTask(operation)
    assertCurrentAction(operation)
    const currentTransport = transport.value
    if (!sameSession(prepared.session, currentTransport.session)) throw new Error('当前季华平台登录会话与任务不一致，请重新连接。')
    runStartedAt = Date.now()
    runner = new JihuaRunner(prepared, repository, currentTransport, { onChange: next => {
      if (isCurrentAction(operation) && task.value?.id === next.id) scheduledRender(next)
    } })
    activeRunner = runner
    localRunning.value = true
    action.value = ''
    runningCompletion = runner.run()
    await runningCompletion
    if (!isCurrentAction(operation)) return
    notice.value = prepared.status === 'completed' ? '所选行已处理结束，请查看上传成功、已经传过和没匹配到的各行结果。'
      : prepared.status === 'failed' ? '有文件上传失败，详细原因和附件回执已保留，可核对后继续。' : '任务已暂停，可以在核对会话后继续。'
  } catch (error) {
    if (!isAborted(error) && isCurrentAction(operation)) showActionError(error, '上传任务没有完成。')
  } finally {
    if (activeRunner === runner) { activeRunner = null; runningCompletion = null }
    if (isCurrentAction(operation)) {
      localRunning.value = false
      pauseRequested.value = false
      finishAction(operation)
      if (progressTimer !== undefined) {
        window.clearTimeout(progressTimer)
        progressTimer = undefined
        if (task.value) triggerRef(task)
      }
      try {
        const latest = await repository.load()
        if (latest && latest.id === task.value?.id) task.value = latest
      } catch {
        // Keep the in-memory runner state visible; the next explicit refresh can retry storage.
      }
      publishUploadProgress()
    }
  }
}

function pauseUpload(): void {
  if (!activeRunner || pauseRequested.value) return
  pauseRequested.value = true
  notice.value = '正在停下新任务；当前行会等回执确认后保存检查点。'
  activeRunner.pause()
}

function exportCsv(): void {
  const current = task.value
  if (!current?.rows.length) return
  const headers = ['来源文件夹', '相对路径', '选中', '申请号', '案件名称', '文件描述', '材料类型', '目标台账', '当前阶段/状态', '详细错误', '回执ID']
  const protect = (value: unknown): string => {
    let text = String(value ?? '')
    if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const lines = [headers, ...current.rows.map(row => {
    const sourceName = current.roots.find(root => root.id === row.rootId)?.name ?? ''
    const baseMaterial = materialByKey(materialForRow(row))
    const selectedMaterial = baseMaterial && row.record ? materialForType(baseMaterial, row.record.type) ?? baseMaterial : baseMaterial
    const target = row.record ? [row.record.applicationNo, row.record.name, row.record.id].filter(Boolean).join(' / ') : row.applicationNo
    const receiptIds = row.receipt?.attachments.map(item => item.ID).filter(Boolean).join('、') ?? ''
    return [sourceName, row.relativePath, isSelected(row) ? '是' : '否', row.applicationNo, row.caseName, row.description,
      selectedMaterial?.label ?? '', target, statusLabel(row), rowDetail(row), receiptIds]
  })].map(line => line.map(protect).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${lines}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '计划实验室-文件导入结果.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function setFilePage(next: number): void {
  filePage.value = Math.max(1, Math.min(filePageCount.value, next))
}

function setGroupPage(next: number): void {
  groupPage.value = Math.max(1, Math.min(groupPageCount.value, next))
}

watch([appFilter, statusFilter], () => { filePage.value = 1 })
watch(appGroups, () => { groupPage.value = Math.min(groupPage.value, groupPageCount.value) })

onMounted(() => {
  if (typeof BroadcastChannel === 'function') {
    controlChannel = new BroadcastChannel('patmail-jihua-task-control')
    controlChannel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; taskId?: unknown } | null
      if (data?.type === 'cancel' && data.taskId === task.value?.id && (activeRunner || operationController)) void cancelTask()
    }
  }
  void initialize()
})
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  if (initialized && !localRunning.value) {
    void Promise.all([refreshTask(), refreshTabs()]).catch(error => showActionError(error, '无法刷新本机上传任务。'))
  }
})
onUnmounted(() => {
  operationController?.abort()
  activeRunner?.cancel()
  controlChannel?.close()
  if (progressTimer !== undefined) window.clearTimeout(progressTimer)
  if (scanPaintTimer !== undefined) window.clearTimeout(scanPaintTimer)
})
</script>

<template>
  <PageHead
    title="计划实验室-文件导入"
    desc="只读取文件名来分组；确认案件、材料和登录会话后，再逐项上传。"
    :art="bg('让重复工作变简单.png')"
  >
    <button type="button" class="ghost jh-back" @click="emit('back')">回到工作流</button>
  </PageHead>

  <p v-if="bootError" class="jh-alert card tone-pink" role="alert">{{ bootError }}</p>
  <p v-if="errorMessage" class="jh-alert card tone-pink" role="alert">{{ errorMessage }}</p>
  <p v-else-if="notice" class="jh-alert card tone-green" role="status">{{ notice }}</p>

  <div class="jh-workbench with-rail">
    <main class="col jh-main">
      <section class="card jh-board" aria-label="文件上传工作台">
        <header class="card-head jh-board-head">
          <div>
            <h2>文件上传工作台</h2>
            <p class="hint">按申请号核对文件和材料类型，再开始逐项上传。</p>
          </div>
          <span v-if="task" class="jh-task-status theme-select-badge" :class="taskTone(task.status)">{{ taskStatusLabel[task.status] }}</span>
        </header>

        <div class="toolbar jh-task-toolbar jh-run-actions" aria-label="任务操作">
          <button type="button" class="ghost" :disabled="!canNewTask" @click="createNewTask">新建任务</button>
          <button type="button" class="ghost" :disabled="!canCancel" @click="cancelTask">取消任务</button>
          <button type="button" class="ghost" :disabled="loading" @click="refreshTask">刷新任务</button>
          <button v-if="task && task.rows.length" type="button" class="ghost" @click="exportCsv">导出 CSV</button>
          <button v-if="task && task.rows.length" type="button" class="ghost" :disabled="!canEdit" @click="selectFiltered(true)">全选筛选结果</button>
          <button v-if="task && task.rows.length" type="button" class="ghost" :disabled="!canEdit" @click="selectFiltered(false)">取消筛选结果</button>
          <button v-if="task && task.rows.length && localRunning" type="button" class="ghost" :disabled="pauseRequested" @click="pauseUpload">{{ pauseRequested ? '正在暂停…' : '暂停上传' }}</button>
          <button v-else-if="task && task.rows.length" type="button" class="solid" :disabled="!canRun" @click="startOrResume">
            {{ action === 'prepare' || action === 'run' ? '正在准备…' : task.status === 'paused' || task.status === 'failed' || task.status === 'cancelled' ? '继续上传' : '开始上传' }}
          </button>
          <span v-if="task">已选 {{ selectedCount }} / {{ task.rows.length }} 行</span>
          <span v-else>{{ loading ? '正在恢复本机任务…' : '尚无文件任务' }}</span>
        </div>
        <p class="jh-retention-note hint">新建任务会保留原任务及待核实回执；需要时可从右侧历史任务恢复。</p>

        <div v-if="selectedCount && invalidSelectedRows.length" class="jh-inline-warn tone-orange" role="status">
          {{ invalidSelectedRows.length }} 个已选文件缺少有效申请号或材料类型，将单独标记为“没匹配到”；其余可匹配文件会继续处理。
        </div>
        <div v-if="task?.status === 'ready' && !transport" class="jh-inline-warn tone-orange" role="status">连接并检测一个已登录的季华平台标签页后，才能开始上传。</div>

        <template v-if="task && task.rows.length">
          <div class="filters jh-filters">
            <label>申请号或文件描述
              <input v-model="appFilter" type="search" placeholder="筛选申请号 / 文件描述" :disabled="busy" />
            </label>
            <label>处理状态
              <ThemeSelect v-model="statusFilter" :options="statusOptions" :disabled="busy" />
            </label>
            <span class="jh-count">显示 {{ pageFrom }}–{{ pageTo }} / {{ filteredRows.length }}</span>
          </div>
          <div class="table-scroll jh-table-wrap" role="region" aria-label="文件明细表格" tabindex="0">
            <table class="grid jh-table jh-file-table">
              <thead><tr><th>选</th><th>申请号</th><th>案件名称</th><th>文件描述</th><th>本地文件</th><th>材料类型</th><th>状态</th><th>进度 / 回执</th></tr></thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.id" class="jh-file-row">
                  <td><input type="checkbox" :checked="isSelected(row)" :disabled="!canEdit" :aria-label="`选择 ${row.fileName}`" @change="editSelection([row], ($event.target as HTMLInputElement).checked)" /></td>
                  <td class="mono">{{ row.applicationNo || '未识别' }}</td>
                  <td>{{ row.caseName || '—' }}</td>
                  <td>{{ row.description || '—' }}</td>
                  <td class="jh-path" :title="row.relativePath">{{ row.relativePath }}</td>
                  <td>
                    <label class="jh-material-select">
                      <span class="sr-only">{{ row.fileName }} 的材料类型</span>
                      <ThemeSelect
                        :model-value="materialForRow(row)"
                        :options="materialChoiceOptions(row)"
                        :disabled="!canEdit || materialLocked(row)"
                        :title="materialLocked(row) ? '上传请求已发送或收到回执，材料类型已锁定。' : ''"
                        @update:model-value="editMaterial(row, String($event))"
                      />
                    </label>
                  </td>
                  <td><span class="jh-badge theme-select-badge" :class="statusClass(row)" :data-status="displayStatus(row)">{{ statusLabel(row) }}</span></td>
                  <td class="jh-detail">
                    {{ rowDetail(row) || `尝试 ${row.attempts} 次` }}
                    <button v-if="row.intent?.sent && !row.receipt" type="button" class="ghost jh-row-recovery" :disabled="!canEdit" @click="confirmUnknownUpload(row)">核实后重试</button>
                  </td>
                </tr>
                <tr v-if="!visibleRows.length"><td colspan="8" class="jh-empty">没有符合当前筛选条件的文件。</td></tr>
              </tbody>
            </table>
          </div>
          <nav class="pagination jh-pagination" aria-label="文件分页">
            <button type="button" :disabled="filePage <= 1" @click="setFilePage(filePage - 1)">上一页</button>
            <span>第 {{ filePage }} / {{ filePageCount }} 页 · 每页 {{ PAGE_SIZE }} 行</span>
            <button type="button" :disabled="filePage >= filePageCount" @click="setFilePage(filePage + 1)">下一页</button>
          </nav>

          <details class="jh-groups">
            <summary class="card-head jh-group-head">
              <span><strong>申请号分组预览</strong><small>同一申请号的文件由一个工作组处理</small></span>
              <span>{{ appGroups.length }} 个分组</span>
            </summary>
            <div class="table-scroll jh-group-table-wrap" role="region" aria-label="申请号分组预览表格" tabindex="0">
              <table class="grid jh-table jh-group-table">
                <thead><tr><th>选择</th><th>申请号</th><th>案件名称</th><th>文件数</th><th>文件描述</th><th>已选</th></tr></thead>
                <tbody>
                  <tr v-for="group in visibleGroups" :key="group.applicationNo || group.rows[0]?.id">
                    <td><input type="checkbox" :checked="group.rows.length > 0 && group.selected === group.rows.length" :disabled="!canEdit" :aria-label="`选择 ${group.applicationNo || '未识别申请号'} 组`" @change="selectGroup(group, ($event.target as HTMLInputElement).checked)" /></td>
                    <td class="mono">{{ group.applicationNo || '未识别' }}</td>
                    <td>{{ group.caseName || '—' }}</td>
                    <td>{{ group.rows.length }}</td>
                    <td class="jh-descriptions">{{ [...group.descriptions].join('、') || '未识别' }}</td>
                    <td>{{ group.selected }} / {{ group.rows.length }}</td>
                  </tr>
                  <tr v-if="!visibleGroups.length"><td colspan="6" class="jh-empty">没有匹配的申请号。</td></tr>
                </tbody>
              </table>
            </div>
            <nav v-if="groupPageCount > 1" class="pagination jh-group-pagination" aria-label="申请号分组分页">
              <button type="button" :disabled="groupPage <= 1" @click="setGroupPage(groupPage - 1)">上一页</button>
              <span>第 {{ groupPage }} / {{ groupPageCount }} 页 · {{ appGroups.length }} 个申请号组</span>
              <button type="button" :disabled="groupPage >= groupPageCount" @click="setGroupPage(groupPage + 1)">下一页</button>
            </nav>
          </details>
        </template>
        <div v-else-if="task && task.roots.length" class="empty jh-empty-state" role="status">
          <strong>文件夹已扫描</strong>
          <p>没有找到所选类型的文件。可调整 PDF、DOC、DOCX 后重新扫描。</p>
        </div>
        <div v-else-if="loading" class="empty jh-empty-state" role="status">正在恢复本机任务…</div>
        <div v-else class="empty jh-empty-state">
          <strong>还没有任务</strong>
          <p>从右侧添加一个或多个文件夹。扫描只读取名称，上传前可以按申请号组核对材料类型。</p>
        </div>
      </section>
    </main>

    <aside class="rail jh-rail">
      <section class="card jh-setup-card" aria-label="导入设置">
        <div class="card-head"><h2>导入设置</h2></div>
        <p class="hint">递归读取名称和相对路径，不读取文件内容。可重复添加多个文件夹，重扫会保留已确认状态和回执。</p>
        <div class="toolbar jh-setup-toolbar">
          <button type="button" class="solid" :disabled="!canEdit || loading" @click="addFolder">{{ action === 'scan' ? '正在扫描…' : '添加文件夹' }}</button>
        </div>
        <div class="jh-extension-list" role="group" aria-label="扫描的文件类型">
          <label v-for="extension in EXTENSIONS" :key="extension" class="jh-check">
            <input type="checkbox" :checked="extensions.has(extension)" :disabled="!canEdit || action === 'scan'" @change="toggleExtension(extension, $event)" />
            <span>.{{ extension }}</span>
          </label>
          <small class="hint">默认勾选 PDF、DOC、DOCX。</small>
        </div>
        <div v-if="task" class="jh-root-list">
          <span v-for="root in task.roots" :key="root.id" class="jh-root-chip theme-select-badge tone-pink">{{ root.name }}</span>
          <span v-if="!task.roots.length" class="hint">还没有来源文件夹。</span>
        </div>
        <div class="jh-meta-row">
          <span v-if="task">任务：{{ taskStatusLabel[task.status] }} · {{ groupedFilesText }}</span>
          <span v-else-if="loading">正在恢复本机任务…</span>
          <span v-else>还没有上传任务。</span>
          <span v-if="task?.excludedFiles">最近一次扫描忽略 {{ task.excludedFiles }} 个其他类型文件</span>
        </div>
        <div v-if="action === 'scan'" class="jh-scan-progress" role="status">
          <span class="jh-spinner" aria-hidden="true"></span>
          <span>{{ scannerProgressText || '正在扫描文件名…' }}</span>
          <b>已查看 {{ scanCount }} 个文件名</b>
          <small v-if="scanFileCount">· 识别 {{ scanFileCount }} 个</small>
          <small v-if="storedHandleCount">· 保存 {{ storedHandleCount }} 个文件句柄</small>
        </div>
        <p v-else-if="scannerProgressText" class="jh-scan-note">{{ scannerProgressText }}</p>

        <div class="jh-session-section">
          <div class="card-head jh-session-head"><h2>登录会话</h2><span class="hint">季华平台</span></div>
          <div class="form-grid jh-session-form">
            <label class="jh-session-select">已打开的季华平台标签页
              <ThemeSelect
                :model-value="selectedTabId ?? -1"
                :options="sessionTabOptions"
                :disabled="busy || !tabs.length"
                @update:model-value="setSelectedTab"
              />
            </label>
          </div>
          <div class="toolbar jh-session-actions">
            <button type="button" class="solid" :disabled="selectedTabId == null || busy" @click="connectSelectedTab">
              {{ action === 'connect' ? '正在检测会话…' : '连接并检测登录' }}
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="refreshTabs">查找标签页</button>
            <button type="button" class="ghost" @click="openOa">打开季华平台</button>
            <a class="jh-link" :href="OA_ORIGIN" target="_blank" rel="noreferrer">在新标签页打开</a>
          </div>
          <span class="jh-session-state theme-select-badge" :class="[`session-${sessionState}`, sessionTone()]">
            {{ sessionState === 'connected' ? '已连接' : sessionState === 'mismatch' ? '任务账号不一致' : sessionState === 'loading' ? '正在检测' : sessionState === 'error' ? '连接失败' : '未连接' }}
          </span>
          <p v-if="sessionMessage" class="jh-session-message" :class="{ warn: sessionState === 'mismatch' || sessionState === 'error' }">{{ sessionMessage }}</p>
          <p v-if="sessionMismatchText" class="jh-session-message warn">{{ sessionMismatchText }}</p>
          <p v-if="otherWorkbenchRunning" class="jh-session-message warn">另一个工作台正在上传。这里只显示当前已保存进度；上传结束或暂停后再编辑。</p>
        </div>
      </section>

      <section class="card jh-history-card" aria-label="任务状态和历史">
        <div class="card-head"><h2>任务状态</h2><span v-if="task" class="jh-task-status theme-select-badge" :class="taskTone(task.status)">{{ taskStatusLabel[task.status] }}</span></div>
        <dl v-if="task" class="jh-summary-grid">
          <div><dt>已成功</dt><dd>{{ taskSummary.success }}</dd></div>
          <div><dt>已存在</dt><dd>{{ taskSummary.already }}</dd></div>
          <div><dt>失败</dt><dd>{{ taskSummary.failed }}</dd></div>
          <div><dt>未匹配</dt><dd>{{ taskSummary.unmatched }}</dd></div>
          <div><dt>待处理</dt><dd>{{ taskSummary.pending }}</dd></div>
          <div><dt>待核实</dt><dd>{{ taskSummary.unconfirmed }}</dd></div>
        </dl>
        <p v-else class="jh-session-message">恢复本机任务后，这里会显示处理汇总。</p>
        <div class="jh-history-section">
          <div class="card-head jh-history-head"><h2>任务历史</h2><span class="hint">{{ taskHistory.length }} 条</span></div>
          <div class="form-grid jh-history-form">
            <label class="jh-history-select">选择要恢复的任务
              <ThemeSelect v-model="selectedHistoryId" :options="historyOptions" :disabled="busy || !historyOptions.length" />
            </label>
          </div>
          <button type="button" class="ghost jh-history-restore" :disabled="!selectedHistoryId || busy" @click="restoreHistoryTask">恢复任务</button>
          <p class="jh-history-note hint">恢复后可继续处理该任务中的未完成文件。</p>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.jh-workbench { align-items: start; margin-bottom: 14px; }
.jh-main, .jh-rail { min-width: 0; }
.jh-board { min-width: 0; }
.jh-board-head { align-items: flex-start; margin-bottom: 8px; }
.jh-board-head .hint { margin: 5px 0 0; line-height: 1.5; }
.jh-task-toolbar { margin-bottom: 4px; }
.jh-task-toolbar button { white-space: nowrap; }
.jh-task-toolbar > span { margin-left: auto; color: var(--sub); font-size: 12px; }
.jh-task-status { flex: none; padding: 5px 9px; white-space: nowrap; }
.jh-retention-note { margin: 0 0 10px; font-size: 12px; line-height: 1.5; }
.jh-inline-warn { margin: 10px 0; padding: 9px 11px; border: 1px solid var(--line); color: var(--text); font-size: 12px; line-height: 1.5; }
.jh-filters { align-items: end; margin: 12px 0; }
.jh-filters label { display: grid; gap: 5px; min-width: min(250px, 100%); color: var(--sub); font-size: 12px; }
.jh-filters label:first-child { flex: 1 1 250px; }
.jh-filters label > input { width: 100%; }
.jh-filters .theme-select { display: block; width: min(230px, 100%); }
.jh-count { color: var(--sub); font-size: 12px; white-space: nowrap; }
.jh-filters .jh-count { margin: 0 0 9px auto; }
.jh-table-wrap, .jh-group-table-wrap { max-width: 100%; overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
.jh-table-wrap { scrollbar-gutter: stable; }
.jh-group-table-wrap { max-height: min(42vh, 380px); }
.jh-table { width: 100%; font-size: 12px; }
.jh-table th, .jh-table td { min-width: 72px; height: auto; padding: 8px 10px; vertical-align: top; }
.jh-table th { position: sticky; top: 0; z-index: 1; white-space: nowrap; }
.jh-table td { white-space: normal; line-height: 1.45; }
.jh-table td.mono { white-space: nowrap; }
.jh-group-table { min-width: 720px; }
.jh-file-table { min-width: 1180px; }
.jh-file-table th:first-child, .jh-file-table td:first-child { min-width: 42px; width: 42px; }
.jh-file-table th:nth-child(2), .jh-file-table td:nth-child(2) { min-width: 120px; }
.jh-file-table th:nth-child(3), .jh-file-table td:nth-child(3) { min-width: 130px; }
.jh-file-table th:nth-child(4), .jh-file-table td:nth-child(4) { min-width: 150px; }
.jh-file-table th:nth-child(5), .jh-file-table td:nth-child(5) { min-width: 250px; max-width: 360px; }
.jh-file-table th:nth-child(6), .jh-file-table td:nth-child(6) { min-width: 190px; }
.jh-file-table th:nth-child(7), .jh-file-table td:nth-child(7) { min-width: 105px; }
.jh-file-table th:nth-child(8), .jh-file-table td:nth-child(8) { min-width: 250px; }
.jh-row-recovery { display: block; height: 28px; margin-top: 8px; padding: 0 9px; color: var(--pink); font-size: 11px; }
.jh-path { max-width: 360px; overflow-wrap: anywhere; color: var(--text); }
.jh-descriptions { max-width: 480px; min-width: 250px !important; overflow-wrap: anywhere; }
.jh-detail { max-width: 460px; overflow-wrap: anywhere; color: var(--text); }
.jh-badge { display: inline-flex; padding: 4px 8px; white-space: nowrap; }
.jh-pagination, .jh-group-pagination { margin-top: 10px; }
.jh-groups { margin-top: 16px; border-top: 1px solid var(--line); }
.jh-group-head { margin: 0; padding: 12px 0 8px; cursor: pointer; }
.jh-group-head > span:first-child { display: grid; gap: 3px; }
.jh-group-head small { color: var(--sub); font-size: 12px; font-weight: 400; }
.jh-group-head > span:last-child { color: var(--sub); font-size: 12px; }
.jh-groups[open] .jh-group-head { margin-bottom: 8px; }
.jh-empty { padding: 24px !important; color: var(--sub); text-align: center !important; }
.jh-empty-state { padding: 24px 8px; text-align: center; }
.jh-empty-state strong { display: block; margin-bottom: 6px; color: var(--text); }
.jh-empty-state p { margin: 0; color: var(--sub); font-size: 13px; }
.jh-setup-card .hint { line-height: 1.5; }
.jh-setup-toolbar { margin: 4px 0 8px; }
.jh-extension-list { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin: 8px 0; }
.jh-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.jh-extension-list small { flex-basis: 100%; color: var(--sub); font-size: 12px; }
.jh-root-list { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0; }
.jh-root-chip { display: inline-flex; max-width: 100%; padding: 4px 10px; overflow-wrap: anywhere; }
.jh-meta-row { display: flex; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; margin-top: 8px; color: var(--sub); font-size: 12px; line-height: 1.5; }
.jh-scan-progress { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; color: var(--text); font-size: 13px; }
.jh-scan-progress small { color: var(--sub); }
.jh-scan-progress b { margin-left: auto; font-size: 12px; font-weight: 600; }
.jh-spinner { width: 15px; height: 15px; flex: none; border: 2px solid var(--line); border-top-color: var(--pink); border-radius: 50%; animation: jh-spin .8s linear infinite; }
.jh-scan-note { margin: 10px 0 0; color: var(--sub); font-size: 12px; }
.jh-session-section, .jh-history-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.jh-session-head, .jh-history-head { margin-bottom: 8px; }
.jh-session-head h2, .jh-history-head h2 { font-size: 14px; }
.jh-session-form, .jh-history-form { grid-template-columns: minmax(0, 1fr); gap: 8px; }
.jh-session-select, .jh-history-select { display: grid; gap: 5px; min-width: 0; }
.jh-session-select :deep(.theme-select), .jh-history-select :deep(.theme-select), .jh-material-select :deep(.theme-select) { display: block; width: 100%; }
.jh-material-select { display: block; min-width: 190px; }
.jh-session-actions { gap: 6px; margin: 8px 0; }
.jh-session-actions button { white-space: nowrap; }
.jh-session-state { display: inline-flex; padding: 5px 9px; white-space: nowrap; }
.jh-session-message { margin: 8px 0 0; color: var(--sub); font-size: 12px; line-height: 1.5; }
.jh-session-message.warn { color: var(--pink); }
.jh-link { color: var(--pink); font-size: 12px; text-decoration: none; white-space: nowrap; }
.jh-link:hover { text-decoration: underline; }
.jh-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px 10px; margin: 0; }
.jh-summary-grid > div { min-width: 0; padding: 7px 2px; border-bottom: 1px solid var(--line); }
.jh-summary-grid dt { color: var(--sub); font-size: 11px; }
.jh-summary-grid dd { margin: 3px 0 0; color: var(--text); font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.jh-history-head { margin-bottom: 8px; }
.jh-history-head .hint { margin: 0; white-space: nowrap; }
.jh-history-restore { margin-top: 8px; }
.jh-history-note { margin: 8px 0 0; font-size: 12px; line-height: 1.5; }
.jh-alert { margin: 0 0 12px; padding: 10px 12px; color: var(--text); font-size: 13px; line-height: 1.5; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
@keyframes jh-spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) {
  .jh-board-head { align-items: flex-start; }
  .jh-task-toolbar > span { margin-left: 0; }
  .jh-scan-progress b { margin-left: 0; }
  .jh-filters .jh-count { margin: 0; }
  .jh-session-actions { align-items: flex-start; }
  .jh-session-actions .jh-link { flex-basis: 100%; }
  .jh-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
