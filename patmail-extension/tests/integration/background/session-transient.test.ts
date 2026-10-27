import { describe, expect, it } from 'vitest'
import { recheckBoundSession, type WorkspaceHost } from '../../../src/background/workspace'
import { MemoryEvidenceStore } from '../../../src/automation/evidence-store'
import { SerialTaskStore } from '../../../src/automation/indexed-store'
import { memoryArea } from '../../factories/memory-area'
import { EasyConnectionController } from '../../../src/shared/connection'
import { MessageType } from '../../../src/shared/message'

const large = 'http://183.36.43.66:88'
const userA = 'aaaaaaaa-1111-4111-8111-111111111111'

function boundHost(answer: () => ReturnType<WorkspaceHost['sendToTab']>) {
  const tabs = [{ id: 8, url: `${large}/inbox`, title: 'EASY' }]
  const connection = new EasyConnectionController()
  connection.beginBind({ id: 8, url: `${large}/inbox` })
  connection.applySession({ ok: true, status: 'authenticated', userId: userA, displayName: '测试员' }, connection.context.connectionVersion)
  const host: WorkspaceHost = {
    connection,
    area: memoryArea(),
    tasks: new SerialTaskStore(null),
    evidence: new MemoryEvidenceStore(),
    queryTabs: async () => tabs,
    getTab: async (tabId) => tabs.find(item => item.id === tabId) ?? (() => { throw new Error('closed') })(),
    createTab: async () => undefined,
    focusTab: async () => undefined,
    openApp: async () => ({ tabId: 7, created: false }),
    sendToTab: answer
  }
  return { connection, host }
}

describe('会话复查的瞬时失败', () => {
  it('检测超时或网络失败只算这次没读到，已登录状态和身份保持不动', async () => {
    for (const code of ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'AUTH_UNKNOWN'] as const) {
      const { connection, host } = boundHost(async () => ({
        type: MessageType.SessionResult,
        payload: { ok: false, error: { code, message: '这次没读到登录状态。' } }
      }))
      expect(connection.context.sessionStatus).toBe('authenticated')
      expect(await recheckBoundSession(host)).toBe('same')
      expect(connection.context.sessionStatus).toBe('authenticated')
      expect(connection.context.operatorId).toBe(userA)
    }
  })

  it('明确的登录失效才把连接判成掉登录', async () => {
    const { connection, host } = boundHost(async () => ({
      type: MessageType.SessionResult,
      payload: { ok: false, error: { code: 'SESSION_EXPIRED', message: 'EASY 登录状态已失效。' } }
    }))
    // 登录失效会清掉身份，账号变化与掉登录都会拦住写操作；状态本身要如实是 expired。
    expect(await recheckBoundSession(host)).not.toBe('same')
    expect(connection.context.sessionStatus).toBe('expired')
    expect(connection.context.operatorId).toBe('')
  })

  it('还没建立登录时检测失败仍如实报错', async () => {
    const { connection, host } = boundHost(async () => ({
      type: MessageType.SessionResult,
      payload: { ok: false, error: { code: 'REQUEST_TIMEOUT', message: '请求超时，请重试。' } }
    }))
    connection.applySession({ ok: false, status: 'error', message: '还没读到登录身份。' }, connection.context.connectionVersion)
    expect(await recheckBoundSession(host)).toBe('invalid')
    expect(connection.context.sessionStatus).toBe('error')
  })
})
