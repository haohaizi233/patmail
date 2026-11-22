import { describe, expect, it, vi } from 'vitest'
import { createLimitMailWriteGuard } from '../../../src/background/limit-mail-write-guard'
import type { LimitMailSubmitItem } from '../../../src/customer/limit-mail-submit'
import { MessageType } from '../../../src/shared/message'

const item: LimitMailSubmitItem = {
  procId: '33333333-3333-4333-8333-333333333333',
  mailTypeId: '55555555-5555-4555-8555-555555555555',
  reviewerId: '22222222-2222-4222-8222-222222222222',
  mailStyle: '1',
  mode: 'ipr',
  customerName: 'fixture',
  contactName: '',
  iprName: '',
  leadName: '',
}
const allowed = () => true

function memoryJournal() {
  const records = new Map<string, unknown>()
  return {
    load: (scope: string) => Promise.resolve(records.get(scope)),
    save: (scope: string, marks: unknown) => {
      records.set(scope, structuredClone(marks))
      return Promise.resolve()
    },
  }
}

describe('EASY write intent guard', () => {
  it('preserves an unknown intent after losing the reply and prevents a second write after restart', async () => {
    const journal = memoryJournal()
    const send = vi.fn(() => Promise.reject(new Error('port disconnected')))
    const lost = await createLimitMailWriteGuard(journal)('account', [item], allowed, allowed, send)
    expect(lost.payload.results[0].state).toBe('unknown')
    const duplicate = await createLimitMailWriteGuard(journal)('account', [item], allowed, allowed, send)
    expect(duplicate.payload.results[0].state).toBe('unknown')
    expect(send).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await journal.load('account'))).not.toContain('customerName')
  })

  it('prevents concurrent dispatch and does not release a confirmed physical write', async () => {
    const guard = createLimitMailWriteGuard(memoryJournal())
    const send = vi.fn(() =>
      Promise.resolve({
        type: MessageType.SubmitLimitMailResult,
        payload: {
          stopped: false,
          results: [{ procId: item.procId, mailId: 'mail-1', state: 'submitted', message: 'ok' }],
        },
      }),
    )
    const [first, second] = await Promise.all([
      guard('account', [item], allowed, allowed, send),
      guard('account', [item], allowed, allowed, send),
    ])
    expect(first.payload.results[0].state).toBe('submitted')
    expect(second.payload.results[0].state).toBe('unknown')
    const confirmed = await guard('account', [item], allowed, allowed, send)
    expect(confirmed.payload.results[0].state).toBe('failed')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not send if scope changes during intent persistence and releases the unstarted intent', async () => {
    const storage = memoryJournal()
    let current = true
    const guard = createLimitMailWriteGuard({
      ...storage,
      save: async (scope, marks) => {
        await storage.save(scope, marks)
        current = false
      },
    })
    const send = vi.fn()
    const result = await guard('account', [item], () => current, allowed, send)
    expect(result.payload.results[0].state).toBe('failed')
    expect(send).not.toHaveBeenCalled()
    expect(await storage.load('account')).toEqual({})
  })
})
