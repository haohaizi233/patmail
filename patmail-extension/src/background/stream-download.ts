import type { StreamDownloadCommand } from '../shared/message'
const BASE = 'http://127.0.0.1:42843'
type Downloads = Pick<typeof chrome.downloads, 'download' | 'cancel'> & Partial<Pick<typeof chrome.downloads, 'search' | 'resume'>>
interface Job {
  tabId: number; owner: string; taskId?: string; id?: number; flight: Promise<number | null>
  failure?: string; cancelled: boolean; touched: number; durable: boolean
}
const binaryBytes = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0))
const encodedBytes = (bytes: Uint8Array) => {
  let result = ''
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(result)
}
/** 任务URL稳定，写入令牌可轮换；下载中断只暂停，明确丢弃才删除。 */
export class LocalStreamDownloads {
  private readonly jobs = new Map<string, Job>()
  constructor(private readonly downloads: Downloads, private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async relay(path: string, init?: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetcher(BASE + path, { ...init, signal: AbortSignal.timeout(init?.method === 'PUT' ? 120_000 : 10_000) })
    } catch (error) {
      const cause = error instanceof Error && 'cause' in error ? String((error as { cause?: unknown }).cause) : ''
      throw new Error(`RELAY ${path} ${error instanceof Error ? error.name : ''}:${error instanceof Error ? error.message : String(error)} cause=${cause}`)
    }
    if (!response.ok) throw new Error(response.status === 409
      ? '缓存或任务版本不一致，没有继续写入。已保留原任务，请检查后重试。'
      : '本机下载流未就绪或未接收完整（HTTP ' + response.status + '），任务缓存仍保留。')
    return response
  }
  private json(path: string, body: unknown = {}): Promise<Response> {
    return this.relay(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }
  private async resume(job: Job): Promise<void> {
    if (job.id === undefined || !this.downloads.search) return
    const item = (await this.downloads.search({ id: job.id }))[0]
    if (!item) throw new Error('原下载记录已被清除。本机缓存仍保留，请从缓存另存为新文件。')
    if (item.state === 'interrupted' || item.paused) {
      if (!item.canResume || !this.downloads.resume) throw new Error('浏览器不支持原记录续传，本机缓存仍保留，请从缓存另存为新文件。')
      await this.downloads.resume(job.id)
    }
  }
  async command(command: StreamDownloadCommand, tabId: number, owner = 'legacy:' + tabId): Promise<{
    ok: true; token?: string; taskId?: string; downloadId?: number; info?: Record<string, unknown>; data?: string
  }> {
    if (command.action === 'start') {
      let data: Record<string, unknown>
      try {
        if (command.manifest || command.taskId) await this.json('/authority', { owner })
        const response = await this.json('/sessions', { fileName: command.fileName, owner,
          ...(command.taskId ? { taskId: command.taskId } : {}), ...(command.manifest ? { manifest: command.manifest } : {}) })
        data = await response.json()
        if (data.protocol !== 'patmail-stream-v1' || typeof data.token !== 'string' || !/^[0-9a-f]{64}$/.test(data.token)) throw new Error('Invalid bridge')
        if ((command.manifest || command.taskId) && data.version !== 2) throw new Error('需要新版续传桥接，请重启 start.py。')
      } catch (error) {
        const detail = error instanceof Error ? error.message : ''
        throw new Error(detail.includes('版本') || detail.includes('缓存') || detail.includes('新版') ? detail
          : '本机流式下载桥接未就绪。请运行仓库 start.py，或 scripts/start-stream-download.ps1 后重试。')
      }
      const token = data.token as string
      const durable = data.version === 2 && typeof data.taskId === 'string'
      const taskId = durable ? data.taskId as string : undefined
      if (data.completed === true) {
        if (command.newCopy) throw new Error('该任务已完成且缓存已清理，请按当前文件新建下载任务。')
        return { ok: true, token, taskId, info: data }
      }
      const url = BASE + (taskId ? '/download/' + taskId : '/stream/' + token)
      let existing: chrome.downloads.DownloadItem | undefined
      if (taskId && this.downloads.search && !command.newCopy) {
        const items = await this.downloads.search({ urlRegex: '^' + url.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$' })
        existing = items.sort((a, b) => b.id - a.id)[0]
      }
      for (const [key, prior] of this.jobs) if (taskId && prior.taskId === taskId) this.jobs.delete(key)
      const job: Job = { tabId, owner, taskId, durable, flight: Promise.resolve(existing?.id ?? null),
        id: existing?.id, cancelled: false, touched: Date.now() }
      this.jobs.set(token, job)
      if (!existing) {
        job.flight = this.downloads.download({ url, filename: command.fileName, saveAs: false, conflictAction: 'uniquify' })
          .then(async id => { job.id = id; if (job.cancelled) await this.downloads.cancel(id).catch(() => {}); return id })
          .catch(() => { job.failure = '浏览器未接住下载。本机任务仍保留，请继续下载。'; return null })
      }
      return { ok: true, token, ...(taskId ? { taskId, info: data } : {}), ...(job.id === undefined ? {} : { downloadId: job.id }) }
    }
    const job = this.jobs.get(command.token)
    if (!job || job.tabId !== tabId) throw new Error('下载流不属于当前来源页面。')
    const token = command.token
    if (command.action === 'abort' || command.action === 'complete') {
      if (command.action === 'abort') {
        job.cancelled = true
        if (job.id !== undefined) await this.downloads.cancel(job.id).catch(() => {})
      }
      if (command.action === 'complete' && job.durable) {
        const item = job.id === undefined ? null : (await this.downloads.search?.({ id: job.id }))?.[0]
        if (!item || item.state !== 'complete') throw new Error('浏览器尚未确认完成，缓存没有清理。')
        await this.json('/complete/' + token, { downloadId: job.id })
      } else await this.relay('/stream/' + token, { method: 'DELETE' })
      this.jobs.delete(token)
      return { ok: true }
    }
    if (command.action === 'pause') {
      if (job.durable) await this.json('/pause/' + token)
      else await this.relay('/stream/' + token, { method: 'DELETE' })
      return { ok: true }
    }
    if (command.action === 'cache') {
      const path = '/cache/' + token + '/' + command.index
      if (command.command === 'info') return { ok: true, info: await (await this.json('/cache-info/' + token + '/' + command.index)).json() }
      if (command.command === 'read') {
        const response = await this.json(path, { read: true, offset: command.offset ?? 0, limit: 65536 })
        return { ok: true, data: encodedBytes(new Uint8Array(await response.arrayBuffer())) }
      }
      if (command.command === 'write') {
        await this.relay(path, { method: 'PUT', headers: { 'X-Patmail-Offset': String(command.offset) }, body: binaryBytes(command.data!) })
      } else await this.json(path, { ...command.metadata, [command.command === 'reset' ? 'reset' : 'complete']: true })
      return { ok: true }
    }
    if (command.action === 'checkpoint') {
      await this.json('/manifest/' + token, { offset: command.offset, names: command.names })
      return { ok: true }
    }
    if (command.action === 'write') {
      const bytes = binaryBytes(command.data)
      if (bytes.length > 256 * 1024) throw new Error('下载流块过大。')
      await this.relay('/stream/' + token, { method: 'PUT', headers: {
        'X-Patmail-Sequence': String(command.sequence),
        ...(command.offset === undefined ? {} : { 'X-Patmail-Offset': String(command.offset) })
      }, body: bytes })
    } else if (command.action === 'finish') {
      await this.json('/finish/' + token)
      const id = await job.flight
      if (id === null) throw new Error(job.failure || '浏览器没有返回下载编号；本机缓存已保留。')
      await this.resume(job)
      return { ok: true, downloadId: id }
    } else if (command.action === 'resume') {
      const info = await (await this.json('/status/' + token)).json()
      if (!info.sealed) throw new Error('正在恢复本机压缩包，封存后才能续传到浏览器。')
      await this.resume(job)
    } else if (Date.now() - job.touched > 15_000) {
      await this.json('/touch/' + token); job.touched = Date.now()
    }
    return { ok: true, ...(job.id === undefined ? {} : { downloadId: job.id }) }
  }
  async discardTask(taskId: string, owner: string): Promise<void> {
    const response = await this.fetcher(BASE + '/discard-task/' + taskId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner }), signal: AbortSignal.timeout(10000) })
    if (!response.ok && response.status !== 404) throw new Error('本机下载任务尚未丢弃，请检查连接后重试。')
    for (const [token, job] of this.jobs) if (job.taskId === taskId) {
      if (job.id !== undefined) await this.downloads.cancel(job.id).catch(() => {})
      this.jobs.delete(token)
    }
  }
  async pauseTask(taskId: string, owner: string): Promise<number[]> {
    const tabs: number[] = []
    const response = await this.fetcher(BASE + '/pause-task/' + taskId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner }), signal: AbortSignal.timeout(10000) })
    if (!response.ok && response.status !== 404) throw new Error('下载任务尚未暂停，请重试。')
    for (const [token, job] of this.jobs) if (job.taskId === taskId) { tabs.push(job.tabId); this.jobs.delete(token) }
    return tabs
  }
  cancelTab(tabId: number): void {
    for (const [token, job] of this.jobs) if (job.tabId === tabId) void this.command({ action: 'pause', token }, tabId).catch(() => {})
  }
  revokeOtherOwners(owner: string): void {
    // Python持久任务不随Service Worker的Map重启而消失，撤销必须覆盖整个同源任务登记表。
    void this.json('/authority', { owner }).catch(() => {})
    for (const [token, job] of this.jobs) if (job.owner !== owner) {
      void this.json('/revoke/' + token).catch(() => {})
      this.jobs.delete(token)
    }
  }
}
