import { describe, expect, it, vi } from 'vitest'
import { EASY_ORIGIN } from '../../../src/api/config'
import { createDefaultNoticeCertQuery } from '../../../src/api/notice-params'
import type { EvidenceRepository } from '../../../src/automation/evidence-store'
import type { LocalArea } from '../../../src/background/account-data'
import {
  handleWorkspaceMessage,
  hasActiveForwards,
  recheckBoundSession,
  type WorkspaceHost
} from '../../../src/background/workspace'
import { EasyConnectionController } from '../../../src/shared/connection'
import { MessageType, type AppMessage } from '../../../src/shared/message'

const OPERATOR_A = '11111111-1111-4111-8111-111111111111'
const OPERATOR_B = '22222222-2222-4222-8222-222222222222'
const TAB_ID = 42

function authenticatedResult(userId = OPERATOR_A, displayName = '张三'): AppMessage {
  return {
    type: MessageType.SessionResult,
    payload: {
      ok: true,
      data: {
        status: 'authenticated',
        userId,
        displayName,
        checkedAt: '2026-11-26T02:30:00.000Z'
      }
    }
  }
}

function expiredErrorResult(): AppMessage {
  return {
    type: MessageType.SessionResult,
    payload: {
      ok: false,
      error: {
        code: 'SESSION_EXPIRED',
        message: 'EASY 登录状态已失效，请在原网站重新登录。'
      }
    }
  }
}

function createHost(sendToTab: WorkspaceHost['sendToTab']): WorkspaceHost {
  const connection = new EasyConnectionController()
  connection.beginBind({ id: TAB_ID, url: `${EASY_ORIGIN}/Index.aspx` })
  connection.applySession(
    {
      ok: true,
      status: 'authenticated',
      userId: OPERATOR_A,
      displayName: '张三',
      checkedAt: '2026-11-26T02:29:00.000Z'
    },
    connection.context.connectionVersion
  )

  const area: LocalArea = {
    get: () => Promise.resolve({}),
    set: () => Promise.resolve()
  }

  return {
    connection,
    area,
    tasks: null,
    evidence: {} as unknown as EvidenceRepository,
    queryTabs: () => Promise.resolve([{ id: TAB_ID, url: `${EASY_ORIGIN}/Index.aspx`, title: 'EASY' }]),
    getTab: tabId => Promise.resolve({ id: tabId, url: `${EASY_ORIGIN}/Index.aspx`, title: 'EASY' }),
    createTab: () => Promise.resolve(),
    focusTab: () => Promise.resolve(),
    openApp: () => Promise.resolve({ tabId: 1, created: false }),
    sendToTab
  }
}

function certSearchMessage(): AppMessage {
  return {
    type: MessageType.Workspace,
    payload: {
      action: 'forward',
      message: {
        type: MessageType.SearchNotice,
        payload: {
          tab: 'cert',
          query: createDefaultNoticeCertQuery()
        }
      }
    }
  }
}

describe('workspace session resilience during slow queries', () => {
  it('double-confirms a single transient SESSION_EXPIRED glitch without dropping authenticated session', async () => {
    let probes = 0
    const host = createHost((_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        probes += 1
        return Promise.resolve(probes === 1 ? expiredErrorResult() : authenticatedResult())
      }
      return Promise.reject(new Error(`unexpected ${message.type}`))
    })

    const gate = await recheckBoundSession(host)
    expect(gate).toBe('same')
    expect(probes).toBe(2)
    expect(host.connection.context.sessionStatus).toBe('authenticated')
    expect(host.connection.context.operatorId).toBe(OPERATOR_A)
  })

  it('transitions to expired after two consecutive SESSION_EXPIRED responses', async () => {
    let probes = 0
    const host = createHost((_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        probes += 1
        return Promise.resolve(expiredErrorResult())
      }
      return Promise.reject(new Error(`unexpected ${message.type}`))
    })

    const gate = await recheckBoundSession(host)
    expect(gate).toBe('changed')
    expect(probes).toBe(2)
    expect(host.connection.context.sessionStatus).toBe('expired')
    expect(host.connection.context.operatorId).toBe('')
  })

  it('recovers valid read-only SearchNotice results if session transiently dipped mid-flight on same tab', async () => {
    let checkCalls = 0
    const host = createHost((_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        checkCalls += 1
        return Promise.resolve(authenticatedResult())
      }
      if (message.type === MessageType.SearchNotice) {
        // 模拟慢查询在途期间后台状态曾被瞬时置为 expired（同标签页、同 connectionVersion、无他人登录）
        host.connection.applySession(
          { ok: false, status: 'expired', message: '瞬时假掉线' },
          host.connection.context.connectionVersion
        )
        return Promise.resolve({
          type: MessageType.SearchNoticeResult,
          payload: {
            ok: true,
            data: {
              tab: 'cert',
              rows: [{ fid: 'cert-1', zhuanlisqh: '2026304262666' }],
              total: 1,
              pageIndex: 1,
              pageSize: 50
            }
          }
        })
      }
      return Promise.reject(new Error(`unexpected ${message.type}`))
    })

    const resp = await handleWorkspaceMessage(certSearchMessage(), host)
    expect(checkCalls).toBe(2)
    expect(resp.type).toBe(MessageType.WorkspaceResult)
    if (resp.type === MessageType.WorkspaceResult) {
      expect(resp.payload.ok).toBe(true)
      expect(resp.payload.forwarded?.type).toBe(MessageType.SearchNoticeResult)
    }
    expect(host.connection.context.sessionStatus).toBe('authenticated')
    expect(host.connection.context.operatorId).toBe(OPERATOR_A)
  })

  it('still discards results when EASY operator genuinely switched mid-flight', async () => {
    let checkCalls = 0
    const host = createHost((_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        checkCalls += 1
        return Promise.resolve(checkCalls === 1 ? authenticatedResult(OPERATOR_A) : authenticatedResult(OPERATOR_B, '李四'))
      }
      if (message.type === MessageType.SearchNotice) {
        host.connection.applySession(
          { ok: false, status: 'expired', message: '瞬时掉线' },
          host.connection.context.connectionVersion
        )
        return Promise.resolve({
          type: MessageType.SearchNoticeResult,
          payload: {
            ok: true,
            data: {
              tab: 'cert',
              rows: [{ fid: 'cert-1' }],
              total: 1,
              pageIndex: 1,
              pageSize: 50
            }
          }
        })
      }
      return Promise.reject(new Error(`unexpected ${message.type}`))
    })

    const resp = await handleWorkspaceMessage(certSearchMessage(), host)
    expect(resp.type).toBe(MessageType.WorkspaceResult)
    if (resp.type === MessageType.WorkspaceResult) {
      expect(resp.payload.ok).toBe(false)
      expect(resp.payload.message).toBe('账号已经变化，这次查询结果已丢弃。')
    }
  })

  it('tracks hasActiveForwards while a forward is pending and clears when settled', async () => {
    let releaseSearch!: () => void
    const searchGate = new Promise<void>(resolve => {
      releaseSearch = resolve
    })
    const onPendingCheck = vi.fn()

    const host = createHost(async (_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return authenticatedResult()
      }
      if (message.type === MessageType.SearchNotice) {
        onPendingCheck(hasActiveForwards(host))
        await searchGate
        return {
          type: MessageType.SearchNoticeResult,
          payload: {
            ok: true,
            data: { tab: 'cert', rows: [], total: 0, pageIndex: 1, pageSize: 50 }
          }
        }
      }
      throw new Error(`unexpected ${message.type}`)
    })

    expect(hasActiveForwards(host)).toBe(false)
    const pending = handleWorkspaceMessage(certSearchMessage(), host)
    await vi.waitFor(() => expect(onPendingCheck).toHaveBeenCalledWith(true))
    expect(hasActiveForwards(host)).toBe(true)
    releaseSearch()
    await pending
    expect(hasActiveForwards(host)).toBe(false)
  })
})
