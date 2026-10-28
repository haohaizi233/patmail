import { describe, expect, it } from 'vitest'
import { DownloadTokens } from '../../../src/api/download-tokens'
import { prefetchFile } from '../../../src/api/stream-file'

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
describe('正文预取背压', () => {
  it('慢消费者将应用队列限制在256KiB，取消后解除生产者等待并归还令牌', async () => {
    const controller = new AbortController()
    const pool = new DownloadTokens(() => 'download')
    let readBytes = 0
    const fetcher: typeof fetch = async () => new Response(new ReadableStream({ pull(target) {
      const chunk = new Uint8Array(64 * 1024); chunk.set(new TextEncoder().encode('%PDF'))
      readBytes += chunk.byteLength; target.enqueue(chunk)
    } }, { highWaterMark: 0 }))
    const file = await prefetchFile('test', 'test.pdf', false, '', pool, controller.signal, fetcher, () => {})
    for (let i = 0; i < 20 && file.bufferedBytes < 256 * 1024; i++) await tick()
    expect(file.bufferedBytes).toBe(256 * 1024)
    const stoppedAt = readBytes
    await tick(); await tick()
    expect(readBytes).toBe(stoppedAt)
    expect(readBytes).toBeLessThanOrEqual(320 * 1024)
    controller.abort(); await file.finished
    expect(file.bufferedBytes).toBe(0)
    const held = await Promise.all(Array.from({ length: 6 }, () => pool.acquire('download', new AbortController().signal)))
    held.forEach(release => release())
  })
  it('正文已到EOF即归还额度，不必等ZIP消费缓冲字节', async () => {
    const pool = new DownloadTokens(() => 'download')
    const controller = new AbortController()
    const held = await Promise.all(Array.from({ length: 5 }, () => pool.acquire('download', controller.signal)))
    const file = await prefetchFile('test', 'test.pdf', false, '', pool, controller.signal,
      async () => new Response('%PDF buffered'), () => {})
    await file.finished
    expect(file.bufferedBytes).toBe(13)
    const release = await pool.acquire('download', controller.signal)
    release(); held.forEach(done => done())
    expect(await new Response(file.body).text()).toBe('%PDF buffered')
  })
})
