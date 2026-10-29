import { expect, it } from 'vitest'
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { streamDownloadFiles } from '../../../src/api/stream-download'
import type { EasyTransport } from '../../../src/api/transport'
import type { DownloadCache, CachedFileInfo } from '../../../src/api/stream-cache'
import { prefetchFile } from '../../../src/api/stream-file'
import { UnavailableDownloadFileError } from '../../../src/api/download-failure'

const files = Array.from({ length: 3 }, (_, i) => ({ fileId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, fileNo: String(i), fileName: `source-${i}.pdf` }))
const notice = '文件不存在或权限不足,您共1个文件合并档.pdf下载失败'
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
    ClientInfo: { IsLogin: true, Status: true }, file_guid: params.get('file_no'), error_message: notice
  } }), fileDownloadUrl: (id: string) => id } as unknown as EasyTransport
  return { cache, transport }
}
async function run(cache: DownloadCache, transport: EasyTransport, fetchFile: (url: string) => Promise<Response>) {
  const chunks: Uint8Array[] = [], progress: Array<{ phase: string; done: number; failed?: number }> = []
  await streamDownloadFiles(transport, files, null, false, { cache, fetchFile, zipCreatedAt: '2026-10-29T00:00:00.000Z', onProgress: value => progress.push(value),
    sink: new WritableStream({ write(bytes) { chunks.push(bytes.slice()) } }) })
  return { bytes: Buffer.concat(chunks), progress }
}

it('不可用附件单独留失败清单，正常附件完成；恢复时冻结失败决定并生成完全相同ZIP', async () => {
  const f = setup()
  const first = await run(f.cache, f.transport, async id => new Response(id === '1'
    ? Uint8Array.from([80, 75, 5, 6, ...Array(18).fill(0)]) : new TextEncoder().encode(`%PDF valid ${id}`)))
  const reader = new ZipReader(new Uint8ArrayReader(first.bytes), { useWebWorkers: false })
  const entries = await reader.getEntries()
  expect(entries.map(entry => entry.filename)).toEqual(['source-0.pdf', 'source-2.pdf', '下载失败清单.txt'])
  const reportEntry = entries[2]
  if (reportEntry.directory) throw new Error('report must be a file')
  const report = await reportEntry.getData!(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })
  expect(new TextDecoder().decode(report)).toContain('source-1.pdf')
  expect(first.progress.at(-1)).toMatchObject({ phase: 'packing', done: 3, failed: 1 })
  expect(await f.cache.info(1)).toMatchObject({ complete: true, receivedBytes: 0, skipReason: notice })
  await reader.close()
  const second = await run(f.cache, f.transport, async () => { throw new Error('已缓存附件与失败决定不应重请求') })
  expect(second.bytes).toEqual(first.bytes)
  // ZIP时间由恢复任务固定；目录和条目内容也必须相同。
  const a = new ZipReader(new Uint8ArrayReader(second.bytes), { useWebWorkers: false })
  expect((await a.getEntries()).map(entry => entry.filename)).toEqual(entries.map(entry => entry.filename))
  await a.close()
})

it('PDF名实际收到完整ZIP时保留PDF和XML原包，用.zip扩展名且不报告不可用', async () => {
  const archive = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false })
  await archive.add('original.pdf', new Uint8ArrayReader(new TextEncoder().encode('%PDF wrapped')))
  await archive.add('data.xml', new Uint8ArrayReader(new TextEncoder().encode('<data/>')))
  const source = await archive.close()
  const f = setup()
  const result = await run(f.cache, f.transport, async id => new Response(id === '1' ? source : new TextEncoder().encode(`%PDF ${id}`)))
  const reader = new ZipReader(new Uint8ArrayReader(result.bytes), { useWebWorkers: false })
  const entries = await reader.getEntries()
  expect(entries.map(entry => entry.filename)).toContain('source-1.zip')
  const packageEntry = entries.find(entry => entry.filename === 'source-1.zip')!
  if (packageEntry.directory) throw new Error('source package must be a file')
  const stored = await packageEntry.getData!(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })
  expect(Buffer.from(stored!)).toEqual(Buffer.from(source))
  expect(result.progress.at(-1)).toMatchObject({ failed: 0 })
  await reader.close()
})

it.each(['login', 'truncated'])('原站通用失败提示不能把%s正文当作可永久跳过的附件', async kind => {
  const file = await prefetchFile('source', 'a.pdf', false, notice, null, new AbortController().signal,
    async () => kind === 'login' ? new Response('<html><body>Login</body></html>', { headers: { 'Content-Type': 'text/plain' } })
      : new Response('x', { headers: { 'Content-Length': '100' } }), () => {})
  await expect(file.ready).rejects.not.toBeInstanceOf(UnavailableDownloadFileError)
  await file.finished
})

it('失败决定reset已提交、complete尚未提交时，恢复补齐失败标记', async () => {
  const f = setup()
  await f.cache.reset(1, { totalBytes: 0, skipReason: notice })
  const result = await run(f.cache, f.transport, async id => { if (id === '1') throw new Error('失败决定已冻结'); return new Response('%PDF normal') })
  expect(await f.cache.info(1)).toMatchObject({ complete: true, skipReason: notice })
  expect(result.progress.at(-1)).toMatchObject({ failed: 1 })
})
