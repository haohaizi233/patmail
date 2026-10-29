import type { StreamDownloadCommand } from '../shared/message'
import { BROWSER_FILE_CHANNEL, type BrowserDownloadStore, type BrowserDownloadTask, type BrowserFileRequest, type BrowserFileReply } from '../browser-download/types'

const BLOCK = 256 * 1024
const capabilityToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
interface Lease {
  token: string; taskId: string; targetId: string; owner: string; tabId: number
  task: BrowserDownloadTask
  active: boolean; sequence: number; offset: number; cursor: number; closed: boolean
  last?: { sequence: number; offset: number; data: string }
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
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly tabEpochs = new Map<number, number>()
  private currentOwner: string | undefined
  constructor(private readonly store: BrowserDownloadStore, private readonly host: (request: BrowserFileRequest) => Promise<BrowserFileReply>) {}

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
  private assertLease(lease: Lease, tabId = lease.tabId, owner = lease.owner): void {
    if (!lease.active || this.leases.get(lease.token) !== lease || lease.tabId !== tabId || lease.owner !== owner) throw new Error('下载凭据已失效或不属于当前账号和来源页面。')
  }
  private async target(lease: Lease, action: BrowserFileRequest['action'], extra: Pick<BrowserFileRequest, 'offset' | 'data'> = {}): Promise<void> {
    let reply: BrowserFileReply
    try { reply = await this.host({ channel: BROWSER_FILE_CHANNEL, taskId: lease.taskId, targetId: lease.targetId, owner: lease.owner, action, ...extra }) }
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
  private async closeTarget(lease: Lease): Promise<void> {
    this.pendingCloses.set(lease.taskId, lease)
    await this.target(lease, 'pause')
    if (this.pendingCloses.get(lease.taskId) === lease) this.pendingCloses.delete(lease.taskId)
  }
  private previousTargets(task: BrowserDownloadTask): Lease[] {
    const targets = new Map<string, Lease>()
    const memory = this.tasks.get(task.taskId), pending = this.pendingCloses.get(task.taskId)
    for (const lease of [memory, pending]) if (lease) targets.set(lease.targetId, lease)
    if (task.activeTargetId && !targets.has(task.activeTargetId)) {
      // A restarted worker knows the host identity but cannot reconstruct a source capability.
      targets.set(task.activeTargetId, { token: '', taskId: task.taskId, targetId: task.activeTargetId,
        owner: task.owner, task, tabId: -1, active: false, sequence: 0, offset: 0, cursor: 0, closed: false })
    }
    return [...targets.values()]
  }
  private async info(task: BrowserDownloadTask, lease?: Lease, includeManifest = false): Promise<Record<string, unknown>> {
    const archive = await this.store.info(task.taskId, 'archive')
    const snapshot = { state: task.state === 'done' || lease?.closed ? 'complete' : 'inProgress',
      receivedBytes: task.completedBytes ?? archive.receivedBytes,
      sealed: archive.complete || task.state === 'sealed' || task.state === 'done',
      completed: task.state === 'done', ...(task.completedBytes === undefined ? {} : { completedBytes: task.completedBytes }) }
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
        if ((this.tabEpochs.get(tabId) ?? 0) !== tabEpoch || (this.currentOwner !== undefined && this.currentOwner !== owner)) throw new Error('来源页面或账号已离开，下载已暂停。')
      }
      if (!owner || !targetId || !command.fileName) throw new Error('请先在工作台选择保存文件。')
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
        if (previousTargets.length) {
          await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
          // A late close can replace the new target. Never open until the old host ACKs close.
          for (const previous of previousTargets) await this.closeTarget(previous)
        }
        assertSource()
        const lease: Lease = { token: capabilityToken(), taskId, targetId, owner, tabId, task, active: true, sequence: 0, offset: 0, cursor: 0, closed: false }
        this.leases.set(lease.token, lease); this.tasks.set(taskId, lease)
        try {
          await this.store.update(taskId, { activeTargetId: targetId, updatedAt: Date.now() })
          this.assertLease(lease); assertSource()
          await this.target(lease, 'open'); this.assertLease(lease); assertSource()
          const archive = await this.store.info(taskId, 'archive')
          await this.store.update(taskId, { state: archive.complete ? 'sealed' : 'running', updatedAt: Date.now() })
          task.state = archive.complete ? 'sealed' : 'running'
          return { ok: true, token: lease.token, taskId, info: await this.info(task, lease, true) }
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
    return this.queue(lease.taskId, async () => {
      this.assertLease(lease, tabId, owner)
      // Ownership and frozen metadata were checked at start. Store mutations still validate their
      // durable task record; reading the full manifest for every 256KiB block would amplify disk IO.
      const task = lease.task
      this.assertLease(lease)
      if (command.action === 'status') return { ok: true, info: await this.info(task, lease) }
      if (command.action === 'pause' || command.action === 'abort') {
        this.invalidate(lease)
        if (task.state !== 'done') await this.store.update(task.taskId, { state: 'paused', updatedAt: Date.now() })
        await this.closeTarget(lease).catch(() => {})
        return { ok: true }
      }
      if (command.action === 'complete') {
        if (task.state !== 'done') {
          const archive = await this.store.info(task.taskId, 'archive')
          if (!lease.closed || !archive.complete) throw new Error('保存文件尚未确认关闭，缓存没有清理。')
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
      } else if (command.action === 'cache') {
        natural(command.index)
        const blob = command.index
        if (command.command === 'info') return { ok: true, info: { ...await this.store.info(task.taskId, blob) } }
        if (command.command === 'read') {
          const offset = command.offset ?? 0; natural(offset)
          return { ok: true, data: encode(await this.store.read(task.taskId, blob, offset, BLOCK)) }
        }
        if (command.command === 'write') { natural(command.offset); await this.store.append(task.taskId, blob, command.offset, decode(command.data)) }
        else if (command.command === 'reset') await this.store.reset(task.taskId, blob, command.metadata ?? {})
        else await this.store.finishBlob(task.taskId, blob, command.metadata ?? {})
      } else if (command.action === 'write') {
        if (lease.closed) throw new Error('保存文件已关闭。')
        natural(command.sequence)
        const offset = command.offset ?? lease.offset; natural(offset)
        const retry = lease.last?.sequence === command.sequence && lease.last.offset === offset && lease.last.data === command.data
        if (retry) return { ok: true }
        if (command.sequence !== lease.sequence || offset !== lease.offset) throw new Error('下载流顺序或位置不一致。')
        const bytes = decode(command.data)
        if (!bytes.length) throw new Error('下载流块为空。')
        await this.store.append(task.taskId, 'archive', offset, bytes)
        this.assertLease(lease)
        await this.target(lease, 'write', { offset, data: command.data })
        this.assertLease(lease)
        lease.cursor = offset + bytes.length; lease.offset = lease.cursor; lease.sequence++
        lease.last = { sequence: command.sequence, offset, data: command.data }
      } else if (command.action === 'finish' || command.action === 'resume') {
        if (lease.closed) return { ok: true }
        let archive = await this.store.info(task.taskId, 'archive')
        if (!archive.complete) {
          if (command.action === 'resume') throw new Error('压缩包尚未封存。')
          if (lease.offset !== archive.receivedBytes) throw new Error('压缩包重放未达到缓存水位，不能封存。')
          await this.store.finishBlob(task.taskId, 'archive')
          await this.store.update(task.taskId, { state: 'sealed', updatedAt: Date.now() })
          task.state = 'sealed'
          archive = await this.store.info(task.taskId, 'archive')
        }
        while (lease.cursor < archive.receivedBytes) {
          this.assertLease(lease)
          const bytes = await this.store.read(task.taskId, 'archive', lease.cursor, Math.min(BLOCK, archive.receivedBytes - lease.cursor))
          if (!bytes.length || bytes.length > BLOCK || lease.cursor + bytes.length > archive.receivedBytes) throw new Error('压缩包缓存不完整，已保留任务。')
          this.assertLease(lease)
          await this.target(lease, 'write', { offset: lease.cursor, data: encode(bytes) })
          this.assertLease(lease); lease.cursor += bytes.length
        }
        this.assertLease(lease); await this.target(lease, 'finish'); this.assertLease(lease)
        lease.closed = true
      }
      return { ok: true }
    })
  }
  async pauseTask(taskId: string, owner: string): Promise<number[]> {
    return this.queue(taskId, async () => {
      const task = await this.owned(taskId, owner)
      if (!task) return []
      const targets = this.previousTargets(task)
      for (const lease of targets) this.invalidate(lease)
      if (task.state !== 'done') await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
      for (const lease of targets) await this.closeTarget(lease)
      return [...new Set(targets.map(lease => lease.tabId).filter(tabId => tabId >= 0))]
    })
  }
  async discardTask(taskId: string, owner: string): Promise<void> {
    await this.queue(taskId, async () => {
      const task = await this.owned(taskId, owner)
      if (!task) return
      const targets = this.previousTargets(task)
      for (const lease of targets) this.invalidate(lease)
      if (task.state !== 'done') await this.store.update(taskId, { state: 'paused', updatedAt: Date.now() })
      // Keep the record (and its target identity) until every old writer confirms close.
      for (const lease of targets) await this.closeTarget(lease)
      await this.store.discard(taskId)
    })
  }
  private revoke(lease: Lease): void {
    this.invalidate(lease)
    void this.queue(lease.taskId, async () => {
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
