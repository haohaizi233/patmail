import { describe, expect, it, vi } from 'vitest'
import { createEasyMailGateway } from '../../../src/infrastructure/mail/easy-mail-gateway-adapter'
import { MessageType, type ContentRequest } from '../../../src/shared/message'

const VALID_PROC_GUID = '33333333-3333-4333-8333-333333333333'
const VALID_CASE_GUID = '44444444-4444-4444-8444-444444444444'
const VALID_OPERATOR_GUID = '22222222-2222-4222-8222-222222222222'
const VALID_MAIL_TYPE_GUID = '55555555-5555-4555-8555-555555555555'

describe('createEasyMailGateway', () => {
  it('translates ListFlowReviewers and ReadCaseBusFlow responses cleanly without leaking protocol', async () => {
    const forward = vi.fn((msg: ContentRequest) => {
      if (msg.type === MessageType.ListFlowReviewers) {
        return Promise.resolve({
          type: MessageType.ListFlowReviewersResult,
          payload: { ok: true, data: { message: 'ok', reviewers: [{ id: 'r1', name: '审核人A' }] } },
        })
      }
      return Promise.resolve({
        type: MessageType.CaseBusFlowResult,
        payload: { ok: true, data: { gate: 'open' } },
      })
    })
    const gateway = createEasyMailGateway(forward)

    expect(await gateway.listReviewers()).toEqual({
      ok: true,
      reviewers: [{ id: 'r1', name: '审核人A' }],
    })
    expect(await gateway.readCaseFlow({ caseId: VALID_CASE_GUID, procId: VALID_PROC_GUID })).toEqual({
      ok: true,
      gate: 'open',
    })
  })

  it('defaults non-open or invalid ReadCaseBusFlow responses to pending so held items stay protected', async () => {
    const gateway = createEasyMailGateway(() => Promise.resolve({ error: '连接已失效' }))
    expect(await gateway.readCaseFlow({ caseId: VALID_CASE_GUID, procId: VALID_PROC_GUID })).toEqual({
      ok: false,
      gate: 'pending',
      message: '连接已失效',
    })
  })

  it('maps timeout and unrecognized submitLimitMail replies to explicit unknown without retrying', async () => {
    const timeoutForward = vi.fn(() => Promise.resolve({ error: '原站没有在时限内返回。' }))
    const timeoutGateway = createEasyMailGateway(timeoutForward)
    const sampleItems = [
      {
        procId: VALID_PROC_GUID,
        procIds: [VALID_PROC_GUID],
        mailTypeId: VALID_MAIL_TYPE_GUID,
        mailStyle: '1' as const,
        mode: 'ipr' as const,
        customerName: '客户甲',
        contactName: '张三',
        iprName: '李四',
        leadName: '',
        address: 'auto' as const,
        reviewerId: VALID_OPERATOR_GUID,
      },
    ]

    const timeoutReceipt = await timeoutGateway.submitLimitMail({
      operatorId: VALID_OPERATOR_GUID,
      items: sampleItems,
    })
    expect(timeoutReceipt).toEqual({ status: 'unknown', message: '原站没有在时限内返回。' })
    expect(timeoutForward).toHaveBeenCalledTimes(1)

    const lostReply = '绑定的 EASY 标签页已失效。'
    const lostForward = vi.fn(() => Promise.resolve({ error: lostReply }))
    expect(
      await createEasyMailGateway(lostForward).submitLimitMail({
        operatorId: VALID_OPERATOR_GUID,
        items: sampleItems,
      }),
    ).toEqual({ status: 'unknown', message: lostReply })
    expect(lostForward).toHaveBeenCalledTimes(1)

    const wrongShapeForward = vi.fn(() => Promise.resolve({ type: MessageType.Pong, payload: { ok: true } }))
    const wrongShapeReceipt = await createEasyMailGateway(wrongShapeForward).submitLimitMail({
      operatorId: VALID_OPERATOR_GUID,
      items: sampleItems,
    })
    expect(wrongShapeReceipt).toEqual({ status: 'unknown', message: '提交没有返回。' })
    expect(wrongShapeForward).toHaveBeenCalledTimes(1)

    const okGateway = createEasyMailGateway(() =>
      Promise.resolve({
        type: MessageType.SubmitLimitMailResult,
        payload: {
          stopped: false,
          results: [{ procId: VALID_PROC_GUID, mailId: 'mail-1', state: 'submitted', message: 'ok' }],
        },
      }),
    )
    expect(await okGateway.submitLimitMail({ operatorId: VALID_OPERATOR_GUID, items: sampleItems })).toEqual({
      status: 'ok',
      stopped: false,
      results: [{ procId: VALID_PROC_GUID, mailId: 'mail-1', state: 'submitted', message: 'ok' }],
    })
  })
})
