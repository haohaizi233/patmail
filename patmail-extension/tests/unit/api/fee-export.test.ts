import { describe, expect, it, vi } from 'vitest'
import {
  belongKeyForMode,
  buildExportColumnsXml,
  buildFeeExportGroups,
  buildTemplateElementXml,
  TRADEMARK_CASE_TYPE_ID
} from '../../../src/api/fee-export'

describe('fee export protocol builders', () => {
  it('encodes e_coulums and template element XML matching EASY IhgAdvExport.js', () => {
    const cols = [
      { value: 'case_volume', text: '我方文号' },
      { value: 'amount', text: '金额<CNY>&税' }
    ]
    expect(buildExportColumnsXml(cols)).toBe(
      '&lt;case_volume&gt;我方文号&lt;/case_volume&gt;&lt;amount&gt;金额&lt;CNY&gt;&amp;税&lt;/amount&gt;'
    )
    expect(buildTemplateElementXml(cols)).toBe(
      '&lt;item&gt;&lt;value&gt;case_volume&lt;/value&gt;&lt;text&gt;我方文号&lt;/text&gt;&lt;sort&gt;1&lt;/sort&gt;&lt;/item&gt;' +
      '&lt;item&gt;&lt;value&gt;amount&lt;/value&gt;&lt;text&gt;金额&lt;CNY&gt;&amp;税&lt;/text&gt;&lt;sort&gt;2&lt;/sort&gt;&lt;/item&gt;'
    )
  })

  it('maps modes to exact EASY belong_key and dynamic custom column labels', () => {
    expect(belongKeyForMode('cond')).toBe('FeeSearch_ExportByCond')
    expect(belongKeyForMode('checked')).toBe('FeeSearch_ExportByCond')
    expect(belongKeyForMode('count')).toBe('FeeSearch_ExportCountByCond')

    const condGroups = buildFeeExportGroups('cond', {
      caseType: TRADEMARK_CASE_TYPE_ID,
      fieldColumns: { column_1: '自定义栏位1', column_2: '特批编号', column_3: '回款日期' }
    })
    expect(condGroups.map(g => g.title)).toEqual(['案件信息', '处理事项', '著录项目', '费用信息', '扩展信息', '自定义栏位'])
    expect(condGroups[0].columns.some(c => c.value === 'register_type_code')).toBe(true)
    expect(condGroups[5].columns.find(c => c.value === 'column_2')?.text).toBe('特批编号')

    const patentGroups = buildFeeExportGroups('cond', { caseType: '31D1A147-2931-43B5-94AE-B72B1525BA8A' })
    expect(patentGroups[0].columns.some(c => c.value === 'register_type_code')).toBe(false)

    const countGroups = buildFeeExportGroups('count')
    expect(countGroups.map(g => g.title)).toEqual(['案件信息', '著录项目', '费用信息'])
    expect(countGroups[2].columns.some(c => c.value === 'total_oa_amount')).toBe(true)
  })

  describe('P1-C 协议输入验证与安全加固', () => {
    it('过滤非法 XML 元素名（如含特殊符号、空格、注入代码）并防止原型污染', () => {
      const dirtyCols = [
        { value: 'case_volume', text: '我方文号' },
        { value: '__proto__', text: '危险原型' },
        { value: 'constructor', text: '危险构造函数' },
        { value: 'bad<tag>', text: '标签注入' },
        { value: 'invalid tag name', text: '含空格非法标签' },
        { value: 'case_name', text: '案件名称' }
      ]
      const xml = buildExportColumnsXml(dirtyCols)
      expect(xml).toContain('&lt;case_volume&gt;我方文号&lt;/case_volume&gt;')
      expect(xml).toContain('&lt;case_name&gt;案件名称&lt;/case_name&gt;')
      expect(xml).not.toContain('__proto__')
      expect(xml).not.toContain('constructor')
      expect(xml).not.toContain('bad<tag>')
      expect(xml).not.toContain('invalid tag name')
    })

    it('自动对重复栏位进行去重，避免生成冗余 XML 标签', () => {
      const dupCols = [
        { value: 'case_volume', text: '我方文号' },
        { value: 'case_volume', text: '我方文号（重复）' },
        { value: 'amount', text: '金额' }
      ]
      const xml = buildExportColumnsXml(dupCols)
      const count = (xml.match(/&lt;case_volume&gt;/g) || []).length
      expect(count).toBe(1)
    })
  })

  describe('P1-C EasyRuntime 模板管理与导出可靠性', () => {
    const origin = 'http://183.36.43.66:88'

    function mockAuthed(runtime: import('../../../src/api/client').EasyRuntime) {
      vi.spyOn(runtime, 'checkSession').mockResolvedValue({
        ok: true,
        data: {
          status: 'authenticated',
          userId: 'u1',
          displayName: '管理员',
          checkedAt: new Date().toISOString()
        }
      })
    }

    it('模板删除：遇到 IsLogin=false 必须精准识别 SESSION_EXPIRED', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => new Response(JSON.stringify({
          ClientInfo: { IsLogin: false, Message: '登录失效' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      })
      mockAuthed(runtime)

      const res = await runtime.manageFeeExportConfig({
        action: 'del',
        belongKey: 'FeeSearch_ExportByCond',
        typeId: 'tmpl-del-1'
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error.code).toBe('SESSION_EXPIRED')
      }
    })

    it('模板删除：原站返回明确 Result=false 时返回失败', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => new Response(JSON.stringify({
          ClientInfo: { Result: false, Message: '无权限删除系统预设模板' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      })
      mockAuthed(runtime)

      const res = await runtime.manageFeeExportConfig({
        action: 'del',
        belongKey: 'FeeSearch_ExportByCond',
        typeId: 'tmpl-sys'
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error.message).toContain('无权限删除系统预设模板')
      }
    })

    it('模板删除：若原站返回列表中仍包含待删除模板，拦截伪成功', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => new Response(JSON.stringify({
          ClientInfo: { Result: true },
          out_model: [{ type_id: 'tmpl-del-2', type_text: '我的模板' }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      })
      mockAuthed(runtime)

      const res = await runtime.manageFeeExportConfig({
        action: 'del',
        belongKey: 'FeeSearch_ExportByCond',
        typeId: 'tmpl-del-2'
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error.message).toContain('仍然存在')
      }
    })

    it('模板新增：原站回查验证成功确认新模板', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      let callCount = 0
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => {
          callCount++
          if (callCount === 1) {
            // 保存响应未直接返回完整列表
            return new Response(JSON.stringify({
              ClientInfo: { Result: true, Message: '保存成功' },
              out_model: []
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }
          // 回查 list 成功找到新模板
          return new Response(JSON.stringify({
            out_model: [{ type_id: 'new-id-99', type_text: '新增成功模板' }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
      })
      mockAuthed(runtime)

      const res = await runtime.manageFeeExportConfig({
        action: 'add',
        belongKey: 'FeeSearch_ExportByCond',
        modelName: '新增成功模板',
        columns: [{ value: 'case_volume', text: '我方文号' }]
      })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.data.templates).toHaveLength(1)
        expect(res.data.templates![0].typeId).toBe('new-id-99')
      }
    })

    it('费用导出：缺失 file_guid 时返回明确错误，不伪造成功', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => new Response(JSON.stringify({
          ClientInfo: { Result: true },
          file_guid: ''
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      })
      mockAuthed(runtime)

      const res = await runtime.exportFees({
        mode: 'cond',
        columns: [{ value: 'case_volume', text: '我方文号' }]
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error.message).toContain('未返回有效的导出文件地址')
      }
    })

    it('费用导出：数据量过大时原站 Asyn=true 准确识别为后台异步生成', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const runtime = new EasyRuntime(origin, {
        fetcher: async () => new Response(JSON.stringify({
          ClientInfo: { Result: true, Asyn: true }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      })
      mockAuthed(runtime)

      const res = await runtime.exportFees({
        mode: 'cond',
        columns: [{ value: 'case_volume', text: '我方文号' }]
      })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.data.async).toBe(true)
        expect(res.data.message).toContain('下载清单')
      }
    })

    it('费用导出：三种模式构建正确的 Call 参数', async () => {
      const { EasyRuntime } = await import('../../../src/api/client')
      const postedCalls: string[] = []
      const runtime = new EasyRuntime(origin, {
        fetcher: async (_url, init) => {
          const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : ''
          const params = new URLSearchParams(body)
          postedCalls.push(params.get('Call') || '')
          return new Response(JSON.stringify({
            ClientInfo: { Result: true },
            file_guid: '00000000-0000-4000-8000-000000000001',
            file_size: 1024
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
      })
      mockAuthed(runtime)

      await runtime.exportFees({ mode: 'cond', columns: [{ value: 'case_volume', text: '我方文号' }] })
      await runtime.exportFees({ mode: 'checked', feeIds: ['f1', 'f2'], columns: [{ value: 'case_volume', text: '我方文号' }] })
      await runtime.exportFees({ mode: 'count', columns: [{ value: 'case_volume', text: '我方文号' }] })

      expect(postedCalls).toEqual(['ExcelFeeListByCond', 'ExcelFeeListByChecked', 'ExcelFeeListCountByCond'])
    })
  })
})
