import { describe, expect, it } from 'vitest'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { streamDownloadFiles } from '../../../src/api/stream-download'
import type { EasyTransport } from '../../../src/api/transport'
import type { DownloadCache, CachedFileInfo } from '../../../src/api/stream-cache'

function memoryCache() {
  const files = new Map<number, { info: CachedFileInfo; bytes: Uint8Array }>()
  const entry = (index: number) => {
    if (!files.has(index)) files.set(index, { info: { receivedBytes: 0, complete: false }, bytes: new Uint8Array() })
    return files.get(index)!
  }
  const cache: DownloadCache = {
    names: {}, async saveNames(offset, names) { cache.names[String(offset)] = names.slice() },
    async info(index) { return { ...entry(index).info } },
    async reset(index, metadata) { files.set(index, { info: { ...metadata, receivedBytes: 0, complete: false }, bytes: new Uint8Array() }) },
    async write(index, offset, chunk) {
      const file = entry(index)
      if (offset !== file.bytes.length) throw new Error('noncontiguous cache write')
      const bytes = new Uint8Array(offset + chunk.length); bytes.set(file.bytes); bytes.set(chunk, offset)
      file.bytes = bytes; file.info.receivedBytes = bytes.length
    },
    async complete(index, metadata) { entry(index).info = { ...entry(index).info, ...metadata, complete: true } },
    async read(index, offset) { return entry(index).bytes.slice(offset, offset + 65536) }
  }
  return { cache, completed: () => [...files.values()].filter(file => file.info.complete).length }
}

describe('持久流水的空转回归', () => {
  it('ZIP输出阻塞时，完整缓存应释放网络窗口并继续取后面的文件', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ fileId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, fileNo: String(index), fileName: `${index}.pdf` }))
    const setup = memoryCache()
    const transport = { post: async (_operation: string, params: URLSearchParams) => ({ ok: true, data: {
      ClientInfo: { IsLogin: true, Status: true }, file_guid: items[Number(params.get('file_no'))].fileId
    } }), fileDownloadUrl: (id: string) => id } as unknown as EasyTransport
    const chunks: Uint8Array[] = []
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    let active = 0, peak = 0
    const bytes = new Uint8Array(512 * 1024); bytes.set(new TextEncoder().encode('%PDF disk-backed'))
    const running = streamDownloadFiles(transport, items, null, false, {
      cache: setup.cache, sink: new WritableStream({ async write(chunk) { await blocked; chunks.push(chunk.slice()) } }),
      fetchFile: async () => {
        active++; peak = Math.max(peak, active)
        let offset = 0
        return new Response(new ReadableStream({ pull(target) {
          if (offset === bytes.length) { active--; target.close(); return }
          target.enqueue(bytes.slice(offset, offset + 65536)); offset += 65536
        } }, { highWaterMark: 0 }), { headers: { 'Content-Length': String(bytes.length) } })
      }
    })
    try {
      for (let i = 0; i < 200 && setup.completed() < 12; i++) await new Promise(resolve => setTimeout(resolve, 5))
      expect(setup.completed()).toBe(12)
      expect(active).toBe(0)
      expect(peak).toBe(6)
    } finally { release(); await running }
    const reader = new ZipReader(new Uint8ArrayReader(Buffer.concat(chunks)), { useWebWorkers: false })
    try {
      const entries = await reader.getEntries()
      expect(entries.map(entry => entry.filename)).toEqual(items.map(item => item.fileName))
      for (const entry of entries) {
        if (entry.directory) throw new Error('Expected file entry')
        expect(Buffer.from(await entry.getData!(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })).equals(Buffer.from(bytes))).toBe(true)
      }
    } finally { await reader.close() }
  }, 15000)
})
