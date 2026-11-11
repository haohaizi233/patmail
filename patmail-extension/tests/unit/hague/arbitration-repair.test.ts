import { expect, it, vi } from 'vitest'
import { arbitrate } from '../../../src/hague/arbitration'
const mock = vi.hoisted(() => vi.fn())
vi.mock('../../../src/app/assistant-job', () => ({ requestAssistantJob: mock }))
it('makes one bounded format repair instead of failing the entire case for a malformed reply', async () => {
  const decision = { applicant: { name: 'Example', address: 'Nanshan District', city: 'Shenzhen', region: 'Guangdong', postalCode: '518000', country: 'CN' }, creators: [{ givenName: 'Lisi', familyName: 'CHEN' }], parties: ['EM'], publicationMonths: '6', priorities: null, warnings: null, evidence: ['source'] }
  mock.mockResolvedValueOnce('{invalid').mockResolvedValueOnce(JSON.stringify({ results: [{ caseVolume: 'PO1HAGUE', decision }] }))
  const result = await arbitrate('PO1HAGUE', { locarno: '28', products: [], description: '', views: [], issues: [] }, '{}')
  expect(result.creators[0].familyName).toBe('CHEN')
  expect(mock).toHaveBeenCalledTimes(2)
})
it('stops after one repair when both replies are unusable', async () => {
  mock.mockReset().mockResolvedValue('not json')
  await expect(arbitrate('PO1HAGUE', { locarno: '28', products: [], description: '', views: [], issues: [] }, '{}')).rejects.toThrow()
  expect(mock).toHaveBeenCalledTimes(2)
})
