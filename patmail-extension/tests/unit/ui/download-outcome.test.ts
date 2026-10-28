import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchBrowserDownload, type BrowserDownloadSnapshot } from '../../../src/utils/download-outcome'
import type { FileDownloadProgress } from '../../../src/shared/download-progress'

afterEach(() => vi.useRealTimers())

function scripted(snapshots: Array<BrowserDownloadSnapshot | Error | null>) {
  const queue = [...snapshots]
  const poll = vi.fn(async () => {
    const next = queue.shift() ?? null
    if (next instanceof Error) throw next
    return next
  })
  return { poll, remaining: () => queue.length }
}

describe('浏览器下载的流式进度与终态', () => {
  it('字节变化才上报进度，完成时给出唯一终态', async () => {
    vi.useFakeTimers()
    const events: FileDownloadProgress[] = []
    const { poll } = scripted([
      { state: 'inProgress', receivedBytes: 0, totalBytes: 100 },
      { state: 'inProgress', receivedBytes: 0, totalBytes: 100 },
      { state: 'inProgress', receivedBytes: 40, totalBytes: 100 },
      { state: 'complete', receivedBytes: 100, totalBytes: 100 }
    ])
    const pending = watchBrowserDownload({
      downloadId: 7,
      poll,
      intervalMs: 1000,
      onProgress: progress => events.push(progress)
    })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toEqual({ state: 'complete', receivedBytes: 100, totalBytes: 100, error: '' })
    // 相同字节不重复报：4 次回读只有 3 条事件（0、40、完成）。
    expect(events.map(event => [event.phase, event.state, event.receivedBytes])).toEqual([
      ['downloading', 'inProgress', 0],
      ['downloading', 'inProgress', 40],
      ['downloading', 'complete', 100]
    ])
    expect(poll).toHaveBeenCalledTimes(4)
  })

  it('浏览器报中断时把中断当终态带回原因', async () => {
    vi.useFakeTimers()
    const events: FileDownloadProgress[] = []
    const { poll } = scripted([{ state: 'interrupted', receivedBytes: 12, error: 'NETWORK_FAILED' }])
    const pending = watchBrowserDownload({ downloadId: 8, poll, intervalMs: 1000, onProgress: progress => events.push(progress) })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toEqual({ state: 'interrupted', receivedBytes: 12, totalBytes: null, error: 'NETWORK_FAILED' })
    expect(events.at(-1)?.state).toBe('interrupted')
  })

  it('连续读不到任务就放弃跟踪返回 null，不能谎报中断', async () => {
    vi.useFakeTimers()
    const { poll } = scripted([null, null, null, null, null])
    const pending = watchBrowserDownload({ downloadId: 9, poll, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(6000)
    await expect(pending).resolves.toBeNull()
    expect(poll).toHaveBeenCalledTimes(5)
  })

  it('单次读失败按读不到处理，之后恢复就继续跟踪', async () => {
    vi.useFakeTimers()
    const { poll } = scripted([new Error('后台没接住'), null, { state: 'complete', receivedBytes: 5 }])
    const pending = watchBrowserDownload({ downloadId: 10, poll, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000)
    await expect(pending).resolves.toEqual({ state: 'complete', receivedBytes: 5, totalBytes: null, error: '' })
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('取消信号立即停止跟踪', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const { poll } = scripted([{ state: 'inProgress', receivedBytes: 1 }, { state: 'inProgress', receivedBytes: 2 },
      { state: 'inProgress', receivedBytes: 3 }, { state: 'inProgress', receivedBytes: 4 }, { state: 'inProgress', receivedBytes: 5 },
      { state: 'inProgress', receivedBytes: 6 }])
    const pending = watchBrowserDownload({ downloadId: 11, poll, intervalMs: 1000, signal: controller.signal })
    await vi.advanceTimersByTimeAsync(2500)
    controller.abort()
    await expect(pending).resolves.toBeNull()
    expect(poll.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
