import { expect, it, vi } from 'vitest'
import { arbitrate } from '../../../src/hague/arbitration'
const send = vi.hoisted(() => vi.fn())
vi.mock('../../../src/app/assistant-job', () => ({ requestAssistantJob: send }))
it('automatically groups cases and applies out-of-order assistant replies by reference', async () => {
  const sizes: number[] = []
  send.mockImplementation(async (message: string) => {
    const rows = [...message.matchAll(/^案件文号：(.+)$/gm)].map(m => ({ caseVolume: m[1] }))
    sizes.push(rows.length)
    return JSON.stringify({ results: rows.reverse().map(r => ({ caseVolume: r.caseVolume, decision: { applicant: { name: r.caseVolume, address: 'Nanshan District', city: 'Shenzhen', region: 'Guangdong', postalCode: '518000', country: 'CN' }, creators: [], parties: ['EM'], publicationMonths: 6, priorities: [], warnings: [], evidence: ['source'] } })) })
  })
  const volumes = ['PO1HAGUE', 'PO2HAGUE', 'PO3HAGUE', 'PO4HAGUE']
  const results = await Promise.all(volumes.map(v => arbitrate(v, { locarno: '28', products: [], description: '', views: [], issues: [] }, '{}')))
  expect(sizes).toEqual([3, 1])
  expect(results.map(r => r.applicant.name)).toEqual(volumes)
})
it('sends fully parsed real remark forms without filing tables, empty fields or internal references', async () => {
  send.mockClear()
  send.mockImplementation(async (message: string) => {
    const rows = [...message.matchAll(/^案件文号：(.+)$/gm)].map(m => ({ caseVolume: m[1] }))
    expect(message.match(/指定缔约方：EM、GB、CH、NO、SA/g)).toHaveLength(2)
    expect(message.match(/公开时间：立即公开（0个月）/g)).toHaveLength(2)
    expect(message.match(/城市：Shanghai/g)).toHaveLength(2)
    const body = message.split('\n材料：')[1]
    expect(body).not.toMatch(/CIP2023|JL2549|unresolved|sourceText|views|description|products|PRIVATE|""/)
    for (const token of ['[', ']', '{', '}', 'addressSource', 'needsEnglishName', 'parsed']) expect(body).not.toContain(token)
    return JSON.stringify({ results: rows.map(r => ({ caseVolume: r.caseVolume, decision: { applicant: { name: 'Example' }, creators: [], parties: ['EM'], publicationMonths: 6 } })) })
  })
  const refs = ['JL254956P1', 'JL254972P1']
  const results = await Promise.all(refs.map((ref, i) => arbitrate(`PA${i}CN-HAGUE`, { locarno: '12', products: [], description: 'Already parsed locally', views: [{ number: '1.1', code: '1', label: 'Perspective' }], issues: [] }, JSON.stringify({
    GetCaseApplicant: [{ TableRows: [{ applicant_name_en: 'Example Ltd.', contact_address_en: 'No. 217, Hongcao South Road, Xuhui District, Shanghai', province: '上海市', city: '徐汇区', id_number: 'PRIVATE' }] }],
    GetCaseInfo: [{ CaseInfo: [{ remark: `合同编号：CIP2023总委00718\n海牙指定欧盟、挪威、瑞士、英国、沙特  ${ref}HSEM，${ref}HSNO，${ref}HSCH，${ref}HSGB，${ref}HSSA，立即公开` }] }]
  }))))
  expect(send).toHaveBeenCalledTimes(1)
  for (const result of results) {
    expect(result.parties).toEqual(['EM', 'GB', 'CH', 'NO', 'SA'])
    expect(result.publicationMonths).toBe(0)
    expect(result.applicant.city).toBe('Shanghai')
  }
})
