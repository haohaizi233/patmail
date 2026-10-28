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
    active--
    return new Response(`%PDF sample ${index}`, { headers: { 'Content-Length': String(`%PDF sample ${index}`.length) } })
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
      fetchFile: async () => new Response(Uint8Array.from([80, 75, 5, 6, ...Array(18).fill(0)]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '22' } })
    })).rejects.toThrow()
    expect(result.aborted()).toBe(true)
  })
  it('后批已生成但前批失败时立即退出，不能让按序队列与命名工作者互相等待', async () => {
    const setup = fixture(), result = output()
    const transport = { ...setup.transport, post: async (_operation: string, params: URLSearchParams) => {
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
  it('命名尚未全部完成就消费文件，原始顺序、ZIP64目录和CRC可解包，业务请求峰值不超过5', async () => {
    const setup = fixture(), result = output()
    await streamDownloadFiles(setup.transport, files, selection, false, { sink: result.sink, fetchFile: setup.fetchFile })
    expect(setup.events.indexOf('read:0')).toBeLessThan(setup.events.indexOf('named:240'))
    expect(setup.peak()).toBeLessThanOrEqual(5)
    expect(result.closed()).toBe(true)
    const reader = new ZipReader(new Uint8ArrayReader(result.bytes()), { useWebWorkers: false })
    const entries = await reader.getEntries()
    expect(entries.map(entry => entry.filename)).toEqual(files.map(file => file.fileName))
    const last = entries[240]
    if (last.directory) throw new Error('Expected file entry')
    expect(new TextDecoder().decode(await last.getData!(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false }))).toBe('%PDF sample 240')
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
