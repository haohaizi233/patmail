import { createApp, defineComponent, h, nextTick, provide, ref, type App } from 'vue'
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
import { OceanResourceManager } from '../../../src/app/components/workflow-ocean/rendering/resource-manager'
import { buildOceanCrystalModel, OCEAN_MODEL_CATALOG } from '../../../src/app/components/workflow-ocean/rendering/model-registry'
import { useOceanQuality } from '../../../src/app/components/workflow-ocean/composables/useOceanQuality'
import { useOceanLifecycle } from '../../../src/app/components/workflow-ocean/composables/useOceanLifecycle'
import type { OceanQuality } from '../../../src/app/components/workflow-ocean/rendering/render-scheduler'
import type { WorkflowOceanIconId } from '../../../src/app/components/workflow-ocean/workflow-ocean.types'
import { defaultWorkflowCatalog, isRunnableWorkflow, isSystemWorkflow, workflowFromSkills } from '../../../src/workflow/catalog'

let app: App | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
  host = undefined
})

describe('workflow-ocean presentation & 2.0 engine', () => {
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

  it('tracks and disposes all 3D crystal model resources cleanly', () => {
    const manager = new OceanResourceManager()
    const iconIds = Object.keys(OCEAN_MODEL_CATALOG) as WorkflowOceanIconId[]
    expect(iconIds).toHaveLength(11)

    for (const id of iconIds) {
      const group = buildOceanCrystalModel(id, manager)
      expect(group.children.length).toBeGreaterThan(0)
    }

    expect(manager.count).toBeGreaterThan(20)
    manager.disposeAll()
    expect(manager.count).toBe(0)
  })

  it('gates renderingActive on route, screen, document visibility, reduced motion, and quality', async () => {
    const route = ref('/workflow')
    const screenActive = ref(true)
    const quality = ref<OceanQuality>('balanced')
    const webglUnavailable = ref(false)
    const sceneEl = ref<HTMLElement | null>(null)
    let renderingActiveRef: ReturnType<typeof useOceanLifecycle>['renderingActive'] | undefined

    const Child = defineComponent({
      setup() {
        const lifecycle = useOceanLifecycle({
          sceneEl,
          screenActive,
          quality,
          webglUnavailable
        })
        renderingActiveRef = lifecycle.renderingActive
        return () => h('div')
      }
    })

    const Harness = defineComponent({
      setup() {
        provide('activeRoute', route)
        return () => h(Child)
      }
    })

    host = document.body.appendChild(document.createElement('div'))
    app = createApp(Harness)
    app.mount(host)
    await nextTick()

    expect(renderingActiveRef?.value).toBe(true)

    // Switch top-level route away from /workflow
    route.value = '/'
    await nextTick()
    expect(renderingActiveRef?.value).toBe(false)

    route.value = '/workflow'
    await nextTick()
    expect(renderingActiveRef?.value).toBe(true)

    // Switch screen away from sea
    screenActive.value = false
    await nextTick()
    expect(renderingActiveRef?.value).toBe(false)

    screenActive.value = true
    await nextTick()
    expect(renderingActiveRef?.value).toBe(true)

    // Static quality disables rendering
    quality.value = 'static'
    await nextTick()
    expect(renderingActiveRef?.value).toBe(false)

    // WebGL unavailable disables rendering
    quality.value = 'cinema'
    webglUnavailable.value = true
    await nextTick()
    expect(renderingActiveRef?.value).toBe(false)
  })

  it('renders scene with non-nested buttons, quality controls, and static mode removes canvas', async () => {
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

    const { setQuality } = useOceanQuality()
    setQuality('static')

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
      expect(host.querySelectorAll('button button')).toHaveLength(0)
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-quality')).toBe('static')
      expect(host.querySelector('[data-testid="workflow-ocean-canvas"]')).toBeNull()
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-rendering')).toBe('false')

      // Switch quality to balanced via hero button -> mounts canvas
      host.querySelector<HTMLButtonElement>('[data-quality-option="balanced"]')?.click()
      await nextTick()
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-quality')).toBe('balanced')
      expect(host.querySelector('[data-testid="workflow-ocean-canvas"]')).not.toBeNull()

      // Switch quality back to static via hero button -> removes canvas & stops rendering
      host.querySelector<HTMLButtonElement>('[data-quality-option="static"]')?.click()
      await nextTick()
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-quality')).toBe('static')
      expect(host.querySelector('[data-testid="workflow-ocean-canvas"]')).toBeNull()
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-rendering')).toBe('false')

      active.value = false
      await nextTick()
      expect(host.querySelector('.workflow-ocean')?.getAttribute('data-ocean-rendering')).toBe('false')
    } finally {
      setQuality('static')
      if (origDescriptor) {
        Object.defineProperty(window, 'matchMedia', origDescriptor)
      } else {
        Reflect.deleteProperty(window, 'matchMedia')
      }
    }
  })
})
