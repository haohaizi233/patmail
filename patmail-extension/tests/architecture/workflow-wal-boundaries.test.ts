import { describe, expect, it } from 'vitest'

const pages = import.meta.glob<string>('../../src/app/pages/*WorkflowPage.vue', {
  query: '?raw', import: 'default', eager: true
})
const existingPages = new Set(['WorkflowPage.vue', 'BillingWorkflowPage.vue'])

describe('workflow WAL boundary', () => {
  it('requires new workflow pages to use the protected bridge', () => {
    const workflowPages = Object.entries(pages)
      .map(([path, source]) => ({ name: path.split('/').at(-1)!, source }))
      .filter(({ name }) => !existingPages.has(name))
    expect(workflowPages.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'PctNoticeWorkflowPage.vue', 'FeeReduceWorkflowPage.vue'
    ]))
    for (const { name, source } of workflowPages) {
      expect(source, name).toMatch(/\bcreateWorkflowBridge\s*\(/)
      expect(source, name).not.toMatch(/\b(createFullPageBridge|sendToBackground|sendMessage)\s*\(/)
    }
  })
})
