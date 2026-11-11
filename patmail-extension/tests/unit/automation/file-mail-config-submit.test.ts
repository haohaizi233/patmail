import { describe, expect, it, vi } from 'vitest'
import type { EasyTransport } from '../../../src/api/transport'
import { submitFileManageBatch } from '../../../src/customer/file-manage-submit'
const id = '11111111-1111-4111-8111-111111111111'
const mail = '22222222-2222-4222-8222-222222222222'
const client = { IsLogin: true, Status: true, Result: false }
describe('客户覆盖进入实际保存请求', () => {
  it('mailstyle、发件人、标题、签名和地址实际写入对应请求', async () => {
    const writes: Record<string, URLSearchParams> = {}
    const post = vi.fn(async (operation: string, params: URLSearchParams) => {
      writes[operation] = params
      const groups: Record<string, string> = { getRecentContact: 'RecentContact', getCustomerContact: 'CustomerContact', getCaseContact: 'CaseContact', getSalesContact: 'SalesContact', getPicsContact: 'PicsContact', getCaseAgentContact: 'CaseAgentContact' }
      let data: unknown = { ClientInfo: client }
      if (operation === 'mailCustomer') data = { ClientInfo: client, objid: mail }
      else if (operation === 'getMailInfo') data = { ClientInfo: client, MailInfo: [{ mail_id: mail, mail_type_id: id, customer_id: id, mailset_id: id, mail_subject: '原标题', mail_body: '正文', is_zip: 0, mail_bcc: '原密送(bcc@example.com);' }] }
      else if (groups[operation]) data = { ClientInfo: client, [groups[operation]]: operation === 'getCaseContact' ? [{ contact_name: '案件', email: 'case@example.com' }] : operation === 'getSalesContact' ? [{ cn_name: '商务', email: 'sales@example.com' }] : null }
      return { ok: true, data }
    })
    await submitFileManageBatch({ post } as unknown as EasyTransport, [{
      fileId: id, fileIds: [id], fileNames: ['甲.pdf'], mailTypeId: id, mailStyle: '2',
      subject: '客户专属标题', senderId: id, senderName: '发件人', senderEmail: 'sender@example.com',
      reviewerId: id, reviewerName: '审核', signature: '客户签名',
      addresses: { to: '追加(extra@example.com);', cc: { sender: false, sales: false, extra: '指定(cc@example.com);' } }
    }])
    expect(writes.mailCustomer?.get('mailstyle')).toBe('2')
    expect(writes.saveMailInfo?.get('mail_to')).toBe('案件(case@example.com);追加(extra@example.com);')
    expect(writes.saveMailInfo?.get('mail_cc')).toBe('指定(cc@example.com);')
    expect(writes.saveMailInfo?.get('mailset_id')).toBe(id)
    expect(writes.saveMailInfo?.get('mail_subject')).toBe('客户专属标题')
    expect(writes.saveMailInfo?.get('mail_body')).toContain('客户签名')
  })
})
