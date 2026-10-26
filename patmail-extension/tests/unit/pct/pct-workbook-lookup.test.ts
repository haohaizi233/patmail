import { describe, expect, it } from 'vitest'
import type { ApiResult } from '../../../src/api/types'
import { lookupIcFlow } from '../../../src/customer/ic-flow-lookup'

function elementTag(element: string, name: string): string {
  const matched = element.match(new RegExp(`&lt;${name}&gt;([\\s\\S]*?)&lt;/${name}&gt;`))
  return matched?.[1] ?? ''
}

describe('一件没查成不停下其余', () => {
  it('单件失败记成没读到，登录失败才整批停下', async () => {
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: true, data: { ProcInfo: [], Eflow: [] } }
      const element = params.get('Element') ?? ''
      if (element.includes('BAD')) return { ok: false, error: { code: 'HTTP_ERROR', message: '暂时没有返回。' } }
      return {
        ok: true,
        data: { TableRows: [{ case_id: 'aaaaaaaa-1111-4111-8111-111111111111', case_volume: 'PA1' }] }
      }
    }
    const mixed = await lookupIcFlow(
      [{ caseVolume: 'PA1', procLabel: '提醒申请PCT' }, { caseVolume: 'BAD', procLabel: '提醒申请PCT' }],
      post
    )
    expect(mixed.ok).toBe(true)
    if (mixed.ok) {
      expect(mixed.data.items.map(item => item.unread ?? false)).toEqual([false, true])
    }
    const login = await lookupIcFlow(
      [{ caseVolume: 'PA1', procLabel: '提醒申请PCT' }],
      async () => ({ ok: false, error: { code: 'SESSION_EXPIRED', message: '登录已失效。' } })
    )
    expect(login.ok).toBe(false)
  })

  it('网关失败再查一次能对上，流程没读到不算没查成', async () => {
    let searches = 0
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: false, error: { code: 'HTTP_ERROR', message: 'EASY 网关异常。', status: 502 } }
      searches += 1
      const element = params.get('Element') ?? ''
      if (element.includes('FLAKY') && searches === 1) return { ok: false, error: { code: 'HTTP_ERROR', message: 'EASY 网关异常。', status: 502 } }
      return {
        ok: true,
        data: { TableRows: [{ case_id: 'aaaaaaaa-1111-4111-8111-111111111111', case_volume: 'FLAKY' }] }
      }
    }
    const mixed = await lookupIcFlow([{ caseVolume: 'FLAKY', procLabel: '提醒申请PCT' }], post)
    expect(mixed.ok).toBe(true)
    if (mixed.ok) {
      expect(mixed.data.items[0]?.unread).toBeUndefined()
      expect(mixed.data.items[0]?.found).toBe(true)
      expect(mixed.data.items[0]?.statusUnread).toBe(true)
    }
  })

  it('我方文号没有时改查客户文号，只差后缀就改成库里的文号', async () => {
    const library = 'aaaaaaaa-1111-4111-8111-111111111111'
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') {
        return {
          ok: true,
          data: {
            ProcInfo: [{ proc_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ctrl_proc: '提醒申请PCT', finish_date: '', proc_status: '' }],
            Eflow: [{ id: 'flow-1', proc_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', eflow_name: '发文', order_by: 2, node_code: 'END' }]
          }
        }
      }
      const element = params.get('Element') ?? ''
      const our = elementTag(element, 'case_volume')
      const customer = elementTag(element, 'case_volume_customer')
      if (our === 'PA2519196CND-YS-放弃复审' && customer === '') return { ok: true, data: { TableRows: [] } }
      if (our === '' && customer === 'PA2519196CND-YS') {
        return { ok: true, data: { TableRows: [{ case_id: library, case_volume: 'PA2519196CND-YS', case_volume_customer: 'PA2519196CND-YS' }] } }
      }
      return { ok: true, data: { TableRows: [] } }
    }
    const found = await lookupIcFlow([{
      caseVolume: 'PA2519196CND-YS-放弃复审',
      customerVolume: 'PA2519196CND-YS',
      procLabel: '提醒申请PCT'
    }], post)
    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.data.items[0]?.found).toBe(true)
      expect(found.data.items[0]?.gate).toBe('done')
      expect(found.data.items[0]?.correctedOur).toBe('PA2519196CND-YS')
      expect(found.data.items[0]?.correctedCustomer).toBeUndefined()
    }
  })

  it('客户文号补查对上库里带后缀的我方文号', async () => {
    const library = 'aaaaaaaa-1111-4111-8111-111111111111'
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') {
        return {
          ok: true,
          data: {
            ProcInfo: [{ proc_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ctrl_proc: '提醒申请PCT', finish_date: '2026-09-01', proc_status: '完成' }],
            Eflow: []
          }
        }
      }
      const element = params.get('Element') ?? ''
      const our = elementTag(element, 'case_volume')
      const customer = elementTag(element, 'case_volume_customer')
      if (our === 'PA25117182CND' && customer === '') return { ok: true, data: { TableRows: [] } }
      if (our === '' && customer === 'HC20251191') {
        return {
          ok: true,
          data: { TableRows: [{ case_id: library, case_volume: 'PA25117182CND-米茅', case_volume_customer: 'HC20251191' }] }
        }
      }
      return { ok: true, data: { TableRows: [] } }
    }
    const found = await lookupIcFlow([{
      caseVolume: 'PA25117182CND',
      customerVolume: 'HC20251191',
      procLabel: '提醒申请PCT'
    }], post)
    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.data.items[0]?.found).toBe(true)
      expect(found.data.items[0]?.correctedOur).toBe('PA25117182CND-米茅')
      expect(found.data.items[0]?.correctedCustomer).toBeUndefined()
      expect(found.data.items[0]?.skipSend).toBe(true)
    }
    const onlyCustomer = await lookupIcFlow([{
      caseVolume: 'HC20251191',
      customerVolume: 'HC20251191',
      procLabel: '提醒申请PCT'
    }], post)
    expect(onlyCustomer.ok).toBe(true)
    if (onlyCustomer.ok) {
      expect(onlyCustomer.data.items[0]?.found).toBe(true)
      expect(onlyCustomer.data.items[0]?.correctedOur).toBeUndefined()
    }
  })

  it('8 个文号并成一次查询，我方文号结果里已经带上客户文号就不再补查', async () => {
    const calls: string[] = []
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: true, data: { ProcInfo: [], Eflow: [] } }
      calls.push(`${params.get('pageSize')}:${elementTag(params.get('Element') ?? '', 'case_volume')}`)
      const volumes = elementTag(params.get('Element') ?? '', 'case_volume').split(';')
      return {
        ok: true,
        data: {
          TableRows: volumes.map((volume, index) => ({
            case_id: `aaaaaaaa-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
            case_volume: volume,
            case_volume_customer: `CS-${index + 1}`
          }))
        }
      }
    }
    const found = await lookupIcFlow(Array.from({ length: 8 }, (_, index) => ({
      caseVolume: `PA${index + 1}`,
      customerVolume: `CS-${index + 1}`,
      procLabel: '提醒申请PCT'
    })), post)
    expect(found.ok).toBe(true)
    expect(calls).toEqual(['50:PA1;PA2;PA3;PA4;PA5;PA6;PA7;PA8'])
    if (found.ok) expect(found.data.items.every(item => item.found)).toBe(true)
  })

  it('我方文号查回来的行已经对上客户文号时，不再发第二次查询', async () => {
    let searches = 0
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: true, data: { ProcInfo: [], Eflow: [] } }
      searches += 1
      const our = elementTag(params.get('Element') ?? '', 'case_volume')
      expect(our).toBe('PA25111975CN')
      return {
        ok: true,
        data: {
          TableRows: [{
            case_id: 'aaaaaaaa-1111-4111-8111-111111111111',
            case_volume: 'PA25111975CND-YS-撤销驳回',
            case_volume_customer: 'HC20251191'
          }]
        }
      }
    }
    const found = await lookupIcFlow([{
      caseVolume: 'PA25111975CN',
      customerVolume: 'HC20251191',
      procLabel: '提醒申请PCT'
    }], post)
    expect(searches).toBe(1)
    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.data.items[0]?.found).toBe(true)
      expect(found.data.items[0]?.correctedOur).toBeUndefined()
    }
  })

  it('没有客户文号时，模糊查询对上带后缀的库内文号并修正', async () => {
    const library = 'aaaaaaaa-1111-4111-8111-111111111111'
    const calls: string[] = []
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: true, data: { ProcInfo: [], Eflow: [] } }
      const fuzzy = params.get('is_fuzzy_query_case_volume') ?? ''
      const our = elementTag(params.get('Element') ?? '', 'case_volume')
      calls.push(`${fuzzy}:${our}`)
      if (fuzzy === 'true' && our === 'CPA25113388CN') {
        return { ok: true, data: { TableRows: [{ case_id: library, case_volume: 'CPA25113388CN（结案）' }] } }
      }
      if (fuzzy === 'true' && our === 'QWPA25110732CN') {
        return { ok: true, data: { TableRows: [{ case_id: library, case_volume: 'QWPA25110732CN-TB-YS' }] } }
      }
      return { ok: true, data: { TableRows: [] } }
    }
    const found = await lookupIcFlow([
      { caseVolume: 'CPA25113388CN', procLabel: '提醒申请PCT' },
      { caseVolume: 'QWPA25110732CN', procLabel: '提醒申请PCT' }
    ], post)
    expect(found.ok).toBe(true)
    expect(calls[0]).toBe('false:CPA25113388CN;QWPA25110732CN')
    expect(calls.slice(1).sort()).toEqual(['true:CPA25113388CN', 'true:QWPA25110732CN'])
    if (found.ok) {
      expect(found.data.items[0]?.found).toBe(true)
      expect(found.data.items[0]?.correctedOur).toBe('CPA25113388CN（结案）')
      expect(found.data.items[1]?.correctedOur).toBe('QWPA25110732CN-TB-YS')
    }
  })

  it('模糊结果不是唯一后缀，或已经有客户文号时，不再模糊对上', async () => {
    const calls: string[] = []
    const post = async (operation: 'icSearch' | 'caseBusFlow', params: URLSearchParams): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') return { ok: true, data: { ProcInfo: [], Eflow: [] } }
      const fuzzy = params.get('is_fuzzy_query_case_volume') ?? ''
      const our = elementTag(params.get('Element') ?? '', 'case_volume')
      const customer = elementTag(params.get('Element') ?? '', 'case_volume_customer')
      calls.push(`${fuzzy}:${our}:${customer}`)
      if (fuzzy === 'true' && our === 'CW1PA25113297CN') {
        return {
          ok: true,
          data: {
            TableRows: [
              { case_id: 'aaaaaaaa-1111-4111-8111-111111111111', case_volume: 'CW1PA25113297CN-A' },
              { case_id: 'bbbbbbbb-1111-4111-8111-111111111111', case_volume: 'CW1PA25113297CN-优' }
            ]
          }
        }
      }
      if (fuzzy === 'true' && our === 'PA25111791CN') {
        return { ok: true, data: { TableRows: [{ case_id: 'cccccccc-1111-4111-8111-111111111111', case_volume: 'PA25111791CNX' }] } }
      }
      return { ok: true, data: { TableRows: [] } }
    }
    const found = await lookupIcFlow([
      { caseVolume: 'CW1PA25113297CN', procLabel: '提醒申请PCT' },
      { caseVolume: 'PA25111791CN', procLabel: '提醒申请PCT' },
      { caseVolume: 'CPA25111897CN', customerVolume: 'HC1', procLabel: '提醒申请PCT' }
    ], post)
    expect(found.ok).toBe(true)
    expect(calls.some(call => call.startsWith('true:CPA25111897CN'))).toBe(false)
    expect(calls.filter(call => call.startsWith('true:')).sort()).toEqual([
      'true:CW1PA25113297CN:',
      'true:PA25111791CN:'
    ])
    if (found.ok) {
      expect(found.data.items[0]?.found).toBe(false)
      expect(found.data.items[0]?.correctedOur).toBeUndefined()
      expect(found.data.items[1]?.found).toBe(false)
      expect(found.data.items[2]?.found).toBe(false)
    }
  })

  it('没有子流程且事项已完成时标不用发', async () => {
    const post = async (operation: 'icSearch' | 'caseBusFlow'): Promise<ApiResult<unknown>> => {
      if (operation === 'caseBusFlow') {
        return {
          ok: true,
          data: {
            ProcInfo: [{ proc_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ctrl_proc: '提醒申请PCT', finish_date: '2026-09-01', proc_status: '完成' }],
            Eflow: []
          }
        }
      }
      return { ok: true, data: { TableRows: [{ case_id: 'aaaaaaaa-1111-4111-8111-111111111111', case_volume: 'PA1' }] } }
    }
    const found = await lookupIcFlow([{ caseVolume: 'PA1', procLabel: '提醒申请PCT' }], post)
    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.data.items[0]?.skipSend).toBe(true)
      expect(found.data.items[0]?.gate).toBe('open')
      expect(found.data.items[0]?.uncontrolled).toBeUndefined()
    }
  })
})
