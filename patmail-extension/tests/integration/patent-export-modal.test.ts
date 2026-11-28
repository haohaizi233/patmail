import { createApp, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import FeeExportModal from '../../src/app/components/FeeExportModal.vue'
import { MessageType, type MessageBridge } from '../../src/shared/message'

vi.mock('../../src/app/dialog', () => ({
  confirmDialog: vi.fn(async () => true),
  infoDialog: vi.fn(async () => {})
}))

describe('patent export modal', () => {
  it('handles group and column interactions, original-site templates, and full query export', async () => {
    const request = vi.fn<MessageBridge['request']>(async message => {
      if (message.type === MessageType.FeeExportConfig) {
        const action = message.payload.action
        const data = action === 'detail'
          ? { columns: [{ seq: 1, value: 'app_no', text: '申请号' }] }
          : { templates: action === 'del' ? [] : [{ typeId: 'sample', typeText: '清单模板' }] }
        return { type: MessageType.FeeExportConfigResult, payload: { ok: true, data } }
      }
      return {
        type: MessageType.ExportFeeResult,
        payload: { ok: true, data: { async: false, status: 'download_completed', message: '导出完成' } }
      }
    })
    const query = { pageIndex: 2, pageSize: 20, fields: { app_no: '123' } }
    const onClose = vi.fn()
    const onExported = vi.fn()
    const app = createApp(FeeExportModal, {
      open: true, mode: 'cond', patentQuery: query, timeoutMs: 60_000, bridge: { request }, onClose, onExported
    })
    app.directive('hint', {})
    app.mount(document.createElement('div'))
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
    const find = <T extends HTMLElement>(selector: string): T => {
      const element = document.querySelector<T>(selector)
      if (!element) throw new Error(`Missing ${selector}`)
      return element
    }
    const button = (label: string) => {
      const match = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(item => item.textContent?.trim() === label)
      if (!match) throw new Error(`Missing ${label}`)
      return match
    }
    const picked = () => [...document.querySelectorAll('.picked-name')].map(item => item.textContent)
    try {
      await settle()
      expect(request).toHaveBeenLastCalledWith({
        type: MessageType.FeeExportConfig, payload: { action: 'list', belongKey: 'ICSearch' }
      })
      expect(picked()).toHaveLength(75)
      const group = find('.group-toggle')
      group.click()
      await nextTick()
      expect(find('.group-grid').style.display).toBe('none')
      group.click()
      await nextTick()

      const serial = find<HTMLInputElement>('.group-grid input')
      expect(serial.checked).toBe(false)
      serial.click()
      await nextTick()
      expect(picked().at(-1)).toBe('序号')
      find('.picked-list li:last-child').click()
      await nextTick()
      find('button[aria-label=向上]').click()
      await nextTick()
      expect(picked().at(-2)).toBe('序号')
      find('.picked-list li.active').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await nextTick()
      expect(serial.checked).toBe(false)
      expect(picked()).toHaveLength(75)

      button('全选').click()
      await nextTick()
      expect(picked()).toHaveLength(177)
      button('全不选').click()
      await nextTick()
      expect(picked()).toHaveLength(0)
      find('[role=combobox]').click()
      await nextTick()
      find('[role=option]:last-child').click()
      await settle()
      expect(picked()).toEqual(['申请号'])
      expect(find<HTMLInputElement>('.tpl-input').value).toBe('清单模板')

      for (const [label, action] of [['保存', 'add'], ['更新', 'up'], ['删除', 'del']]) {
        button(label).click()
        await settle()
        const last = request.mock.lastCall?.[0]
        expect(last?.type).toBe(MessageType.FeeExportConfig)
        if (last?.type === MessageType.FeeExportConfig) {
          expect(last.payload.action).toBe(action)
          expect(last.payload.belongKey).toBe('ICSearch')
        }
      }
      expect(picked()).toHaveLength(0)
      serial.click()
      await nextTick()
      button('导出 Excel').click()
      await settle()
      expect(request).toHaveBeenLastCalledWith({
        type: MessageType.ExportFee,
        payload: { mode: 'patent', query, columns: [{ value: 'SN', text: '序号' }], timeoutMs: 60_000 }
      })
      expect(onExported).toHaveBeenCalledWith('导出完成')
      expect(onClose).toHaveBeenCalledOnce()
    } finally {
      app.unmount()
    }
  })
})
