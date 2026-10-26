import type { CustomerQueryProfile } from '../../src/customer/types'

export function customerProfile(overrides: Partial<CustomerQueryProfile> = {}): CustomerQueryProfile {
  return {
    id: 'profile-a',
    name: '客户A',
    baseTemplateId: 'base',
    overrides: {},
    enabled: true,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...overrides
  }
}
