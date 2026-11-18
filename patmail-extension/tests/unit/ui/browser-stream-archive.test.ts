import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeStreamArchive, pauseNativeDownload } from '../../../src/utils/stream-download'
import { MessageType } from '../../../src/shared/message'
const state = vi.hoisted(() => ({ calls: [] as string[], finished: false, failFinish: false, statusFailures: 0, failWrite: false, startDelay: 0 }))
vi.mock('../../../src/utils/runtime', () => ({ sendToBackground: vi.fn(async (message, timeoutMs: number) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (message.type !== 'BROWSER_STREAM_DOWNLOAD') throw new Error('不能依赖本机桥接或浏览器下载记录')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
  const p = message.payload; state.calls.push(p.action)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (p.action === 'start' && state.startDelay) {
    await new Promise(resolve => setTimeout(resolve, Math.min(state.startDelay, timeoutMs)))
    if (state.startDelay >= timeoutMs) return { type: 'ERROR', payload: { message: '扩展后台没有在时限内返回。' } }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (p.action === 'status' && state.statusFailures-- > 0) return { type: 'ERROR', payload: { message: '扩展后台没有在时限内返回。' } }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (p.action === 'write' && state.failWrite) return { type: 'ERROR', payload: { message: '扩展后台没有在时限内返回。' } }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (p.action === 'finish' && state.failFinish) return { type: 'ERROR', payload: { message: '目标文件权限已撤销' } }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (p.action === 'finish') state.finished = true
  return { type: 'STREAM_DOWNLOAD_RESULT', payload: { ok: true,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
    ...(p.action === 'start' ? { token: 'a'.repeat(64), taskId: p.taskId, info: { manifest: {} } } : {}),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
    ...(p.action === 'status' ? { info: { state: state.finished ? 'complete' : 'inProgress', receivedBytes: 3 } } : {})
  } }
}) }))
afterEach(() => { state.calls = []; state.finished = false; state.failFinish = false; state.statusFailures = 0; state.failWrite = false; state.startDelay = 0; vi.useRealTimers() })
describe('纯浏览器流任务', () => {
  const options = { taskId: '11111111-1111-4111-8111-111111111111', targetId: '22222222-2222-4222-8222-222222222222', backend: 'browser' as const }
  const produce = async (sink: WritableStream<Uint8Array>) => { const writer = sink.getWriter(); await writer.write(new Uint8Array([1, 2, 3])); await writer.close(); writer.releaseLock() }
  it('登录复查与目标连接超过20秒时仍等待同一次启动回执，不误暂停或重复启动', async () => {
    vi.useFakeTimers()
    state.startDelay = 95_000
    let productions = 0
    const pending = nativeStreamArchive('test.zip', async sink => { productions++; await produce(sink) }, () => {}, options)
    const assertion = expect(pending).resolves.toBe(3)
    void assertion.catch(() => {})
    await vi.advanceTimersByTimeAsync(25_000)
    expect(state.calls).toEqual(['start'])
    expect(productions).toBe(0)
    await vi.advanceTimersByTimeAsync(71_000)
    await assertion
    expect(productions).toBe(1)
    expect(state.calls.filter(action => action === 'start')).toHaveLength(1)
    expect(state.calls).not.toContain('pause')
  })
  it('启动等待期间暂停后，迟到的启动回执只关闭原令牌，不运行生产者', async () => {
    vi.useFakeTimers()
    state.startDelay = 45_000
    const production = vi.fn(produce)
    const pending = nativeStreamArchive('test.zip', production, () => {}, options)
    const assertion = expect(pending).rejects.toThrow('暂停')
    void assertion.catch(() => {})
    await vi.advanceTimersByTimeAsync(1_000)
    pauseNativeDownload(options.taskId)
    await assertion
    await vi.advanceTimersByTimeAsync(45_000)
    expect(production).not.toHaveBeenCalled()
    expect(state.calls).toEqual(['start', 'pause'])
  })
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
  it('状态检查短暂超时后自动恢复，不重启生产者或重复写入', async () => {
    vi.useFakeTimers()
    state.statusFailures = 2
    let productions = 0
    const pending = nativeStreamArchive('test.zip', async (...args) => { productions++; await produce(args[0]) }, () => {}, options)
    const assertion = expect(pending).resolves.toBe(3)
    void assertion.catch(() => {})
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(productions).toBe(1)
    expect(state.calls.filter(action => action === 'write')).toHaveLength(1)
    expect(state.calls).not.toContain('pause')
  })
  it('写入应答丢失不会盲目重放，暂停并说明缓存恢复入口', async () => {
    state.failWrite = true
    await expect(nativeStreamArchive('test.zip', produce, () => {}, options)).rejects.toThrow(/浏览器数据写入回执超时.*缓存.*继续下载/)
    expect(state.calls.filter(action => action === 'write')).toHaveLength(1)
    expect(state.calls).toContain('pause')
    expect(state.calls).not.toContain('complete')
  })
  it('状态故障的重试等待可被用户暂停立即打断', async () => {
    vi.useFakeTimers()
    state.statusFailures = 100
    const pending = nativeStreamArchive('test.zip', async (sink, signal) => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }, () => {}, options)
    const assertion = expect(pending).rejects.toThrow(/暂停/)
    void assertion.catch(() => {})
    await vi.advanceTimersByTimeAsync(10)
    pauseNativeDownload(options.taskId)
    await vi.advanceTimersByTimeAsync(10)
    await assertion
    expect(state.calls.filter(action => action === 'status')).toHaveLength(1)
    expect(state.calls).not.toContain('complete')
  })
  it('后台持续失联时有限重试后暂停，保留缓存并给出继续入口', async () => {
    vi.useFakeTimers()
    state.statusFailures = 100
    const pending = nativeStreamArchive('test.zip', async (_sink, signal) => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }, () => {}, options)
    const assertion = expect(pending).rejects.toThrow(/缓存.*继续下载/)
    void assertion.catch(() => {})
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(state.calls.filter(action => action === 'status')).toHaveLength(3)
    expect(state.calls.filter(action => action === 'start')).toHaveLength(1)
    expect(state.calls).toContain('pause')
    expect(state.calls).not.toContain('complete')
  })
})

it('custom transport write has a bounded timeout and never replays an uncertain write',async()=>{
 vi.useFakeTimers();const calls:string[]=[]
 const pending=nativeStreamArchive('one.pdf',async sink=>{const w=sink.getWriter();await w.write(new Uint8Array([1]));await w.close()},()=>{},{backend:'browser',request:async p=>{
  calls.push(p.action)
  if(p.action==='write')return new Promise(()=>{})
  return{type:MessageType.StreamDownloadResult,payload:{ok:true,...(p.action==='start'?{token:'b'.repeat(64)}:{}),...(p.action==='status'?{info:{state:'inProgress',receivedBytes:0}}:{})}}
 }})
 let error:unknown;void pending.catch(e=>{error=e})
 await vi.advanceTimersByTimeAsync(131000)
 expect(String(error)).toMatch(/回执超时/);expect(calls.filter(c=>c==='write')).toHaveLength(1);expect(calls).toContain('pause');expect(calls).not.toContain('complete')
})
