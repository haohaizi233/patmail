import { describe, expect, it } from 'vitest'
import { dropPrefilledNoticeRecipient, submitLimitMailBatch } from '../../../src/customer/limit-mail-submit'
import {
  client,
  contacts,
  draft,
  flowInfo,
  mailInfo,
  nodes,
  transport,
  mail,
  mailset,
  urgency,
  user
} from './support/limit-mail-submit-fixtures'

describe('limit mail submit', () => {
  it('drops the prefilled notice address from recipients and copies', () => {
    expect(dropPrefilledNoticeRecipient('chenjch02@pcl.ac.cn;高宇(gaoy@pcl.ac.cn);')).toBe('高宇(gaoy@pcl.ac.cn);')
    expect(dropPrefilledNoticeRecipient('陈嘉成<chenjch02@pcl.ac.cn>;李克军(likj@pcl.ac.cn);')).toBe('李克军(likj@pcl.ac.cn);')
    expect(dropPrefilledNoticeRecipient('chenjch02@pcl.ac.cn')).toBe('')
    expect(dropPrefilledNoticeRecipient('高宇(gaoy@pcl.ac.cn);')).toBe('高宇(gaoy@pcl.ac.cn);')
  })

  it('writes the technical lead to the recipient and IPR plus sales to CC', async () => {
    const calls: string[] = []
    const saved: { params: URLSearchParams | null } = { params: null }
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(
        [{ cn_name: '商务甲', email: 'sales@example.com' }],
        [{ cn_name: '雷工', email: 'ipr@example.com' }, { cn_name: '技术甲', email: 'lead@example.com' }]
      ),
      saveMailInfo: params => {
        saved.params = params
        return { ClientInfo: client({ Result: false, Status: true }) }
      },
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, calls), user, [draft({ mode: 'lead', leadName: '技术甲' })])
    expect(result.results[0]?.state).toBe('submitted')
    expect(saved.params?.get('mail_to')).toBe('技术甲(lead@example.com);')
    expect(saved.params?.get('mail_cc')).toContain('雷工(ipr@example.com);')
    expect(saved.params?.get('mail_cc')).toContain('商务甲(sales@example.com);')
  })

  it('writes the mapped default sender when the draft mailbox is empty', async () => {
    const calls: string[] = []
    const saved: { params: URLSearchParams | null } = { params: null }
    const chosen = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33'
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      getMailInfo: () => {
        const body = mailInfo()
        body.MailInfo[0].mailset_id = ''
        return body
      },
      saveMailInfo: params => {
        saved.params = params
        return { ClientInfo: client({ Result: false, Status: true }) }
      },
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, calls), user, [draft({ senderId: chosen })])
    expect(result.results[0]?.state).toBe('submitted')
    expect(result.results[0]?.message).toContain('发件邮箱已写入发文映射里的默认发件人')
    expect(saved.params?.get('mailset_id')).toBe(chosen)
  })

  it('keeps the draft mailbox when the site already filled one', async () => {
    const calls: string[] = []
    const saved: { params: URLSearchParams | null } = { params: null }
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      saveMailInfo: params => {
        saved.params = params
        return { ClientInfo: client({ Result: false, Status: true }) }
      },
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, calls), user, [draft({ senderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33' })])
    expect(result.results[0]?.state).toBe('submitted')
    expect(result.results[0]?.message).not.toContain('默认发件人')
    expect(saved.params?.get('mailset_id')).toBe(mailset)
  })

  it('草稿建出来时预填的档案杂值不写进收件人，地址按写回值整列重写', async () => {
    const savedTo = { value: '' }
    const savedCc = { value: '' }
    const dirty = mailInfo()
    const row = dirty.MailInfo?.[0]
    if (!row) throw new Error('mailInfo 需要 MailInfo 行')
    row.mail_to = 'Archiv69@163.com;38199642@qq.com;'
    row.mail_cc = 'chenjch02@pcl.ac.cn;'
    const result = await submitLimitMailBatch(transport({
      limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
      ...contacts(),
      getMailInfo: () => dirty,
      saveMailInfo: params => {
        savedTo.value = params.get('mail_to') ?? ''
        savedCc.value = params.get('mail_cc') ?? ''
        return { ClientInfo: client({ Result: false, Status: true }) }
      },
      getFlowInfo: () => flowInfo(),
      getFlowSubmit: () => nodes([user]),
      getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
      getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
      mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
    }, []), user, [draft()])
    expect(result.results[0]?.state).toBe('submitted')
    expect(decodeURIComponent(savedTo.value)).toBe('雷工(ipr@example.com);')
    expect(decodeURIComponent(savedCc.value)).toBe('商务甲(sales@example.com);')
  })
})

it('指定业务最终保存准确姓名和邮箱，不受其他商务的抄送检查扩写', async () => {
  const calls: string[] = []
  const saved: { params: URLSearchParams | null } = { params: null }
  const result = await submitLimitMailBatch(transport({
    limitMailCustomer: () => ({ ClientInfo: client(), objid: mail }),
    ...contacts([{ cn_name: '陈冠宇', email: 'chen@example.com' }, { cn_name: '其他商务', email: 'other@example.com' }], []),
    saveMailInfo: params => { saved.params = params; return { ClientInfo: client({ Result: false, Status: true }) } },
    getFlowInfo: () => flowInfo(), getFlowSubmit: () => nodes([user]),
    getUrgencyList: () => ({ ClientInfo: client(), UrgencyList: [{ urgency_id: urgency, urgency_code: 'CM', urgency_name: '普通', seq: 1 }] }),
    getFlowLastStatus: () => ({ ClientInfo: client(), last_status: null }),
    mailSubmit: () => ({ ClientInfo: client({ Result: true }) })
  }, calls), user, [draft({ iprName: '陈冠宇', arbitrated: true, namedBusiness: true })])
  expect(result.results[0]?.state).toBe('submitted')
  expect(saved.params?.get('mail_to')).toBe('陈冠宇(chen@example.com);')
  expect(saved.params?.get('mail_cc')).toBe('陈冠宇(chen@example.com);')
  expect(result.results[0]?.to).toBe('陈冠宇(chen@example.com);')
})
