import { JihuaClient, JihuaError, parseUploadReceipt } from './client'
import { materialByKey, materialForType, normalizeApplicationNo } from './materials'
import type { Attachment, Detail, JihuaRepository, JihuaRow, JihuaTask, JihuaTransport, Material, TargetRecord } from './types'

const finished = new Set(['success', 'already', 'excluded'])
const active = new Set(['checking', 'uploading', 'associating', 'verifying'])
const LOCK = 'patmail-jihua-upload'
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
class LocalCancellation extends Error {
  constructor() { super('任务已取消。'); this.name = 'LocalCancellation' }
}
function sessionFailure(error: unknown): boolean {
  if (error instanceof JihuaError && error.kind === 'unknown') return false
  return error instanceof JihuaError && error.kind === 'session' || /会话|登录|session|unauthori[sz]ed|401|403|标签页.*(失效|关闭)|页面.*(变化|关闭)|无法连接季华|NetworkError|Failed to fetch|document.*(lost|changed)/i.test(message(error))
}
function platformUnavailable(error: unknown): boolean {
  // A retained, failed upload receipt is historical evidence; it cannot establish a new outage.
  if (error instanceof JihuaError && error.kind === 'unknown') return false
  return /HTTP (?:408|429|5\d\d)\b|OA (?:上传|请求)超过时限/.test(message(error))
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
  private readonly client: JihuaClient
  constructor(readonly task: JihuaTask, private readonly repository: JihuaRepository, private readonly transport: JihuaTransport,
    private readonly options: { onChange?: (task: JihuaTask) => void } = {}) { this.client = new JihuaClient(transport) }

  pause(): void {
    if (this.cancelRequested) return
    this.stopping = true
    if (this.running) this.task.status = 'pausing'
    this.options.onChange?.(this.task)
  }

  cancel(): void {
    if (!this.running || this.cancelRequested) return
    this.cancelRequested = true
    this.stopping = true
    this.task.status = 'pausing'
    this.options.onChange?.(this.task)
    try { this.transport.stopWaiting?.() } catch { /* The runner wait race still makes local cancellation bounded. */ }
    for (const wake of [...this.cancelWaiters]) wake()
    this.cancelWaiters.clear()
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

  async run(): Promise<void> {
    if (this.running) throw new Error('这条任务正在执行。')
    const execute = async () => {
      this.running = true; this.stopping = false; this.cancelRequested = false
      try {
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
    await this.work(() => this.transport.checkSession())
    this.throwIfCancelled()
    if (this.task.session && this.task.session.key !== this.transport.session.key) {
      throw new JihuaError('季华登录会话已变化。请回到原账号会话后继续；保留本任务，未跨账号上传。', 'session')
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
    await this.checkpoint()
    this.throwIfCancelled()
    const queue = [...groups.values()]
    let index = 0
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (!this.stopping) {
        const rows = queue[index++]
        if (!rows) return
        try { await this.group(rows) }
        catch (error) {
          if (this.storageFailure) throw error
          if (this.cancelRequested || error instanceof LocalCancellation) return
          if (platformUnavailable(error)) {
            this.stopping = true
            const detail = `${message(error)} 客户平台暂不可用，已暂停新上传；已发送的请求保留原回执，不自动重传。`
            this.task.errors = [...this.task.errors.slice(-49), detail]
            await this.state(rows.filter(row => !finished.has(row.status)), 'failed', detail)
          } else if (sessionFailure(error)) {
            this.stopping = true
            this.task.errors = [...this.task.errors.slice(-49), message(error)]
            await this.state(rows.filter(row => !finished.has(row.status)), 'pending', message(error))
          } else await this.state(rows.filter(row => !finished.has(row.status)), error instanceof JihuaError && error.kind === 'unmatched' ? 'unmatched' : 'failed', message(error))
        }
      }
    })
    const settled = await Promise.allSettled(workers)
    if (this.storageFailure) { this.task.status = 'failed'; this.options.onChange?.(this.task); throw this.storageFailure }
    const rejected = settled.find(item => item.status === 'rejected')
    if (rejected?.status === 'rejected') throw rejected.reason
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
      if (row.receipt) continue
      if (row.intent?.sent) {
        const sameDocument = row.intent.sessionKey === this.transport.session.key && row.intent.tabId === this.transport.session.tabId && row.intent.documentId === this.transport.session.documentId
        if (!sameDocument) throw new JihuaError('上次上传已发送，但原页面回执不可用。请人工确认平台或暂存附件；没有重新上传。', 'unknown')
        const recovered = await this.work(() => this.transport.receipt(row.intent!.requestId))
        if (recovered.state !== 'done') throw new JihuaError(recovered.error || '上次上传回执尚未确认，请稍后继续；没有重新上传。', 'unknown')
        row.receipt = parseUploadReceipt(recovered.value, Boolean(material.ofcType))
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
        if (!row.receipt) throw error
      }
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
      return
    }
    if (current.length && rows.some(row => !confirmed(row, current))) {
      for (const row of rows) await this.state([row], confirmed(row, current) ? 'success' : 'already', '上传期间平台已有同类附件，已停止追加，请人工核实未关联的本地回执。')
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
    const verify = await this.work(() => this.client.detail(record))
    const verified = verify.attachments[material.field] ?? []
    for (const row of rows) {
      if (confirmed(row, verified)) await this.state([row], 'success', row.receipt?.warning ?? '')
      else await this.state([row], 'failed', `${updateError ? message(updateError) + '；' : ''}台账回读未确认附件关联。上传回执已保留，继续时先核对，不重新上传。`)
    }
    await this.retireReceipt(updateId)
  }
}
