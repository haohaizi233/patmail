import { describe, expect, it, vi } from 'vitest'
import { PctNoticeWal } from '../../../src/background/pct-notice-write'
import type { RecoveryReply, RecoveryTransport } from '../../../src/recovery/client'
import { MessageType } from '../../../src/shared/message'

const owner = {
  origin: 'http://183.36.43.66:88',
  operatorId: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222'
}

const confirmed = {
  type: MessageType.NoticeActionResult,
  payload: { ok: true, data: { ok: true, message: '完成' } }
}
const stillBound = () => Promise.resolve(true)

function makeJournal(): RecoveryTransport {
  let head: RecoveryReply = { revision: 0 }
  return request => {
    if (request.op === 'put') {
      expect(request.expectedRevision).toBe(head.revision)
      head = { revision: (head.revision ?? 0) + 1, payload: request.payload }
    }
    return Promise.resolve(head)
  }
}

describe('PCT notice write recovery', () => {
  it('resumes from receipts even if targets are regrouped and keeps replay numbers paired', async () => {
    const journal = makeJournal()
    const send = vi.fn(() => Promise.resolve(confirmed))
    await new PctNoticeWal(journal).runAction({
      action: 'downloadTzsList', isReplay: true, account: 'cpc', fids: ['a', 'b'], xlh: ['01', '02']
    }, owner, stillBound, send)
    await new PctNoticeWal(journal).runAction({
      action: 'downloadTzsList', isReplay: true, account: 'cpc', fids: ['c', 'b'], xlh: ['03', '02']
    }, owner, stillBound, send)
    expect(send).toHaveBeenLastCalledWith({
      action: 'downloadTzsList', isReplay: true, account: 'cpc', fids: ['c'], xlh: ['03']
    })
    await new PctNoticeWal(journal).runAction({
      action: 'downloadTzsList', isReplay: true, account: 'cpc', fids: ['a', 'c', 'b'], xlh: ['01', '03', '02']
    }, owner, stillBound, send)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('keeps both import rounds distinct and fences an unknown write across runs', async () => {
    const journal = makeJournal()
    const send = vi.fn(() => Promise.resolve(confirmed))
    const action = { action: 'importNotice', oaIds: ['a'] } as const
    await new PctNoticeWal(journal).runAction({ ...action, oaIds: ['a'] }, { ...owner, importRound: 1 }, stillBound, send)
    send.mockRejectedValueOnce(new Error('response lost'))
    await expect(new PctNoticeWal(journal).runAction(
      { ...action, oaIds: ['a'] }, { ...owner, importRound: 2 }, stillBound, send
    )).rejects.toThrow('response lost')
    await expect(new PctNoticeWal(journal).runAction(
      { ...action, oaIds: ['b'] }, { ...owner, runId: 'different-batch', importRound: 1 }, stillBound, send
    )).rejects.toThrow('未确认')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not dispatch after an account change and can retry an unsent intent', async () => {
    const wal = new PctNoticeWal(makeJournal())
    const send = vi.fn(() => Promise.resolve(confirmed))
    const action = { action: 'deleteDownloadOa' as const, fids: ['a'] }
    await expect(wal.runAction(action, owner, () => Promise.resolve(false), send)).rejects.toThrow('没有发送')
    expect(send).not.toHaveBeenCalled()
    await wal.runAction(action, owner, stillBound, send)
    expect(send).toHaveBeenCalledOnce()
  })
})
