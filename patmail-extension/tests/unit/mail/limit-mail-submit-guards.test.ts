import { describe, expect, it } from 'vitest'
import { readLimitMailCustomer, readMailSubmit, submitLimitMailBatch } from '../../../src/customer/limit-mail-submit'
import {
  client,
  contacts,
  draft,
  flowInfo,
  mailInfo,
  nodes,
  transport,
  mail,
  other,
  urgency,
  user
} from './support/limit-mail-submit-fixtures'

describe('limit mail submit', () => {
  it('reads a created mail from objid even when ClientInfo.Result is false', () => {
    expect(readLimitMailCustomer({ ClientInfo: client(), objid: mail })).toEqual({ ok: true, mailId: mail })
    const confirm = readLimitMailCustomer({ NeedConfirmFillAgency: true, ClientInfo: client({ Message: '请确认代理机构' }) })
    expect(confirm.ok).toBe(false)
    if (!confirm.ok) expect(confirm.kind).toBe('confirm')
  })

  it('accepts MailSubmit only when Result is true', () => {
    expect(readMailSubmit({ ClientInfo: client({ Result: true }) }).ok).toBe(true)
    const rejected = readMailSubmit({ ClientInfo: client({ Result: false, Message: '不行' }) })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.kind).toBe('rejected')
  })

  it('does not pick another reviewer and does not submit when the logged-in user is absent', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: () => ({ ClientInfo: client({ Result: false, Status: true }) }),
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([other]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null })
    }, calls), user, [draft()])
    expect(result.results[0]?.state).toBe('created')
    expect(calls.some(item => item.startsWith('mailSubmit'))).toBe(false)
  })

  it('blocks before creating a draft when no default reviewer is configured', async () => {
    const calls: string[] = []
    const item = { ...draft(), reviewerId: undefined }
    const result = await submitLimitMailBatch(transport({}, calls), user, [item])
    expect(calls).toEqual([])
    expect(result.results[0]?.state).toBe('failed')
    expect(result.results[0]?.message).toContain('默认审核人')
  })

  it('does not fall back to the operator if the configured reviewer is absent from the next node', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: () => ({ ClientInfo: client({ Status: true }) }),
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, calls), user, [draft({ reviewerId: other })])
    expect(result.results[0]?.state).toBe('created')
    expect(result.results[0]?.message).toContain('默认审核人')
    expect(calls.some(call => call.startsWith('mailSubmit'))).toBe(false)
  })

  it('stops when the site asks to confirm the agency and does not resubmit', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ NeedConfirmFillAgency: true, ClientInfo: client({ Message: '请确认' }) })
    }, calls), user, [draft()])
    expect(result.results[0]?.state).toBe('failed')
    expect(calls).toHaveLength(1)
  })

  it('does not save addresses when the draft mailbox and the default sender are both empty', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      getMailInfo: () => {
        const body = mailInfo()
        body.MailInfo[0].mailset_id = ''
        return body
      }
    }, calls), user, [draft()])
    expect(result.results[0]?.state).toBe('created')
    expect(result.results[0]?.message).toContain('发文映射里也没有默认发件人')
    expect(calls.some(item => item.startsWith('saveMailInfo'))).toBe(false)
  })

  it('does not submit when the mail page has no sales address', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts([])
    }, calls), user, [draft()])
    expect(result.results[0]?.state).toBe('created')
    expect(result.results[0]?.message).toContain('商务')
    expect(calls.some(item => item.startsWith('saveMailInfo'))).toBe(false)
    expect(calls.some(item => item.startsWith('mailSubmit'))).toBe(false)
  })

  it('does not submit when the sheet IPR does not match a contact', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts()
    }, calls), user, [draft({ iprName: '没有这个人' })])
    expect(result.results[0]?.state).toBe('created')
    expect(result.results[0]?.message).toContain('没有这个人')
    expect(calls.some(item => item.startsWith('saveMailInfo'))).toBe(false)
    expect(calls.some(item => item.startsWith('mailSubmit'))).toBe(false)
  })
})
