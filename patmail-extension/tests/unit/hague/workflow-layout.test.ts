import { expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import WorkflowWorkspace from '../../../src/app/components/WorkflowWorkspace.vue'
import HaguePage from '../../../src/app/pages/HaguePage.vue'

vi.mock('../../../src/shell/components/Bunny.vue', () => ({ default: { render: () => null } }))
vi.mock('../../../src/hague/session', () => ({ hagueSessionClient: {
  listTabs: async () => [{ id: 1, title: 'WIPO eHague Tab' }],
  verify: async () => ({}),
  open: async () => {}
} }))

it('renders OaSessionCard compactly inside WorkflowWorkspace header without duplicate ID conflicts', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp({
    render: () => h('div', [
      // A sibling workspace like Jihua
      h(WorkflowWorkspace, { title: '季华', description: 'desc', guide: 'g', view: 'use' }),
      // Hague workspace
      h(WorkflowWorkspace, { title: '海牙新申请', description: 'desc', guide: 'g', view: 'use' }, () => [
        h(HaguePage, { embedded: true })
      ])
    ])
  })
  app.mount(root)
  await nextTick()
  await nextTick()

  const card = root.querySelector('.oa-session-card')
  expect(card).not.toBeNull()
  // The card should be inside Hague's header extra container, not Jihua's
  const parent = card?.parentElement
  expect(parent?.classList.contains('workflow-head-extra')).toBe(true)
  expect(card?.textContent).toContain('WIPO eHague')
  expect(card?.textContent).toContain('重新检测')
})
