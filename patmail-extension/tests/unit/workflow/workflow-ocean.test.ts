import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/shell/components/Bunny.vue', () => ({
  default: { template: '<img class="bunny" alt="" />' }
}))

import WorkflowOceanScene from '../../../src/app/components/workflow-ocean/WorkflowOceanScene.vue'
import WorkflowOceanCard from '../../../src/app/components/workflow-ocean/WorkflowOceanCard.vue'
import WorkflowOceanAddCard from '../../../src/app/components/workflow-ocean/WorkflowOceanAddCard.vue'
import {
  buildWorkflowOceanCards,
  buildWorkflowOceanStats,
  oceanModeForScreen
} from '../../../src/app/components/workflow-ocean/workflow-ocean-presentation'
import { defaultWorkflowCatalog, isRunnableWorkflow, isSystemWorkflow, workflowFromSkills } from '../../../src/workflow/catalog'

let app: App | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
  host = undefined
})

describe('workflow-ocean presentation', () => {
  it('maps all 9 built-in workflows and custom workflows into presentation DTOs', () => {
    const catalog = defaultWorkflowCatalog()
    const custom = workflowFromSkills('我的定制流', ['start', 'read-sheet'], catalog.workflows.map(w => w.id))
    const cards = buildWorkflowOceanCards([...catalog.workflows, custom], {
      isSystem: isSystemWorkflow,
      canUse: isRunnableWorkflow,
      hasGuide: flow => ['pct-reminder', 'pct-pengcheng', 'file-manage', 'filing-export'].includes(flow.id)
    })

    expect(cards).toHaveLength(10)
    expect(cards.map(c => c.id)).toEqual([
      'pct-reminder',
      'pct-pengcheng',
      'file-manage',
      'filing-export',
      custom.id,
      'hague',
      'jihua',
      'billing',
      'pctNotice',
      'feeReduce'
    ])
    expect(cards[0]).toMatchObject({ icon: 'pct-bell', tone: 'rose', canUse: true, canCopy: true, canRemove: false })
    expect(cards[2]).toMatchObject({ icon: 'file-folder', tone: 'peach', canUse: false, canGuide: true, canCopy: true, canRemove: false })
    expect(cards[4]).toMatchObject({ id: custom.id, icon: 'custom-crystal', tone: 'prism', canUse: false, canCopy: true, canRemove: true })
    expect(cards[9]).toMatchObject({ icon: 'fee-shield', tone: 'sakura', canUse: true, canGuide: true, canCopy: false, canRemove: false })

    const stats = buildWorkflowOceanStats(cards)
    expect(stats).toEqual({ total: 10, systemAndTool: 9, custom: 1 })
  })

  it('resolves ocean theme mode strictly per workflow screen', () => {
    expect(oceanModeForScreen('sea')).toBe('sea')
    expect(oceanModeForScreen('ocean')).toBe('ocean')
    expect(oceanModeForScreen('flow')).toBe('workbench')
    expect(oceanModeForScreen('hague')).toBe('workbench')
    expect(oceanModeForScreen('jihua')).toBe('workbench')
    expect(oceanModeForScreen('billing')).toBe('workbench')
    expect(oceanModeForScreen('pctNotice')).toBe('workbench')
    expect(oceanModeForScreen('feeReduce')).toBe('workbench')
  })

  it('renders scene with non-nested buttons, aria-hidden atmosphere, and pauses animations when inactive', async () => {
    const catalog = defaultWorkflowCatalog()
    const cards = buildWorkflowOceanCards(catalog.workflows, {
      isSystem: isSystemWorkflow,
      canUse: isRunnableWorkflow,
      hasGuide: () => true
    })
    const stats = buildWorkflowOceanStats(cards)
    const active = ref(true)
    const addSpy = vi.fn()
    const removeSpy = vi.fn()

    const origDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: fine)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })

    try {
      host = document.body.appendChild(document.createElement('div'))
      app = createApp({
        render: () =>
          h(
            WorkflowOceanScene,
            { active: active.value, stats },
            {
              default: () => [
                ...cards.map(card => h(WorkflowOceanCard, { key: card.id, card, onRemove: removeSpy })),
                h(WorkflowOceanAddCard, { onOpen: addSpy })
              ]
            }
          )
      })
      app.directive('hint', {})
      app.mount(host)
      await nextTick()

      expect(host.querySelectorAll('.sea-card')).toHaveLength(10)
      expect(host.querySelector('.ocean-atmosphere')?.getAttribute('aria-hidden')).toBe('true')
      expect(host.querySelector('.ocean-atmosphere')?.getAttribute('data-paused')).toBe('false')
      expect(host.querySelectorAll('button button')).toHaveLength(0)

      active.value = false
      await nextTick()
      expect(host.querySelector('.ocean-atmosphere')?.getAttribute('data-paused')).toBe('true')
    } finally {
      if (origDescriptor) {
        Object.defineProperty(window, 'matchMedia', origDescriptor)
      } else {
        Reflect.deleteProperty(window, 'matchMedia')
      }
    }
  })
})
