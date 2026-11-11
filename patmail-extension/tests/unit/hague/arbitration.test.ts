import { expect, it } from 'vitest'
import { parseDecision } from '../../../src/hague/arbitration'
it('rejects unstructured decisions and forces creator address reuse', () => {
  expect(() => parseDecision('looks good')).toThrow()
  const d = parseDecision(JSON.stringify({ applicant: { name: 'A', address: 'Nanshan District', city: 'Shenzhen', region: 'Guangdong', postalCode: '518000', country: 'CN' }, creators: [{ givenName: 'Li', familyName: 'Wang', address: 'WRONG' }], parties: ['US'], publicationMonths: 6, priorities: [], warnings: [], evidence: ['申请人地址：原文'] }))
  expect(d.creators[0].address).toEqual(d.applicant)
})
it('does not accept an incomplete applicant or invalid designated parties', () => {
  expect(() => parseDecision('{}')).toThrow()
  expect(() => parseDecision(JSON.stringify({ applicant: {}, creators: [], parties: ['whatever'] }))).toThrow()
})
it('normalizes common nullable and alternate-name model fields before source validation', () => {
  const result = parseDecision(JSON.stringify({ applicant: { name: 'Example Ltd.', address: null, city: 'Shenzhen', region: 'Guangdong', postal_code: '518000', country: 'CN' }, creators: [{ given_name: 'Lisi', family_name: 'CHEN' }], parties: ['EM'], publicationMonths: '6', priorities: null, warnings: null, evidence: { applicant: '接口英文原文' } }))
  expect(result.publicationMonths).toBe(6)
  expect(result.applicant.postalCode).toBe('518000')
  expect(result.creators[0].familyName).toBe('CHEN')
  expect(result.evidence).toContain('applicant：接口英文原文')
})
