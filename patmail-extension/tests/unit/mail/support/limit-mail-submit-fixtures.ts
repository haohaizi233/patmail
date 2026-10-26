import type { EasyTransport } from '../../../../src/api/transport'
import type { LimitMailSubmitItem } from '../../../../src/customer/limit-mail-submit'

export const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
export const other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac'
export const proc = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
export const proc2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae'
export const mailType = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
export const mail = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
export const flow = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
export const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
export const next = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'
export const list1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'
export const list2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'
export const urgency = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
export const dept = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad'

export function client(extra: Record<string, unknown> = {}) {
  return { IsLogin: true, Status: true, Result: false, Message: null, ...extra }
}

export function flowInfo(mailId = mail) {
  return {
    ClientInfo: client({ Result: true }),
    Result: {
      obj_id: mailId, flow_id: flow, flow_type: 'CO', flow_sub_type: '', dept_id: dept, dept_full_name: '部门',
      status: -1, cur_node_id: '', cur_user_id: '', node_code: '', cn_name: '', is_skip: false, is_enabled: true,
      urgency_id: '', update_time: '2026-07-07', update_time_dd: '2026-07-07', update_time_mm: '2026-07-07 08:17',
      update_time_ss: '2026-07-07 08:17:41'
    }
  }
}

export function nodes(reviewerIds: string[]) {
  return {
    ClientInfo: client(),
    flow_type_name: '发文',
    Result: [
      { seq: 1, next: '2', node_code: 'FIRST', node_id: first, list_id: list1, node_name_zh_cn: '启动', allow_edit: true, allow_skip: '', is_parallel: 0, need_all_audit: 0, user_list_id: '', user_list_name: '', user_list: '' },
      { seq: 2, next: '3', node_code: '', node_id: next, list_id: list2, node_name_zh_cn: '审核', allow_edit: true, allow_skip: '', is_parallel: 0, need_all_audit: 0, user_type: '用户', user_list_id: reviewerIds.join(';'), user_list_name: reviewerIds.map((_, index) => `审核人${index + 1}`).join(';'), user_list: '' },
      { seq: 3, next: '0', node_code: 'END', node_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf', list_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0', node_name_zh_cn: '结束', allow_edit: false, allow_skip: '', is_parallel: 0, need_all_audit: 0, user_list_id: '', user_list_name: '' }
    ]
  }
}

export const customer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'
export const mailset = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22'

export function draft(extra: Partial<LimitMailSubmitItem> = {}): LimitMailSubmitItem {
  return {
    procId: proc,
    mailTypeId: mailType,
    mailStyle: '1' as const,
    mode: 'ipr' as const,
    customerName: '客户甲',
    contactName: '',
    iprName: '雷工',
    leadName: '',
    reviewerId: user,
    ...extra
  }
}

export function mailInfo() {
  return {
    ClientInfo: client(),
    MailInfo: [{
      mail_id: mail,
      customer_id: customer,
      mail_type_id: mailType,
      mailset_id: mailset,
      mail_to: '',
      mail_cc: '',
      mail_bcc: '',
      mail_subject: '主题',
      mail_body: '正文',
      is_zip: false,
      zip_pwd: '',
      rename_zip: '',
      reply_date: '',
      proc_ids: '',
      express_id: '',
      message_id: '',
      subject_desc: '',
      mail_tags: '',
      finish_ctrl_proc: ''
    }]
  }
}

export function contacts(sales = [{ cn_name: '商务甲', email: 'sales@example.com' }], pics = [{ cn_name: '雷工', email: 'ipr@example.com' }]) {
  const empty = (key: string) => ({ ClientInfo: client(), [key]: [] })
  return {
    getMailInfo: () => mailInfo(),
    getRecentContact: () => empty('RecentContact'),
    getCustomerContact: () => empty('CustomerContact'),
    getCaseContact: () => empty('CaseContact'),
    getSalesContact: () => ({ ClientInfo: client(), SalesContact: sales }),
    getPicsContact: () => ({ ClientInfo: client(), PicsContact: pics }),
    getCaseAgentContact: () => empty('CaseAgentContact')
  }
}

export const finishProc = '629cd76f-d7ed-4bf9-944b-a9b2b91b84a2'

function mailCases() {
  return {
    ClientInfo: client(),
    TableRows: [
      { case_id: customer, case_volume: 'PA1', ctrl_proc: '提醒申请PCT', ctrl_proc_id: finishProc },
      { case_id: customer, case_volume: 'PA2', ctrl_proc: '提醒申请PCT', ctrl_proc_id: finishProc }
    ],
    TableRowsCount: '2'
  }
}

export function transport(handlers: Record<string, (params: URLSearchParams) => unknown>, calls: string[]) {
  return {
    post: async (operation: string, params: URLSearchParams) => {
      calls.push(`${operation}:${params.get('Call')}`)
      const body = handlers[operation]?.(params) ?? (operation === 'getMailCase' ? mailCases() : undefined)
      return body === undefined ? { ok: false, error: { code: 'HTTP_ERROR', message: '没有这个响应', status: 500 } } : { ok: true, data: body }
    }
  } as unknown as EasyTransport
}
