import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import BindQueryBar from '../../../src/app/components/BindQueryBar.vue'

const state = vi.hoisted(() => ({ call: vi.fn(async () => ({ ok: true })) }))
vi.mock('../../../src/app/composables/useWorkspace', async () => {
  const { ref } = await import('vue')
  return { useWorkspace: () => ({
    connection: ref({ sessionStatus: 'authenticated', easyOrigin: 'http://183.36.43.66:88', operatorId: '11111111-1111-4111-8111-111111111111', easyTabId: 1, connectionVersion: 1 }),
    customers: ref([{ id: 'customer', name: '验收客户', enabled: true, revision: 1, fileDownloadName: { newFilename: 'app_no', fileNameType: 'colname' } }]), call: state.call
  }) }
})
let app: App | undefined
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; state.call.mockClear() })
it('下载配方无效时禁用客户绑定，事件绕过禁用也不能删除原有配方', async () => {
  const problem = ref('第2段固定字符不能为空。')
  app = createApp({ render: () => h(BindQueryBar, { surface: 'file', fields: { case_volume: 'AUDIT' }, downloadName: null, downloadNameProblem: problem.value }) })
  app.directive('hint', {})
  app.mount(document.body.appendChild(document.createElement('div')))
  const bind = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('将查询条件绑定到'))!
  expect(bind.disabled).toBe(true)
  bind.dispatchEvent(new MouseEvent('click', { bubbles: true })); await nextTick()
  expect(state.call).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('第2段固定字符不能为空')
  problem.value = ''; await nextTick()
  expect(bind.disabled).toBe(false)
})
