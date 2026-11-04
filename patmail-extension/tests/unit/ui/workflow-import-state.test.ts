import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import WorkflowMailEntry from '../../../src/app/components/WorkflowMailEntry.vue'
import { defaultWorkflowCatalog } from '../../../src/workflow/catalog'
vi.mock('../../../src/app/composables/useWorkspace', () => ({ useWorkspace: () => ({ connection: ref({ easyOrigin: '', operatorId: '', sessionStatus: 'unknown' }), call: vi.fn(async () => null) }) }))
vi.mock('../../../src/recovery/wal-ledger', () => ({ flushRecovery: vi.fn(), holdRecovery: vi.fn(), peekRecovery: vi.fn(), recallRecovery: vi.fn(async () => null), scheduleRecovery: vi.fn(), systemScope: () => '' }))
vi.mock('../../../src/customer/xlsx-table', async original => ({ ...(await original<typeof import('../../../src/customer/xlsx-table')>()), readXlsxSheets: vi.fn(async () => [{ name: 'Sheet1', rows: [['错误表头'], ['内容']] }]) }))
vi.mock('../../../src/app/components/FileManageMail.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../../src/app/components/LimitMonitorQuery.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../../src/app/components/FilingExportPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../../src/app/components/EmptyGuide.vue', () => ({ default: { template: '<div />' } }))
let app: App | undefined
let host: HTMLDivElement
afterEach(() => { app?.unmount(); host?.remove() })
it('读表失败不启动期限查询，不显示假运行状态并保留具体错误', async () => {
  const request = vi.fn()
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(WorkflowMailEntry, { customers: [], rules: null, operatorId: '', mailTypes: [], senders: [], signatureName: '', signatureText: '', catalog: defaultWorkflowCatalog() }) })
  app.directive('hint', {}); app.provide('bridge', { request }); app.mount(host)
  await nextTick()
  const input = host.querySelector('input[aria-label="选择表格"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [{ name: '错误.xlsx', arrayBuffer: async () => new ArrayBuffer(0) }] })
  input.dispatchEvent(new Event('change'))
  await new Promise(resolve => setTimeout(resolve, 30)); await nextTick()
  expect(host.textContent).toContain('表格要有')
  expect(host.textContent).not.toContain('正在查期限监控…')
  expect(request).not.toHaveBeenCalled()
})
