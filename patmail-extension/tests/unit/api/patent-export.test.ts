import { describe, expect, it, vi } from 'vitest'
import { EasyRuntime } from '../../../src/api/client'
import { buildPatentExportGroups, buildPatentExportParams } from '../../../src/api/patent-export'

describe('patent list export', () => {
  it('keeps the live group order and adds process columns only in process mode', () => {
    const groups = buildPatentExportGroups(false)
    expect(groups.map(group => group.columns.length)).toEqual([55, 48, 35, 16, 23])
    expect(groups[0].columns[0]).toMatchObject({ text: '序号', defaultChecked: false })
    expect(buildPatentExportGroups(true).slice(5).map(group => group.columns.length)).toEqual([55, 14])
  })

  it('exports the whole query with ordered columns and no paging arguments', () => {
    const params = buildPatentExportParams({
      pageIndex: 3, pageSize: 20, fields: { app_no: '123' }, select_and: true, is_proc: true
    }, 'E', [{ value: 'app_no', text: '申请号' }, { value: 'case_volume', text: '我方文号' }])
    expect(params.get('Call')).toBe('ICCaseSearchToExcel')
    expect(params.get('Element')).toContain('&lt;app_no&gt;123&lt;/app_no&gt;')
    expect(params.get('select_and')).toBe('true')
    expect(params.get('is_proc')).toBe('true')
    expect(params.get('PageAuth')).toBe('E')
    expect(params.get('e_coulums')).toBe('&lt;app_no&gt;申请号&lt;/app_no&gt;&lt;case_volume&gt;我方文号&lt;/case_volume&gt;')
    expect(params.has('pageIndex')).toBe(false)
    expect(params.has('colsel')).toBe(false)
  })

  it('uses the active account permission and only queues on a confirmed export response', async () => {
    const calls: { path: string; data: URLSearchParams }[] = []
    let permission = 'A,E,Q'
    let result = true
    const runtime = new EasyRuntime('http://183.36.43.66:88', {
      fetcher: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const path = new URL(url).pathname
        const body = init?.body
        const bodyText = typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : ''
        calls.push({ path, data: new URLSearchParams(bodyText) })
        if (path === '/Forms/Patent/ICSearch.aspx') return new Response(`<script>var PageAuth="${permission}"</script>`)
        return Response.json({ ClientInfo: { Result: result, Asyn: true } })
      }
    })
    vi.spyOn(runtime, 'checkSession').mockResolvedValue({
      ok: true,
      data: { status: 'authenticated', userId: 'operator', displayName: '操作员', checkedAt: new Date().toISOString() }
    })
    const request = {
      mode: 'patent' as const,
      query: { pageIndex: 2, pageSize: 20, fields: { app_no: '123' } },
      columns: [{ value: 'app_no', text: '申请号' }]
    }
    expect(await runtime.exportFees(request)).toMatchObject({ ok: true, data: { async: true } })
    expect(calls[1].path).toBe('/AjaxServers/CaseInfo.ashx')
    expect(calls[1].data.get('PageAuth')).toBe('A,E,Q')
    expect(calls[1].data.get('Call')).toBe('ICCaseSearchToExcel')
    result = false
    expect(await runtime.exportFees(request)).toMatchObject({ ok: false })
    permission = 'A,Q'
    expect(await runtime.exportFees(request)).toMatchObject({ ok: false })
    expect(calls.filter(call => call.path === '/AjaxServers/CaseInfo.ashx')).toHaveLength(2)
  })
})
