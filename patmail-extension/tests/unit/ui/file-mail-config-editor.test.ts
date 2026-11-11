import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type PropType } from 'vue'
import FileMailConfigEditor from '../../../src/app/components/FileMailConfigEditor.vue'
import type { FileMailConfig } from '../../../src/customer/file-mail-config'
import { MessageType } from '../../../src/shared/message'

vi.mock('../../../src/shell/components/ThemeSelect.vue', () => ({ default: defineComponent({
  props: { modelValue: String, placeholder: String, options: { type: Array as PropType<Array<{ value: string; label: string }>>, default: () => [] } }, emits: ['update:modelValue', 'open'],
  setup: (props, { emit }) => () => h('select', { value: props.modelValue, 'aria-label': props.placeholder, onFocus: () => emit('open'), onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, props.options.map((x: { value: string; label: string }) => h('option', { value: x.value }, x.label)))
}) }))
const id = '11111111-1111-4111-8111-111111111111'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach(fn => fn()))
async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }
function mount(initial?: FileMailConfig, defaults?: FileMailConfig) {
  const model = ref(initial)
  const key = ref('a')
  const request = vi.fn(async (message: { type: string; payload: { kind?: string } }) => {
    const kind = message.payload.kind
    if (message.type === MessageType.ReadCustomerDirectory) return { type: MessageType.CustomerDirectoryResult, payload: { ok: true, data: { complete: true, rows: [{ name: '联系人', email: 'contact@example.com' }] } } }
    return { type: MessageType.DictionaryResult, payload: { ok: true, data: { kind,
      reviewers: [{ id, name: '审核甲' }], items: [{ id, name: '签名甲' }], reserved: null, note: '',
      nodes: [{ id, name: '类型甲', parentId: '' }]
    } } }
  })
  const el = document.createElement('div'); document.body.appendChild(el)
  const app = createApp({ setup: () => () => h(FileMailConfigEditor, { key: key.value, modelValue: model.value, defaults, customerId: id, 'onUpdate:modelValue': (value: FileMailConfig | undefined) => { model.value = value } }) })
  app.provide('bridge', { request }); app.mount(el)
  cleanup.push(() => { app.unmount(); el.remove() })
  return { el, model, key, request }
}
async function check(el: HTMLElement, text: string, checked: boolean) {
  const label = [...el.querySelectorAll('label')].find(x => x.textContent?.includes(text))!
  const input = label.querySelector('input')!; input.checked = checked; input.dispatchEvent(new Event('change', { bubbles: true })); await settle()
}
describe('客户发文设置编辑器', () => {
  it('直接展示设置，展开热加载只请求一次；选择和清除即自定义与默认', async () => {
    const { el, model, request, key } = mount()
    expect(el.textContent).not.toContain('自定义审核人')
    expect(el.querySelector('[data-field=mailType]')).toBeNull()
    expect(el.querySelector('[data-field=title]')).toBeNull()
    const select = el.querySelector<HTMLElement>('[data-field=reviewer]')!.querySelector('select')!
    select.dispatchEvent(new Event('focus')); await settle()
    select.dispatchEvent(new Event('focus')); await settle()
    expect(request.mock.calls.filter(([m]) => m.payload.kind === 'reviewer')).toHaveLength(1)
    select.value = id; select.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    expect(model.value?.reviewer).toEqual({ id, name: '审核甲' })
    key.value = 'reload'; await settle()
    const restored = el.querySelector<HTMLElement>('[data-field=reviewer]')!.querySelector('select')!
    expect(restored.value).toBe(id)
    restored.value = ''; restored.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    expect(model.value).toBeUndefined()
  })
  it('选回当前默认审核人不保存覆盖', async () => {
    const { el, model } = mount({ reviewer: { id: '22222222-2222-4222-8222-222222222222', name: '另一审核人' } }, { reviewer: { id, name: '审核甲' } })
    const select = el.querySelector<HTMLElement>('[data-field=reviewer]')!.querySelector('select')!
    select.dispatchEvent(new Event('focus')); await settle()
    select.value = id; select.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    expect(model.value).toBeUndefined()
  })
  it('保留显式不抄送和追加地址，恢复原有两个来源时自动继承默认', async () => {
    const { el, model } = mount()
    await check(el, '抄送发件人', false)
    await check(el, '抄送商务', false)
    expect(model.value?.cc).toEqual({ sender: false, sales: false })
    await check(el, '抄送发件人', true)
    await check(el, '抄送商务', true)
    expect(model.value).toBeUndefined()
    const area = el.querySelector('textarea')!; area.value = '甲(a@example.com);'; area.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    expect(model.value?.to).toBe('甲(a@example.com);')
    area.value = ''; area.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    expect(model.value).toBeUndefined()
  })
})
