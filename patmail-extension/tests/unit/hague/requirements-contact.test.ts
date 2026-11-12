import { expect, it } from 'vitest'
import { applySourceFields, parsedHagueSource, sourceRequirements } from '../../../src/hague/source'
import { formatHagueMaterial, type Decision } from '../../../src/hague/arbitration'
import { HAGUE_ARBITRATION_SYSTEM } from '../../../src/agent/hague-skill'

const source = (applicant: Record<string, unknown> = {}, remark = '海牙进入欧盟、英国；公开情况：立即公开') => JSON.stringify({
  GetCaseApplicant: [{ TableRows: [{ applicant_name_en: 'Example Ltd.', contact_address_en: 'No. 21, High tech Industrial Development Zone, Xuzhou, Jiangsu', city: 'Xuzhou', province: 'Jiangsu', country_zh_cn: '中国', postcode: '/', ...applicant }] }],
  GetCaseInfo: [{ CaseInfo: [{ remark }] }]
})
const decision = (): Decision => ({ applicant: { name: 'Example', address: 'District', city: 'Xuzhou', region: 'Jiangsu', postalCode: '999999', country: 'US' }, creators: [{ givenName: 'San', familyName: 'ZHANG', address: {} as Decision['applicant'] }], priorities: [], parties: ['US'], publicationMonths: 6, warnings: [], evidence: [] })

it('treats the live slash postcode as missing rather than accepting it or an AI guess', () => {
  const result = applySourceFields(decision(), source())
  expect(result.applicant).toMatchObject({ postalCode: '', country: 'CN' })
  expect(result.creators[0].address.postalCode).toBe('')
  expect(result.warnings.filter(w => /邮编/.test(w))).toHaveLength(1)
  expect(parsedHagueSource(source())).toMatchObject({ applicants: [{ postalCode: '' }] })
})

it('restores missing postcode only from an explicit full English address, including Singapore leading zero', () => {
  for (const [country, address, postalCode] of [['CN', 'Room 1, Nanshan District, Shenzhen, Guangdong 518055, China', '518055'], ['SG', '1 Example Street, Singapore 018956', '018956']]) {
    const input = source({ country_zh_cn: '', country_code: country, postcode: 'N/A', contact_address_en: address })
    expect(applySourceFields(decision(), input).applicant.postalCode).toBe(postalCode)
    expect(parsedHagueSource(input)).toMatchObject({ applicants: [{ postalCode }] })
  }
  expect(applySourceFields(decision(), source({ postcode: '-', contact_address_en: 'Building 123456, High tech Zone, Xuzhou, Jiangsu' })).applicant.postalCode).toBe('')
  expect(applySourceFields(decision(), source({ postcode: '-', contact_address_en: 'Building 123456, China' })).applicant.postalCode).toBe('')
})

it('normalizes country labels, ignores placeholder columns and never adopts an unsourced model country', () => {
  expect(applySourceFields(decision(), source({ country_code: '/', country_en: 'china', postcode: '518000' })).applicant.country).toBe('CN')
  expect(applySourceFields(decision(), source({ country_code: 'sg - Singapore', country_zh_cn: '', postcode: '018956' })).applicant.country).toBe('SG')
  const result = applySourceFields(decision(), source({ country_zh_cn: '/', country_en: '', country_code: '' }))
  expect(result.applicant.country).toBe('')
  expect(result.warnings.join()).toMatch(/国家/)
})

it('flags country and postcode conflicts without silently replacing the explicit source value', () => {
  const result = applySourceFields(decision(), source({ country_code: 'SG', postcode: '518000', contact_address_en: 'Nanshan District, Shenzhen, Guangdong 518055, China' }))
  expect(result.warnings.join()).toMatch(/国家.*冲突/)
  expect(result.applicant.postalCode).toBe('518000')
  expect(result.warnings.join()).toMatch(/邮编.*冲突/)
})

it('passes missing postal evidence and its task to the agent before address truncation', () => {
  const text = formatHagueMaterial('PO1HAGUE', { locarno: '28', products: [], description: '', views: [], issues: [] }, source())
  expect(text).toContain('待核对邮编')
  expect(HAGUE_ARBITRATION_SYSTEM).toContain('邮编')
  expect(HAGUE_ARBITRATION_SYSTEM).toContain('不得按城市')
})

it('does not lose parties when publication follows immediately or the list repeats across lines', () => {
  expect(sourceRequirements(source({}, '指定缔约方：欧盟、英国公开时间：6个月')).unrecognized).toEqual([])
  const conflict = sourceRequirements(source({}, '海牙进入欧盟、英国；\n指定国家：欧盟、日本；公开情况：6个月'))
  expect(conflict.parties).toBeNull()
  expect(conflict.reviewNotes.join()).toMatch(/指定.*冲突/)
})

it('detects contradictory numeric publication clauses and invalid months instead of accepting the first', () => {
  for (const remark of ['海牙进入欧盟；公开时间：6个月；公开情况：12个月', '海牙进入欧盟；公开时间：1个月', '海牙进入欧盟；公开时间：31个月']) {
    const r = sourceRequirements(source({}, remark))
    expect(r.publicationMonths).toBeNull()
    expect(r.reviewNotes.join()).toMatch(/公开/)
  }
  expect(sourceRequirements(source({}, '海牙进入欧盟；公开时间：6个月；历史申请正常公开')).publicationMonths).toBe(6)
})

it('maps the filing instructions and gives the publication-status field priority over historical text', () => {
  for (const [text, months] of [['正常公开（已申请提前公开）', 12], ['12个月公开', 12], ['立即公开', 0], ['6个月', 6]] as const) {
    const input = source({}, `海牙进入欧盟；公开情况：${text}；曾在展会公开，其他历史申请正常公开`)
    const result = applySourceFields(decision(), input)
    expect(result.publicationMonths).toBe(months)
    expect(result.warnings.join()).not.toMatch(/公开.*(?:冲突|待人工确认)/)
  }
  expect(sourceRequirements(source({}, '海牙进入欧盟；12个月公开')).publicationMonths).toBe(12)
  expect(sourceRequirements(source({}, '海牙进入欧盟；公开情况：待客户确认；历史申请正常公开')).publicationMonths).toBeNull()
})

it('keeps a conditional-party issue once after source revalidation', () => {
  const d = decision()
  d.warnings = ['备注提示存在按款式限定指定国的条件，需确认本案对应款式。']
  const r = applySourceFields(d, source({}, '海牙进入欧盟、英国；立即公开；CM20H不申请美国和日本'))
  expect(r.warnings.filter(w => /款式/.test(w))).toHaveLength(1)
  expect(r.parties).toEqual(['EM', 'GB'])
})
