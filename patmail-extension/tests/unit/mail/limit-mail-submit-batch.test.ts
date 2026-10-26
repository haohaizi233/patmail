import { describe, expect, it } from 'vitest'
import {
  limitMailSubmitShouldHalt,
  nextLimitMailAttempt,
  submitLimitMailBatch,
  summarizeLimitMailSubmit
} from '../../../src/customer/limit-mail-submit'
import {
  client,
  contacts,
  draft,
  flowInfo,
  nodes,
  transport,
  finishProc,
  list2,
  mail,
  other,
  proc,
  proc2,
  urgency,
  user
} from './support/limit-mail-submit-fixtures'

describe('limit mail submit', () => {
  it('submits to the configured default reviewer even when different from the logged-in user', async () => {
    const calls: string[] = []
    const sent: { params: URLSearchParams | null } = { params: null }
    const saved: { params: URLSearchParams | null } = { params: null }
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: params => {
        saved.params = params
        return { ClientInfo: client({ Result: false, Status: true }) }
      },
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([other, user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: params => {
        sent.params = params
        return { ClientInfo: client({ Result: true }) }
      }
    }, calls), user, [draft({ reviewerId: other })])
    expect(result.stopped).toBe(false)
    expect(result.results[0]?.state).toBe('submitted')
    expect(result.results[0]?.message).toContain('抄送已含商务')
    expect(calls.filter(item => item.startsWith('limitMailCustomer'))).toHaveLength(1)
    expect(calls.filter(item => item.startsWith('mailSubmit'))).toHaveLength(1)
    const saveAt = calls.findIndex(item => item.startsWith('saveMailInfo'))
    const submitAt = calls.findIndex(item => item.startsWith('mailSubmit'))
    expect(saveAt).toBeGreaterThan(-1)
    expect(submitAt).toBeGreaterThan(saveAt)
    expect(saved.params?.get('mail_to')).toBe('雷工(ipr@example.com);')
    expect(saved.params?.get('mail_cc')).toBe('商务甲(sales@example.com);')
    expect(saved.params?.get('finish_ctrl_proc')).toBe(finishProc)
    expect(result.results[0]?.message).toContain('完成事项已勾上本封的处理事项')
    expect(saved.params?.get('mail_subject')).toBe('主题')
    expect(saved.params?.get('mail_body')).toBe('正文')
    expect(saved.params?.get('is_zip')).toBe('0')
    expect(saved.params?.get('Call')).toBe('SaveMailInfo')
    expect(sent.params?.get('Call')).toBe('MailSubmit')
    expect(sent.params?.get('handler')).toBe('Mail.ashx')
    expect(sent.params?.get('f_next_user_id')).toBe(other)
    expect(sent.params?.get('f_status')).toBe('1000')
    expect(sent.params?.get('f_next_node_code')).toBe('')
    expect(sent.params?.get('f_score')).toBe('')
    expect(sent.params?.get('finishdate')).toBe('false')
    expect(sent.params?.get('f_list_id')).toBe(list2)
    expect(sent.params?.get('f_cur_node_code')).toBe('FIRST')
  })

  it('一件提交响应未确认只算这一件，同批第二件继续做', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: () => ({ ClientInfo: client({ Result: false, Status: true }) }),
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ nope: true })
    }, calls), user, [draft(), draft({ procId: proc2, mailTypeId: 'bbbbbbbb-4bbb-4bbb-8bbb-bbbbbbbbbbbb' })])
    expect(result.stopped).toBe(false)
    expect(result.results.every(item => item.state === 'unknown')).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(calls.filter(item => item.startsWith('limitMailCustomer'))).toHaveLength(2)
    expect(calls.filter(item => item.startsWith('mailSubmit'))).toHaveLength(2)
  })

  it('不用发是明确结论，同一批后面那件照常提交', async () => {
    const calls: string[] = []
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: () => ({ ClientInfo: client({ Result: false, Status: true }) }),
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, calls), user, [draft({ procId: proc, hold: 'skip' }), draft({ procId: proc2 })])
    expect(result.stopped).toBe(false)
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.state).toBe('failed')
    expect(result.results[0]?.message).toBe('客户要求这封提醒不用发，没有创建发文。')
    expect(result.results[1]?.state).toBe('submitted')
    expect(result.results[1]?.message).toContain('已提交')
  })

  it('结束流程后回传还没提交审核时，不再沿用上次已提交的记录', () => {
    const item = draft()
    const mark = { procId: proc, mailId: mail, state: 'submitted' as const }
    const again = nextLimitMailAttempt(item, mark, 'done')
    expect(again.action).toBe('send')
    if (again.action === 'send') expect(again.item.mailId).toBeUndefined()
    expect(nextLimitMailAttempt(item, mark, 'open').action).toBe('send')
    expect(nextLimitMailAttempt(item, mark, 'pending')).toEqual({ action: 'skip', reason: 'pending' })
    expect(nextLimitMailAttempt(item, mark, undefined)).toEqual({ action: 'skip', reason: 'remembered' })
  })

  it('创建后遇到网关异常，再点提交沿用这封，不因为流程是还没提交或已结束而新建', () => {
    const item = draft()
    const mark = { procId: proc, mailId: mail, state: 'created' as const }
    for (const gate of ['open', 'done', undefined] as const) {
      const again = nextLimitMailAttempt(item, mark, gate)
      expect(again.action).toBe('send')
      if (again.action === 'send') expect(again.item.mailId).toBe(mail)
    }
    expect(limitMailSubmitShouldHalt('没有提交到审核人。EASY 网关异常。再点「提交到 EASY」会沿用这封发文，不会重新创建。')).toBe(false)
    expect(limitMailSubmitShouldHalt('没有提交到审核人。请求超时，请重试。')).toBe(false)
    expect(limitMailSubmitShouldHalt('没有提交到审核人。创建发文的响应无法确认，没有再次创建。')).toBe(false)
    expect(limitMailSubmitShouldHalt('客户要求这封提醒不用发，没有创建发文。')).toBe(false)
    expect(limitMailSubmitShouldHalt('写开关已关闭，没有提交到 EASY。')).toBe(true)
    expect(limitMailSubmitShouldHalt('EASY 登录已失效，请在原网站重新登录。')).toBe(true)
    const heldSummary = summarizeLimitMailSubmit([{ procId: proc, mailId: '', state: 'failed', message: '客户要求这封提醒不用发，没有创建发文。' }], true)
    expect(heldSummary).toBe('客户要求这封提醒不用发，没有创建发文。')
    expect(summarizeLimitMailSubmit([{ procId: proc, mailId: mail, state: 'submitted', message: '已提交给当前登录人审核。' }], false)).toBe('已提交 1 件给默认审核人审核。')
    expect(summarizeLimitMailSubmit([{ procId: proc, mailId: mail, state: 'created', message: '请求超时，请重试。再点「提交到 EASY」会沿用这封发文，不会重新创建。' }], false)).toBe('没有提交到审核人。请求超时，请重试。再点「提交到 EASY」会沿用这封发文，不会重新创建。')
  })
})
