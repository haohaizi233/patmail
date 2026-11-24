import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppRoot from '../../../src/app/App.vue'

const uploadRuntime = vi.hoisted(() => ({ mounts: 0 }))

vi.mock('../../../src/app/pages/JihuaUploadPage.vue', async () => {
  const { defineComponent, h, onMounted, ref } = await import('vue')
  return {
    default: defineComponent({
      emits: ['back'],
      setup(_props, { emit }) {
        const taskName = ref('')
        onMounted(() => { uploadRuntime.mounts += 1 })
        return () => h('section', { 'data-testid': 'jihua-runtime' }, [
          h('h1', '季华实验室-文件导入'),
          h('input', {
            'aria-label': '当前任务名称',
            value: taskName.value,
            onInput: event => { taskName.value = (event.target as HTMLInputElement).value }
          }),
          h('button', { type: 'button', onClick: () => emit('back') }, '回到工作流')
        ])
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
vi.mock('../../../src/workflow/catalog-store', () => ({
  loadWorkflowCatalog: vi.fn(async () => ({ workflows: [] })),
  saveWorkflowCatalog: vi.fn(async (catalog: unknown) => catalog)
}))
vi.mock('../../../src/shell/assets', () => ({ bg: (name: string) => `/assets/${name}` }))
vi.mock('../../../src/shell/components/Bunny.vue', () => ({ default: { template: '<span class="bunny"></span>' } }))
vi.mock('../../../src/shell/components/PageHead.vue', () => ({
  default: { props: ['title', 'desc', 'art'], template: '<header class="page-head"><h1>{{ title }}</h1><slot /></header>' }
}))
vi.mock('../../../src/shell/components/MailTypeTreeSelect.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/shell/components/ThemeSelect.vue', () => ({ default: { template: '<span class="theme-select"></span>' } }))
vi.mock('../../../src/shell/components/Shell.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['page', 'items'],
      emits: ['navigate', 'settings', 'mode', 'preview'],
      setup(props, { emit, slots }) {
        const page = props.page as string
        const items = props.items as Array<{ name: string }>
        return () => h('div', { 'data-testid': 'shell', 'data-page': page }, [
          h('nav', items.map(item => h('button', {
            type: 'button',
            onClick: () => emit('navigate', item.name)
          }, item.name))),
          slots.default?.()
        ])
      }
    })
  }
})
vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return {
    useWorkspace: () => ({
      connection: ref({ displayName: '', sessionStatus: 'disconnected', accountOffer: null, lastDisplayName: '' }),
      call: vi.fn(async () => ({}))
    })
  }
})
vi.mock('../../../src/settings/customer-mode', () => ({
  customerMode: () => 'large',
  hydrateCustomerMode: async () => {},
  setCustomerMode: async () => {},
  watchCustomerMode: () => {}
}))
vi.mock('../../../src/settings/use-account-avatar', async () => {
  const { ref } = await import('vue')
  return { useAccountAvatar: () => ({ src: ref(''), zoomed: ref(false), zoomSrc: ref(''), openZoom: vi.fn(), closeZoom: vi.fn() }) }
})
vi.mock('../../../src/app/services/full-page-bridge', () => ({ createFullPageBridge: () => ({}) }))
vi.mock('../../../src/app/recovery/executions', () => ({ mirrorLocalExecutions: vi.fn(), restoreLocalExecutions: vi.fn() }))
vi.mock('../../../src/app/utils/idle', () => ({ runWhenIdle: vi.fn() }))
vi.mock('../../../src/app/components/AgentDock.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/app/components/DocsDock.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/app/components/CheckRainbow.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/app/components/AppDialog.vue', () => ({ default: { template: '<span></span>' } }))
vi.mock('../../../src/app/pages/HomePage.vue', () => ({ default: { template: '<div>home</div>' } }))
vi.mock('../../../src/app/pages/FilesPage.vue', () => ({ default: { template: '<div>files</div>' } }))
vi.mock('../../../src/app/pages/CustomersPage.vue', () => ({ default: { template: '<div>customers</div>' } }))
vi.mock('../../../src/app/pages/TemplatesPage.vue', () => ({ default: { template: '<div>templates</div>' } }))
vi.mock('../../../src/app/pages/RulesPage.vue', () => ({ default: { template: '<div>rules</div>' } }))
vi.mock('../../../src/app/pages/TasksPage.vue', () => ({ default: { template: '<div>tasks</div>' } }))
vi.mock('../../../src/app/pages/DraftsPage.vue', () => ({ default: { template: '<div>drafts</div>' } }))
vi.mock('../../../src/app/pages/RecordsPage.vue', () => ({ default: { template: '<div>records</div>' } }))
vi.mock('../../../src/app/pages/AcceptancePage.vue', () => ({ default: { template: '<div>acceptance</div>' } }))
vi.mock('../../../src/app/pages/SettingsPage.vue', () => ({ default: { template: '<div>settings</div>' } }))
vi.mock('../../../src/app/pages/LimitsPage.vue', () => ({ default: { template: '<div>limits</div>' } }))
vi.mock('../../../src/app/pages/FilingsPage.vue', () => ({ default: { template: '<div>filings</div>' } }))
vi.mock('../../../src/app/pages/CaseContactsPage.vue', () => ({ default: { template: '<div>contacts</div>' } }))
vi.mock('../../../src/app/pages/SnapshotProbe.vue', () => ({ default: { template: '<div>probe</div>' } }))

let app: App | undefined
let host: HTMLDivElement | undefined

function mount(hash = '#/workflow'): void {
  window.location.hash = hash
  host = document.body.appendChild(document.createElement('div'))
  app = createApp(AppRoot)
  app.mount(host)
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index++) await nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 0))
  for (let index = 0; index < 12; index++) await nextTick()
}

function clickButton(label: string, root: ParentNode = host!): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)
  expect(button, `button "${label}" should exist`).toBeDefined()
  button?.click()
}

beforeEach(() => { uploadRuntime.mounts = 0 })
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  host = undefined
  window.location.hash = ''
})

describe('季华实验室上传入口', () => {
  it('keeps the standalone route and sidebar entry out of the app shell', async () => {
    mount('#/jihua-upload')
    await settle()

    const shell = host?.querySelector<HTMLElement>('[data-testid="shell"]')
    expect(shell?.dataset.page).toBe('首页')
    expect([...shell?.querySelectorAll('nav button') ?? []].map(button => button.textContent?.trim())).not.toContain('季华实验室-文件导入')
    expect([...shell?.querySelectorAll('nav button') ?? []].map(button => button.textContent?.trim())).not.toContain('季华传文')
    expect(host?.querySelector('[data-testid="jihua-runtime"]')).toBeNull()
  })

  it('opens from the workflow card and keeps the same upload runtime when returning and reactivating the workflow', async () => {
    mount()
    await settle()

    const entry = [...(host?.querySelectorAll<HTMLButtonElement>('.sea-open') ?? [])]
      .find(button => button.textContent?.includes('季华实验室-文件导入'))
    expect(entry).toBeDefined()
    entry?.click()
    await settle()

    expect(host?.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('流程说明')
    expect(host?.querySelector('[data-testid="workflow-guide"]')?.textContent).toContain('递归')
    clickButton('开始使用', host!.querySelector('[role="tablist"]')!)
    await settle()

    const runtime = host?.querySelector<HTMLElement>('[data-testid="jihua-runtime"]')
    expect(runtime?.textContent).toContain('季华实验室-文件导入')
    const taskName = runtime?.querySelector<HTMLInputElement>('input')
    if (taskName) {
      taskName.value = '上传中的任务'
      taskName.dispatchEvent(new Event('input', { bubbles: true }))
    }
    clickButton('回到工作流')
    await settle()
    expect(host?.querySelector('[data-testid="jihua-runtime"] input')).toHaveProperty('value', '上传中的任务')

    const reopened = [...(host?.querySelectorAll<HTMLButtonElement>('.sea-open') ?? [])]
      .find(button => button.textContent?.includes('季华实验室-文件导入'))
    reopened?.click()
    await settle()
    clickButton('开始使用', host!.querySelector('[role="tablist"]')!)
    await settle()
    clickButton('首页')
    await settle()
    clickButton('工作流')
    await settle()

    expect(host?.querySelector<HTMLElement>('[data-testid="shell"]')?.dataset.page).toBe('工作流')
    expect(host?.querySelector('[data-testid="jihua-runtime"] input')).toHaveProperty('value', '上传中的任务')
    expect(uploadRuntime.mounts).toBe(1)
  })

  it('provides a direct use entry and preserves the mounted task across guide and use tabs', async () => {
    mount()
    await settle()
    clickButton('开始使用', host!.querySelector('.jihua-upload-card')!)
    await settle()
    const tabs = host!.querySelector('[role="tablist"]')!
    const selected = () => tabs.querySelector('[aria-selected="true"]')
    expect(selected()?.textContent?.trim()).toBe('开始使用')
    const runtime = host!.querySelector<HTMLElement>('[data-testid="jihua-runtime"]')!
    const input = runtime.querySelector('input')!
    input.value = '保持当前上传和筛选'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    clickButton('流程说明', tabs)
    await settle()
    const usePanel = runtime.closest<HTMLElement>('[role="tabpanel"]')
    expect(usePanel?.classList.contains('is-hidden-pane')).toBe(true)
    expect(usePanel?.getAttribute('aria-hidden')).toBe('true')
    expect(host!.querySelector('[data-testid="workflow-guide"]')).not.toBeNull()
    clickButton('开始使用', tabs)
    await settle()
    expect(usePanel?.classList.contains('is-hidden-pane')).toBe(false)
    expect(usePanel?.getAttribute('aria-hidden')).toBeNull()
    expect(host!.querySelector('[data-testid="jihua-runtime"]')).toBe(runtime)
    expect(input.value).toBe('保持当前上传和筛选')
    expect(uploadRuntime.mounts).toBe(1)
    expect(selected()?.getAttribute('aria-controls')).toBe(runtime.closest('[role="tabpanel"]')?.id)
  })

  it('supports keyboard switching with one selected and tabbable view', async () => {
    mount()
    await settle()
    clickButton('流程说明', host!.querySelector('.jihua-upload-card')!)
    await settle()
    const tabs = [...host!.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    tabs[0].focus()
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settle()
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0])
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await settle()
    expect(document.activeElement).toBe(tabs[0])
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    expect(uploadRuntime.mounts).toBe(1)
  })
})
