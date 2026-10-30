import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDictionaryResult } from '../../../src/api/message-guards'
import { loadSmeCustomerSnapshot, parseSmeCustomerSnapshot } from '../../../src/customer/sme-customers'

const guid = '50ba5fd7-030b-4de6-9c3a-f7a39ecefc3c'

afterEach(() => vi.unstubAllGlobals())

describe('中小客户名单快照', () => {
  it('loads the declared packaged resource using the extension URL in every bundle format', async () => {
    const getURL = vi.fn((path: string) => `chrome-extension://test-extension/${path}`)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      takenAt: '2026-10-31T01:19:20+08:00', customers: [[guid, '测试客户']]
    })))
    vi.stubGlobal('chrome', { runtime: { getURL } })
    vi.stubGlobal('fetch', fetcher)

    expect(await loadSmeCustomerSnapshot(true)).toEqual({
      takenAt: '2026-10-31T01:19:20+08:00', customers: [{ id: guid, name: '测试客户' }]
    })
    expect(getURL).toHaveBeenCalledWith('assets/sme-customers.json')
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [resource, options] = fetcher.mock.calls[0]
    expect(resource).toMatch(/^chrome-extension:\/\/test-extension\/assets\/sme-customers\.json\?t=\d+$/)
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it('解析紧凑数组，校验编号并去重', () => {
    const snapshot = parseSmeCustomerSnapshot({
      takenAt: '2026-10-13T14:38:36+08:00',
      customers: [
        [guid, '海目星激光科技集团股份有限公司'],
        ['not-a-guid', '无效编号'],
        [guid.toUpperCase(), '重复客户'],
        ['', '空编号']
      ]
    })
    expect(snapshot?.takenAt).toBe('2026-10-13T14:38:36+08:00')
    expect(snapshot?.customers).toEqual([{ id: guid, name: '海目星激光科技集团股份有限公司' }])
  })

  it('结构不对或全对不上编号时当没有快照', () => {
    expect(parseSmeCustomerSnapshot(null)).toBeNull()
    expect(parseSmeCustomerSnapshot({ takenAt: 'x' })).toBeNull()
    expect(parseSmeCustomerSnapshot({ takenAt: 'x', customers: 'oops' })).toBeNull()
    expect(parseSmeCustomerSnapshot({ takenAt: 'x', customers: [[guid, ''], ['bad', 'name']] })).toBeNull()
  })

  it('三万家名单能过消息桥的校验，快照时间跟着带过去', () => {
    const customers = Array.from({ length: 29449 }, (_, index) => ({
      id: `${guid.slice(0, 24)}${String(index).padStart(12, '0')}`, name: `客户${index}号`
    }))
    expect(isDictionaryResult({ ok: true, data: { kind: 'customerList', customers, takenAt: '2026-10-13T14:38:36+08:00' } })).toBe(true)
    expect(isDictionaryResult({ ok: true, data: { kind: 'customerList', customers: customers.slice(0, 3) } })).toBe(true)
  })
})
