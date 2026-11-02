import { JihuaClient, JihuaError, parseUploadReceipt } from './client'
import { materialByKey, materialForType, normalizeApplicationNo } from './materials'
import type { Attachment, Detail, JihuaRepository, JihuaRow, JihuaTask, JihuaTransport, Material, TargetRecord } from './types'

const finished = new Set(['success', 'already', 'excluded'])
const active = new Set(['checking', 'uploading', 'associating', 'verifying'])
const LOCK = 'patmail-jihua-upload'
const DEFAULT_RECOVERY_DELAYS_MS = [3000, 10000, 30000] as const
const WRITE_FAILURE_LIMIT = 3
interface ApplicationBatch { key: string; rows: JihuaRow[]; ready: boolean }
type RecoveryOperationResult<T> = { interrupted: true } | { interrupted: false; value: T }
type WritePath = 'upload' | 'association'
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
class LocalCancellation extends Error {
  constructor() { super('任务已取消。'); this.name = 'LocalCancellation' }
}
class WritePathFailure extends Error {
  constructor(readonly path: WritePath, readonly original: unknown) {
    super(message(original))
    this.name = 'WritePathFailure'
  }
}
function originalError(error: unknown): unknown { return error instanceof WritePathFailure ? error.original : error }
function writePath(error: unknown): WritePath | undefined { return error instanceof WritePathFailure ? error.path : undefined }
function sessionFailure(error: unknown): boolean {
  error = originalError(error)
  if (error instanceof JihuaError && error.kind === 'unknown') return false
  if (error instanceof JihuaError && error.kind === 'session') return true
  if (platformUnavailable(error)) return false
  return /会话|登录|session|unauthori[sz]ed|HTTP 401\b|HTTP 403\b|标签页.*(失效|关闭)|页面.*(变化|关闭)|document.*(lost|changed)/i.test(message(error))
}
function platformUnavailable(error: unknown): boolean {
  error = originalError(error)
  // A retained, failed upload receipt is historical evidence; it cannot establish a new outage.
  if (error instanceof JihuaError && error.kind === 'unknown') return false
  return /HTTP (?:408|429|5\d\d)\b|(?:OA )?(?:上传|请求|读取)超过时限|NetworkError|Failed to fetch|fetch failed|ERR_NETWORK|ECONN(?:RESET|REFUSED|TIMEDOUT)|EHOSTUNREACH|(?:request|read|fetch|connection) (?:timed? ?out|timeout)|(?:网络|连接|读取|请求).{0,16}超时|无法连接季华 OA/i.test(message(error))
}
function confirmed(row: JihuaRow, list: Attachment[]): boolean {
  return Boolean(row.receipt?.attachments.length && row.receipt.attachments.every(item => list.some(existing => existing.ID === item.ID)))
}
function checkApplicable(material: Material, detail: Detail): void {
  const flags = { fast: ['IS_FAST', ['TRUE']], general: ['IS_HAVE_GER', ['TRUE']], review: ['IS_REVIEW', ['TRUE', 'READY']] } as const
  if (!material.group) return
  const [key, values] = flags[material.group]
  if (!(values as readonly unknown[]).includes(detail.form[key])) throw new JihuaError(`平台当前未启用该材料所属阶段（${key}），请在“更新信息”核实后继续；没有自动修改业务开关。`)
}
async function readHeader(file: File): Promise<Uint8Array> {
  const blob = file.slice(0, 512)
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  // FileReader also supports the test/browser implementations lacking Blob.arrayBuffer.
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件。'))
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.readAsArrayBuffer(blob)
  })
}
async function validateFile(row: JihuaRow, file: File): Promise<void> {
  if (file.name !== row.fileName) throw new JihuaError('本地文件已重命名，请重新扫描目录并核对申请号后继续。')
  if (!file.size) throw new JihuaError('文件为空，未上传。')
  const header = await readHeader(file)
  const text = Array.from(header, value => String.fromCharCode(value)).join('').trimStart()
  if (/^(?:<!doctype\s+html|<html\b)/i.test(text)) throw new JihuaError('文件实际是网页，未作为官文上传。')
  if (row.extension === 'doc' && text.startsWith('%PDF-')) throw new JihuaError('文件扩展名是 DOC，实际是 PDF；请改为 .pdf 后重新扫描，未上传。')
  if (row.extension === 'doc' && header[0] === 0x50 && header[1] === 0x4b) {
    throw new JihuaError('文件扩展名是 DOC，实际是 ZIP 容器（可能是 DOCX 或压缩包）；请核实真实类型并更正后重新扫描，未上传。')
  }
  if (row.extension === 'pdf' && !text.startsWith('%PDF-')) throw new JihuaError('文件内容与 PDF 扩展名不符，未上传。')
  if (row.extension === 'docx' && !(header[0] === 0x50 && header[1] === 0x4b)) throw new JihuaError('文件内容与 DOCX 扩展名不符，未上传。')
  if (row.extension === 'doc' && !(header[0] === 0xd0 && header[1] === 0xcf) && !text.startsWith('{\\rtf') && !/wordDocument|Word\.Document/i.test(text)) {
    throw new JihuaError('文件内容不是可确认的 Word 文档，未上传。')
  }
}

/** One coordinator, six application lanes, one writer per application. All side effects have durable checkpoints. */
export class JihuaRunner {
  private stopping = false
  private cancelRequested = false
  private readonly cancelWaiters = new Set<() => void>()
  private running = false
  private saveQueue: Promise<void> = Promise.resolve()
  private storageFailure: Error | null = null
  private batches: ApplicationBatch[] = []
  private activeApplications = new Set<string>()
  private activeWorkers = 0
  private pendingEnqueues = 0
  private dispatcherInitialized = false
  private dispatcherReady = false
  private dispatcherClosed = true
  private dispatcherFailure: unknown
  private dispatcherDone: Promise<void> = Promise.resolve()
  private resolveDispatcherDone: (() => void) | null = null
  private recoveryPromise: Promise<void> | null = null
  private readonly recoveryInterrupts = new Set<() => void>()
  private readonly client: JihuaClient
  constructor(readonly task: JihuaTask, private readonly repository: JihuaRepository, private readonly transport: JihuaTransport,
    private readonly options: { onChange?: (task: JihuaTask) => void; recoveryDelaysMs?: readonly number[] } = {}) { this.client = new JihuaClient(transport) }

  pause(): void {
    if (this.cancelRequested) return
    this.stopping = true
    delete this.task.pauseReason
    delete this.task.recovery
    this.interruptRecoveryWaits()
    if (this.running) this.task.status = 'pausing'
    this.options.onChange?.(this.task)
    this.dispatchBatches()
  }

  cancel(): void {
    if (!this.running || this.cancelRequested) return
    this.cancelRequested = true
    this.stopping = true
    delete this.task.pauseReason
    delete this.task.recovery
    this.interruptRecoveryWaits()
    this.task.status = 'pausing'
    this.options.onChange?.(this.task)
    try { this.transport.stopWaiting?.() } catch { /* The runner wait race still makes local cancellation bounded. */ }
    for (const wake of [...this.cancelWaiters]) wake()
    this.cancelWaiters.clear()
    this.dispatchBatches()
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) throw new LocalCancellation()
  }

  /** Interrupt local waits on cancellation while observing late settlement to avoid unhandled rejections. */
  private work<T>(operation: () => Promise<T>): Promise<T> {
    this.throwIfCancelled()
    const pending = Promise.resolve().then(() => {
      this.throwIfCancelled()
      return operation()
    })
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const cleanup = () => { this.cancelWaiters.delete(onCancel) }
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        complete()
      }
      const onCancel = () => finish(() => reject(new LocalCancellation()))
      this.cancelWaiters.add(onCancel)
      pending.then(value => {
        if (this.cancelRequested) finish(() => reject(new LocalCancellation()))
        else finish(() => resolve(value))
      }, error => finish(() => reject(error instanceof Error ? error : new Error(message(error)))))
    })
  }

  private checkpoint(): Promise<void> {
    if (this.storageFailure) return Promise.reject(this.storageFailure)
    this.task.updatedAt = Date.now()
    this.options.onChange?.(this.task)
    const snapshot = JSON.parse(JSON.stringify(this.task)) as JihuaTask
    this.saveQueue = this.saveQueue.then(() => this.repository.save(snapshot)).catch((error: unknown) => {
      this.stopping = true
      this.interruptRecoveryWaits()
      this.storageFailure = error instanceof Error ? error : new Error(message(error))
      throw this.storageFailure
    })
    return this.saveQueue
  }
  private async state(rows: JihuaRow[], status: JihuaRow['status'], error = ''): Promise<void> {
    this.throwIfCancelled()
    for (const row of rows) { row.status = status; row.error = error; row.updatedAt = Date.now() }
    await this.checkpoint()
    this.throwIfCancelled()
  }
  private async retireReceipt(requestId: string | undefined): Promise<void> {
    if (!requestId || !this.transport.acknowledge || this.cancelRequested) return
    // This is a local-page memory cleanup, never a server delete. Durable IDs remain in the task.
    try { await this.work(() => this.transport.acknowledge!(requestId)) }
    catch (error) {
      if (error instanceof LocalCancellation || this.cancelRequested) throw new LocalCancellation()
      /* A later reconnect/recovery may still use the retained receipt. */
    }
  }

  private async resetWriteFailureStreak(path: WritePath): Promise<void> {
    const current = this.task.writeFailureStreak ?? { upload: 0, association: 0 }
    if (current[path] === 0) return
    this.task.writeFailureStreak = { ...current, [path]: 0 }
    await this.checkpoint()
  }

  private async recordWriteFailure(path: WritePath, error: unknown): Promise<void> {
    const current = this.task.writeFailureStreak ?? { upload: 0, association: 0 }
    const count = current[path] + 1
    const opensCircuit = count >= WRITE_FAILURE_LIMIT && !current.circuitOpen
    this.task.writeFailureStreak = { ...current, [path]: count, ...(opensCircuit ? { circuitOpen: true } : {}) }
    if (opensCircuit) {
      this.stopping = true
      delete this.task.recovery
      const label = path === 'upload' ? '上传' : '附件关联'
      const pauseReason = `季华${label}写入连续 ${WRITE_FAILURE_LIMIT} 次临时失败，已暂停新调度：${message(error)}；已发送请求回执保留，不自动重传。`
      this.task.pauseReason = pauseReason
      this.task.errors = [...this.task.errors.slice(-49), pauseReason]
      this.interruptRecoveryWaits()
    }
    await this.checkpoint()
  }

  private interruptRecoveryWaits(): void {
    for (const interrupt of [...this.recoveryInterrupts]) interrupt()
    this.recoveryInterrupts.clear()
  }

  private waitForRecoveryDelay(delayMs: number): Promise<boolean> {
    if (this.stopping || this.cancelRequested) return Promise.resolve(false)
    return new Promise(resolve => {
      let settled = false
      const timerState: { id?: ReturnType<typeof setTimeout> } = {}
      const finish = (elapsed: boolean) => {
        if (settled) return
        settled = true
        if (timerState.id !== undefined) clearTimeout(timerState.id)
        this.recoveryInterrupts.delete(interrupt)
        resolve(elapsed)
      }
      const interrupt = () => finish(false)
      this.recoveryInterrupts.add(interrupt)
      timerState.id = setTimeout(() => finish(true), Math.max(0, delayMs))
    })
  }

  /** Observe late settlement after a local pause/cancel wins the recovery wait race. */
  private recoveryOperation<T>(operation: () => Promise<T>): Promise<RecoveryOperationResult<T>> {
    if (this.stopping || this.cancelRequested) return Promise.resolve({ interrupted: true })
    const pending = Promise.resolve().then(async (): Promise<RecoveryOperationResult<T>> => {
      if (this.stopping || this.cancelRequested) return { interrupted: true }
      return { interrupted: false, value: await operation() }
    })
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        this.recoveryInterrupts.delete(interrupt)
        complete()
      }
      const interrupt = () => finish(() => resolve({ interrupted: true }))
      this.recoveryInterrupts.add(interrupt)
      pending.then(result => finish(() => resolve(result)), error => finish(() => reject(error instanceof Error ? error : new Error(message(error)))))
    })
  }

  private recoverAvailability(reason: string, applicationNo: string): Promise<void> {
    if (this.stopping || this.cancelRequested) return Promise.resolve()
    let shared = this.recoveryPromise
    if (!shared) {
      const recovery = this.performAvailabilityRecovery(reason, applicationNo)
      this.recoveryPromise = recovery
      shared = recovery
      void recovery.then(() => this.finishAvailabilityRecovery(recovery), () => this.finishAvailabilityRecovery(recovery))
    }
    return shared
  }

  private finishAvailabilityRecovery(completed: Promise<void>): void {
    if (this.recoveryPromise !== completed) return
    this.recoveryPromise = null
    this.dispatchBatches()
    this.finishDispatcherIfIdle()
  }

  private async performAvailabilityRecovery(reason: string, applicationNo: string): Promise<void> {
    const configured = this.options.recoveryDelaysMs ?? DEFAULT_RECOVERY_DELAYS_MS
    const delays = configured.length ? configured : [0]
    let lastFailure: unknown
    for (let index = 0; index < delays.length; index++) {
      if (this.stopping || this.cancelRequested) return
      const configuredDelay = delays[index] ?? 0
      const delay = Math.max(0, Number.isFinite(configuredDelay) ? configuredDelay : 0)
      const retryReason = message(lastFailure ?? reason)
      this.task.recovery = {
        attempt: index + 1,
        maxAttempts: delays.length,
        retryAt: Date.now() + delay,
        reason: retryReason,
      }
      await this.checkpoint()
      if (this.stopping || this.cancelRequested) return
      if (!await this.waitForRecoveryDelay(delay)) return
      if (this.stopping || this.cancelRequested) return

      try {
        const result = await this.recoveryOperation(async () => {
          await this.transport.checkSession()
          try {
            // checkSession confirms the bound page; this read-only search GET verifies OA availability.
            await this.client.findUnique(applicationNo)
          } catch (error) {
            // A valid response with no unique current case still proves the endpoint is reachable.
            if (!(error instanceof JihuaError && error.kind === 'unmatched')) throw error
          }
        })
        if (result.interrupted || this.stopping || this.cancelRequested) return
        delete this.task.recovery
        await this.checkpoint()
        return
      } catch (error) {
        if (this.stopping || this.cancelRequested) return
        if (sessionFailure(error)) {
          this.stopping = true
          delete this.task.recovery
          const pauseReason = `季华登录会话已失效，自动恢复已停止：${message(error)}`
          this.task.pauseReason = pauseReason
          this.task.errors = [...this.task.errors.slice(-49), pauseReason]
          await this.checkpoint()
          return
        }
        lastFailure = error
        if (index === delays.length - 1) {
          this.stopping = true
          delete this.task.recovery
          const pauseReason = `客户平台连续 ${delays.length} 次健康检查失败，已暂停队列：${message(error)}`
          this.task.pauseReason = pauseReason
          this.task.errors = [...this.task.errors.slice(-49), pauseReason]
          await this.checkpoint()
          return
        }
      }
    }
  }

  /** Queue explicit retries without discarding the previous result or any upload recovery evidence. */
  async enqueue(rowIds: readonly string[], materials?: ReadonlyMap<string, string>): Promise<number> {
    const seen = new Set<string>()
    const rows: JihuaRow[] = []
    for (const id of rowIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const row = this.task.rows.find(candidate => candidate.id === id)
      if (!row || (row.status !== 'failed' && row.status !== 'unmatched')) continue
      row.selected = true
      row.status = 'pending'
      row.updatedAt = Date.now()
      const materialKey = materials?.get(id)
      if (materialKey !== undefined && !row.intent?.sent && !row.receipt && (materialKey === '' || materialByKey(materialKey))) row.materialKey = materialKey
      rows.push(row)
    }
    if (!rows.length) return 0

    const canAppend = this.running && !this.stopping && !this.cancelRequested && !this.dispatcherClosed
    const shouldQueue = canAppend && this.dispatcherInitialized
    if (canAppend) this.pendingEnqueues++

    if (shouldQueue) {
      const additions = rows.filter(row => !this.batches.some(batch => batch.rows.some(queued => queued.id === row.id)))
      const byApplication = new Map<string, JihuaRow[]>()
      for (const row of additions) {
        const key = normalizeApplicationNo(row.applicationNo) || row.id
        const group = byApplication.get(key) ?? []
        group.push(row)
        byApplication.set(key, group)
      }
      for (const [key, groupedRows] of byApplication) {
        const existing = this.activeApplications.has(key) ? undefined : this.batches.find(batch => batch.key === key)
        if (existing) {
          existing.rows.push(...groupedRows)
          existing.ready = false
        } else this.batches.push({ key, rows: groupedRows, ready: false })
      }
    } else if (this.running && this.dispatcherClosed && !this.stopping && !this.cancelRequested) {
      // The current workers have drained. Leave the new rows durable for the next explicit resume.
      this.stopping = true
      this.task.status = 'paused'
      this.task.pauseReason = '运行队列已结束，新加入的项目将在继续任务时处理。'
    } else if (!this.running && (this.task.status === 'completed' || this.task.status === 'failed')) {
      this.task.status = 'paused'
      this.task.pauseReason = '新加入的项目已进入待处理队列；点击继续任务后执行。'
    }

    try {
      await this.checkpoint()
    } finally {
      if (canAppend) {
        for (const batch of this.batches) {
          if (!batch.ready && batch.rows.some(row => rows.includes(row))) batch.ready = true
        }
        this.pendingEnqueues--
        this.dispatchBatches()
      }
    }
    return rows.length
  }

  private resetDispatcher(): void {
    this.batches = []
    this.activeApplications.clear()
    this.activeWorkers = 0
    this.pendingEnqueues = 0
    this.dispatcherInitialized = false
    this.dispatcherReady = false
    this.dispatcherClosed = false
    this.dispatcherFailure = undefined
    this.recoveryPromise = null
    this.interruptRecoveryWaits()
    this.dispatcherDone = new Promise(resolve => { this.resolveDispatcherDone = resolve })
  }

  private dispatchBatches(): void {
    if (!this.dispatcherReady || this.dispatcherClosed || this.pendingEnqueues > 0 || this.recoveryPromise) return
    while (!this.stopping && this.activeWorkers < 6) {
      const index = this.batches.findIndex(batch => batch.ready && !this.activeApplications.has(batch.key))
      if (index < 0) break
      const [batch] = this.batches.splice(index, 1)
      if (!batch) break
      this.activeApplications.add(batch.key)
      this.activeWorkers++
      void this.processBatch(batch.rows).catch(error => {
        this.dispatcherFailure ??= error
      }).finally(() => {
        this.activeApplications.delete(batch.key)
        this.activeWorkers--
        this.dispatchBatches()
        this.finishDispatcherIfIdle()
      })
    }
    this.finishDispatcherIfIdle()
  }

  private async processBatch(rows: JihuaRow[]): Promise<void> {
    try { await this.group(rows) }
    catch (error) {
      if (this.storageFailure) throw error
      if (this.cancelRequested || error instanceof LocalCancellation) return
      if (platformUnavailable(error)) {
        const path = writePath(error)
        const cause = originalError(error)
        if (path) await this.recordWriteFailure(path, cause)
        const state = this.stopping ? '新调度已暂停' : '正在执行健康检查'
        const detail = `${message(cause)} 客户平台响应异常，${state}；已发送的请求保留原回执，不自动重传。`
        this.task.errors = [...this.task.errors.slice(-49), detail]
        await this.state(rows.filter(row => !finished.has(row.status)), 'failed', detail)
        if (!this.stopping) await this.recoverAvailability(message(cause), rows[0]?.applicationNo ?? '')
      } else if (sessionFailure(error)) {
        this.stopping = true
        delete this.task.recovery
        this.task.pauseReason = message(error)
        this.task.errors = [...this.task.errors.slice(-49), message(error)]
        this.interruptRecoveryWaits()
        await this.state(rows.filter(row => !finished.has(row.status)), 'pending', message(error))
      } else await this.state(rows.filter(row => !finished.has(row.status)), error instanceof JihuaError && error.kind === 'unmatched' ? 'unmatched' : 'failed', message(error))
    }
  }

  private finishDispatcherIfIdle(): void {
    if (!this.dispatcherReady || this.dispatcherClosed || this.pendingEnqueues > 0 || this.activeWorkers > 0 || this.recoveryPromise) return
    const runnable = this.batches.some(batch => batch.ready && !this.activeApplications.has(batch.key))
    if (!this.stopping && runnable) {
      this.dispatchBatches()
      return
    }
    if (!this.stopping && this.batches.length) return
    this.dispatcherClosed = true
    this.resolveDispatcherDone?.()
    this.resolveDispatcherDone = null
  }

  async run(options: { resetWriteFailureStreak?: boolean } = {}): Promise<void> {
    if (this.running) throw new Error('这条任务正在执行。')
    const execute = async () => {
      this.running = true
      try {
        this.stopping = false
        this.cancelRequested = false
        if (options.resetWriteFailureStreak) {
          const current = this.task.writeFailureStreak ?? { upload: 0, association: 0 }
          this.task.writeFailureStreak = { ...current, upload: 0, association: 0, circuitOpen: false }
          delete this.task.pauseReason
          delete this.task.recovery
          await this.checkpoint()
        }
        if (this.cancelRequested) { await this.finishCancellation(); return }
        if (this.stopping) {
          this.task.status = 'paused'
          await this.checkpoint()
          return
        }
        if (this.task.writeFailureStreak?.circuitOpen) {
          this.stopping = true
          this.task.status = 'paused'
          this.task.pauseReason ??= '季华写入连续临时失败熔断已开启；点击继续任务后核实状态并重试待处理项目。'
          await this.checkpoint()
          return
        }
        try { await this.execute() }
        catch (error) {
          if (this.storageFailure || (!this.cancelRequested && !(error instanceof LocalCancellation))) throw error
        }
        if (this.cancelRequested) await this.finishCancellation()
      } finally { this.running = false }
    }
    if (globalThis.navigator?.locks) {
      await navigator.locks.request(LOCK, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一工作台正在执行季华传文，请先暂停另一条任务。')
        await execute()
      })
    } else await execute()
  }

  private async execute(): Promise<void> {
    this.resetDispatcher()
    delete this.task.pauseReason
    delete this.task.recovery
    try { await this.work(() => this.transport.checkSession()) }
    catch (error) {
      if (sessionFailure(error)) {
        const detail = message(error)
        this.task.pauseReason = detail
        this.task.errors = [...this.task.errors.slice(-49), detail]
        this.task.status = 'paused'
        await this.checkpoint()
      }
      throw error
    }
    this.throwIfCancelled()
    if (this.task.session && this.task.session.key !== this.transport.session.key) {
      const error = new JihuaError('季华登录会话已变化。请回到原账号会话后继续；保留本任务，未跨账号上传。', 'session')
      this.task.pauseReason = message(error)
      this.task.errors = [...this.task.errors.slice(-49), message(error)]
      this.task.status = 'paused'
      await this.checkpoint()
      throw error
    }
    // A refreshed tab may continue association with saved IDs; unknown uploads remain fenced by their original document.
    this.task.session = { ...this.transport.session }
    this.task.status = 'running'
    const groups = new Map<string, JihuaRow[]>()
    for (const row of this.task.rows) {
      if (!row.selected || finished.has(row.status)) continue
      const key = normalizeApplicationNo(row.applicationNo) || row.id
      const list = groups.get(key) ?? []; list.push(row); groups.set(key, list)
    }
    this.batches = [...groups.entries()].map(([key, rows]) => ({ key, rows, ready: true }))
    this.dispatcherInitialized = true
    const dispatcherDone = this.dispatcherDone
    await this.checkpoint()
    this.throwIfCancelled()
    this.dispatcherReady = true
    this.dispatchBatches()
    await dispatcherDone
    if (this.storageFailure) { this.task.status = 'failed'; this.options.onChange?.(this.task); throw this.storageFailure }
    if (this.dispatcherFailure) {
      throw this.dispatcherFailure instanceof Error ? this.dispatcherFailure : new Error(message(this.dispatcherFailure))
    }
    if (this.cancelRequested) return
    for (const row of this.task.rows) if (active.has(row.status)) {
      row.status = 'pending'
      row.error = row.receipt ? '附件回执已保留，继续后核对并完成关联。' : '任务已暂停，继续后先核对平台现状。'
    }
    this.task.status = this.stopping ? 'paused' : this.task.rows.some(row => row.selected && row.status === 'failed') ? 'failed' : 'completed'
    await this.checkpoint()
  }

  private async finishCancellation(): Promise<void> {
    const detail = '任务已取消；已发送请求保留原始回执，继续前先核对平台状态。'
    for (const row of this.task.rows) if (active.has(row.status)) {
      row.status = 'pending'
      row.error = detail
      row.updatedAt = Date.now()
    }
    delete this.task.pauseReason
    delete this.task.recovery
    this.task.status = 'cancelled'
    try { await this.checkpoint() }
    catch (error) {
      this.task.status = 'failed'
      this.options.onChange?.(this.task)
      throw error
    }
  }

  private async group(rows: JihuaRow[]): Promise<void> {
    await this.state(rows, 'checking')
    const record = await this.work(() => this.client.findUnique(rows[0].applicationNo))
    if (this.stopping) return
    for (const row of rows) {
      // Never associate an old upload receipt with a newly resolved duplicate/replacement case.
      if (row.receipt && row.record && (row.record.id !== record.id || row.record.type !== record.type)) throw new JihuaError('案件记录已变化，已有上传回执不能自动转给另一案件。')
      row.record = record
      row.attempts++
    }
    await this.checkpoint()
    const categories = new Map<string, { material: Material; rows: JihuaRow[] }>()
    for (const row of rows) {
      if (row.intent?.sent && row.intent.sessionKey !== this.transport.session.key) {
        await this.state([row], 'failed', '该文件在其他季华账号下已有发送记录，请恢复原任务并连接原账号核对；没有重新上传或跨账号关联。')
        continue
      }
      if (row.intent?.sent && row.intent.materialKey && row.intent.materialKey !== row.materialKey) throw new JihuaError('该文件已发送，不能将原上传回执改关联到另一材料分类。')
      if (row.intent?.sent && row.intent.applicationNo && row.intent.applicationNo !== row.applicationNo) throw new JihuaError('该文件已发送，不能将原上传回执转给另一申请号。')
      const base = materialByKey(row.materialKey)
      const material = base && materialForType(base, record.type)
      if (!material) { await this.state([row], 'unmatched', '文件描述没有匹配到该台账支持的材料，请手动选择目标材料。'); continue }
      const group = categories.get(material.field) ?? { material, rows: [] }
      group.rows.push(row); categories.set(material.field, group)
    }
    for (const { material, rows: files } of categories.values()) {
      if (this.stopping) return
      try { await this.category(record, material, files) }
      catch (error) {
        if (this.storageFailure || sessionFailure(error) || platformUnavailable(error)) throw error
        await this.state(files.filter(row => !finished.has(row.status)), error instanceof JihuaError && error.kind === 'unmatched' ? 'unmatched' : 'failed', message(error))
      }
    }
  }

  private async category(record: TargetRecord, material: Material, rows: JihuaRow[]): Promise<void> {
    const initial = await this.work(() => this.client.detail(record))
    const existing = initial.attachments[material.field] ?? []
    if (existing.length) {
      for (const row of rows) await this.state([row], confirmed(row, existing) ? 'success' : 'already',
        confirmed(row, existing) ? row.receipt?.warning ?? '' : row.receipt ? '平台已有同类附件，未覆盖；本地另有上传回执尚未关联，请人工核实。' : '')
      if (rows.some(row => confirmed(row, existing))) await this.resetWriteFailureStreak('association')
      for (const row of rows) if (row.receipt) await this.retireReceipt(row.intent?.requestId)
      return
    }
    // Selecting a parent directory and its child must not send the same physical file twice.
    const unique: JihuaRow[] = []
    for (const row of rows) {
      const handle = await this.work(() => this.repository.getFile(row.id))
      let duplicate = false
      if (!row.intent && !row.receipt && handle?.isSameEntry) for (const kept of unique) {
        const other = await this.work(() => this.repository.getFile(kept.id))
        if (other && await this.work(() => handle.isSameEntry!(other))) { duplicate = true; break }
      }
      if (duplicate) await this.state([row], 'excluded', '同一物理文件已由另一目录记录纳入，本行不重复上传。')
      else unique.push(row)
    }
    rows = unique
    if (!rows.length) return
    checkApplicable(material, initial)
    if (rows.length > material.limit) throw new JihuaError(`同一申请号选中了 ${rows.length} 份“${material.label}”，平台该类上限为 ${material.limit} 份，请调整选择后继续。`, 'unmatched')
    for (const row of rows) {
      if (this.stopping) return
      await this.work(() => this.transport.checkSession())
      if (row.receipt) {
        await this.resetWriteFailureStreak('upload')
        continue
      }
      if (row.intent?.sent) {
        const sameDocument = row.intent.sessionKey === this.transport.session.key && row.intent.tabId === this.transport.session.tabId && row.intent.documentId === this.transport.session.documentId
        if (!sameDocument) throw new JihuaError('上次上传已发送，但原页面回执不可用。请人工确认平台或暂存附件；没有重新上传。', 'unknown')
        const recovered = await this.work(() => this.transport.receipt(row.intent!.requestId))
        if (recovered.state !== 'done') throw new JihuaError(recovered.error || '上次上传回执尚未确认，请稍后继续；没有重新上传。', 'unknown')
        row.receipt = parseUploadReceipt(recovered.value, Boolean(material.ofcType))
        await this.resetWriteFailureStreak('upload')
        await this.checkpoint()
        await this.retireReceipt(row.intent.requestId)
        continue
      }
      const handle = await this.work(() => this.repository.getFile(row.id))
      if (!handle) throw new JihuaError('本地文件句柄丢失，请重新选择原目录后继续。')
      if (handle.queryPermission && await this.work(() => handle.queryPermission!({ mode: 'read' })) !== 'granted') throw new JihuaError('本地目录读取权限未授权，请点击继续并重新授权目录。')
      const file = await this.work(() => handle.getFile())
      await this.work(() => validateFile(row, file))
      row.intent = { requestId: crypto.randomUUID(), sessionKey: this.transport.session.key, tabId: this.transport.session.tabId,
        documentId: this.transport.session.documentId, sent: false, materialKey: row.materialKey, applicationNo: row.applicationNo }
      await this.state([row], 'uploading')
      if (this.stopping) return
      try {
        const value = await this.work(() => this.transport.upload(file, material, row.intent!.requestId, async () => {
          this.throwIfCancelled()
          if (this.stopping) throw new Error('任务已暂停，文件未发送。')
          row.intent!.sent = true
          await this.checkpoint()
          this.throwIfCancelled()
        }))
        this.throwIfCancelled()
        row.receipt = parseUploadReceipt(value, Boolean(material.ofcType))
      } catch (error) {
        if (this.cancelRequested || error instanceof LocalCancellation) throw new LocalCancellation()
        // A failed callback is not permission to replay multipart. Try the original request's receipt only.
        if (!this.storageFailure && row.intent.sent) {
          try {
            const receipt = await this.work(() => this.transport.receipt(row.intent!.requestId))
            if (receipt.state === 'done') row.receipt = parseUploadReceipt(receipt.value, Boolean(material.ofcType))
          } catch (receiptError) {
            if (this.cancelRequested || receiptError instanceof LocalCancellation) throw new LocalCancellation()
            /* Keep the intent and the original detailed failure for explicit recovery. */
          }
        }
        this.throwIfCancelled()
        if (!row.receipt) {
          if (row.intent.sent && platformUnavailable(error) && !(error instanceof JihuaError && error.kind === 'unknown')) {
            throw new WritePathFailure('upload', error)
          }
          throw error
        }
      }
      await this.resetWriteFailureStreak('upload')
      await this.state([row], 'associating', row.receipt.warning ?? '')
      await this.retireReceipt(row.intent.requestId)
    }
    if (this.stopping) return
    // Re-read immediately before the write; never save the stale pre-upload form.
    const latest = await this.work(() => this.client.detail(record))
    if (this.stopping) return
    const current = latest.attachments[material.field] ?? []
    if (rows.every(row => confirmed(row, current))) {
      for (const row of rows) await this.state([row], 'success', row.receipt?.warning ?? '')
      await this.resetWriteFailureStreak('association')
      return
    }
    if (current.length && rows.some(row => !confirmed(row, current))) {
      for (const row of rows) await this.state([row], confirmed(row, current) ? 'success' : 'already', '上传期间平台已有同类附件，已停止追加，请人工核实未关联的本地回执。')
      if (rows.some(row => confirmed(row, current))) await this.resetWriteFailureStreak('association')
      return
    }
    checkApplicable(material, latest)
    const additions = rows.flatMap(row => row.receipt?.attachments ?? [])
    if (additions.length + current.length > material.limit) throw new JihuaError('上传返回的附件数量超过平台该类上限，回执已保留，未覆盖现有附件。')
    await this.state(rows, 'associating')
    if (this.stopping) return
    let updateError: unknown
    const updateId = crypto.randomUUID()
    try { await this.work(() => this.client.update(record, latest, { [material.field]: additions }, updateId)) }
    catch (error) { updateError = error }
    this.throwIfCancelled()
    await this.state(rows, 'verifying')
    let verify: Detail
    try { verify = await this.work(() => this.client.detail(record)) }
    catch (error) {
      if (updateError instanceof JihuaError && updateError.kind === 'unknown') throw updateError
      const cause = updateError && sessionFailure(updateError) ? originalError(updateError) :
        updateError && platformUnavailable(updateError) ? originalError(updateError) : error
      if (cause instanceof JihuaError && cause.kind === 'unknown') throw cause
      if (platformUnavailable(cause)) throw new WritePathFailure('association', cause)
      if (sessionFailure(cause)) throw originalError(cause)
      throw cause
    }
    const verified = verify.attachments[material.field] ?? []
    for (const row of rows) {
      if (confirmed(row, verified)) await this.state([row], 'success', row.receipt?.warning ?? '')
      else if (updateError instanceof JihuaError && updateError.kind === 'unknown') throw updateError
      else if (updateError && platformUnavailable(updateError)) throw new WritePathFailure('association', updateError)
      else if (updateError && sessionFailure(updateError)) throw originalError(updateError)
      else await this.state([row], 'failed', `${updateError ? message(updateError) + '；' : ''}台账回读未确认附件关联。上传回执已保留，继续时先核对，不重新上传。`)
    }
    if (rows.some(row => confirmed(row, verified))) await this.resetWriteFailureStreak('association')
    await this.retireReceipt(updateId)
  }
}
