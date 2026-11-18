import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeStreamArchive } from '../../../src/utils/stream-download'
const state = vi.hoisted(() => ({ status: undefined as undefined | ((value: unknown) => void), completed: false }))
vi.mock('../../../src/utils/runtime', () => ({ sendToBackground: vi.fn(async message => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (message.type !== 'STREAM_DOWNLOAD') return null
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (message.payload.action === 'start') return { type: 'STREAM_DOWNLOAD_RESULT', payload: { ok: true, token: 'a'.repeat(64), ...(state.completed ? { info: { completed: true, completedBytes: 12345 } } : {}) } }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (message.payload.action === 'status') return new Promise(resolve => { state.status = resolve })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  if (message.payload.action === 'abort') state.status?.({ type: 'ERROR', payload: { message: '清理后令牌已失效' } })
  return { type: 'STREAM_DOWNLOAD_RESULT', payload: { ok: true } }
}) }))
afterEach(() => { state.completed = false })

describe('原生流任务清理', () => {
  it('界面错过完成消息时从持久回执恢复完成，不重新运行生产者', async () => {
    state.completed = true
    expect(await nativeStreamArchive('模板.zip', async () => { throw new Error('不能重下') }, () => {})).toBe(12345)
  })
  it('生产失败时，清理导致的轮询错误不能覆盖真实根因', async () => {
    await expect(nativeStreamArchive('模板.zip', async () => { throw new Error('文件响应出错') }, () => {})).rejects.toThrow('文件响应出错')
  })
  it('ZIP先abort输出再抛异常时，也保留原始正文错误', async () => {
    await expect(nativeStreamArchive('模板.zip', async sink => {
      const failure = new Error('原始正文错误')
      const writer = sink.getWriter()
      await writer.abort(failure)
      writer.releaseLock()
      throw failure
    }, () => {})).rejects.toThrow('原始正文错误')
  })
})
