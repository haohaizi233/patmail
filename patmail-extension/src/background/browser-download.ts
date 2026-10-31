import type { StreamDownloadCommand } from '../shared/message'
import { finalDownloadNameKey } from '../mail/deduplicate'
import { BROWSER_FILE_CHANNEL, type BrowserDownloadStore, type BrowserDownloadTask, type BrowserFileRequest, type BrowserFileReply } from '../browser-download/types'

const BLOCK = 256 * 1024
const capabilityToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
interface Lease {
  token: string; taskId: string; targetId: string; owner: string; tabId: number
  task: BrowserDownloadTask
  active: boolean; sequence: number; offset: number; cursor: number; closed: boolean
  output: Promise<void>
  last?: { sequence: number; offset: number; data: string; settled?: Promise<void>; failed?: boolean }
}
type Reply = { ok: true; token?: string; taskId?: string; info?: Record<string, unknown>; data?: string }
const encode = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
function decode(data: string | undefined): Uint8Array {
  if (typeof data !== 'string' || data.length > Math.ceil(BLOCK / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('下载缓存块编码无效或超过256KiB。')
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
  if (bytes.length > BLOCK) throw new Error('下载流块过大。')
  return bytes
}
function natural(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('下载流位置无效。')
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => JSON.stringify(key) + ':' + canonical(child)).join(',') + '}'
  return JSON.stringify(value)
}
function manifestIdentity(manifest: Record<string, unknown>): string {
  const { cachedNames: _names, zipCreatedAt: _date, ...identity } = manifest
  return canonical(identity)
}

/** Durable disk cache owns bytes; leases authorize a single source and visible file host. */
export class BrowserStreamDownloads {
  private readonly leases = new Map<string, Lease>()
  private readonly tasks = new Map<string, Lease>()
  private readonly pendingCloses = new Map<string, Lease>()
  private readonly closingTargets = new Map<Lease, Promise<void>>()
  private readonly closedTargets = new WeakSet<Lease>()
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly cacheWork = new Map<string, Set<Promise<unknown>>>()
  private readonly tabEpochs = new Map<number, number>()
  private currentOwner: string | undefined
  constructor(private readonly store: BrowserDownloadStore, private readonly host: (request: BrowserFileRequest) => Promise<BrowserFileReply>,
    private readonly nativeStatus?: (targetId: string) => Promise<{ state: 'inProgress' | 'complete'; receivedBytes: number; totalBytes?: number } | undefined>) {}

  private queue<T>(taskId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(taskId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(work)
    this.queues.set(taskId, next)
    void next.finally(() => { if (this.queues.get(taskId) === next) this.queues.delete(taskId) }).catch(() => {})
    return next
  }
  private invalidate(lease: Lease): void {
    lease.active = false
    this.leases.delete(lease.token)
    if (this.tasks.get(lease.taskId) === lease) this.tasks.delete(lease.taskId)
  }
  private async drainCache(taskId: string): Promise<void> {
    await Promise.allSettled([...(this.cacheWork.get(taskId) ?? [])])
  }
  private cacheCommand(lease: Lease, command: Extract<StreamDownloadCommand, { action: 'cache' }>, tabId: number, owner: string): Promise<Reply> {
    natural(command.index)
    const work = this.queue<Reply>(`${lease.taskId}/attachment/${command.index}`, async () => {
      this.assertLease(lease, tabId, owner)
      if (lease.task.state === 'done') throw new Error('下载任务已完成且缓存已清理。')
      const id = lease.taskId, blob = command.index
      let reply: Reply = { ok: true }
      if (command.command === 'info') reply = { ok: true, info: { ...await this.store.info(id, blob) } }
      else if (command.command === 'read') {
        const offset = command.offset ?? 0; natural(offset)
        reply = { ok: true, data: encode(await this.store.read(id, blob, offset, BLOCK)) }
      } else if (command.command === 'write') { natural(command.offset); await this.store.append(id, blob, command.offset, decode(command.data)) }
      else if (command.command === 'reset') await this.store.reset(id, blob, command.metadata ?? {})
      else await this.store.finishBlob(id, blob, command.metadata ?? {})
      this.assertLease(lease, tabId, owner)
      return reply
    })
    const pending = this.cacheWork.get(lease.taskId) ?? new Set<Promise<unknown>>()
    this.cacheWork.set(lease.taskId, pending); pending.add(work)
    void work.finally(() => { pending.delete(work); if (!pending.size && this.cacheWork.get(lease.taskId) === pending) this.cacheWork.delete(lease.taskId) }).catch(() => {})
    return work
  }
  private output(lease: Lease, work: () => Promise<void>): Promise<void> {
    const next = lease.output.then(async () => { this.assertLease(lease); await work() })
    lease.output = next
    void next.catch(() => {})
    return next
  }
  private assertLease(lease: Lease, tabId = lease.tabId, owner = lease.owner): void {
    if (!lease.active || this.leases.get(lease.token) !== lease || lease.tabId !== tabId || lease.owner !== owner) throw new Error('下载凭据已失效或不属于当前账号和来源页面。')
  }
  private async target(lease: Lease, action: BrowserFileRequest['action'], extra: Pick<BrowserFileRequest, 'offset' | 'data'> = {}): Promise<void> {
    let reply: BrowserFileReply
    try { reply = await this.host({ channel: BROWSER_FILE_CHANNEL, taskId: lease.taskId, targetId: lease.targetId, owner: lease.owner, fileName: lease.task.fileName, action, ...extra }) }
    catch (error) { throw new Error('保存文件工作台未响应，缓存已保留：' + (error instanceof Error ? error.message : String(error))) }
    // The background distinguishes an absent target registry from a failed or timed-out close.
    if (action === 'pause' && reply?.ok === false && reply.code === 'HOST_GONE') return
    if (!reply?.ok) throw new Error(reply && 'error' in reply ? reply.error : '保存文件工作台未响应，缓存已保留。')
  }
  private async owned(taskId: string, owner: string): Promise<BrowserDownloadTask | null> {
    const task = await this.store.get(taskId)
    if (task && task.owner !== owner) throw new Error('下载任务不属于当前账号。')
    return task
  }
  private async duplicateCount(task: BrowserDownloadTask): Promise<number> {
    if (!task.manifest.deduplicate || !Array.isArray(task.manifest.items)) return 0
    const items = task.manifest.items as Array<{ fileId: string; fileName: string }>
    const names = await this.store.names(task.taskId), byId = task.manifest.resolvedNames as Record<string, string> | undefined
    const scopes = task.manifest.caseScopes as Record<string, string> | undefined
    const seen = new Set<string>(); let count = 0
    for (const [index, item] of items.entries()) {
      const offset = Math.floor(index / 40) * 40
      const name = names[String(offset)]?.[index - offset] ?? byId?.[item.fileId] ?? (task.manifest.selection === null ? item.fileName : undefined)
      if (typeof name !== 'string') throw new Error('去重命名检查点不完整，不能确认完成。')
      const key = JSON.stringify([scopes?.[item.fileId] ?? item.fileId, finalDownloadNameKey(name, task.manifest.stripAppNoDot === true)])
      if (seen.has(key)) count++; else seen.add(key)
    }
    return count
  }
  private async closeTarget(lease: Lease): Promise<void> {
    if (this.closedTargets.has(lease)) return
    const existing = this.closingTargets.get(lease)
    if (existing) return existing
    this.pendingCloses.set(lease.taskId, lease)
    const closing = this.target(lease, 'pause').then(() => {
      this.closedTargets.add(lease)
      if (this.pendingCloses.get(lease.taskId) === lease) this.pendingCloses.delete(lease.taskId)
    }).finally(() => {
      if (this.closingTargets.get(lease) === closing) this.closingTargets.delete(lease)
    })
    this.closingTargets.set(lease, closing)
    return closing
  }
  private previousTargets(task: BrowserDownloadTask): Lease[] {
    const targets = new Map<string, Lease>()
    const memory = this.tasks.get(task.taskId), pending = this.pendingCloses.get(task.taskId)
    for (const lease of [memory, pending]) if (lease) targets.set(lease.targetId, lease)
    if (task.activeTargetId && !targets.has(task.activeTargetId)) {
      // A restarted worker knows the host identity but cannot reconstruct a source capability.
      targets.set(task.activeTargetId, { token: '', taskId: task.taskId, targetId: task.activeTargetId,
        owner: task.owner, task, tabId: -1, active: false, sequence: 0, offset: 0, cursor: 0, closed: false, output: Promise.resolve() })
    }
    return [...targets.values()]
  }
  private async info(task: BrowserDownloadTask, lease?: Lease, includeManifest = false): Promise<Record<string, unknown>> {
    const archive = await this.store.info(task.taskId, 'archive')
    const snapshot = { state: task.state === 'done' || lease?.closed ? 'complete' : 'inProgress',
      receivedBytes: task.completedBytes ?? archive.receivedBytes,
      sealed: archive.complete || task.state === 'sealed' || task.state === 'done',
      completed: task.state === 'done', ...(task.completedBytes === undefined ? {} : { completedBytes: task.completedBytes }) }
    Object.assign(snapshot, { failedCount: task.failedCount ?? 0 })
    Object.assign(snapshot, { deduplicatedCount: task.deduplicatedCount ?? 0 })
    if (lease && task.state !== 'done' && this.nativeStatus) {
      const native = await this.nativeStatus(lease.targetId)
      if (native) Object.assign(snapshot, native)
    }
    if (!includeManifest) return snapshot
    const cachedNames = await this.store.names(task.taskId)
    return { ...snapshot,
      zipCreatedAt: task.zipCreatedAt, cachedNames,
      manifest: { ...task.manifest, zipCreatedAt: task.zipCreatedAt, cachedNames } }
  }
  async command(command: StreamDownloadCommand, tabId: number, owner: string): Promise<Reply> {
    if (command.action === 'start') {
      const taskId = command.taskId ?? crypto.randomUUID()
      // Snapshot before waiting on a prior writer: callers cannot mutate the frozen manifest.
      const manifest = command.manifest ? structuredClone(command.manifest) : undefined
      const targetId = command.targetId
      const tabEpoch = this.tabEpochs.get(tabId) ?? 0
      const assertSource = () => {
        if (command.expiresAt !== undefined && Date.now() >= command.expiresAt) throw new Error('下载初始化已超时，缓存已保留，请继续下载。')
        if ((this.tabEpochs.get(tabId) ?? 0) !== tabEpoch || (this.currentOwner !== undefined && this.currentOwner !== owner)) throw new Error('来源页面或账号已离开，下载已暂停。')
      }
      if (!owner || !targetId || !command.fileName) throw new Error('请先在工作台启动浏览器下载。')
      return this.queue(taskId, async () => {
        assertSource()
        let task = await this.owned(taskId, owner)
        if (task) {
          if (task.fileName !== command.fileName || (manifest && manifestIdentity(task.manifest) !== manifestIdentity(manifest))) throw new Error('下载文件或冻结清单与原任务不一致。')
          if (task.state === 'done') {
            if (command.newCopy) throw new Error('该任务已完成且缓存已清理，请新建下载任务。')
            return { ok: true, taskId, info: await this.info(task, undefined, true) }
          }
        } else {
          if (!manifest) throw new Error('原任务缓存不存在，无法在缺少清单时恢复。')
          task = { taskId, owner, fileName: command.fileName, manifest, state: 'paused', updatedAt: Date.now(), zipCreatedAt: new Date().toISOString() }
          await this.store.create(task)
        }
        assertSource()
        const previousTargets = this.previousTargets(task)
        for (const previous of previousTargets) this.invalidate(previous)
        await this.drainCache(taskId)
        if (previousTargets.length) {
          await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
          // A late close can replace the new target. Never open until the old host ACKs close.
          for (const previous of previousTargets) await this.closeTarget(previous)
        }
        assertSource()
        const lease: Lease = { token: capabilityToken(), taskId, targetId, owner, tabId, task, active: true, sequence: 0, offset: 0, cursor: 0, closed: false, output: Promise.resolve() }
        this.leases.set(lease.token, lease); this.tasks.set(taskId, lease)
        try {
          await this.store.update(taskId, { activeTargetId: targetId, updatedAt: Date.now() })
          this.assertLease(lease); assertSource()
          await this.target(lease, 'open'); this.assertLease(lease); assertSource()
          const archive = await this.store.info(taskId, 'archive')
          if (archive.complete) task.failedCount = await this.store.skipped?.(taskId) ?? task.failedCount ?? 0
          if (archive.complete) task.deduplicatedCount = await this.duplicateCount(task)
          await this.store.update(taskId, { state: archive.complete ? 'sealed' : 'running', updatedAt: Date.now(), ...(archive.complete ? { failedCount: task.failedCount, deduplicatedCount: task.deduplicatedCount } : {}) })
          task.state = archive.complete ? 'sealed' : 'running'
          const info = await this.info(task, lease, true)
          assertSource()
          return { ok: true, token: lease.token, taskId, info }
        } catch (error) {
          this.invalidate(lease)
          await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
          await this.closeTarget(lease).catch(() => {})
          throw error
        }
      })
    }
    const lease = this.leases.get(command.token)
    if (!lease) throw new Error('下载凭据已失效。')
    this.assertLease(lease, tabId, owner)
    if (command.action === 'cache') return this.cacheCommand(lease, command, tabId, owner)
    // Status is read-only. It must remain observable while a queued write is
    // waiting for the browser sink to pull and acknowledge its bytes.
    if (command.action === 'status') {
      const info = await this.info(lease.task, lease)
      this.assertLease(lease, tabId, owner)
      return { ok: true, info }
    }
    if (command.action === 'pause' || command.action === 'abort') {
      await this.pauseTaskForLease(lease, owner)
      return { ok: true }
    }
    let settled: Promise<void> | undefined
    const result = await this.queue<Reply>(lease.taskId, async () => {
      this.assertLease(lease, tabId, owner)
      // Ownership and frozen metadata were checked at start. Store mutations still validate their
      // durable task record; reading the full manifest for every 256KiB block would amplify disk IO.
      const task = lease.task
      this.assertLease(lease)
      if (command.action === 'complete') {
        if (task.state !== 'done') {
          const archive = await this.store.info(task.taskId, 'archive')
          if (!lease.closed || !archive.complete) throw new Error('保存文件尚未确认关闭，缓存没有清理。')
          await this.drainCache(task.taskId)
          await this.store.complete(task.taskId, archive.receivedBytes)
          task.state = 'done'; task.completedBytes = archive.receivedBytes
        }
        return { ok: true }
      }
      if (task.state === 'done') throw new Error('下载任务已完成且缓存已清理。')
      if (command.action === 'checkpoint') {
        natural(command.offset)
        if (!Array.isArray(command.names) || !command.names.every(name => typeof name === 'string')) throw new Error('缓存文件名无效。')
        await this.store.saveNames(task.taskId, command.offset, command.names)
      } else if (command.action === 'write') {
        if (lease.closed) throw new Error('保存文件已关闭。')
        natural(command.sequence)
        const offset = command.offset ?? lease.offset; natural(offset)
        const retry = lease.last?.sequence === command.sequence && lease.last.offset === offset && lease.last.data === command.data
        if (retry) {
          const last = lease.last!
          if (last.failed) {
            // Retry only the most recently reserved block, after its concrete failure.
            // A duplicate still in flight waits for the original consumption ACK.
            lease.output = Promise.resolve()
            last.failed = false
            settled = last.settled = this.output(lease, async () => {
              await this.target(lease, 'write', { offset, data: command.data })
              this.assertLease(lease); lease.cursor = offset + decode(command.data).length
            })
            void settled.catch(() => { last.failed = true })
          } else settled = last.settled
          return { ok: true }
        }
        if (command.sequence !== lease.sequence || offset !== lease.offset) throw new Error('下载流顺序或位置不一致。')
        const bytes = decode(command.data)
        if (!bytes.length) throw new Error('下载流块为空。')
        await this.store.append(task.taskId, 'archive', offset, bytes)
        this.assertLease(lease)
        // Reserve durable positions under the metadata queue, but never hold it while
        // waiting for Chrome to pull bytes. Cache RPCs, status and pause must remain runnable.
        settled = this.output(lease, async () => {
          await this.target(lease, 'write', { offset, data: command.data })
          this.assertLease(lease); lease.cursor = offset + bytes.length
        })
        lease.offset = offset + bytes.length; lease.sequence++
        lease.last = { sequence: command.sequence, offset, data: command.data, settled }
        const last = lease.last
        void settled.catch(() => { last.failed = true })
      } else if (command.action === 'finish' || command.action === 'resume') {
        if (lease.closed) return { ok: true }
        await this.drainCache(task.taskId)
        let archive = await this.store.info(task.taskId, 'archive')
        if (!archive.complete) {
          if (command.action === 'resume') throw new Error('压缩包尚未封存。')
          if (lease.offset !== archive.receivedBytes) throw new Error('压缩包重放未达到缓存水位，不能封存。')
          await this.store.finishBlob(task.taskId, 'archive')
          task.state = 'sealed'
          archive = await this.store.info(task.taskId, 'archive')
        }
        // Reconcile after an interrupted seal as well: the archive transaction may
        // have committed before the task's summary receipt was written.
        const failedCount = await this.store.skipped?.(task.taskId) ?? task.failedCount ?? 0
        const deduplicatedCount = await this.duplicateCount(task)
        await this.store.update(task.taskId, { state: 'sealed', updatedAt: Date.now(), failedCount, deduplicatedCount })
        task.deduplicatedCount = deduplicatedCount
        task.failedCount = failedCount; task.state = 'sealed'
        const receivedBytes = archive.receivedBytes
        settled = this.output(lease, async () => {
          while (lease.cursor < receivedBytes) {
            this.assertLease(lease)
            const bytes = await this.store.read(task.taskId, 'archive', lease.cursor, Math.min(BLOCK, receivedBytes - lease.cursor))
            if (!bytes.length || bytes.length > BLOCK || lease.cursor + bytes.length > receivedBytes) throw new Error('压缩包缓存不完整，已保留任务。')
            this.assertLease(lease)
            await this.target(lease, 'write', { offset: lease.cursor, data: encode(bytes) })
            this.assertLease(lease); lease.cursor += bytes.length
          }
          this.assertLease(lease); await this.target(lease, 'finish'); this.assertLease(lease)
          lease.closed = true
        })
      }
      return { ok: true }
    })
    await settled
    return result
  }
  async pauseTask(taskId: string, owner: string): Promise<number[]> {
    return this.pauseTaskInternal(taskId, owner)
  }
  private async pauseTaskForLease(lease: Lease, owner: string): Promise<number[]> {
    this.assertLease(lease, lease.tabId, owner)
    if (this.tasks.get(lease.taskId) !== lease) throw new Error('下载凭据已失效或不属于当前账号和来源页面。')
    return this.pauseTaskInternal(lease.taskId, owner, lease)
  }
  private async pauseTaskInternal(taskId: string, owner: string, expectedLease?: Lease): Promise<number[]> {
    // The archive writer can be blocked on a native sink acknowledgement. Ask
    // the target to cancel that pending write before waiting for the task queue.
    const active = this.tasks.get(taskId)
    if (expectedLease && active !== expectedLease) throw new Error('下载凭据已失效或不属于当前账号和来源页面。')
    const preempted = active ? [active] : []
    let preemptedClose: Promise<void> | undefined
    if (active) {
      if (active.owner !== owner) throw new Error('下载任务不属于当前账号。')
      this.invalidate(active)
      preemptedClose = this.closeTarget(active)
      void preemptedClose.catch(() => {})
    }
    return this.queue(taskId, async () => {
      const task = await this.owned(taskId, owner)
      if (!task) return []
      // A token-scoped pause may sit behind a replacement start in the task
      // queue. It owns only the lease that authorized it, never a later lease.
      if (expectedLease && (this.tasks.has(taskId) || (task.activeTargetId && task.activeTargetId !== expectedLease.targetId))) return []
      const targetsById = new Map(preempted.map(lease => [lease.targetId, lease]))
      if (!expectedLease) for (const lease of this.previousTargets(task)) if (!targetsById.has(lease.targetId)) targetsById.set(lease.targetId, lease)
      const targets = [...targetsById.values()]
      for (const lease of targets) this.invalidate(lease)
      await this.drainCache(taskId)
      if (task.state !== 'done') await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
      for (const lease of targets) await (lease === active && preemptedClose ? preemptedClose : this.closeTarget(lease))
      return [...new Set(targets.map(lease => lease.tabId).filter(tabId => tabId >= 0))]
    })
  }
  async discardTask(taskId: string, owner: string): Promise<void> {
    await this.queue(taskId, async () => {
      const task = await this.owned(taskId, owner)
      if (!task) return
      const targets = this.previousTargets(task)
      for (const lease of targets) this.invalidate(lease)
      await this.drainCache(taskId)
      if (task.state !== 'done') await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
      // Keep the record (and its target identity) until every old writer confirms close.
      for (const lease of targets) await this.closeTarget(lease)
      await this.store.discard(taskId)
    })
  }
  private revoke(lease: Lease): void {
    this.invalidate(lease)
    void this.queue(lease.taskId, async () => {
      await this.drainCache(lease.taskId)
      const task = await this.store.get(lease.taskId)
      if (task && task.state !== 'done') await this.store.update(lease.taskId, { state: 'paused', updatedAt: Date.now() })
      await this.closeTarget(lease).catch(() => {})
    }).catch(() => {})
  }
  cancelTab(tabId: number): void {
    this.tabEpochs.set(tabId, (this.tabEpochs.get(tabId) ?? 0) + 1)
    for (const lease of this.leases.values()) if (lease.tabId === tabId) this.revoke(lease)
  }
  revokeOtherOwners(owner: string): void {
    this.currentOwner = owner
    for (const lease of this.leases.values()) if (lease.owner !== owner) this.revoke(lease)
  }
}
