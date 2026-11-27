import { describe, expect, it, vi } from 'vitest'
import { FeeReduceClient } from '../../src/api/fee-reduce-client'
import { EasyTransport } from '../../src/api/transport'
import { MessageType, workspaceForwardBlock } from '../../src/shared/message'
import { setWriteSwitchOpen } from '../../src/settings/write-switch'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

const CASE_ID_1 = '123ee97c-0791-4e98-bbc6-b62cead539a0'
const CASE_ID_2 = '223ee97c-0791-4e98-bbc6-b62cead539a0'
const CASE_ID_3 = '323ee97c-0791-4e98-bbc6-b62cead539a0'
const PROC_ID_1 = '257A47AA-5216-4B5A-A288-93285E250EB2'
const PROC_ID_2 = '357A47AA-5216-4B5A-A288-93285E250EB2'
const PROC_ID_3 = '457A47AA-5216-4B5A-A288-93285E250EB2'
const FILING_ID = 'AA6845C0-03A8-4FA6-AE8B-0A56A0BB3EB8'

describe('FeeReduceClient', () => {
  it('inspects cases and classifies 递交中/完成 as completed and 撰写中 as ready', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const call = body.get('Call')
      if (call === 'ICSearchList') {
        return jsonResponse({
          TableRows: [
            { case_id: CASE_ID_1, case_volume: 'PE26115584CND', case_name: '案件一', app_no: '201811026858.X' },
            { case_id: CASE_ID_2, case_volume: 'PE26115585CND', case_name: '案件二', app_no: '201811026859.X' },
            { case_id: CASE_ID_3, case_volume: 'PE26115586CND', case_name: '案件三', app_no: '201811026860.X' }
          ]
        })
      }
      if (call === 'GetProcList') {
        const cid = body.get('case_id')
        if (cid === CASE_ID_1) {
          return jsonResponse({
            TableRows: [{ proc_id: PROC_ID_1, ctrl_proc: '请求费用减缓', proc_status: '撰写中' }]
          })
        }
        if (cid === CASE_ID_2) {
          return jsonResponse({
            TableRows: [{ proc_id: PROC_ID_2, ctrl_proc: '请求费用减缓', proc_status: '递交中' }]
          })
        }
        return jsonResponse({
          TableRows: [{ proc_id: PROC_ID_3, ctrl_proc: '著录项目变更', proc_status: '完成' }]
        })
      }
      return jsonResponse({ ClientInfo: { IsLogin: true, Status: true, Result: true } })
    })

    const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: fetcher as unknown as typeof fetch })
    const client = new FeeReduceClient(transport)
    const result = await client.inspectCases(['PE26115584CND', 'PE26115585CND', 'PE26115586CND', 'PE_MISSING'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items.map(i => [i.caseVolume, i.state])).toEqual([
      ['PE26115584CND', 'ready'],
      ['PE26115585CND', 'completed'],
      ['PE26115586CND', 'missing_proc'],
      ['PE_MISSING', 'not_found']
    ])
  })

  it('executes full fee-reduce submission sequence, tolerates CheckFirstInventor warning, and submits to PROCE', async () => {
    const calls: Array<{ call: string; params: Record<string, string> }> = []
    let convertPollCount = 0

    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const call = body.get('Call') ?? ''
      calls.push({ call, params: Object.fromEntries(body.entries()) })

      switch (call) {
        case 'CheckCtrlProc':
        case 'VerificateFiling':
        case 'SaveCPCType':
        case 'SaveFilingType':
        case 'SaveFeeReduceRspInfo':
        case 'ConvertSubmit':
        case 'FilingSubmit':
          return jsonResponse({ ClientInfo: { IsLogin: true, Status: true, Result: true, Message: null } })
        case 'GetCPCBusineeType':
          return jsonResponse({
            cpcBusinessType: [
              { id: 'B3E65076-97D7-4423-A6BF-EA8B54AC4174', code: '5', name: '手续办理' },
              { id: '98C0C9E2-FB7D-445D-BCA2-72191F9A035B', code: '100008', name: '费用减缴请求' }
            ]
          })
        case 'InsertNewFiling':
          return jsonResponse({ id: FILING_ID, ClientInfo: { IsLogin: true, Status: true, Result: true } })
        case 'CheckResult':
        case 'CheckSplitPDF':
          return jsonResponse({ ClientInfo: { IsLogin: true, Status: true, Result: false, Message: null } })
        case 'CheckFirstInventor':
          return jsonResponse({
            ClientInfo: { IsLogin: true, Status: true, Result: false, Message: '第一发明人国别信息未填写!' }
          })
        case 'GetConvertStatus':
          convertPollCount += 1
          return jsonResponse({
            TableRows:
              convertPollCount === 1
                ? [{ convert_status: '0', form_status: '0', err_code: '' }]
                : [{ convert_status: '1000', form_status: '1000', err_code: '', convert_result: '转档成功' }],
            ClientInfo: { IsLogin: true, Status: true, Result: true }
          })
        case 'GetConvertedFile':
          return jsonResponse({
            TableRows: [{ file_desc: '费用减缴请求书', file_name: '100008.pdf' }]
          })
        case 'GetFlowInfo':
          return jsonResponse({
            Result: {
              flow_id: 'cb18d989-60f8-41c5-be41-18504ca48288',
              status: -1,
              flow_type: 'EF',
              flow_sub_type: 'OA',
              obj_id: FILING_ID
            },
            ClientInfo: { IsLogin: true, Status: true, Result: true }
          })
        case 'GetFlowSubmit':
          return jsonResponse({
            Result: [
              { node_code: 'FIRST', node_id: '9BBB6A0E-FDE3-4FD6-AAB8-03CD54087035', node_name_zh_cn: '启动流程' },
              {
                node_code: 'PROCE',
                node_id: 'ab1e0d91-332b-45b5-a4d7-b362732f76a3',
                node_name_zh_cn: '流程人员初核',
                list_id: '17304dd6-ed36-4802-b21f-6e6c3d5a93ec',
                user_list_id: '27a86ec7-ceb7-46ed-82d4-bffbc9f807a2;9eda7e30-4477-4a33-8d2b-433898b3e12f',
                user_list_name: '邓锐;冯志文'
              }
            ]
          })
        case 'GetPicProcessCount':
          return jsonResponse({
            Result: [
              { user_id: '27a86ec7-ceb7-46ed-82d4-bffbc9f807a2', count: 26, cn_name: '邓锐' },
              { user_id: '9eda7e30-4477-4a33-8d2b-433898b3e12f', count: 0, cn_name: '冯志文' }
            ]
          })
        case 'GetUrgencyList':
          return jsonResponse({
            UrgencyList: [{ urgency_id: '0FA8EF3F-8A5A-4E1F-BF75-DEA23292E77F', urgency_code: 'CM', urgency_name: '一般' }]
          })
        case 'GetFlowLastStatus':
          return jsonResponse({ last_status: null })
        default:
          return jsonResponse({})
      }
    })

    const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: fetcher as unknown as typeof fetch })
    const client = new FeeReduceClient(transport, { pollIntervalMs: 1, pollTimeoutMs: 500, sleep: async () => {} })

    const res = await client.submitFeeReduce({
      caseVolume: 'PE26115584CND',
      caseId: CASE_ID_1,
      procId: PROC_ID_1,
      reviewerStrategy: 'first'
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.filingId).toBe(FILING_ID)
    expect(res.data.reviewerName).toBe('邓锐(26)')
    expect(res.data.warnings).toContain('第一发明人国别信息未填写!')
    expect(res.data.convertedFiles).toEqual(['费用减缴请求书'])

    const submitCall = calls.find(c => c.call === 'FilingSubmit')
    expect(submitCall?.params.f_next_user_id).toBe('27a86ec7-ceb7-46ed-82d4-bffbc9f807a2')
    expect(submitCall?.params.f_next_user_name).toBe('邓锐(26)')
    expect(submitCall?.params.f_cur_node_code).toBe('FIRST')
    expect(submitCall?.params.f_next_node_code).toBe('PROCE')
    expect(submitCall?.params.f_obj_id).toBe(FILING_ID)
  })

  it('skips InsertNewFiling when resumeFilingId is provided and enforces write switch in workspaceForwardBlock', async () => {
    const calls: string[] = []
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const call = body.get('Call') ?? ''
      calls.push(call)
      if (call === 'GetCPCBusineeType') return jsonResponse({ cpcBusinessType: [] })
      if (call === 'GetConvertStatus') return jsonResponse({ TableRows: [{ convert_status: '1000', form_status: '1000', err_code: '' }] })
      if (call === 'GetFlowInfo') return jsonResponse({ Result: { flow_id: 'f1', status: -1 } })
      if (call === 'GetFlowSubmit') {
        return jsonResponse({
          Result: [
            { node_code: 'FIRST', node_id: 'n1', node_name_zh_cn: '启动流程' },
            { node_code: 'PROCE', node_id: 'n2', node_name_zh_cn: '流程人员初核', list_id: 'l1', user_list_id: 'u1', user_list_name: '邓锐' }
          ]
        })
      }
      if (call === 'GetPicProcessCount') return jsonResponse({ Result: [{ user_id: 'u1', count: 5, cn_name: '邓锐' }] })
      if (call === 'GetUrgencyList') return jsonResponse({ UrgencyList: [{ urgency_id: 'urg1', urgency_code: 'CM' }] })
      return jsonResponse({ ClientInfo: { IsLogin: true, Status: true, Result: true } })
    })

    const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: fetcher as unknown as typeof fetch })
    const client = new FeeReduceClient(transport, { pollIntervalMs: 1, pollTimeoutMs: 500, sleep: async () => {} })
    const res = await client.submitFeeReduce({
      caseVolume: 'PE26115584CND',
      caseId: CASE_ID_1,
      procId: PROC_ID_1,
      resumeFilingId: FILING_ID
    })
    expect(res.ok).toBe(true)
    expect(calls).not.toContain('InsertNewFiling')

    setWriteSwitchOpen(false)
    expect(
      workspaceForwardBlock({
        type: MessageType.InspectFeeReduceCases,
        payload: { caseVolumes: ['PE26115584CND'] }
      })
    ).toBe('')
    expect(
      workspaceForwardBlock({
        type: MessageType.ReadFeeReduceReviewers
      })
    ).toBe('')
    expect(
      workspaceForwardBlock({
        type: MessageType.SubmitFeeReduceFiling,
        payload: { caseVolume: 'PE26115584CND', caseId: CASE_ID_1, procId: PROC_ID_1 }
      })
    ).toContain('写开关已关闭')
  })

  it('reads PROCE reviewers using ZERO_GUID and rejects unrelated DRD flow when PROCE is missing', async () => {
    const seenObjIds: string[] = []
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const call = body.get('Call') ?? ''
      if (call === 'GetFlowInfo') {
        const objId = body.get('obj_id') ?? ''
        seenObjIds.push(objId)
        return jsonResponse({
          Result: {
            flow_id: objId === '00000000-0000-0000-0000-000000000000' ? 'cb18d989-60f8-41c5-be41-18504ca48288' : 'other',
            status: -1,
            flow_type: 'EF',
            flow_sub_type: 'OA'
          }
        })
      }
      if (call === 'GetFlowSubmit') {
        if (body.get('flow_id') === 'cb18d989-60f8-41c5-be41-18504ca48288') {
          return jsonResponse({
            Result: [
              { node_code: 'FIRST', node_id: 'n1', node_name_zh_cn: '启动流程' },
              {
                node_code: 'PROCE',
                node_id: 'ab1e0d91-332b-45b5-a4d7-b362732f76a3',
                node_name_zh_cn: '流程人员初核',
                list_id: 'l1',
                user_list_id: 'u1;u2',
                user_list_name: '邓锐;冯志文'
              }
            ]
          })
        }
        return jsonResponse({
          Result: [
            { node_code: 'FIRST', node_id: 'n1', node_name_zh_cn: '启动流程' },
            { node_code: 'DRD', node_id: 'n2', node_name_zh_cn: '配案主管', list_id: 'l2', user_list_id: 'u3', user_list_name: '陈婷婷' }
          ]
        })
      }
      if (call === 'GetPicProcessCount') {
        return jsonResponse({
          Result: [
            { user_id: 'u1', count: 26, cn_name: '邓锐' },
            { user_id: 'u2', count: 0, cn_name: '冯志文' }
          ]
        })
      }
      return jsonResponse({})
    })

    const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: fetcher as unknown as typeof fetch })
    const client = new FeeReduceClient(transport)
    const res = await client.readReviewers()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(seenObjIds[0]).toBe('00000000-0000-0000-0000-000000000000')
    expect(res.data.nodeName).toBe('流程人员初核')
    expect(res.data.reviewers).toEqual([
      { userId: 'u1', name: '邓锐', count: 26 },
      { userId: 'u2', name: '冯志文', count: 0 }
    ])
  })

  it('accepts >200 volumes in workspaceForwardBlock and isolates overlong volumes per row', async () => {
    const volumes250 = Array.from({ length: 250 }, (_, i) => `PE26${String(i).padStart(6, '0')}CND`)
    expect(
      workspaceForwardBlock({
        type: MessageType.InspectFeeReduceCases,
        payload: { caseVolumes: volumes250 }
      })
    ).toBe('')

    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const call = body.get('Call')
      if (call === 'ICSearchList') {
        return jsonResponse({
          TableRows: [{ case_id: CASE_ID_1, case_volume: 'PE26115584CND', case_name: '案件一', app_no: '201811026858.X' }]
        })
      }
      if (call === 'GetProcList') {
        return jsonResponse({
          TableRows: [{ proc_id: PROC_ID_1, ctrl_proc: '请求费用减缓', proc_status: '撰写中' }]
        })
      }
      return jsonResponse({})
    })

    const transport = new EasyTransport('http://183.36.43.66:88', { fetcher: fetcher as unknown as typeof fetch })
    const client = new FeeReduceClient(transport)
    const overlong = 'X'.repeat(85)
    const res = await client.inspectCases(['PE26115584CND', overlong])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.items.map(i => [i.caseVolume, i.state])).toEqual([
      ['PE26115584CND', 'ready'],
      [overlong, 'error']
    ])
  })
})
