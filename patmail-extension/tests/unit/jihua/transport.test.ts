import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJihuaMessageHandler, JIHUA_CHANNEL, type JihuaMessageHost } from '../../../src/background/jihua-page-world'
import { createJihuaTransport, type JihuaCommand, type JihuaCommandSender } from '../../../src/jihua/transport'
import type { JihuaSession, RemoteReceipt } from '../../../src/jihua/types'

const session: JihuaSession = {
  key: 'b'.repeat(64),
  tabId: 17,
  documentId: 'document-17',
  title: '发明台账',
}
const BINDING = 'binding-01234567-89ab-cdef'

function reply(receipt: RemoteReceipt) {
  return { ok: true, receipt }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Jihua transport', () => {
  it('stages one 256 KiB chunk at a time, then persists intent before starting upload', async () => {
    const events: string[] = []
    const chunks: Array<{ chunkIndex: number; offset: number; base64: string }> = []
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') {
        const chunk = command as JihuaCommand & { chunkIndex: number; offset: number; base64: string }
        events.push(`stage:${chunk.chunkIndex}`)
        chunks.push(chunk)
        return { ok: true, receivedBytes: chunk.offset + atob(chunk.base64).length }
      }
      if (command.action === 'startUpload') {
        events.push('start')
        return reply({ state: 'done', value: { code: 200, data: { appendixList: [{ ID: 'a-1' }] } } })
      }
      if (command.action === 'receipt') return reply({ state: 'missing' })
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })
    const bytes = new Uint8Array(256 * 1024 + 1).fill(0x41)
    const file = new File([bytes], 'notice.pdf', { type: 'application/pdf' })
    const beforeSend = vi.fn(async () => { events.push('persist') })

    const result = await transport.upload(file, {
      key: 'ACPT_NOTICE', label: '专利申请受理通知书', appendixType: 'ACPT_NOTICE',
      field: 'acptNoticeAppendixList', ofcType: 'FETCH_PDF', limit: 1,
    }, 'request-1', beforeSend)

    expect(result).toEqual({ code: 200, data: { appendixList: [{ ID: 'a-1' }] } })
    expect(events).toEqual(['stage:0', 'stage:1', 'persist', 'start'])
    expect(chunks.map(chunk => atob(chunk.base64).length)).toEqual([256 * 1024, 1])
    expect(chunks.every(chunk => chunk.base64.length <= 350_000)).toBe(true)
    expect(beforeSend).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      channel: JIHUA_CHANNEL,
      action: 'startUpload',
      session,
      requestId: 'request-1',
    }))
  })

  it('stops local receipt polling without deleting the receipt or replaying a started upload', async () => {
    const pollStarted = deferred<unknown>()
    const latePoll = deferred<unknown>()
    let startCalls = 0
    let receiptCalls = 0
    let discardCalls = 0
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') return { ok: true, receivedBytes: 3 }
      if (command.action === 'startUpload') {
        startCalls++
        return reply({ state: 'pending' })
      }
      if (command.action === 'receipt') {
        receiptCalls++
        pollStarted.resolve(undefined)
        return latePoll.promise
      }
      if (command.action === 'discardStage') discardCalls++
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })
    const upload = transport.upload(new File(['abc'], 'a.pdf'), {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'cancel-poll', async () => {})

    await pollStarted.promise
    transport.stopWaiting?.()
    await expect(upload).rejects.toThrow(/停止/)
    const callsAtStop = vi.mocked(send).mock.calls.length
    latePoll.resolve(reply({ state: 'done', value: { code: 200 } }))
    await Promise.resolve()
    await Promise.resolve()

    expect(startCalls).toBe(1)
    expect(receiptCalls).toBe(1)
    expect(discardCalls).toBe(0)
    expect(send).toHaveBeenCalledTimes(callsAtStop)
  })

  it('stops chunk staging and rejects byte-budget waiters immediately', async () => {
    const firstChunkStarted = deferred<unknown>()
    const lateChunk = deferred<unknown>()
    let stageChunkCalls = 0
    let startCalls = 0
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') {
        stageChunkCalls++
        firstChunkStarted.resolve(undefined)
        return lateChunk.promise
      }
      if (command.action === 'startUpload') startCalls++
      return { ok: true }
    })
    const transport = createJihuaTransport(session, send, {
      binding: BINDING, pollIntervalMs: 0, maxStagingBytes: 1,
    })
    const material = {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }
    const first = transport.upload(new File(['a'], 'a.pdf'), material, 'cancel-stage-1', async () => {})
    await firstChunkStarted.promise
    const queued = transport.upload(new File(['b'], 'b.pdf'), material, 'cancel-stage-2', async () => {})

    transport.stopWaiting?.()
    await expect(first).rejects.toThrow(/停止/)
    await expect(queued).rejects.toThrow(/停止/)
    lateChunk.resolve({ ok: true, receivedBytes: 1 })
    await Promise.resolve()
    await Promise.resolve()

    expect(stageChunkCalls).toBe(1)
    expect(startCalls).toBe(0)
  })

  it('does not start the upload when the durable sent checkpoint settles after cancellation', async () => {
    const checkpointStarted = deferred<unknown>()
    const finishCheckpoint = deferred<unknown>()
    const actions: string[] = []
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      actions.push(command.action)
      if (command.action === 'stageChunk') return { ok: true, receivedBytes: 3 }
      if (command.action === 'discardStage') return { ok: true }
      if (command.action === 'startUpload') return reply({ state: 'done', value: { code: 200 } })
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })
    const upload = transport.upload(new File(['abc'], 'a.pdf'), {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'cancel-checkpoint', async () => {
      checkpointStarted.resolve(undefined)
      await finishCheckpoint.promise
    })

    await checkpointStarted.promise
    transport.stopWaiting?.()
    await expect(upload).rejects.toThrow(/停止/)
    finishCheckpoint.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()

    expect(actions).toEqual(['stageChunk', 'discardStage'])
  })

  it('retries a lost chunk acknowledgment idempotently without replaying the upload POST', async () => {
    let stageCalls = 0
    let startCalls = 0
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') {
        stageCalls += 1
        if (stageCalls === 1) throw new Error('callback lost after staging')
        return { ok: true, receivedBytes: 3 }
      }
      if (command.action === 'receipt') return reply({ state: 'missing' })
      if (command.action === 'startUpload') {
        startCalls += 1
        return reply({ state: 'done', value: { code: 200 } })
      }
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })

    await transport.upload(new File(['abc'], 'a.pdf'), {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'request-2', async () => {})

    expect(stageCalls).toBe(2)
    expect(startCalls).toBe(1)
  })

  it('recovers the original upload receipt after a lost start callback without starting another POST', async () => {
    let startCalls = 0
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') return { ok: true, receivedBytes: 3 }
      if (command.action === 'startUpload') {
        startCalls += 1
        throw new Error('runtime callback closed after MAIN accepted request')
      }
      if (command.action === 'receipt') return reply({ state: 'done', value: { code: 200, data: { appendixList: [{ ID: 'a-2' }] } } })
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })

    const result = await transport.upload(new File(['abc'], 'a.pdf'), {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'callback-lost-1', async () => {})

    expect(result).toEqual({ code: 200, data: { appendixList: [{ ID: 'a-2' }] } })
    expect(startCalls).toBe(1)
  })

  it('deduplicates a POST request id and rejects a second payload for that id', async () => {
    let startCalls = 0
    let ackCalls = 0
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'startRequest') {
        startCalls += 1
        return reply({ state: 'done', value: { code: 200 } })
      }
      if (command.action === 'ackReceipt') {
        ackCalls += 1
        return { ok: true, acknowledged: true }
      }
      if (command.action === 'receipt') return reply({ state: 'missing' })
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })

    const first = await transport.request('/prod-api/conow/pat/parameter/patent/update', 'POST', {
      patentParameter: { ID: 'record-1', PATENT_TYPE: 'INVENTION' },
    }, 'update-1')
    const repeated = await transport.request('/prod-api/conow/pat/parameter/patent/update', 'POST', {
      patentParameter: { ID: 'record-1', PATENT_TYPE: 'INVENTION' },
    }, 'update-1')
    await expect(transport.request('/prod-api/conow/pat/parameter/patent/update', 'POST', {
      patentParameter: { ID: 'record-2', PATENT_TYPE: 'INVENTION' },
    }, 'update-1')).rejects.toThrow(/request id/i)

    expect(first).toEqual({ code: 200 })
    expect(repeated).toEqual({ code: 200 })
    expect(startCalls).toBe(1)
    await transport.acknowledge?.('update-1')
    expect(ackCalls).toBe(1)
  })

  it('retries a missing GET receipt with a new id and releases settled local read results', async () => {
    let startCalls = 0
    const requestIds: string[] = []
    let retryId = 0
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `read-retry-${++retryId}`) })
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'startRequest') {
        startCalls += 1
        if (typeof command.requestId === 'string') requestIds.push(command.requestId)
        if (startCalls === 1) throw new Error('季华扩展后台没有返回')
        return reply({ state: 'done', value: { code: 200, rows: [], total: 0 } })
      }
      if (command.action === 'receipt') return reply({ state: 'missing' })
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })
    const path = '/conow/pat/parameter/INVENTION?pageNum=1&pageSize=100&PATENT_NUM=202610000001X'

    const recovered = await transport.request(path, 'GET', undefined, 'read-1')
    const freshRead = await transport.request(path, 'GET', undefined, 'read-1')

    expect(recovered).toEqual({ code: 200, rows: [], total: 0 })
    expect(freshRead).toEqual({ code: 200, rows: [], total: 0 })
    expect(startCalls).toBe(3)
    expect(requestIds[0]).toBe('read-1')
    expect(requestIds[1]).not.toBe(requestIds[0])
    expect(requestIds[2]).toBe('read-1')
  })

  it('rejects a file over the local staging cap before slicing or sending bytes', async () => {
    const send: JihuaCommandSender = vi.fn(async () => ({ ok: true }))
    const transport = createJihuaTransport(session, send, { binding: BINDING })
    const slice = vi.fn()
    const file = { name: 'large.pdf', type: 'application/pdf', size: 256 * 1024 * 1024 + 1, slice } as unknown as File

    await expect(transport.upload(file, {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'oversize-1', async () => {})).rejects.toThrow(/本地暂存上限 256 MiB/)

    expect(slice).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('holds the weighted byte reservation until one oversized file finishes alone', async () => {
    let finishFirst!: () => void
    const firstFetch = new Promise<void>(resolve => { finishFirst = resolve })
    const started = new Set<string>()
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      if (command.action === 'stageChunk') {
        const chunk = command as JihuaCommand & { offset: number; base64: string }
        return { ok: true, receivedBytes: chunk.offset + atob(chunk.base64).length }
      }
      if (command.action === 'startUpload') {
        if (typeof command.requestId === 'string') started.add(command.requestId)
        return reply({ state: 'pending' })
      }
      if (command.action === 'receipt') {
        if (command.requestId === 'first') {
          await firstFetch
          return reply({ state: 'done', value: { code: 200 } })
        }
        return reply({ state: 'done', value: { code: 200 } })
      }
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, maxStagingBytes: 8, pollIntervalMs: 1 })
    const material = {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }
    const first = transport.upload(new File(['123456789'], 'one.pdf'), material, 'first', async () => {})
    await vi.waitFor(() => expect(started.has('first')).toBe(true))
    let secondSettled = false
    const second = transport.upload(new File(['67890'], 'two.pdf'), material, 'second', async () => {})
      .finally(() => { secondSettled = true })
    await new Promise(resolve => setTimeout(resolve, 5))

    expect(started.has('second')).toBe(false)
    expect(secondSettled).toBe(false)
    finishFirst()
    await Promise.all([first, second])
    expect(started.has('second')).toBe(true)
  })

  it('discards only unsent staged bytes when the durable beforeSend checkpoint fails', async () => {
    const actions: string[] = []
    const send: JihuaCommandSender = vi.fn(async (command: JihuaCommand) => {
      actions.push(command.action)
      if (command.action === 'stageChunk') return { ok: true, receivedBytes: 3 }
      if (command.action === 'discardStage') return { ok: true }
      throw new Error(`unexpected action: ${command.action}`)
    })
    const transport = createJihuaTransport(session, send, { binding: BINDING, pollIntervalMs: 0 })

    await expect(transport.upload(new File(['abc'], 'a.pdf'), {
      key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT',
      field: 'firstResultAppendixList', limit: 10,
    }, 'unsent-1', async () => { throw new Error('checkpoint failed') })).rejects.toThrow('checkpoint failed')

    expect(actions).toEqual(['stageChunk', 'discardStage'])
  })

  it('roundtrips transport commands through the guarded background handler and MAIN function', async () => {
    const extensionId = 'patmail-extension-id'
    const sender = {
      id: extensionId,
      url: `chrome-extension://${extensionId}/app.html?view=upload#jihua`,
    } as chrome.runtime.MessageSender
    const binding = 'binding-01234567-89ab-cdef'
    const ids = [binding, '12345678-1234-4234-8234-123456789abc']
    const cryptoStub = {
      subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(0xaa).buffer) },
      randomUUID: vi.fn(() => ids.shift() ?? '12345678-1234-4234-8234-123456789abc'),
      getRandomValues: vi.fn((array: Uint8Array) => array.fill(7)),
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { origin: 'https://oa.jihualab.net', href: 'https://oa.jihualab.net/patentParameter/invention' })
    vi.stubGlobal('document', { cookie: 'Admin-Token=transient-token' })
    vi.stubGlobal('crypto', cryptoStub)
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const value = url.endsWith('/getInfo')
        ? { code: 200, user: { userId: 'stable-user-17' } }
        : { code: 200, rows: [{ ID: 'record-1' }], total: 1 }
      return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetcher)

    const host: JihuaMessageHost = {
      extensionId,
      queryTabs: async () => [],
      getTab: async tabId => ({ id: tabId, title: '发明台账', url: 'https://oa.jihualab.net/patentParameter/invention' }),
      executeScript: async injection => [{
        documentId: 'document-17',
        result: await injection.func(...injection.args),
      }],
    }
    const handler = createJihuaMessageHandler(host)
    const connected = await handler({ channel: JIHUA_CHANNEL, action: 'connect', tabId: session.tabId }, sender) as {
      ok: boolean; session: JihuaSession; binding: string
    }
    expect(connected.ok).toBe(true)
    const commands: Array<Record<string, unknown>> = []
    const send: JihuaCommandSender = async command => {
      commands.push(command)
      return handler(command, sender)
    }
    const transport = createJihuaTransport(connected.session, send, { binding: connected.binding, pollIntervalMs: 0 })
    await transport.checkSession()
    const result = await transport.request('/conow/pat/parameter/INVENTION?pageNum=1&pageSize=100&PATENT_NUM=202610000001X')

    expect(result).toEqual({ code: 200, rows: [{ ID: 'record-1' }], total: 1 })
    expect(commands.length).toBeGreaterThanOrEqual(3)
    expect(commands.every(command => command.tabId === session.tabId)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('https://oa.jihualab.net/prod-api/getInfo', expect.any(Object))
    expect(JSON.stringify(connected)).not.toContain('transient-token')
  })
})
