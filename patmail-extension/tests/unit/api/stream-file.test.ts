import { describe, expect, it } from 'vitest'
import { DownloadTokens } from '../../../src/api/download-tokens'
import { prefetchFile } from '../../../src/api/stream-file'
import { cachedFileResponse, type DownloadCache } from '../../../src/api/stream-cache'

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
describe('正文预取背压', () => {
  it('邮件头只影响冒充PDF的EML，合法eml及正文提到邮件头的PDF仍保留', async () => {
    const mail = 'Received: from fixture.invalid\r\nFrom: sender@example.invalid\r\nTo: recipient@example.invalid\r\nMIME-Version: 1.0\r\nSubject: fixture %PDF mention\r\n\r\nfixture mail'
    for (const [name, body] of [['source.eml', mail], ['valid.pdf', '%PDF-1.7\n' + mail]]) {
      const file = await prefetchFile('source', name, false, '', null, new AbortController().signal, async () => new Response(body), () => {})
      await file.ready; await file.finished
      expect(await new Response(file.body).text()).toBe(body)
    }
    const invalid = await prefetchFile('source', 'expected.pdf', false, '', null, new AbortController().signal, async () => new Response(mail), () => {})
    await expect(invalid.ready).rejects.toMatchObject({ name: 'RetryableDownloadFileError', message: expect.stringContaining('EML') })
    await invalid.finished
  })
  it('Word导出的HTML可作为旧版doc保留，但不能冒充PDF；登录网页仍拒绝', async () => {
    const html = '<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>fixture</body></html>'
    const doc = await prefetchFile('source', 'legacy.doc', false, '', null, new AbortController().signal,
      async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }), () => {})
    await doc.ready; await doc.finished
    expect(await new Response(doc.body).text()).toBe(html)
    const pdf = await prefetchFile('source', 'expected.pdf', false, '', null, new AbortController().signal,
      async () => new Response(html, { headers: { 'Content-Type': 'application/octet-stream' } }), () => {})
    await expect(pdf.ready).rejects.toMatchObject({ name: 'RetryableDownloadFileError' })
    await pdf.finished
    const login = await prefetchFile('source', 'legacy.doc', false, '', null, new AbortController().signal,
      async () => new Response('<html><form action="Login.aspx"></form></html>'), () => {})
    await expect(login.ready).rejects.toThrow('网页')
    await login.finished
  })
  it('带文件条目的ZIP正文保留原始ZIP格式，有效PDF仍保持原格式，空ZIP不能冒充PDF', async () => {
    const notice = '文件不存在或权限不足'
    const zipped = await prefetchFile('source', 'test.pdf', false, notice, null, new AbortController().signal,
      async () => new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])), () => {})
    await expect(zipped.ready).resolves.toBeUndefined()
    expect(zipped.format).toBe('zip')
    await zipped.finished
    expect(new Uint8Array(await new Response(zipped.body).arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]))
    const pdf = await prefetchFile('source', 'test.pdf', false, notice, null, new AbortController().signal,
      async () => new Response('%PDF valid'), () => {})
    await pdf.ready
    expect(pdf.format).toBe('original')
    await pdf.finished
    const emptyZip = await prefetchFile('source', 'test.pdf', false, notice, null, new AbortController().signal,
      async () => new Response(new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...Array.from({ length: 18 }, () => 0)])), () => {})
    await expect(emptyZip.ready).rejects.toMatchObject({ name: 'UnavailableDownloadFileError' })
    await emptyZip.finished
  })
  it('HTTP失败先取消未读原站正文，再释放下载额度', async () => {
    let cancelled = false
    await expect(prefetchFile('source', 'test.pdf', false, '', null, new AbortController().signal,
      async () => new Response(new ReadableStream({ cancel() { cancelled = true } }), { status: 503 }), () => {}
    )).rejects.toThrow('读取文件失败')
    expect(cancelled).toBe(true)
  })
  it('ZIP创建条目前可等待正文前缀验证，异常PDF拒绝ready但有效PDF忽略旧notice', async () => {
    const notice = '文件不存在或权限不足，共1个文件，下载失败'
    const invalid = await prefetchFile('source', 'test.pdf', false, notice, null, new AbortController().signal,
      async () => new Response(''), () => {})
    expect(invalid.ready).toBeInstanceOf(Promise)
    await expect(invalid.ready).rejects.toMatchObject({ name: 'Error' })
    await invalid.finished
    const valid = await prefetchFile('source', 'test.pdf', false, notice, null, new AbortController().signal,
      async () => new Response('%PDF valid'), () => {})
    await expect(valid.ready).resolves.toBeUndefined()
    await valid.finished
  })
  it('原站EOF后即使缓存最终提交阻塞，也归还真实网络额度', async () => {
    const controller = new AbortController()
    const pool = new DownloadTokens(() => 'download')
    const held = await Promise.all(Array.from({ length: 5 }, () => pool.acquire('download', controller.signal)))
    let finishCommit!: () => void
    const commit = new Promise<void>(resolve => { finishCommit = resolve })
    let upstreamActive = 1, durableFinished = false
    const cache: DownloadCache = {
      names: {}, async saveNames() {}, async info() { return { receivedBytes: 0, complete: false } },
      async reset() {}, async write() {}, async complete() { await commit }, async read() { return new TextEncoder().encode('%PDF data') }
    }
    const file = await prefetchFile('source', 'test.pdf', false, '', pool, controller.signal,
      url => cachedFileResponse(url, 0, cache, controller.signal, async () => new Response(new ReadableStream({
        start(target) { target.enqueue(new TextEncoder().encode('%PDF data')); target.close(); upstreamActive = 0 }
      }))), () => {}, offset => cache.read(0, offset))
    void file.finished.then(() => { durableFinished = true })
    let acquired = false
    const next = pool.acquire('download', controller.signal).then(release => { acquired = true; return release })
    try {
      for (let i = 0; i < 20 && !acquired; i++) await tick()
      expect(upstreamActive).toBe(0)
      expect(durableFinished).toBe(false)
      expect(acquired).toBe(true)
      await file.networkFinished
    } finally {
      finishCommit(); await file.finished
      ;(await next)(); held.forEach(release => release())
    }
  })
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
