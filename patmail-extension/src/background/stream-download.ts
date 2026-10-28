import type { StreamDownloadCommand } from '../shared/message'

const BASE = 'http://127.0.0.1:42843'
interface Job {
  tabId: number
  id?: number
  flight: Promise<number | null>
  failure?: string
  cancelled: boolean
  touched: number
}

/** 只接收已校验的扩展消息；能力令牌必须属于发起下载的EASY标签页。 */
export class LocalStreamDownloads {
  private readonly jobs = new Map<string, Job>()
  constructor(
    private readonly downloads: Pick<typeof chrome.downloads, 'download' | 'cancel'>,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {}

  private async relay(path: string, init?: RequestInit): Promise<Response> {
    const response = await this.fetcher(BASE + path, { ...init, signal: AbortSignal.timeout(init?.method === 'PUT' ? 120_000 : 5000) })
    if (!response.ok) throw new Error('本机下载流已关闭或未接收完整，压缩包没有完成。')
    return response
  }

  async command(command: StreamDownloadCommand, tabId: number): Promise<{ ok: true; token?: string; downloadId?: number }> {
    if (command.action === 'start') {
      let token: string
      try {
        const response = await this.relay('/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: command.fileName }) })
        const data = await response.json()
        if (data.protocol !== 'patmail-stream-v1' || typeof data.token !== 'string' || !/^[0-9a-f]{64}$/.test(data.token)) throw new Error('Invalid bridge')
        token = data.token
      } catch {
        throw new Error('本机流式下载桥接未就绪。请运行仓库 start.py，或 scripts/start-stream-download.ps1 后重试。')
      }
      const job: Job = { tabId, flight: Promise.resolve(null), cancelled: false, touched: Date.now() }
      this.jobs.set(token, job)
      // download()可能等到正文首字节才返回ID；先返回写入令牌，避免首字节互相等待。
      job.flight = this.downloads.download({ url: `${BASE}/stream/${token}`, filename: command.fileName, saveAs: false, conflictAction: 'uniquify' })
        .then(async id => {
          job.id = id
          if (job.cancelled) await this.downloads.cancel(id).catch(() => {})
          return id
        }).catch(async () => {
          job.failure = '浏览器未接住本机下载流，压缩包没有保存完整。'
          await this.relay(`/stream/${token}`, { method: 'DELETE' }).catch(() => {})
          return null
        })
      return { ok: true, token }
    }
    const job = this.jobs.get(command.token)
    if (!job || job.tabId !== tabId) throw new Error('下载流不属于当前来源页面。')
    if (command.action === 'abort') {
      job.cancelled = true
      this.jobs.delete(command.token)
      await this.relay(`/stream/${command.token}`, { method: 'DELETE' }).catch(() => {})
      if (job.id !== undefined) await this.downloads.cancel(job.id).catch(() => {})
      return { ok: true }
    }
    if (job.failure) throw new Error(job.failure)
    if (command.action === 'write') {
      const binary = atob(command.data)
      if (binary.length > 256 * 1024) throw new Error('下载流块过大。')
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      await this.relay(`/stream/${command.token}`, { method: 'PUT', headers: { 'X-Patmail-Sequence': String(command.sequence) }, body: bytes })
    } else if (command.action === 'finish') {
      await this.relay(`/finish/${command.token}`, { method: 'POST', body: '' })
      const id = await job.flight
      if (id === null) throw new Error(job.failure || '浏览器没有返回下载编号。')
      return { ok: true, downloadId: id }
    } else if (Date.now() - job.touched > 15_000) {
      await this.relay(`/touch/${command.token}`, { method: 'POST', body: '' })
      job.touched = Date.now()
    }
    return { ok: true, ...(job.id === undefined ? {} : { downloadId: job.id }) }
  }

  cancelTab(tabId: number): void {
    for (const [token, job] of this.jobs) if (job.tabId === tabId) void this.command({ action: 'abort', token }, tabId).catch(() => {})
  }
}
