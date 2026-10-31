import { describe, expect, it } from 'vitest'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { streamDownloadFiles } from '../../../src/api/stream-download'
import type { DownloadCache, CachedFileInfo } from '../../../src/api/stream-cache'
import type { EasyTransport } from '../../../src/api/transport'
import { asError } from '../../../src/api/download-failure'

const wordHtml = '<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta name=ProgId content=Word.Document></head><body>fixture document</body></html>'
const mailSource = 'X-QQ-mid: regression\r\nReceived: from fixture.invalid\r\nX-Padding: ' + 'x'.repeat(600) +
  '\r\nDate: Tue, 1 Jan 2030 00:00:00 +0000\r\nFrom: sender@example.invalid\r\nTo: recipient@example.invalid\r\nSubject: fixture\r\nMIME-Version: 1.0\r\nMessage-ID: <fixture@example.invalid>\r\nContent-Type: multipart/related; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nfixture mail\r\n--fixture--'
const items = Array.from({ length: 3 }, (_, index) => ({ fileId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, fileNo: String(index), fileName: `file-${index}.pdf` }))

function cacheFixture() {
  const data = new Map<number, { info: CachedFileInfo; bytes: Uint8Array }>()
  const entry = (index: number) => {
    if (!data.has(index)) data.set(index, { info: { receivedBytes: 0, complete: false }, bytes: new Uint8Array() })
    return data.get(index)!
  }
  const cache: DownloadCache = {
    names: {}, async saveNames(offset, names) { this.names[offset] = names },
    async info(index) { return { ...entry(index).info } },
    async reset(index, metadata) { data.set(index, { info: { receivedBytes: 0, complete: false, ...metadata }, bytes: new Uint8Array() }) },
    async write(index, offset, bytes) {
      const file = entry(index)
      if (offset !== file.bytes.length) throw Error('noncontiguous write')
      const next = new Uint8Array(offset + bytes.length); next.set(file.bytes); next.set(bytes, offset)
      file.bytes = next; file.info.receivedBytes = next.length
    },
    async complete(index, metadata) { Object.assign(entry(index).info, metadata, { complete: true, receivedBytes: entry(index).bytes.length }) },
    async read(index, offset) { return entry(index).bytes.slice(offset, offset + 65536) }
  }
  return { cache }
}

function fixture(fetchFile: (index: number, attempt: number) => Promise<Response>, cache?: DownloadCache) {
  const prepares: number[] = [], attempts = new Map<number, number>(), chunks: Uint8Array[] = []
  const transport = {
    async post(_operation: string, params: URLSearchParams) {
      const index = Number(params.get('file_no')); prepares.push(index)
      return { ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_guid: String(index) } }
    }, fileDownloadUrl: (guid: string) => guid
  } as unknown as EasyTransport
  const run = () => streamDownloadFiles(transport, items, null, false, {
    cache, sink: new WritableStream({ write(chunk) { chunks.push(chunk.slice()) } }),
    fetchFile: async url => {
      const index = Number(url), attempt = (attempts.get(index) ?? 0) + 1; attempts.set(index, attempt)
      return fetchFile(index, attempt)
    }
  })
  const entries = async () => {
    const reader = new ZipReader(new Uint8ArrayReader(Buffer.concat(chunks)), { useWebWorkers: false })
    try {
      return await Promise.all((await reader.getEntries()).map(async entry => {
        if (entry.directory) throw Error('Expected file entry')
        return { name: entry.filename, text: Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })).toString() }
      }))
    } finally { await reader.close() }
  }
  return { run, entries, prepares, attempts }
}

// HAR 2026-10-31：末三条 DownLoad 状态0、ERR_ABORTED，尚在排队即被全局取消。
// 只保留协议与并发关系，业务名称和文件编号使用合成值。
const tailItems = Array.from({ length: 4 }, (_, index) => ({
  fileId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  fileNo: `tail-${index}`, fileName: index ? `pending-${index}.pdf` : 'html-source.pdf'
}))
function cancelledTail(cache: DownloadCache, mode: 'word' | 'pause' | 'resume', signal?: AbortSignal) {
  let pending = 0, notifyPending!: () => void
  const allPending = new Promise<void>(resolve => { notifyPending = resolve })
  const cancelled: number[] = [], requested: number[] = [], chunks: Uint8Array[] = []
  const transport = {
    async post(_operation: string, params: URLSearchParams, requestSignal: AbortSignal) {
      const index = Number(params.get('file_no')!.split('-')[1]); requested.push(index)
      if (index && mode !== 'resume') {
        pending++; if (pending === 3) notifyPending()
        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined
          const abort = () => { clearTimeout(timer); cancelled.push(index); reject(asError(requestSignal.reason)) }
          requestSignal.addEventListener('abort', abort, { once: true })
          if (requestSignal.aborted) abort()
          else if (mode === 'word') timer = setTimeout(() => {
            requestSignal.removeEventListener('abort', abort); resolve()
          }, 20)
        })
      }
      return { ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_guid: String(index) } }
    }, fileDownloadUrl: (guid: string) => guid
  } as unknown as EasyTransport
  const run = () => streamDownloadFiles(transport, tailItems, null, false, {
    cache, signal, sink: new WritableStream({ write(chunk) { chunks.push(chunk.slice()) } }),
    fetchFile: async url => {
      const index = Number(url)
      if (!index && mode === 'word') { await allPending; return new Response(wordHtml) }
      return new Response(`%PDF tail fixture ${index}`)
    }
  })
  const entries = async () => {
    const reader = new ZipReader(new Uint8ArrayReader(Buffer.concat(chunks)), { useWebWorkers: false })
    try {
      return await Promise.all((await reader.getEntries()).map(async entry => {
        if (entry.directory) throw Error('Expected file entry')
        return { name: entry.filename, text: Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })).toString() }
      }))
    } finally { await reader.close() }
  }
  return { run, entries, allPending, cancelled, requested }
}

describe('单文件正文异常容灾', () => {
  it.each([false, true])('持久缓存=%s：PDF收到EML邮件后只重试该附件，恢复后完整入包', async persistent => {
    const f = fixture(async (index, attempt) => new Response(index === 1 && attempt === 1 ? mailSource : `%PDF fixture ${index}`), persistent ? cacheFixture().cache : undefined)
    await f.run()
    expect(f.prepares.filter(index => index === 1)).toHaveLength(2)
    expect(await f.entries()).toEqual(items.map((item, index) => ({ name: item.fileName, text: `%PDF fixture ${index}` })))
  })

  it('EML持续冒充PDF：尝试三次后仅跳过邮件，失败原因可恢复，其余PDF完整保留', async () => {
    const { cache } = cacheFixture()
    const f = fixture(async index => new Response(index === 1 ? mailSource : `%PDF fixture ${index}`), cache)
    await f.run()
    expect(f.prepares.filter(index => index === 1)).toHaveLength(3)
    const entries = await f.entries()
    expect(entries.map(entry => entry.name)).toEqual(['file-0.pdf', 'file-2.pdf', '下载失败清单.txt'])
    expect(entries[2].text).toContain('EML')
    expect((await cache.info(1)).skipReason).toContain('EML')
    const resumed = fixture(async () => { throw Error('完整缓存与失败清单不能重复请求') }, cache)
    await resumed.run()
    expect(resumed.prepares).toEqual([])
    expect(await resumed.entries()).toEqual(entries)
  })

  it('旧完整缓存实际是EML时继续任务只清理并重取该附件', async () => {
    const { cache } = cacheFixture()
    for (let index = 0; index < 3; index++) {
      const bytes = new TextEncoder().encode(index === 1 ? mailSource : `%PDF fixture ${index}`)
      await cache.write(index, 0, bytes); await cache.complete(index, { totalBytes: bytes.length })
    }
    const f = fixture(async index => new Response(`%PDF fixture ${index}`), cache)
    await f.run()
    expect(f.prepares).toEqual([1])
    expect(await f.entries()).toEqual(items.map((item, index) => ({ name: item.fileName, text: `%PDF fixture ${index}` })))
  })
  it('HAR末三条排队请求：前一个Word HTML附件失败不再连带取消，三条均成功入包', async () => {
    const { cache } = cacheFixture()
    const f = cancelledTail(cache, 'word')
    await f.run()
    expect(f.cancelled).toEqual([])
    const entries = await f.entries()
    expect(entries.map(entry => entry.name)).toEqual(['pending-1.pdf', 'pending-2.pdf', 'pending-3.pdf', '下载失败清单.txt'])
    for (let index = 1; index <= 3; index++) {
      expect(entries[index - 1].text).toBe(`%PDF tail fixture ${index}`)
      expect((await cache.info(index)).complete).toBe(true)
      expect((await cache.info(index)).skipReason).toBeUndefined()
      expect(f.requested.filter(value => value === index)).toHaveLength(1)
      expect(entries[3].text).not.toContain(`pending-${index}.pdf`)
    }
    expect(entries[3].text).toContain('成功 3 个；跳过 1 个')
  })

  it('HAR末三条确实取消后继续：不持久化为缺失，重新准备三条且复用前一份完整缓存', async () => {
    const { cache } = cacheFixture()
    const bytes = new TextEncoder().encode('%PDF tail fixture 0')
    await cache.write(0, 0, bytes); await cache.complete(0, { totalBytes: bytes.length })
    const controller = new AbortController()
    const interrupted = cancelledTail(cache, 'pause', controller.signal)
    const running = interrupted.run()
    const rejected = expect(running).rejects.toThrow('用户暂停')
    await interrupted.allPending
    controller.abort(new Error('用户暂停'))
    await rejected
    expect(interrupted.cancelled.sort()).toEqual([1, 2, 3])
    for (let index = 1; index <= 3; index++) {
      expect((await cache.info(index)).complete).toBe(false)
      expect((await cache.info(index)).skipReason).toBeUndefined()
    }
    const resumed = cancelledTail(cache, 'resume')
    await resumed.run()
    expect(resumed.requested.sort()).toEqual([1, 2, 3])
    expect(await resumed.entries()).toEqual(tailItems.map((item, index) => ({ name: item.fileName, text: `%PDF tail fixture ${index}` })))
  })
  it.each([false, true])('持久缓存=%s：PDF收到Word HTML后重新取句柄重试，成功后正常入包', async persistent => {
    const cache = persistent ? cacheFixture().cache : undefined
    const f = fixture(async (index, attempt) => new Response(index === 1 && attempt === 1 ? wordHtml : `%PDF fixture ${index}`,
      { headers: { 'Content-Type': index === 1 && attempt === 1 ? 'text/html' : 'application/octet-stream' } }), cache)
    await f.run()
    expect(f.prepares.filter(index => index === 1)).toHaveLength(2)
    expect(await f.entries()).toEqual(items.map((item, index) => ({ name: item.fileName, text: `%PDF fixture ${index}` })))
  })

  it('Word HTML持续返回时仅跳过该附件，其他文件完成，失败原因持久保存且重放不再请求', async () => {
    const { cache } = cacheFixture()
    const f = fixture(async index => new Response(index === 1 ? wordHtml : `%PDF fixture ${index}`), cache)
    await f.run()
    expect(f.prepares.filter(index => index === 1)).toHaveLength(3)
    const entries = await f.entries()
    expect(entries.map(entry => entry.name)).toEqual(['file-0.pdf', 'file-2.pdf', '下载失败清单.txt'])
    expect(entries[2].text).toContain('file-1.pdf')
    expect(entries[2].text).toContain('Word')
    expect(await cache.info(1)).toMatchObject({ complete: true, receivedBytes: 0, skipReason: expect.stringContaining('Word') })
    const restored = fixture(async () => { throw Error('完整缓存和已确认失败均不得再请求') }, cache)
    await restored.run()
    expect(restored.prepares).toEqual([])
    expect(await restored.entries()).toEqual(entries)
  })

  it('继续下载时清掉旧版已缓存的异常HTML，只重取该文件并复用其余完整缓存', async () => {
    const { cache } = cacheFixture()
    for (let index = 0; index < items.length; index++) {
      const bytes = new TextEncoder().encode(index === 1 ? wordHtml : `%PDF fixture ${index}`)
      await cache.write(index, 0, bytes); await cache.complete(index, { totalBytes: bytes.length })
    }
    const f = fixture(async index => new Response(`%PDF fixture ${index}`), cache)
    await f.run()
    expect(f.prepares).toEqual([1])
    expect(await f.entries()).toEqual(items.map((item, index) => ({ name: item.fileName, text: `%PDF fixture ${index}` })))
  })

  it('HTTP 503恢复后重新取句柄并继续下载', async () => {
    const f = fixture(async (index, attempt) => index === 1 && attempt === 1 ? new Response('busy', { status: 503 }) : new Response(`%PDF fixture ${index}`))
    await f.run()
    expect(f.prepares.filter(index => index === 1)).toHaveLength(2)
    expect((await f.entries()).map(entry => entry.name)).toEqual(items.map(item => item.fileName))
  })

  it('登录网页仍暂停整批，不能把账号失效当成附件缺失', async () => {
    const f = fixture(async index => new Response(index === 1 ? '<html><form action="Login.aspx"><input type="password"></form></html>' : `%PDF fixture ${index}`))
    await expect(f.run()).rejects.toThrow('网页')
  })

  it('缓存写盘失败仍暂停，不能把磁盘故障当成附件缺失', async () => {
    const { cache } = cacheFixture()
    cache.write = async () => { throw Error('disk write failed') }
    const f = fixture(async index => new Response(`%PDF fixture ${index}`), cache)
    await expect(f.run()).rejects.toThrow('disk write failed')
  })
})
