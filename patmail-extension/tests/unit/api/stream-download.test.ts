import { describe, expect, it } from 'vitest'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { streamDownloadFiles } from '../../../src/api/stream-download'
import type { EasyTransport } from '../../../src/api/transport'

const files = Array.from({ length: 241 }, (_, index) => ({
  fileId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, fileNo: `A${index}`, fileName: `file-${index}.pdf`
}))
const info = { ClientInfo: { IsLogin: true, Status: true } }
const selection = { newFilename: 'file_name', fileNameType: 'colname' }
function fixture() {
  const events: string[] = []
  let active = 0, peak = 0
  const transport = {
    post: async (operation: string, params: URLSearchParams) => {
      active++; peak = Math.max(peak, active)
      try {
        if (operation === 'getFileName') {
          const ids = params.get('file_ids')!.split(';')
          const first = files.findIndex(file => file.fileId === ids[0])
          await new Promise(resolve => setTimeout(resolve, first === 0 ? 1 : 40))
          events.push(`named:${first}`)
          return { ok: true, data: { ...info, file_names: ids.map(id => files.find(file => file.fileId === id)!.fileName).join(';') } }
        }
        const index = files.findIndex(file => file.fileNo === params.get('file_no'))
        events.push(`prepare:${index}`)
        return { ok: true, data: { ...info, file_guid: files[index].fileId } }
      } finally { active-- }
    },
    fileDownloadUrl: (guid: string) => guid
  } as unknown as EasyTransport
  const fetchFile = async (url: string) => {
    active++; peak = Math.max(peak, active)
    const index = files.findIndex(file => file.fileId === url)
    events.push(`read:${index}`)
    let sent = false
    return new Response(new ReadableStream({ async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 1))
      if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(`%PDF sample ${index}`)) }
      else { active--; controller.close() }
    } }, { highWaterMark: 0 }), { headers: { 'Content-Length': String(`%PDF sample ${index}`.length) } })
  }
  return { transport, fetchFile, events, peak: () => peak }
}
function output() {
  const chunks: Uint8Array[] = []
  let closed = false, aborted = false
  const sink = new WritableStream<Uint8Array>({ write: chunk => { chunks.push(chunk.slice()) }, close: () => { closed = true }, abort: () => { aborted = true } })
  return { sink, closed: () => closed, aborted: () => aborted, bytes: () => Buffer.concat(chunks) }
}

describe('流水单ZIP下载', () => {
  it('单附件准备遇到临时网关502后重新取得句柄，正文只下载一次', async () => {
    const result = output()
    let prepares = 0, bodies = 0
    const transport = { post: async () => ++prepares === 1 ? { ok: false, error: { code: 'HTTP_ERROR', message: 'EASY 网关异常。', status: 502 } }
      : { ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_guid: files[0].fileId } }, fileDownloadUrl: () => 'https://easy.test/file' } as unknown as EasyTransport
    await streamDownloadFiles(transport, files.slice(0, 1), null, false, { sink: result.sink,
      fetchFile: async () => { bodies++; return new Response('%PDF retry') } })
    expect(prepares).toBe(2)
    expect(bodies).toBe(1)
    expect(result.closed()).toBe(true)
  })
  it.each([false, true])('慢首文件与后续大正文填满缓冲，取消=%s，保持顺序或清理全部请求', async cancelled => {
    const setup = fixture(), result = output(), controller = new AbortController()
    let release!: () => void
    const firstGate = new Promise<void>(resolve => { release = resolve })
    const reads = Array(6).fill(0)
    let active = 0, peak = 0
    const expected = (index: number) => {
      const body = new Uint8Array(512 * 1024).fill(index)
      body.set(new TextEncoder().encode('%PDF large fixture'))
      return body
    }
    const running = streamDownloadFiles(setup.transport, files.slice(0, 6), null, false, {
      signal: controller.signal, sink: result.sink, fetchFile: async url => {
        const index = files.findIndex(file => file.fileId === url), bytes = expected(index)
        active++; peak = Math.max(peak, active)
        let stopped = false
        return new Response(new ReadableStream({ async pull(target) {
          if (index === 0) await firstGate
          if (stopped) return
          if (reads[index] < 8) {
            const offset = reads[index]++ * 65536
            target.enqueue(bytes.slice(offset, offset + 65536))
          } else { stopped = true; active--; target.close() }
        }, cancel() { if (!stopped) { stopped = true; active-- }; release() } }, { highWaterMark: 0 }),
        { headers: { 'Content-Length': String(bytes.length) } })
      }
    })
    const settled = running.then(() => null, (error: unknown) => (error instanceof Error ? error : new Error('非 Error 失败原因。')))
    try {
      for (let attempt = 0; attempt < 100 && reads.slice(1).some(count => count < 5); attempt++) await new Promise(resolve => setTimeout(resolve, 5))
      expect(peak).toBe(6)
      expect(reads).toEqual([0, 5, 5, 5, 5, 5])
      if (cancelled) controller.abort(new Error('填满缓冲后取消'))
    } finally { release() }
    const error = await settled
    expect(active).toBe(0)
    if (cancelled) {
      expect(error?.message).toBe('填满缓冲后取消')
      expect(result.aborted()).toBe(true)
      return
    }
    expect(error).toBeNull()
    const reader = new ZipReader(new Uint8ArrayReader(result.bytes()), { useWebWorkers: false })
    const entries = await reader.getEntries()
    expect(entries.map(entry => entry.filename)).toEqual(files.slice(0, 6).map(file => file.fileName))
    for (const [index, entry] of entries.entries()) {
      if (entry.directory) throw new Error('Expected file')
      const data = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })
      expect(Buffer.from(data).equals(Buffer.from(expected(index)))).toBe(true)
    }
    await reader.close()
  }, 15000)
  it('本机输出被背压阻塞时取消仍应及时返回', async () => {
    const setup = fixture(), controller = new AbortController()
    let unblock!: () => void, writing!: () => void
    const blocked = new Promise<void>(resolve => { unblock = resolve })
    const entered = new Promise<void>(resolve => { writing = resolve })
    const running = streamDownloadFiles(setup.transport, files.slice(0, 2), null, false, {
      signal: controller.signal,
      sink: new WritableStream({ write() { writing(); return blocked } }), fetchFile: setup.fetchFile
    })
    await entered
    controller.abort(new Error('用户取消'))
    const outcome = await Promise.race([running.then(() => 'success', () => 'cancelled'), new Promise(resolve => setTimeout(() => resolve('hung'), 500))])
    unblock()
    await expect(running).rejects.toThrow('用户取消')
    expect(outcome).toBe('cancelled')
  })
  it('后续预取正文失败时，不能等最前面的慢正文才中断', async () => {
    const setup = fixture(), result = output(), controller = new AbortController()
    const running = streamDownloadFiles(setup.transport, files.slice(0, 2), null, false, {
      signal: controller.signal, sink: result.sink, fetchFile: async (url, init) => {
        if (url === files[1].fileId) return new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } })
        return new Response(new ReadableStream({ async pull(target) {
          await new Promise<void>(resolve => {
            if (init?.signal?.aborted) resolve()
            else init?.signal?.addEventListener('abort', () => resolve(), { once: true })
          })
          target.close()
        } }, { highWaterMark: 0 }))
      }
    })
    const outcome = await Promise.race([running.then(() => 'success', () => 'failed'), new Promise(resolve => setTimeout(() => resolve('hung'), 500))])
    controller.abort()
    await expect(running).rejects.toThrow('网页')
    expect(outcome).toBe('failed')
  })
  it.each([false, true])('命名=%s 时正文并行达到六路，读取到EOF才释放，ZIP保持原始顺序', async naming => {
    const setup = fixture(), result = output()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let active = 0, peak = 0
    const started = Date.now()
    const running = streamDownloadFiles(setup.transport, files.slice(0, 12), naming ? selection : null, false, {
      sink: result.sink,
      fetchFile: async url => {
        active++; peak = Math.max(peak, active)
        let sent = false
        return new Response(new ReadableStream({ async pull(controller) {
          await gate
          if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(`%PDF ${url}`)) }
          else { active--; controller.close() }
        } }, { highWaterMark: 0 }))
      }
    })
    try {
      while (peak < 6 && Date.now() - started < 1000) await new Promise(resolve => setTimeout(resolve, 5))
      expect(peak).toBe(6)
    } finally { release(); await running }
    expect(active).toBe(0)
    const reader = new ZipReader(new Uint8ArrayReader(result.bytes()), { useWebWorkers: false })
    const entries = await reader.getEntries()
    expect(entries.map(entry => entry.filename)).toEqual(files.slice(0, 12).map(file => file.fileName))
    for (const [index, entry] of entries.entries()) {
      if (entry.directory) throw new Error('Expected file')
      expect(new TextDecoder().decode(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false }))).toBe(`%PDF ${files[index].fileId}`)
    }
    await reader.close()
  })
  it('单文件原站提示失败但句柄正文为完整PDF时，沿原站口径按实际正文完成', async () => {
    const setup = fixture(), result = output()
    const transport = { ...setup.transport, post: async () => ({ ok: true, data: { ...info, file_guid: files[0].fileId,
      error_message: '文件不存在或权限不足,您共1个文件证书.pdf下载失败' } }) } as unknown as EasyTransport
    await streamDownloadFiles(transport, files.slice(0, 1), null, false, { sink: result.sink, fetchFile: setup.fetchFile })
    expect(result.closed()).toBe(true)
  })
  it('有效句柄返回空ZIP伪装成PDF时，必须中断而不能生成一个坏PDF条目', async () => {
    const setup = fixture(), result = output()
    await expect(streamDownloadFiles(setup.transport, files.slice(0, 1), null, false, { sink: result.sink,
      fetchFile: async () => new Response(Uint8Array.from([80, 75, 5, 6, ...Array.from({ length: 18 }, () => 0)]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '22' } })
    })).rejects.toThrow()
    expect(result.aborted()).toBe(true)
  })
  it('后批已生成但前批失败时立即退出，不能让按序队列与命名工作者互相等待', async () => {
    const setup = fixture(), result = output()
    const transport = { ...setup.transport, post: async (operation: string, params: URLSearchParams) => {
      if (operation !== 'getFileName') return setup.transport.post(operation as Parameters<EasyTransport['post']>[0], params)
      const first = params.get('file_ids')!.split(';')[0]
      if (first === files[0].fileId) {
        await new Promise(resolve => setTimeout(resolve, 30))
        return { ok: false, error: { code: 'HTTP_ERROR', message: '前批失败' } }
      }
      return { ok: true, data: { ...info, file_names: files.slice(40, 80).map(file => file.fileName).join(';') } }
    } } as unknown as EasyTransport
    const controller = new AbortController()
    const running = streamDownloadFiles(transport, files.slice(0, 80), selection, false, { sink: result.sink, signal: controller.signal, fetchFile: setup.fetchFile })
    const outcome = await Promise.race([running.then(() => 'success', () => 'failed'), new Promise(resolve => setTimeout(() => resolve('hung'), 300))])
    controller.abort()
    await expect(running).rejects.toThrow('前批失败')
    expect(outcome).toBe('failed')
    expect(result.aborted()).toBe(true)
  })
  it('命名尚未全部完成就消费文件，原始顺序、ZIP64目录和CRC可解包，共享请求达到六路且不越界', async () => {
    const setup = fixture(), result = output()
    await streamDownloadFiles(setup.transport, files, selection, false, { sink: result.sink, fetchFile: setup.fetchFile })
    expect(setup.events.indexOf('read:0')).toBeLessThan(setup.events.indexOf('named:240'))
    expect(setup.peak()).toBe(6)
    expect(result.closed()).toBe(true)
    const reader = new ZipReader(new Uint8ArrayReader(result.bytes()), { useWebWorkers: false })
    const entries = await reader.getEntries()
    expect(entries.map(entry => entry.filename)).toEqual(files.map(file => file.fileName))
    const last = entries[240]
    if (last.directory) throw new Error('Expected file entry')
    expect(new TextDecoder().decode(await last.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false }))).toBe('%PDF sample 240')
    await reader.close()
  })

  it.each(['html', 'short', 'failure'])('%s 响应时中断输出，不能完成残缺包', async kind => {
    const setup = fixture(), result = output()
    const fetchFile = async () => kind === 'failure' ? new Response('', { status: 502 })
      : new Response(kind === 'html' ? '<html>login</html>' : 'short', { headers: { 'Content-Type': kind === 'html' ? 'text/html' : 'application/pdf', 'Content-Length': '999' } })
    await expect(streamDownloadFiles(setup.transport, files.slice(0, 2), null, false, { sink: result.sink, fetchFile })).rejects.toThrow()
    expect(result.closed()).toBe(false)
    expect(result.aborted()).toBe(true)
  })

  it('正文错误先发生时保留正文错误，清理命名请求的取消不能盖掉根因', async () => {
    const setup = fixture(), result = output()
    await expect(streamDownloadFiles(setup.transport, files, selection, false, { sink: result.sink,
      fetchFile: async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } })
    })).rejects.toThrow('网页')
    expect(result.aborted()).toBe(true)
  })

  it('重名安全改名，路径只能作为文件名，已取消时不准备或获取文件', async () => {
    const setup = fixture(), result = output()
    const items = files.slice(0, 3).map(file => ({ ...file, fileName: '../相同.pdf' }))
    await streamDownloadFiles(setup.transport, items, null, false, { sink: result.sink, fetchFile: setup.fetchFile })
    const reader = new ZipReader(new Uint8ArrayReader(result.bytes()), { useWebWorkers: false })
    expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(['_相同.pdf', '_相同 (2).pdf', '_相同 (3).pdf'])
    await reader.close()
    const controller = new AbortController(); controller.abort()
    const cancelled = output()
    await expect(streamDownloadFiles(setup.transport, files, selection, false, { sink: cancelled.sink, fetchFile: setup.fetchFile, signal: controller.signal })).rejects.toThrow()
  })
})
