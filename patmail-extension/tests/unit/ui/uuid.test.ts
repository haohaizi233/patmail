import { afterEach, describe, expect, it, vi } from 'vitest'
import { newUuid } from '../../../src/utils/uuid'

afterEach(() => vi.unstubAllGlobals())

describe('唯一 ID', () => {
  it('安全上下文里直接用 randomUUID', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
    expect(newUuid()).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('http 页面没有 randomUUID 时用 getRandomValues 拼同形 GUID，两次不重复', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    const first = newUuid()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(newUuid()).not.toBe(first)
  })
})
