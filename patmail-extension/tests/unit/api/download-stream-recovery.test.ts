import { expect, it, vi } from 'vitest'
import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js'
import { isResumableDownloadInterruption, runWithDownloadRecovery } from '../../../src/api/download-failure'
import { streamDownloadFiles } from '../../../src/api/stream-download'
import type { EasyTransport } from '../../../src/api/transport'
import type { DownloadCache, CachedFileInfo } from '../../../src/api/stream-cache'

it('凭据失效、会话暂离与回执超时算可续跑中断；用户暂停、取消与接管不算', () => {
  for (const message of [
    '下载凭据已失效或不属于当前账号和来源页面。',
    '下载凭据已失效。',
    '来源页面或账号已离开，下载已暂停。',
    '保存文件工作台未响应，缓存已保留：连接断开',
    '下载初始化已超时，缓存已保留，请继续下载。',
    '名称检查点保存回执超时：扩展后台没有在时限内返回。 下载已暂停，缓存已保留；请点击「继续下载」恢复。',
    '保存文件尚未确认关闭，缓存没有清理。'
  ]) expect(isResumableDownloadInterruption(new Error(message)), message).toBe(true)
  for (const message of [
    '下载已暂停，本机缓存和任务已保留。',
    '任务已由新的恢复请求接管。',
    '下载已取消。',
    '浏览器下载已取消，本机任务已保留，可在工作台继续或丢弃。',
    '该任务已完成且缓存已清理，请新建下载任务。',
    '读取文件失败，没有完成压缩包。'
  ]) expect(isResumableDownloadInterruption(new Error(message)), message).toBe(false)
  expect(isResumableDownloadInterruption('下载凭据已失效。')).toBe(true)
  expect(isResumableDownloadInterruption(undefined)).toBe(false)
})

it('可续跑中断自动续跑直到成功，间隔按次数递增', async () => {
  const delays: number[] = []
  const retries: Array<[number, string]> = []
  const run = vi.fn()
    .mockRejectedValueOnce(new Error('下载凭据已失效或不属于当前账号和来源页面。'))
    .mockRejectedValueOnce(new Error('保存文件工作台未响应，缓存已保留：超时'))
    .mockResolvedValue('完成')
  await expect(runWithDownloadRecovery(() => run() as Promise<string>, {
    attempts: 3, delayMs: attempt => { delays.push(attempt); return 0 },
    onRetry: (attempt, error) => retries.push([attempt, error.message])
  })).resolves.toBe('完成')
  expect(run).toHaveBeenCalledTimes(3)
  expect(delays).toEqual([1, 2])
  expect(retries.map(([attempt]) => attempt)).toEqual([1, 2])
})

it('次数用尽上抛原错误；用户暂停不续跑', async () => {
  const paused = new Error('下载已暂停，本机缓存和任务已保留。')
  const run = vi.fn().mockRejectedValue(paused)
  await expect(runWithDownloadRecovery(() => run() as Promise<number>, { attempts: 3, delayMs: () => 0 }))
    .rejects.toBe(paused)
  expect(run).toHaveBeenCalledTimes(1)

  const lost = new Error('下载凭据已失效。')
  const dying = vi.fn().mockRejectedValue(lost)
  await expect(runWithDownloadRecovery(() => dying() as Promise<number>, { attempts: 1, delayMs: () => 0 }))
    .rejects.toBe(lost)
  expect(dying).toHaveBeenCalledTimes(2)
})

function setup() {
  const blobs = new Map<number, Uint8Array>(), infos = new Map<number, CachedFileInfo>()
  const cache: DownloadCache = {
    names: {}, async saveNames() {}, async info(i) { return infos.get(i) ?? { receivedBytes: 0, complete: false } },
    async reset(i, meta) { blobs.set(i, new Uint8Array()); infos.set(i, { ...meta, receivedBytes: 0, complete: false }) },
    async write(i, offset, bytes) { const old = blobs.get(i) ?? new Uint8Array(); const next = new Uint8Array(offset + bytes.length); next.set(old); next.set(bytes, offset); blobs.set(i, next); infos.set(i, { ...infos.get(i), receivedBytes: next.length, complete: false }) },
    async complete(i, meta) { infos.set(i, { ...infos.get(i), ...meta, receivedBytes: blobs.get(i)?.length ?? 0, complete: true }) },
    async read(i, offset) { return blobs.get(i)?.slice(offset, offset + 262144) ?? new Uint8Array() }
  }
  const transport = { post: async (_op: string, params: URLSearchParams) => ({ ok: true, data: {
    ClientInfo: { IsLogin: true, Status: true }, file_guid: params.get('file_no'), error_message: ''
  } }), fileDownloadUrl: (id: string) => id } as unknown as EasyTransport
  return { cache, transport }
}

it('凭据中断后续跑同一持久任务：已缓存附件不重取，ZIP完整收尾', async () => {
  const files = Array.from({ length: 3 }, (_, i) => ({ fileId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, fileNo: String(i), fileName: `source-${i}.pdf` }))
  const f = setup()
  // 第一轮前已有两个附件落在持久缓存里（等同中断前已完成的取包）。
  for (const index of [0, 2]) {
    await f.cache.write(index, 0, new TextEncoder().encode(`%PDF ${index}`))
    await f.cache.complete(index, {})
  }
  let attempt = 0
  const fetched: string[] = []
  const runOnce = async () => {
    attempt++
    const current = attempt
    const chunks: Uint8Array[] = []
    await streamDownloadFiles(f.transport, files, null, false, {
      cache: f.cache, zipCreatedAt: '2026-10-31T00:00:00.000Z',
      fetchFile: async id => {
        fetched.push(id)
        if (current === 1) throw new Error('下载凭据已失效或不属于当前账号和来源页面。')
        return new Response(new TextEncoder().encode(`%PDF ${id}`))
      },
      sink: new WritableStream({ write(bytes) { chunks.push(bytes.slice()) } })
    })
    return Buffer.concat(chunks)
  }
  const bytes = await runWithDownloadRecovery(runOnce, { attempts: 3, delayMs: () => 0 })
  expect(attempt).toBe(2)
  // 续跑沿用持久缓存：已缓存附件零网络请求，未缓存附件每轮重取。
  expect(fetched.filter(id => id === '0' || id === '2')).toHaveLength(0)
  expect(fetched.filter(id => id === '1')).toHaveLength(2)
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false })
  expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(['source-0.pdf', 'source-1.pdf', 'source-2.pdf'])
  await reader.close()
})
