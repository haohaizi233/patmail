import { expect, it, vi } from 'vitest'
import { loadHagueCase } from '../../../src/hague/easy'
import type { EasyOperation } from '../../../src/api/transport'

it('loads complete case source and never switches to a fuzzy result', async () => {
  const post = vi.fn(async (op: EasyOperation) => ({ ok: true as const, data: op === 'icSearch' ? { TableRows: [{ case_id: '11111111-1111-4111-8111-111111111111', case_volume: 'PO2631874HAGUE' }], ClientInfo: { IsLogin: true } } : { TableRows: [{ contact_address_en: 'A'.repeat(2000) }], ClientInfo: { IsLogin: true } } }))
  const result = await loadHagueCase('PO2631874HAGUE', post)
  expect(result).toContain('A'.repeat(2000))
  expect(post.mock.calls.map(c => c[0])).toEqual(['icSearch', 'caseManageInfo', 'hagueApplicants', 'caseInventor', 'haguePriorities'])
  await expect(loadHagueCase('PO999HAGUE', post)).rejects.toThrow('当前连接的知易通未找到案件 PO999HAGUE')
})
it('stops instead of arbitrating a partially failed source', async () => {
  const post = vi.fn(async (op: EasyOperation) => op === 'icSearch' ? { ok: true as const, data: { TableRows: [{ case_id: '11111111-1111-4111-8111-111111111111', case_volume: 'PO1HAGUE' }], ClientInfo: { IsLogin: true } } } : { ok: false as const, error: { code: 'SESSION_EXPIRED' as const, message: '登录失效' } })
  await expect(loadHagueCase('PO1HAGUE', post)).rejects.toThrow('登录失效')
})
