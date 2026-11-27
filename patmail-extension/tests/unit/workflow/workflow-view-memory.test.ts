import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultWorkflowCatalog } from '../../../src/workflow/catalog'
import { resetWorkflowViewMemoryForTest } from '../../../src/app/composables/useWorkflowViewMemory'

const mailEntrySpy = vi.hoisted(() => ({ mounts: 0, unmounts: 0, ids: [] as string[] }))
const dialogState = vi.hoisted(() => ({ confirmResult: true }))
const recoveryState = vi.hoisted((): { stored: unknown } => ({ stored: null }))

vi.mock('../../../src/app/pages/JihuaUploadPage.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      emits: ['back'],
      setup(_props, { emit }) {
        return () => h('div', { 'data-testid': 'mock-jihua' }, [
          h('button', { type: 'button', onClick: () => emit('back') }, '回到工作流')
        ])
      }
    })
  }
})

vi.mock('../../../src/app/pages/HaguePage.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['embedded', 'isActive'],
      setup() {
        return () => h('div', { 'data-testid': 'mock-hague' }, 'hague')
      }
    })
  }
})

vi.mock('../../../src/app/pages/BillingWorkflowPage.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['embedded', 'isActive'],
      emits: ['back'],
      setup(_props, { emit }) {
        return () => h('div', { 'data-testid': 'mock-billing' }, [
          h('button', { type: 'button', onClick: () => emit('back') }, '回到工作流')
        ])
      }
    })
  }
})

vi.mock('../../../src/app/components/WorkflowMailEntry.vue', async () => {
  const { defineComponent, h, onMounted, onUnmounted } = await import('vue')
  return {
    default: defineComponent({
      props: ['lockedWorkflowId'],
      setup(props) {
        onMounted(() => {
          mailEntrySpy.mounts += 1
          mailEntrySpy.ids.push(String(props.lockedWorkflowId ?? ''))
        })
        onUnmounted(() => {
          mailEntrySpy.unmounts += 1
        })
        return () => h('div', { 'data-testid': 'mock-mail-entry' }, String(props.lockedWorkflowId ?? ''))
      }
    })
  }
})

vi.mock('../../../src/app/components/DocsMarkdown.vue', () => ({
  default: { props: ['source'], template: '<article data-testid="workflow-guide">{{ source }}</article>' }
}))

vi.mock('../../../src/app/composables/useWorkflowChoices', async () => {
  const { ref } = await import('vue')
  return {
    useWorkflowChoices: () => ({
      rules: ref(null), mailTypes: ref([]), senders: ref([]), procs: ref([]), notice: ref(''), load: vi.fn()
    })
  }
})

vi.mock('../../../src/app/composables/useQuerySurfaces', async () => {
  const { ref } = await import('vue')
  return { useQuerySurfaces: () => ({ surfaces: ref([]) }) }
})

vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return {
    useWorkspace: () => ({
      customers: ref([]),
      connection: ref({ displayName: '', sessionStatus: 'disconnected', operatorId: '', accountOffer: null, lastDisplayName: '' }),
      call: vi.fn(async () => ({}))
    })
  }
})

vi.mock('../../../src/app/dialog', () => ({
  confirmDialog: vi.fn(async () => dialogState.confirmResult)
}))

vi.mock('../../../src/recovery/client', () => ({
  createRecoveryClient: () => ({
    get: vi.fn(async () => recoveryState.stored),
    put: vi.fn(async () => undefined)
  })
}))

const catalogState = vi.hoisted(() => ({
  workflows: [] as ReturnType<typeof defaultWorkflowCatalog>['workflows']
}))

vi.mock('../../../src/workflow/catalog-store', () => ({
  loadWorkflowCatalog: vi.fn(async () => ({ workflows: catalogState.workflows })),
  saveWorkflowCatalog: vi.fn(async (catalog: { workflows: typeof catalogState.workflows }) => {
    catalogState.workflows = catalog.workflows
    return catalog
  })
}))

vi.mock('../../../src/shell/assets', () => ({ bg: (name: string) => `/assets/${name}` }))
vi.mock('../../../src/shell/components/Bunny.vue', () => ({ default: { template: '<span class="bunny"></span>' } }))
vi.mock('../../../src/shell/components/PageHead.vue', () => ({
  default: { props: ['title', 'desc', 'art'], template: '<header class="page-head"><h1>{{ title }}</h1><slot /></header>' }
}))
vi.mock('../../../src/shell/components/MailTypeTreeSelect.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/shell/components/ThemeSelect.vue', () => ({ default: { template: '<span class="theme-select"></span>' } }))

import WorkflowPage from '../../../src/app/pages/WorkflowPage.vue'

let app: App | undefined
let host: HTMLDivElement | undefined
let scroller: HTMLDivElement | undefined

function mountPage(): void {
  host = document.body.appendChild(document.createElement('div'))
  scroller = host.appendChild(document.createElement('div'))
  scroller.className = 'workspace'
  const mountPoint = scroller.appendChild(document.createElement('div'))
  app = createApp(WorkflowPage)
  app.mount(mountPoint)
}

function unmountPage(): void {
  app?.unmount()
  app = undefined
  host?.remove()
  host = undefined
  scroller = undefined
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 0))
  for (let i = 0; i < 10; i += 1) await nextTick()
}

function cardFor(title: string): HTMLElement {
  const card = [...(host?.querySelectorAll<HTMLElement>('.sea-card') ?? [])]
    .find(item => item.querySelector('.sea-open b')?.textContent?.trim() === title)
  expect(card, `card "${title}" should exist`).toBeDefined()
  return card!
}

function activeWorkflowTab(containerSelector: string): string | undefined {
  const container = host?.querySelector<HTMLElement>(containerSelector)
  const selected = container?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
  return selected?.textContent?.trim()
}

function clickTab(containerSelector: string, label: string): void {
  const container = host?.querySelector<HTMLElement>(containerSelector)
  const tab = [...(container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])]
    .find(item => item.textContent?.trim() === label)
  expect(tab, `tab "${label}" in ${containerSelector} should exist`).toBeDefined()
  tab?.click()
}

function clickVisibleBackButton(): void {
  const buttons = [...(host?.querySelectorAll<HTMLButtonElement>('.workflow-back-btn') ?? [])]
  const activeBtn = buttons.find(btn => !btn.closest('.is-hidden-pane'))
  expect(activeBtn, 'visible back button should exist').toBeDefined()
  activeBtn?.click()
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: key => store.get(key) ?? null,
    key: index => [...store.keys()][index] ?? null,
    removeItem: key => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  mailEntrySpy.mounts = 0
  mailEntrySpy.unmounts = 0
  mailEntrySpy.ids = []
  dialogState.confirmResult = true
  recoveryState.stored = null
  const base = defaultWorkflowCatalog().workflows
  catalogState.workflows = [
    ...base,
    {
      id: 'custom-note',
      label: '自定义非运行流',
      summary: '只有步骤',
      steps: [
        { id: 'step-a', title: '第一步', detail: '做A', params: [] },
        { id: 'step-b', title: '第二步', detail: '做B', params: [] }
      ]
    }
  ]
  resetWorkflowViewMemoryForTest()
})

afterEach(() => {
  unmountPage()
  resetWorkflowViewMemoryForTest()
  vi.unstubAllGlobals()
})

describe('workflow view memory via WorkflowWorkspace', () => {
  it('remembers last tab per catalog workflow independently when reopening card body', async () => {
    mountPage()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('步骤流程')

    clickTab('.workflow-main', '开始使用')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('文件管理').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('步骤流程')
    clickTab('.workflow-main', '流程说明')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('开始使用')
    clickVisibleBackButton()
    await settle()

    cardFor('文件管理').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('流程说明')
  })

  it('remembers last tab for jihua, hague and billing without background panels overwriting defaults', async () => {
    mountPage()
    await settle()

    expect(localStorage.getItem('patmail.workflow.last-position.v1')).toBeNull()

    cardFor('季华实验室-文件导入').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-jihua')).toBe('流程说明')
    clickTab('.workflow-jihua', '开始使用')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('海牙新申请').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-hague')).toBe('开始使用')
    clickTab('.workflow-hague', '流程说明')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('请款').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-billing')).toBe('开始使用')
    clickTab('.workflow-billing', '流程说明')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('季华实验室-文件导入').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-jihua')).toBe('开始使用')
    clickVisibleBackButton()
    await settle()

    cardFor('海牙新申请').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-hague')).toBe('流程说明')
    clickVisibleBackButton()
    await settle()

    cardFor('请款').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-billing')).toBe('流程说明')
  })

  it('supports card shortcut buttons to jump directly and update remembered position', async () => {
    mountPage()
    await settle()

    const pctCard = cardFor('PCT鹏城专案')
    const startBtn = [...pctCard.querySelectorAll<HTMLButtonElement>('.sea-actions button')]
      .find(btn => btn.textContent?.trim() === '开始使用')
    startBtn?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('开始使用')

    clickVisibleBackButton()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('开始使用')
    clickVisibleBackButton()
    await settle()

    const billingGuideBtn = [...cardFor('请款').querySelectorAll<HTMLButtonElement>('.sea-actions button')]
      .find(btn => btn.textContent?.trim() === '流程说明')
    billingGuideBtn?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-billing')).toBe('流程说明')
    clickVisibleBackButton()
    await settle()

    cardFor('请款').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-billing')).toBe('流程说明')
  })

  it('persists last workflow tab and step across simulated page reload and forgets deleted custom flow', async () => {
    mountPage()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    clickTab('.workflow-main', '流程说明')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('海牙新申请').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    clickTab('.workflow-hague', '流程说明')
    await settle()
    clickVisibleBackButton()
    await settle()

    cardFor('自定义非运行流').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    const stepTwoBtn = [...(host?.querySelectorAll<HTMLButtonElement>('.flow-node') ?? [])]
      .find(btn => btn.textContent?.includes('第二步'))
    stepTwoBtn?.click()
    await settle()
    expect(stepTwoBtn?.classList.contains('on')).toBe(true)

    unmountPage()
    resetWorkflowViewMemoryForTest(false)
    mountPage()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('流程说明')
    clickVisibleBackButton()
    await settle()

    cardFor('海牙新申请').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-hague')).toBe('流程说明')
    clickVisibleBackButton()
    await settle()

    cardFor('自定义非运行流').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    const restoredStepTwo = [...(host?.querySelectorAll<HTMLButtonElement>('.flow-node') ?? [])]
      .find(btn => btn.textContent?.includes('第二步'))
    expect(restoredStepTwo?.classList.contains('on')).toBe(true)
    clickVisibleBackButton()
    await settle()

    const removeBtn = [...cardFor('自定义非运行流').querySelectorAll<HTMLButtonElement>('.sea-actions button')]
      .find(btn => btn.textContent?.trim() === '拿掉')
    removeBtn?.click()
    await settle()
    const stored = JSON.parse(localStorage.getItem('patmail.workflow.last-position.v1') || '{}') as {
      steps?: Record<string, string>
    }
    expect(stored.steps?.['custom-note']).toBeUndefined()
  })

  it('remembers selected step, preserves scroll per tab, and keeps lazy use panel mounted across tab switches', async () => {
    mountPage()
    await settle()

    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()

    const stepNodes = [...(host?.querySelectorAll<HTMLButtonElement>('.flow-node') ?? [])]
    expect(stepNodes.length).toBeGreaterThan(2)
    stepNodes[2]?.click()
    await settle()
    expect(stepNodes[2]?.classList.contains('on')).toBe(true)

    scroller!.scrollTop = 260
    clickTab('.workflow-main', '开始使用')
    await settle()
    expect(mailEntrySpy.mounts).toBe(1)
    expect(scroller!.scrollTop).toBe(0)

    scroller!.scrollTop = 140
    clickTab('.workflow-main', '流程说明')
    await settle()
    expect(scroller!.scrollTop).toBe(0)

    clickTab('.workflow-main', '步骤流程')
    await settle()
    expect(scroller!.scrollTop).toBe(260)

    clickTab('.workflow-main', '开始使用')
    await settle()
    expect(scroller!.scrollTop).toBe(140)
    expect(mailEntrySpy.mounts).toBe(1)
    expect(mailEntrySpy.unmounts).toBe(0)

    clickVisibleBackButton()
    await settle()
    cardFor('PCT鹏城专案').querySelector<HTMLButtonElement>('.sea-open')?.click()
    await settle()
    expect(activeWorkflowTab('.workflow-main')).toBe('开始使用')
    expect(scroller!.scrollTop).toBe(140)

    clickTab('.workflow-main', '步骤流程')
    await settle()
    const reopenedNodes = [...(host?.querySelectorAll<HTMLButtonElement>('.flow-node') ?? [])]
    expect(reopenedNodes[2]?.classList.contains('on')).toBe(true)
  })
})
