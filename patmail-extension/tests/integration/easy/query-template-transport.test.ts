import { describe, expect, it } from 'vitest'
import type { ApiResult } from '../../../src/api/types'
import { historyDeleteRequest, historySaveRequest, normalizeHistorySave } from '../../../src/api/query-history'
import { HistoryQueryService } from '../../../src/api/query-history/service'
import { historyRequest } from '../../../src/api/query-history/surfaces'
import { EasyTransport } from '../../../src/api/transport'
import { cellsFromLiveFields } from '../../../src/query/live-fields'
import { buildQueryXml } from '../../../src/query/query-xml'
import { parseQueryXml } from '../../../src/query/xml-parser'

const client = { ClientInfo: { IsLogin: true, Status: true, Result: false, Message: null } }
const guid = '227BFA59-A8A7-4EC6-928D-50FB5C29F960'
const other = '122F1BAA-F03E-42EE-B297-D9E47C0823A4'

function dataOf<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
function codeOf(result: ApiResult<unknown>): string {
  if (result.ok) throw new Error('expected an error')
  return result.error.code
}

describe('历史模板传输', () => {
  it('caches the list, forces refresh, and times out', async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      if (calls > 2) return new Response('down', { status: 500 })
      return new Response(JSON.stringify({ ...client, Options: [{ query_id: other, title: '列表' }] }), { status: 200 })
    }
    const service = new HistoryQueryService(new EasyTransport('http://183.36.43.66:88', { fetcher }), () => 1_000)
    expect(dataOf(await service.list('user', 'file', false))).toHaveLength(1)
    expect(dataOf(await service.list('user', 'file', false))).toHaveLength(1)
    expect(calls).toBe(1)
    await service.list('user', 'file', true)
    expect(calls).toBe(2)
    expect(dataOf(await service.list('user', 'file', true))).toHaveLength(1)
    expect(calls).toBe(3)
    service.invalidate()
    const hanging = new HistoryQueryService(new EasyTransport('http://183.36.43.66:88', {
      fetcher: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true })
      }),
      timeoutMs: 20
    }))
    expect(codeOf(await hanging.list('user', 'file', true))).toBe('REQUEST_TIMEOUT')
  })

  it('uses the cached title when the detail payload omits Options', async () => {
    const xml = '<xmlRoot><app_no>2026.1</app_no></xmlRoot>'
    const fetcher: typeof fetch = async (_url, init) => {
      const id = new URLSearchParams(String(init?.body)).get('query_id')
      const body = id
        ? { ...client, Options: null, QueryXml: [{ query_xml: xml }] }
        : { ...client, Options: [{ query_id: guid, title: '缓存标题' }] }
      return new Response(JSON.stringify(body), { status: 200 })
    }
    const service = new HistoryQueryService(new EasyTransport('http://183.36.43.66:88', { fetcher }))
    await service.list('user', 'file', true)
    expect(dataOf(await service.detail('user', 'file', guid))).toMatchObject({ name: '缓存标题', queryXml: xml })
    expect(codeOf(await service.detail('user', 'file', 'not-a-guid'))).toBe('INVALID_QUERY')
  })

  it('saves a query template with SearchQueryHisSave and does not invent an id', async () => {
    const xml = buildQueryXml(
      { customer_name_vague: '宁德时代', fileclass: 'general', post_s: '2025-09-15' },
      { fileclass: '所有文件' }
    )
    expect(xml).toContain('<customer_name_vague>宁德时代</customer_name_vague>')
    expect(xml).toContain('<selfileclass>general</selfileclass>')
    expect(xml).toContain('<selfileclass_text>所有文件</selfileclass_text>')
    expect(xml).toContain('<txtpost_s>2025-09-15</txtpost_s>')
    const parsed = parseQueryXml(xml)
    expect(parsed.ok && parsed.data.fields.fileclass).toBe('general')
    expect(dataOf(normalizeHistorySave({ ClientInfo: { IsLogin: true, Status: true, Result: true } }))).toEqual({ saved: true })
    expect(dataOf(normalizeHistorySave({ ...client, Ret: true }))).toEqual({ saved: true })
    expect(dataOf(normalizeHistorySave(client))).toEqual({ saved: true })
    expect(codeOf(normalizeHistorySave({ ClientInfo: { IsLogin: true, Status: true, Result: false, Message: '没有保存' } }))).toBe('BUSINESS_ERROR')
    expect(codeOf(normalizeHistorySave({ ...client, Ret: false }))).toBe('BUSINESS_ERROR')
    let body = ''
    const service = new HistoryQueryService(new EasyTransport('http://183.36.43.66:88', {
      fetcher: async (_url, init) => {
        body = String(init?.body)
        return new Response(JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: true } }), { status: 200 })
      }
    }))
    expect(dataOf(await service.save('user', 'file', { title: '我的查询条件', queryId: '', queryXml: xml }))).toEqual({ saved: true })
    const sent = new URLSearchParams(body)
    expect(sent.get('Call')).toBe('SearchQueryHisSave')
    expect(sent.get('is_query_save')).toBe('true')
    expect(sent.get('is_out_save')).toBe('false')
    expect(sent.get('query_save_title')).toBe('我的查询条件')
    expect(sent.get('query_id')).toBe('')
    expect(sent.get('query_type')).toBe('FileSearch')
    expect(historySaveRequest('limit', '期限', '', '<xmlRoot></xmlRoot>').get('query_type')).toBe('LimitMonitor\u2014liall')
    const remove = historyDeleteRequest('file', guid)
    expect(remove.get('Call')).toBe('SearchQueryHisDelete')
    expect(remove.get('query_id')).toBe(guid)
    expect(remove.get('log_pagename')).toBe('FileSearch.aspx')
    let deletedBody = ''
    const deleting = new HistoryQueryService(new EasyTransport('http://183.36.43.66:88', {
      fetcher: async (_url, init) => {
        deletedBody = String(init?.body)
        return new Response(JSON.stringify({ ...client, Ret: true }), { status: 200 })
      }
    }))
    await deleting.list('user', 'file', true)
    expect(dataOf(await deleting.delete('user', 'file', guid))).toEqual({ deleted: true })
    expect(new URLSearchParams(deletedBody).get('Call')).toBe('SearchQueryHisDelete')
    expect(codeOf(await deleting.delete('user', 'file', 'not-a-guid'))).toBe('INVALID_QUERY')
  })

  it('loads only the fields that sit below the first screen', () => {
    const live = cellsFromLiveFields([
      { id: 'case_volume', label: '我方文号', section: 'case', advanced: false, control: 'text', visible: true, hiddenBy: [], options: [] },
      { id: 'applicant', label: '申请人', section: 'case', advanced: true, control: 'text', visible: true, hiddenBy: [], options: [] },
      { id: 'agency_id', label: '代理机构', section: 'case', advanced: true, control: 'picker', visible: true, hiddenBy: [], options: [] },
      { id: 'hidden_case', label: '藏起来', section: 'case', advanced: true, control: 'text', visible: false, hiddenBy: ['tr'], options: [] },
      { id: 'file_remark', label: '文件备注', section: 'file', advanced: true, control: 'text', visible: true, hiddenBy: [], options: [] }
    ])
    expect(live.case.map(item => item.kind === 'text' || item.kind === 'named' ? item.key : '')).toEqual(['applicant', 'agency_id'])
    expect(live.file.map(item => item.kind === 'text' ? item.key : '')).toEqual(['file_remark'])
  })

  it('asks the limit page for its own templates', () => {
    const params = historyRequest('limit', '')
    expect(params.get('query_type')).toBe('LimitMonitor\u2014liall')
    expect(params.get('query_type')).not.toContain('-')
    expect(params.get('log_pagename')).toBe('LimitMonitor.aspx')
    expect(historyRequest('file', '').get('query_type')).toBe('FileSearch')
  })
})
