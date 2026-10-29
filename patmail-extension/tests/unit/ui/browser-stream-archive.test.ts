import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeStreamArchive } from '../../../src/utils/stream-download'
import { MessageType } from '../../../src/shared/message'
const state = vi.hoisted(() => ({ calls: [] as string[], finished: false, failFinish: false }))
vi.mock('../../../src/utils/runtime', () => ({ sendToBackground: vi.fn(async message => {
  if (message.type !== 'BROWSER_STREAM_DOWNLOAD') throw new Error('不能依赖本机桥接或浏览器下载记录')
  const p = message.payload; state.calls.push(p.action)
  if (p.action === 'finish' && state.failFinish) return { type: 'ERROR', payload: { message: '目标文件权限已撤销' } }
  if (p.action === 'finish') state.finished = true
  return { type: 'STREAM_DOWNLOAD_RESULT', payload: { ok: true,
    ...(p.action === 'start' ? { token: 'a'.repeat(64), taskId: p.taskId, info: { manifest: {} } } : {}),
    ...(p.action === 'status' ? { info: { state: state.finished ? 'complete' : 'inProgress', receivedBytes: 3 } } : {})
  } }
}) }))
afterEach(() => { state.calls = []; state.finished = false; state.failFinish = false })
describe('纯浏览器流任务', () => {
  const options = { taskId: '11111111-1111-4111-8111-111111111111', targetId: '22222222-2222-4222-8222-222222222222', backend: 'browser' as const }
  const produce = async (sink: WritableStream<Uint8Array>) => { const writer = sink.getWriter(); await writer.write(new Uint8Array([1, 2, 3])); await writer.close(); writer.releaseLock() }
  it('写入目标close确认后才完成，不查询chrome.downloads', async () => {
    expect(await nativeStreamArchive('test.zip', produce, () => {}, options)).toBe(3)
    expect(state.calls.indexOf('complete')).toBeGreaterThan(state.calls.indexOf('finish'))
  })
  it('目标文件close失败时暂停并保留缓存，不能上报完成', async () => {
    state.failFinish = true
    await expect(nativeStreamArchive('test.zip', produce, () => {}, options)).rejects.toThrow('权限已撤销')
    expect(state.calls).toContain('pause')
    expect(state.calls).not.toContain('complete')
  })
})
