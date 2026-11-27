import { describe, expect, it, vi } from 'vitest'
import { LARGE_CUSTOMER_ORIGIN, SME_CUSTOMER_ORIGIN } from '../../../src/api/config'
import { createDefaultNoticeReplayQuery } from '../../../src/api/notice-params'
import type { EvidenceRepository } from '../../../src/automation/evidence-store'
import type { LocalArea } from '../../../src/background/account-data'
import { handleWorkspaceMessage, type WorkspaceHost } from '../../../src/background/workspace'
import { EasyConnectionController, type BrowserTabRef } from '../../../src/shared/connection'
import { MessageType, type AppMessage } from '../../../src/shared/message'

const OP_LARGE = '11111111-1111-4111-8111-111111111111'
const OP_SME = '22222222-2222-4222-8222-222222222222'

function makeHost(tabs: BrowserTabRef[], sendToTab: WorkspaceHost['sendToTab']): WorkspaceHost {
  const connection = new EasyConnectionController()
  const data = new Map<string, unknown>()
  const area: LocalArea = {
    get: async keys => {
      const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(data)
      const out: Record<string, unknown> = {}
      for (const k of list) if (data.has(k)) out[k] = data.get(k)
      return out
    },
    set: async items => {
      for (const [k, v] of Object.entries(items)) data.set(k, v)
    }
  }
  const evidence = {
    saveAcceptance: vi.fn(async () => undefined)
  } as unknown as EvidenceRepository

  return {
    connection,
    area,
    tasks: null,
    evidence,
    queryTabs: async () => tabs,
    getTab: async tabId => {
      const found = tabs.find(t => t.id === tabId)
      if (!found) throw new Error('no tab with id')
      return found
    },
    createTab: vi.fn(async () => undefined),
    focusTab: vi.fn(async () => undefined),
    openApp: async () => ({ tabId: 999, created: false }),
    sendToTab
  }
}

describe('dual-system workspace support for pct-notice workflow', () => {
  it('checks large and sme systems silently without mutating active connection', async () => {
    const tabs: BrowserTabRef[] = [
      { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx`, title: '大客户' },
      { id: 202, url: `${SME_CUSTOMER_ORIGIN}/Index.aspx`, title: '中小客户' }
    ]
    const host = makeHost(tabs, async (tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return {
          type: MessageType.SessionResult,
          payload: {
            ok: true,
            data: {
              status: 'authenticated',
              userId: tabId === 101 ? OP_LARGE : OP_SME,
              displayName: tabId === 101 ? '大客户专员' : '中小客户专员',
              checkedAt: '2026-11-27T07:00:00.000Z'
            }
          }
        } satisfies AppMessage
      }
      throw new Error(`unexpected ${message.type}`)
    })

    const res = await handleWorkspaceMessage(
      { type: MessageType.Workspace, payload: { action: 'checkDualSystems' } },
      host
    )
    expect(res.type).toBe(MessageType.WorkspaceResult)
    if (res.type !== MessageType.WorkspaceResult) return
    expect(res.payload.ok).toBe(true)
    expect(res.payload.dualSystems?.allReady).toBe(true)
    expect(res.payload.dualSystems?.large.tabId).toBe(101)
    expect(res.payload.dualSystems?.sme.tabId).toBe(202)
    expect(host.connection.context.easyTabId).toBeNull()
  })

  it('reports missing sme tab with guidance and opens sme login without altering mode', async () => {
    const tabs: BrowserTabRef[] = [
      { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx`, title: '大客户' }
    ]
    const host = makeHost(tabs, async (_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return {
          type: MessageType.SessionResult,
          payload: {
            ok: true,
            data: {
              status: 'authenticated',
              userId: OP_LARGE,
              displayName: '大客户专员',
              checkedAt: '2026-11-27T07:00:00.000Z'
            }
          }
        } satisfies AppMessage
      }
      throw new Error('unexpected')
    })

    const checkRes = await handleWorkspaceMessage(
      { type: MessageType.Workspace, payload: { action: 'checkDualSystems' } },
      host
    )
    expect(checkRes.type).toBe(MessageType.WorkspaceResult)
    if (checkRes.type !== MessageType.WorkspaceResult) return
    expect(checkRes.payload.dualSystems?.allReady).toBe(false)
    expect(checkRes.payload.dualSystems?.large.ready).toBe(true)
    expect(checkRes.payload.dualSystems?.sme.ready).toBe(false)
    expect(checkRes.payload.dualSystems?.sme.reason).toBe('no_tab')

    const openRes = await handleWorkspaceMessage(
      { type: MessageType.Workspace, payload: { action: 'openDualLogin', mode: 'sme' } },
      host
    )
    expect(openRes.type).toBe(MessageType.WorkspaceResult)
    expect(host.createTab).toHaveBeenCalledWith(`${SME_CUSTOMER_ORIGIN}/`)
  })

  it('routes targeted forward requests to large or sme tab independently', async () => {
    const tabs: BrowserTabRef[] = [
      { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx`, title: '大客户' },
      { id: 202, url: `${SME_CUSTOMER_ORIGIN}/Index.aspx`, title: '中小客户' }
    ]
    const routed: number[] = []
    const host = makeHost(tabs, async (tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return {
          type: MessageType.SessionResult,
          payload: {
            ok: true,
            data: {
              status: 'authenticated',
              userId: tabId === 101 ? OP_LARGE : OP_SME,
              displayName: '操作员',
              checkedAt: '2026-11-27T07:00:00.000Z'
            }
          }
        } satisfies AppMessage
      }
      if (message.type === MessageType.SearchNotice) {
        routed.push(tabId)
        return {
          type: MessageType.SearchNoticeResult,
          payload: {
            ok: true,
            data: { tab: 'replay', rows: [], total: 0, pageIndex: 1, pageSize: 200 }
          }
        } satisfies AppMessage
      }
      throw new Error(`unexpected ${message.type}`)
    })

    const query = createDefaultNoticeReplayQuery('acc1')
    const [rLarge, rSme] = await Promise.all([
      handleWorkspaceMessage(
        {
          type: MessageType.Workspace,
          payload: { action: 'forward', targetMode: 'large', message: { type: MessageType.SearchNotice, payload: { tab: 'replay', query } } }
        },
        host
      ),
      handleWorkspaceMessage(
        {
          type: MessageType.Workspace,
          payload: { action: 'forward', targetMode: 'sme', message: { type: MessageType.SearchNotice, payload: { tab: 'replay', query } } }
        },
        host
      )
    ])

    expect(rLarge.type).toBe(MessageType.WorkspaceResult)
    expect(rSme.type).toBe(MessageType.WorkspaceResult)
    expect(routed.sort()).toEqual([101, 202])
  })
})
