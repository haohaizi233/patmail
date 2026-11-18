import { describe, expect, it } from 'vitest'
import { isBillPatentFile, parseBillFileName } from '../../../src/mail/bill-detector'
import type { PatentFile } from '../../../src/api/file-search-types'

describe('账单识别算法 (bill-detector)', () => {
  describe('现场 30 个真实样本测试', () => {
    const positiveSamples = [
      { name: '202605182 PA2510821PCT-EP 答复欧洲检索报告 20261110.pdf', caseVol: 'PA2510821PCT-EP', billNo: '202605182', date: '20261110' },
      { name: 'Credit Memo PA2310398CN-US RCE退款20261111.pdf', caseVol: 'PA2310398CN-US', billNo: 'Credit Memo', date: '20261111' },
      { name: '604032 PA2611555PCT-UK-D1 英国发明分案新申请+提实审账单 20261101.PDF', caseVol: 'PA2611555PCT-UK-D1', billNo: '604032', date: '20261101' },
      { name: '27-002833 PA2311312CN-CA 加拿大发明第3年维持费账单 20261105.pdf', caseVol: 'PA2311312CN-CA', billNo: '27-002833', date: '20261105' },
      { name: 'IKI-0784-26 PA2631850CN-ID 印度尼西亚外观新申请账单 20261106.pdf', caseVol: 'PA2631850CN-ID', billNo: 'IKI-0784-26', date: '20261106' },
      { name: '2026ZLSQ1106011-PH PA2631851CN-PH 菲律宾外观新申请账单 20261106.pdf', caseVol: 'PA2631851CN-PH', billNo: '2026ZLSQ1106011-PH', date: '20261106' },
      { name: '1262538 PA2631884CN-US- 美国外观新申请账单 20261105.pdf', caseVol: 'PA2631884CN-US', billNo: '1262538', date: '20261105' },
      { name: '27-000571 PA2411656CN-BR 巴西发明第三年维持费 20261014.pdf', caseVol: 'PA2411656CN-BR', billNo: '27-000571', date: '20261014' },
      { name: '1262526 PA2510173PCT-US IDS3账单 20261105.pdf', caseVol: 'PA2510173PCT-US', billNo: '1262526', date: '20261105' },
      { name: '603814 PA2410192PCT-EP 缴纳第六年维持费 20261101.PDF', caseVol: 'PA2410192PCT-EP', billNo: '603814', date: '20261101' },
      { name: '603828 PA2412315PCT-EP 缴纳第五年维持费 20261101.PDF', caseVol: 'PA2412315PCT-EP', billNo: '603828', date: '20261101' },
      { name: '603813 PA2410189PCT-EP 缴纳第六年维持费 20261101.PDF', caseVol: 'PA2410189PCT-EP', billNo: '603813', date: '20261101' },
      { name: '603825 PA2412311PCT-EP 缴纳第五年维持费 20261101.PDF', caseVol: 'PA2412311PCT-EP', billNo: '603825', date: '20261101' },
      { name: '1262460 PA2511530CN-US IDS1账单 20261103.pdf', caseVol: 'PA2511530CN-US', billNo: '1262460', date: '20261103' },
      { name: '201559250 PA2510820PCT-US IDS3账单 20260930.pdf', caseVol: 'PA2510820PCT-US', billNo: '201559250', date: '20260930' },
      { name: '604161 PA2511961PCT-EP 缴纳第三年维持费 20261101.PDF', caseVol: 'PA2511961PCT-EP', billNo: '604161', date: '20261101' },
      { name: '604159 PA2410191PCT-EP 缴纳第六年维持费 20261101.PDF', caseVol: 'PA2410191PCT-EP', billNo: '604159', date: '20261101' },
      { name: '603816 PA1911196PCT-EP 缴纳第八年维持费 20261101.PDF', caseVol: 'PA1911196PCT-EP', billNo: '603816', date: '20261101' },
      { name: '603818 PA1911206PCT-EP 缴纳第八年维持费 20261101.PDF', caseVol: 'PA1911206PCT-EP', billNo: '603818', date: '20261101' },
      { name: '200490 PA2411669CN-AU 澳大利亚发明一通答复 账单 20261029.pdf', caseVol: 'PA2411669CN-AU', billNo: '200490', date: '20261029' },
      { name: '1262346 PA2631761CN-US美国外观新申请账单 20261030.pdf', caseVol: 'PA2631761CN-US', billNo: '1262346', date: '20261030' },
      { name: '1259208 PA2310181PCT-US 授权账单 20260901.pdf', caseVol: 'PA2310181PCT-US', billNo: '1259208', date: '20260901' },
      { name: '269359 PA2511252PCT-JP 答复一通 20261030.pdf', caseVol: 'PA2511252PCT-JP', billNo: '269359', date: '20261030' },
      { name: '269401 PA2511254PCT-JP 答复二通 20261030.pdf', caseVol: 'PA2511254PCT-JP', billNo: '269401', date: '20261030' },
      { name: '1261359 PA2211468PCT-US 美国发明授权费账单 20261014.pdf', caseVol: 'PA2211468PCT-US', billNo: '1261359', date: '20261014' }
    ]

    for (const item of positiveSamples) {
      it(`正确识别账单正样本: ${item.name}`, () => {
        const res = parseBillFileName(item.name, item.caseVol)
        expect(res.isBill).toBe(true)
        expect(res.billNo).toBe(item.billNo)
        expect(res.date).toBe(item.date)
        expect(isBillPatentFile({ fileId: '1', fileName: item.name, caseVolume: item.caseVol })).toBe(true)
      })
    }

    const negativeSamples = [
      { name: 'PA2631801CN-HAGUE 海牙外观缴费通知书.pdf', caseVol: 'PA2631801CN-HAGUE', reason: '无账单号且无末尾日期' },
      { name: 'PA2631801CN-HAGUE 海牙外观缴费通知书 20261113.pdf', caseVol: 'PA2631801CN-HAGUE', reason: '案号开头，无账单号' },
      { name: '云图发票.pdf', caseVol: 'PA2631761CN-US', reason: '发票' },
      { name: '案例费用清单-云图.xls', caseVol: 'PA2631801CN-HAGUE', reason: '费用清单' }
    ]

    for (const item of negativeSamples) {
      it(`正确排除非账单负样本 (${item.reason}): ${item.name}`, () => {
        const res = parseBillFileName(item.name, item.caseVol)
        expect(res.isBill).toBe(false)
        expect(isBillPatentFile({ fileId: '1', fileName: item.name, caseVolume: item.caseVol })).toBe(false)
      })
    }
  })

  describe('边界与异常情况处理', () => {
    it('空字符串或无文件名时安全返回 false', () => {
      expect(isBillPatentFile({ fileId: '1', fileName: '' })).toBe(false)
      expect(parseBillFileName('').isBill).toBe(false)
      expect(isBillPatentFile(null as unknown as PatentFile)).toBe(false)
    })

    it('无扩展名或无点时返回 false', () => {
      expect(parseBillFileName('12345 PA12345 事项 20261101').isBill).toBe(false)
    })

    it('事项为空时（我方案号与日期直接相邻）返回 false', () => {
      expect(parseBillFileName('12345 PA12345 20261101.pdf', 'PA12345').isBill).toBe(false)
    })

    it('案号前无账单号时返回 false', () => {
      expect(parseBillFileName('PA12345CN 答复通知书 20261101.pdf', 'PA12345CN').isBill).toBe(false)
    })

    it('未传 caseVolume 时若文件名中含通用 PA 案号格式仍能自适应识别', () => {
      const res = parseBillFileName('BILL-9988 PA2412345CN-US 审查意见答复账单 20261108.pdf')
      expect(res.isBill).toBe(true)
      expect(res.billNo).toBe('BILL-9988')
      expect(res.caseNo).toBe('PA2412345CN-US')
      expect(res.matter).toBe('审查意见答复账单')
      expect(res.date).toBe('20261108')
    })

    it('兼容日期后带有（更新）或版本括号修饰符的真实样本', () => {
      const v1 = parseBillFileName('INVSG260800245 PA2511528CN-ID 实审账单 20260811（更新）.pdf', 'PA2511528CN-ID')
      expect(v1.isBill).toBe(true)
      expect(v1.billNo).toBe('INVSG260800245')
      expect(v1.date).toBe('20260811')
      expect(v1.versionSuffix).toBe('（更新）')

      const v2 = parseBillFileName('INVSG260800247 PA2511527CN-TH 新申请和翻译账单 20260811（更新）.pdf', 'PA2511527CN-TH')
      expect(v2.isBill).toBe(true)
      expect(v2.date).toBe('20260811')

      const v3 = parseBillFileName('BILL123 PA2511526CN-MY 事项 20260811 (2).pdf', 'PA2511526CN-MY')
      expect(v3.isBill).toBe(true)
      expect(v3.date).toBe('20260811')
      expect(v3.versionSuffix).toBe('(2)')
    })

    it('兼容案号开头但事项中明确标有账单且带日期的真实样本', () => {
      const res = parseBillFileName('PA2532001CN-HAGUE （海牙报告函）美国拟授权通知书 账单 20260718.pdf', 'PA2532001CN-HAGUE')
      expect(res.isBill).toBe(true)
      expect(res.caseNo).toBe('PA2532001CN-HAGUE')
      expect(res.date).toBe('20260718')
      expect(res.matter).toBe('（海牙报告函）美国拟授权通知书 账单')
    })

    it('案号开头且事项中无账单/退款字样者仍准确排除', () => {
      const res = parseBillFileName('PA2532001CN-HAGUE （海牙报告函）美国拟授权通知书 20260718.pdf', 'PA2532001CN-HAGUE')
      expect(res.isBill).toBe(false)
    })

    it('兼容日期中带有破折号或点号分隔的日期', () => {
      const res = parseBillFileName('123456 PA2511000CN 授权账单 2026-11-05.pdf', 'PA2511000CN')
      expect(res.isBill).toBe(true)
      expect(res.date).toBe('20261105')
    })
  })
})
