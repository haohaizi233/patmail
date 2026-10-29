import { describe, expect, it } from 'vitest'
import { cachedFileResponse, type DownloadCache, type CachedFileInfo } from '../../../src/api/stream-cache'

function fixture(initial = '', complete = false) {
  let bytes = new TextEncoder().encode(initial)
  let info: CachedFileInfo = { receivedBytes: bytes.length, complete, totalBytes: complete ? bytes.length : 12, etag: '"same"', lastModified: '' }
  const cache: DownloadCache = {
    names: {}, async saveNames() {}, async info() { return { ...info } },
    async reset(_index, next) { bytes = new Uint8Array(); info = { ...next, receivedBytes: 0, complete: false } },
    async write(_index, offset, chunk) { expect(offset).toBe(bytes.length); bytes = new Uint8Array([...bytes, ...chunk]); info.receivedBytes = bytes.length },
    async complete(_index, next) { info = { ...info, ...next, complete: true } },
    async read(_index, offset) { return bytes.slice(offset, offset + 65536) }
  }
  return { cache, text: () => new TextDecoder().decode(bytes), info: () => info }
}
describe('持久附件缓存', () => {
  it('64KiB网络碎片合并为256KiB持久提交，避免每个网络块都走一次落盘RPC', async () => {
    const setup = fixture()
    const bytes = new Uint8Array(512 * 1024).fill(7)
    const writes: number[] = []
    const write = setup.cache.write
    setup.cache.write = async (index, offset, part) => { writes.push(part.length); await write(index, offset, part) }
    let offset = 0
    const response = await cachedFileResponse('source', 0, setup.cache, new AbortController().signal, async () => new Response(new ReadableStream({
      pull(target) {
        if (offset === bytes.length) { target.close(); return }
        target.enqueue(bytes.slice(offset, offset + 65536)); offset += 65536
      }
    }, { highWaterMark: 0 }), { headers: { 'Content-Length': String(bytes.length) } }))
    expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true)
    expect(writes).toEqual([262144, 262144])
    expect(setup.info().complete).toBe(true)
  })
  it('已确认字节达到原始Content-Length但EOF标记未提交时，不重新请求完整附件', async () => {
    const setup = fixture('%PDF content', false)
    const response = await cachedFileResponse('unused', 0, setup.cache, new AbortController().signal, async () => { throw new Error('完整字节不应重下') })
    expect(await response.text()).toBe('%PDF content')
    expect(setup.info().complete).toBe(true)
  })
  it('完整附件恢复时不再请求原站', async () => {
    const setup = fixture('%PDF cached', true)
    const response = await cachedFileResponse('unused', 0, setup.cache, new AbortController().signal, async () => { throw new Error('不应访问原站') })
    expect(await response.text()).toBe('%PDF cached')
  })
  it('有稳定版本的未完成附件校验206偏移后续取，并向ZIP重放完整正文', async () => {
    const setup = fixture('%PDF ')
    const response = await cachedFileResponse('source', 0, setup.cache, new AbortController().signal, async (_url, init) => {
      expect(new Headers(init?.headers).get('Range')).toBe('bytes=5-')
      return new Response('content', { status: 206, headers: { ETag: '"same"', 'Content-Range': 'bytes 5-11/12' } })
    })
    expect(await response.text()).toBe('%PDF content')
    expect(setup.text()).toBe('%PDF content')
    expect(setup.info().complete).toBe(true)
  })
  it('服务器忽略Range返回200时重置当前附件，不能把整份响应追加到旧片段', async () => {
    const setup = fixture('%PDF old')
    const response = await cachedFileResponse('source', 0, setup.cache, new AbortController().signal,
      async () => new Response('%PDF replacement', { headers: { 'Content-Length': '16' } }))
    expect(await response.text()).toBe('%PDF replacement')
    expect(setup.text()).toBe('%PDF replacement')
  })
})
