import type { QueryTemplate } from '../../src/query/query-types'

export function queryTemplate(overrides: Partial<QueryTemplate> = {}): QueryTemplate {
  return {
    id: 'base',
    name: '基础模板',
    source: 'local',
    queryType: 'FileSearch',
    fields: {},
    version: 1,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...overrides
  }
}
