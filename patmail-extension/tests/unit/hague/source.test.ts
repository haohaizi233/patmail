import { expect, it } from 'vitest'
import { applySourceFields, generateDraftPriority, validCnNumber, parsedHagueSource, sourceRequirements } from '../../../src/hague/source'
import type { Decision } from '../../../src/hague/arbitration'

const source = JSON.stringify({ GetCaseApplicant: [{ TableRows: [{ applicant_name_en: 'Example Ltd.', contact_address_en: 'Room 201, Building A, Qianhai Shenzhen-Hong Kong Cooperation Zone, Shenzhen, Guangdong 518000, China', contact_address_cn: '中文旧地址', city: '深圳市', province: '广东省', postcode: '518000' }] }], GetCasePriority: [{ TableRows: [{ priority_no: '111', priority_id: 'database-id', priority_date: '2026-11-11', access_code: '111', priority_country_id: 'CN' }] }] })
const decision = (): Decision => ({ applicant: { name: '错名', address: '中文地址', city: '深圳', region: '前海深港合作区', postalCode: '', country: 'CN' }, creators: [{ givenName: 'Li', familyName: 'Wang', address: {} as Decision['applicant'] }], priorities: [], warnings: [], evidence: [], parties: ['US'], publicationMonths: 6 })
it('parses filing fields before arbitration and excludes unrelated API metadata', () => {
  const data = JSON.parse(source) as { GetCaseApplicant: { TableRows: Record<string, unknown>[] }[]; GetCaseInventor?: { TableRows: Record<string, unknown>[] }[] }
  Object.assign(data.GetCaseApplicant[0].TableRows[0], { id_number: 'PRIVATE_ID', tel: 'PRIVATE_PHONE', applicant_id: 'DATABASE_ID', country_zh_cn: '中国' })
  data.GetCaseInventor = [{ TableRows: [{ inventor_name_en: 'Flavien DACHET', first_name_cn: 'Flavien', last_name_en: 'DACHET', cn_name: 'staff name', id_number: 'PRIVATE_ID' }] }]
  const parsed = parsedHagueSource(JSON.stringify(data))
  expect(parsed).toMatchObject({ applicants: [{ name: 'Example Ltd.', city: 'Shenzhen', region: 'Guangdong', country: 'China' }], creators: [{ givenName: 'Flavien', familyName: 'DACHET', addressSource: 'applicants[0]' }], priorities: [{ number: '111', country: 'CN' }] })
  expect(JSON.stringify(parsed)).not.toMatch(/PRIVATE_|DATABASE_ID|staff name|GetCaseApplicant/)
})
it('parses embedded foreign application numbers without losing Mexico, Vietnam or immediate publication', () => {
  const parsed = sourceRequirements(JSON.stringify({ GetCaseInfo: [{ CaseInfo: [{ remark: '海牙进入欧盟、俄罗斯、墨西哥MX/f/2025/002387、越南申请号8-2025-00348\n公开情况：立即公开' }] }] }))
  expect(parsed.parties).toEqual(['EM', 'RU', 'MX', 'VN'])
  expect(parsed.publicationMonths).toBe(0)
  expect(parsed.unrecognized).toEqual([])
})
it('locks English source address and administrative levels and shows reused creator address', () => {
  const result = applySourceFields(decision(), source)
  expect(result.applicant.address).toBe('Room 201, Building A, Qianhai Shenzhen-Hong Kong Cooperation Zone')
  expect(result.applicant.city).toBe('Shenzhen')
  expect(result.applicant.region).toBe('Guangdong')
  expect(result.creators[0].address).toEqual(result.applicant)
  expect(result.evidence.join()).toContain('复用')
})
it('maps ALL priority columns directly, retaining invalid original instead of calling it an ID', () => {
  const guessed = decision()
  guessed.warnings = ['优先权号疑似数据库序号，已留空', '城市缺失', '省份缺失']
  const result = applySourceFields(guessed, source)
  expect(result.priorities[0]).toMatchObject({ originalNumber: '111', generated: true, date: '2026-11-11', country: 'CN', das: '111' })
  expect(validCnNumber(result.priorities[0].number)).toBe(true)
  expect(result.warnings.join()).toContain('自动生成')
  expect(result.warnings.join()).not.toContain('数据库序号')
  expect(result.warnings.join()).not.toContain('城市缺失')
})
it('restores all six parties and publication from the actual remark instead of accepting EM alone', () => {
  const data = JSON.parse(source) as Record<string, unknown>
  data.GetCaseInfo = [{ CaseInfo: [{ remark: '海牙进入美国、欧盟、英国、日本、加拿大、韩国；公开情况：6个月；尚未公开。' }] }]
  const guessed = decision(); guessed.parties = ['EM']; guessed.publicationMonths = 0
  const result = applySourceFields(guessed, JSON.stringify(data))
  expect(result.parties).toEqual(['US', 'EM', 'GB', 'JP', 'CA', 'KR'])
  expect(result.publicationMonths).toBe(6)
  expect(result.applicant.address).not.toContain(', Shenzhen')
})
it('generates a marked draft placeholder with a checksum and retains original source', () => {
  const p = generateDraftPriority({ number: '111', date: '2026-11-11', country: 'CN', das: '111' }, 0.5)
  expect(p.number).toMatch(/^20263\d{7}\.[\dX]$/)
  expect(p.generated).toBe(true)
  expect(p.requiresReview).toBe(true)
  expect(p.originalNumber).toBe('111')
  expect(validCnNumber(p.number)).toBe(true)
})
it('retains every priority row even when the model omitted all of them', () => {
  const data = JSON.parse(source) as { GetCasePriority: { TableRows: Record<string, string>[] }[] }
  data.GetCasePriority[0].TableRows.push({ priority_no: '201810504860.7', priority_date_dd: '2018-05-23', priority_country_id: 'CN', access_code: 'ABCD' })
  const result = applySourceFields(decision(), JSON.stringify(data))
  expect(result.priorities).toHaveLength(2)
  expect(result.priorities[1]).toEqual({ number: '201810504860.7', date: '2018-05-23', country: 'CN', das: 'ABCD' })
})
