import { describe, expect, it, vi } from 'vitest'
import { LARGE_CUSTOMER_ORIGIN, SME_CUSTOMER_ORIGIN } from '../../../src/api/config'
import { createDefaultNoticeReplayQuery } from '../../../src/api/notice-params'
import type { EvidenceRepository } from '../../../src/automation/evidence-store'
import type { LocalArea } from '../../../src/background/account-data'
import { dispatchRecoveryRequest } from '../../../src/background/recovery'
import { handleFeeReduceCheckpoint, withFeeReduceCheckpoint } from '../../../src/background/fee-reduce-checkpoint'
import { runWorkflowWrite, workflowWriteStep } from '../../../src/background/workflow-write'
import { handleWorkspaceMessage, type WorkspaceHost } from '../../../src/background/workspace'
import { EasyConnectionController, scopeFromConnection, type BrowserTabRef } from '../../../src/shared/connection'
import { FEE_REDUCE_CHECKPOINT } from '../../../src/shared/fee-reduce-checkpoint'
import { isContentRequest, isMessage, MessageType, workspaceForwardBlock, type AppMessage } from '../../../src/shared/message'

const OP_LARGE = '11111111-1111-4111-8111-111111111111'
const OP_SME = '22222222-2222-4222-8222-222222222222'

vi.mock('../../../src/background/recovery', () => ({ dispatchRecoveryRequest: vi.fn() }))

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
  it('protects new workflow commands without a per-command WAL registration', async () => {
    const journal = vi.mocked(dispatchRecoveryRequest)
    journal.mockReset()
    journal.mockResolvedValueOnce({ revision: 0 }).mockRejectedValueOnce(new Error('WAL offline'))
    const tab = { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx` }
    const send = vi.fn((_tabId: number, message: AppMessage) => {
      if (message.type !== MessageType.CheckSession) throw new Error('Business request escaped WAL')
      return Promise.resolve({
        type: MessageType.SessionResult,
        payload: { ok: true, data: { status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z' } }
      })
    })
    const host = makeHost([tab], send)
    const request = {
      type: MessageType.Workspace,
      payload: {
        action: 'forward', targetMode: 'large',
        message: { type: MessageType.NoticeAction, payload: { action: 'reMatchNotice', oaIds: ['1'] } },
        workflowId: 'new-workflow'
      }
    } satisfies AppMessage
    expect(isMessage(request)).toBe(true)
    const response = await handleWorkspaceMessage(request, host)
    expect(response).toMatchObject({ payload: { ok: false, message: 'WAL offline' } })
    expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({
      slot: 'workflow-write', scope: JSON.stringify(['new-workflow', LARGE_CUSTOMER_ORIGIN, OP_LARGE, '']),
      payload: expect.objectContaining({ state: 'pending' })
    }))
    expect(send.mock.calls.every(([, message]) => message.type === MessageType.CheckSession)).toBe(true)
  })

  it('writes a WAL intent for the targeted account before forwarding a PCT write', async () => {
    const journal = vi.mocked(dispatchRecoveryRequest)
    journal.mockReset()
    journal.mockResolvedValueOnce({ revision: 0 }).mockRejectedValueOnce(new Error('WAL offline'))
    const writes = vi.fn(() => ({
      type: MessageType.NoticeActionResult,
      payload: { ok: true, data: { ok: true, message: '' } }
    }))
    const host = makeHost([{ id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx` }], (_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return Promise.resolve({
          type: MessageType.SessionResult,
          payload: { ok: true, data: { status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z' } }
        })
      }
      expect(journal.mock.calls.at(-1)?.[0].payload).toMatchObject({ state: 'pending', step: 'deleteDownloadOa' })
      return Promise.resolve(writes())
    })
    const request = {
      type: MessageType.Workspace,
      payload: {
        action: 'forward', targetMode: 'large',
        message: { type: MessageType.NoticeAction, payload: { action: 'deleteDownloadOa', fids: ['fid-1'] } }
      }
    } satisfies AppMessage
    await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject({ payload: { ok: false, message: 'WAL offline' } })
    expect(writes).not.toHaveBeenCalled()
    journal.mockResolvedValueOnce({ revision: 0 }).mockResolvedValueOnce({ revision: 1 }).mockResolvedValueOnce({ revision: 2 })
    await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject({ payload: { ok: true } })
    expect(writes).toHaveBeenCalledTimes(1)
    expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({
      slot: 'workflow-write', scope: JSON.stringify(['pct-notice', LARGE_CUSTOMER_ORIGIN, OP_LARGE, '']),
      expectedRevision: 1, payload: expect.objectContaining({ state: 'completed' })
    }))
  })

  it('does not forward a fee reduction again when the process already has a WAL intent', async () => {
    const journal = vi.mocked(dispatchRecoveryRequest)
    journal.mockReset()
    journal.mockResolvedValueOnce({ revision: 3, payload: { state: 'pending', step: 'submit' } })
    const send = vi.fn((_tabId: number, message: AppMessage) => {
      if (message.type !== MessageType.CheckSession) throw new Error('Unexpected business request')
      return Promise.resolve({
        type: MessageType.SessionResult,
        payload: { ok: true, data: { status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z' } }
      })
    })
    const tab = { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx` }
    const host = makeHost([tab], send)
    host.connection.beginBind(tab)
    host.connection.applySession({
      ok: true, status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z'
    }, host.connection.context.connectionVersion)
    const caseId = '33333333-3333-4333-8333-333333333333'
    const procId = '44444444-4444-4444-8444-444444444444'
    const request = {
      type: MessageType.Workspace,
      payload: {
        action: 'forward',
        message: { type: MessageType.SubmitFeeReduceFiling, payload: {
          caseVolume: 'A-1', caseId, procId, expectedScope: scopeFromConnection(host.connection.context)!
        } }
      }
    } satisfies AppMessage
    const stale = { ...request, payload: { ...request.payload, message: {
      ...request.payload.message,
      payload: { ...request.payload.message.payload, expectedScope: { ...request.payload.message.payload.expectedScope, operatorId: OP_SME } }
    } } }
    await expect(handleWorkspaceMessage(stale, host)).resolves.toMatchObject({ payload: { contextError: 'STALE_CONTEXT' } })
    expect(send).not.toHaveBeenCalled()
    expect(journal).not.toHaveBeenCalled()
    await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject({
      payload: { ok: false, message: expect.stringContaining('未确认') }
    })
    expect(send.mock.calls.every(([, message]) => message.type === MessageType.CheckSession)).toBe(true)
    expect(journal).toHaveBeenCalledExactlyOnceWith({
      op: 'get', slot: 'workflow-write', scope: JSON.stringify(['fee-reduce', LARGE_CUSTOMER_ORIGIN, OP_LARGE, procId])
    })
  })

  it('permits fee preflight retries, resumes the confirmed draft and fences an unknown final submission', async () => {
    const journal = vi.mocked(dispatchRecoveryRequest)
    journal.mockReset()
    let head: { payload: unknown; revision: number } = { payload: null, revision: 0 }
    journal.mockImplementation(request => {
      if (request.op === 'get') return Promise.resolve(head)
      expect(request.expectedRevision).toBe(head.revision)
      head = { payload: request.payload, revision: head.revision + 1 }
      return Promise.resolve(head)
    })
    const tab = { id: 101, url: `${LARGE_CUSTOMER_ORIGIN}/Index.aspx` }
    const filingId = '55555555-5555-4555-8555-555555555555'
    const operations: string[] = []
    const checkpoint = (token: string, phase: string, id?: string, tabId = tab.id) => new Promise(resolve => {
      const handled = handleFeeReduceCheckpoint(
        { type: FEE_REDUCE_CHECKPOINT, token, phase, filingId: id },
        { id: 'test-extension', tab: { id: tabId } as chrome.tabs.Tab, url: tab.url }, resolve
      )
      expect(handled).toBe(true)
    })
    const host = makeHost([tab], async (_tabId, message) => {
      if (message.type === MessageType.CheckSession) {
        return {
          type: MessageType.SessionResult,
          payload: { ok: true, data: { status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z' } }
        }
      }
      if (message.type !== MessageType.ExecuteFeeReduceFiling) throw new Error('Unexpected request')
      expect(isContentRequest(message)).toBe(true)
      expect(workspaceForwardBlock(message)).not.toBe('')
      const { walToken, resumeFilingId } = message.payload
      expect(walToken).toBeTruthy()
      operations.push(resumeFilingId ? 'resume' : 'start')
      if (operations.length === 2) {
        await expect(checkpoint(walToken!, 'creating', undefined, 999)).resolves.toMatchObject({ ok: false })
        await expect(checkpoint(walToken!, 'creating')).resolves.toMatchObject({ ok: true })
        await expect(checkpoint(walToken!, 'draft', filingId)).resolves.toMatchObject({ ok: true })
      } else if (operations.length === 3) {
        expect(resumeFilingId).toBe(filingId)
        await expect(checkpoint(walToken!, 'submitting', filingId)).resolves.toMatchObject({ ok: true })
      }
      return { type: MessageType.Error, payload: { message: '模拟中断' } }
    })
    host.connection.beginBind(tab)
    host.connection.applySession({
      ok: true, status: 'authenticated', userId: OP_LARGE, checkedAt: '2026-11-27T07:00:00.000Z'
    }, host.connection.context.connectionVersion)
    const request = {
      type: MessageType.Workspace, payload: { action: 'forward', workflowId: 'fee-reduce',
        message: { type: MessageType.SubmitFeeReduceFiling, payload: {
          caseVolume: 'A-1', caseId: '33333333-3333-4333-8333-333333333333', procId: '44444444-4444-4444-8444-444444444444',
          expectedScope: scopeFromConnection(host.connection.context)!
        } }
      }
    } satisfies AppMessage
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension' } })
    try {
      const forwardedError = { payload: { forwarded: { payload: { message: '模拟中断' } } } }
      await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject(forwardedError)
      await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject(forwardedError)
      expect(head.payload).toMatchObject({ progress: { phase: 'draft', filingId } })
      await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject({
        payload: { message: expect.stringContaining('最终提交结果未确认') }
      })
      await expect(handleWorkspaceMessage(request, host)).resolves.toMatchObject({ payload: { message: expect.stringContaining('未确认') } })
      expect(operations).toEqual(['start', 'start', 'resume'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('closes the fee WAL after confirming the exact process was already completed without a submit checkpoint', async () => {
    const journal = vi.mocked(dispatchRecoveryRequest)
    journal.mockReset()
    journal.mockResolvedValueOnce({ revision: 0 }).mockResolvedValueOnce({ revision: 1 }).mockResolvedValueOnce({ revision: 2 })
    const account = { easyOrigin: LARGE_CUSTOMER_ORIGIN, operatorId: OP_LARGE, easyTabId: 101, connectionVersion: 1 }
    const process = { caseId: '33333333-3333-4333-8333-333333333333', procId: '44444444-4444-4444-8444-444444444444' }
    const write = workflowWriteStep({ type: MessageType.SubmitFeeReduceFiling, payload: { ...process, caseVolume: 'A-1' } }, false)!
    const reply = {
      type: MessageType.SubmitFeeReduceFilingResult,
      payload: { ok: true, data: { outcome: 'already_completed', ...process, caseVolume: 'A-1', procStatus: '完成', message: '跳过' } }
    } satisfies AppMessage
    await expect(runWorkflowWrite(write, account, () => true, (save, progress) =>
      withFeeReduceCheckpoint({ account, process, save, progress: progress!, canWrite: () => Promise.resolve(true) },
        () => Promise.resolve(reply))
    )).resolves.toEqual(reply)
    expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedRevision: 1, payload: expect.objectContaining({ state: 'completed', progress: { phase: 'preflight' } })
    }))
  })

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
          payload: { action: 'forward', workflowId: 'pct-notice', targetMode: 'large', message: { type: MessageType.SearchNotice, payload: { tab: 'replay', query } } }
        },
        host
      ),
      handleWorkspaceMessage(
        {
          type: MessageType.Workspace,
          payload: { action: 'forward', workflowId: 'pct-notice', targetMode: 'sme', message: { type: MessageType.SearchNotice, payload: { tab: 'replay', query } } }
        },
        host
      )
    ])

    expect(rLarge.type).toBe(MessageType.WorkspaceResult)
    expect(rSme.type).toBe(MessageType.WorkspaceResult)
    expect(routed.sort()).toEqual([101, 202])
  })
})
