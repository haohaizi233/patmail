import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type PropType } from 'vue'
import FileManageMail from '../../../src/app/components/FileManageMail.vue'
import { MessageType } from '../../../src/shared/message'
import type { CustomerQueryProfile } from '../../../src/customer/types'

vi.mock('../../../src/shell/components/ThemeSelect.vue', () => ({ default: defineComponent({
  props: { modelValue: String, disabled: Boolean, options: { type: Array as PropType<Array<{ value: string; label: string }>>, default: () => [] } },
  emits: ['update:modelValue'], setup: (props, { emit }) => () => h('select', { value: props.modelValue, disabled: props.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, props.options.map(x => h('option', { value: x.value }, x.label)))
}) }))
vi.mock('../../../src/app/composables/useWorkspace', () => ({ useWorkspace: () => ({
  connection: ref({ sessionStatus: 'authenticated', easyOrigin: 'http://example.test', operatorId: '11111111-1111-4111-8111-111111111111' }), call: vi.fn()
}) }))
vi.mock('../../../src/recovery/wal-ledger', () => ({
  flushRecovery: vi.fn(), holdRecovery: vi.fn(), peekRecovery: vi.fn(), recallRecovery: async () => null, scheduleRecovery: vi.fn(), systemScope: () => 'test|local'
}))
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
describe('文件查询客户隔离', () => {
  it('查询期间禁用选择且丢弃属于旧客户的迟到响应', async () => {
    const customers = ['a', 'b'].map(id => ({ id, name: id, querySurface: 'file', workflowId: 'file-manage', fileMailStyle: 'single_file', enabled: true, baseTemplateId: 'base', overrides: {}, boundQuery: { customer_name_vague: id }, createdAt: '', updatedAt: '' })) as CustomerQueryProfile[]
    let complete: (value: unknown) => void = () => undefined
    const pending = new Promise(resolve => { complete = resolve })
    const request = vi.fn((message: { type: string }) => message.type === MessageType.SearchFiles ? pending : Promise.resolve({ type: MessageType.Error, payload: { message: 'unused' } }))
    const el = document.createElement('div'); document.body.appendChild(el)
    const app = createApp({ render: () => h(FileManageMail, { customers, rules: null, senders: [] }) })
    app.provide('bridge', { request }); app.directive('hint', {}); app.mount(el)
    try {
      const select = el.querySelector('select')!
      select.value = 'a'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle()
      const button = [...el.querySelectorAll('button')].find(x => x.textContent === '按绑定条件查询')!
      button.click(); await settle()
      expect(request.mock.calls.some(([m]) => m.type === MessageType.SearchFiles)).toBe(true)
      expect(select.disabled).toBe(true)
      // 模拟外部恢复/强制变化；即使绕过禁用，迟到的查询也不能套用另一客户配置。
      select.value = 'b'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle()
      complete({ type: MessageType.SearchFilesResult, payload: { ok: true, data: { total: 1, items: [{ fileId: '22222222-2222-4222-8222-222222222222', fileName: 'A.pdf', fileDescription: '甲', customerName: 'a' }] } } })
      await settle()
      expect(el.querySelector('table')).toBeNull()
      expect(el.textContent).not.toContain('查到 1 个文件')
    } finally { app.unmount(); el.remove() }
  })
})

