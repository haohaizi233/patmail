import { describe, expect, it, vi } from 'vitest'
import { MailLetterUseCases, splitFileMailBatch } from '../../../src/application/mail/mail-letter-usecases'
import type { MailLetterGateway } from '../../../src/application/mail/ports/mail-letter-gateway'
import type { FileManageSubmitItem } from '../../../src/customer/file-manage-submit'
import type { LimitMailSubmitItem } from '../../../src/customer/limit-mail-submit'

describe('MailLetterUseCases', () => {
  it('keeps the twenty-letter file batch cap and halts unstarted work on unknown result', async () => {
    const items = Array.from({ length: 22 }, (_, index) => ({ fileId: `file-${index}` }) as FileManageSubmitItem)
    const { batch, overflow } = splitFileMailBatch(items)
    const submitFile = vi.fn<MailLetterGateway['submitFile']>(() => Promise.resolve('创建结果无法确认，没有再次创建。'))
    const service = new MailLetterUseCases({ submitFile, submitDeadline: vi.fn() })
    const receipt = vi.fn(() => Promise.resolve())
    const result = await service.submitFiles('operator', batch, 1, { start: vi.fn(), receipt })
    expect(batch).toHaveLength(20)
    expect(overflow).toEqual(items.slice(20))
    expect(result).toEqual({ halted: true, unstarted: items.slice(1, 20) })
    expect(submitFile).toHaveBeenCalledExactlyOnceWith('operator', items[0])
    expect(receipt).toHaveBeenCalledTimes(1)
  })

  it('reads gates before dispatch, preserves order at width one and retains structured deadline responses', async () => {
    const item = { procId: 'procedure', reviewerId: 'configured-reviewer' } as LimitMailSubmitItem
    const events: string[] = []
    const submitDeadline = vi.fn<MailLetterGateway['submitDeadline']>(() => {
      events.push('write')
      return Promise.resolve({
        text: '收到结构化回执',
        results: [{ procId: item.procId, mailId: '', state: 'unknown', message: '暂待核对' }],
      })
    })
    const service = new MailLetterUseCases({ submitFile: vi.fn(), submitDeadline })
    const receipt = vi.fn()
    await service.submitDeadlines('operator', [item], 1, {
      gates: () => {
        events.push('read')
        return { procedure: 'open' }
      },
      receipt,
    })
    expect(events).toEqual(['read', 'write'])
    expect(submitDeadline).toHaveBeenCalledExactlyOnceWith('operator', item, { procedure: 'open' })
    expect(receipt).toHaveBeenCalledWith(item, '收到结构化回执', [
      { procId: item.procId, mailId: '', state: 'unknown', message: '暂待核对' },
    ])
  })
})
