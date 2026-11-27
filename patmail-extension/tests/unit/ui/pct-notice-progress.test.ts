import { createApp, nextTick } from 'vue'
import { expect, it, vi } from 'vitest'
import PctNoticeWorkflowPage from '../../../src/app/pages/PctNoticeWorkflowPage.vue'
import { createDefaultNoticeImportQuery } from '../../../src/api/notice-params'
import { createInitialSystemPipelineProgress } from '../../../src/workflow/pct-notice-runner'

const checkSystems = vi.hoisted(() => vi.fn())
const request = vi.hoisted(() => vi.fn())
const read = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
vi.mock('../../../src/app/services/full-page-bridge', () => ({
  checkDualEasySystems: checkSystems,
  createWorkflowBridge: () => ({ request }),
  openDualEasyLogin: vi.fn()
}))
vi.mock('../../../src/recovery/client', () => ({
  createRecoveryClient: () => ({ get: read, put })
}))

it.each([false, true])('restores PCT stage checkpoints without sending requests (finished=%s)', async finished => {
  const large = { origin: 'https://large.test', operatorId: 'large-user', ready: true }
  const sme = { origin: 'https://sme.test', operatorId: 'sme-user', ready: true }
  checkSystems.mockResolvedValue({ allReady: true, writeSwitchOpen: true, large, sme })
  request.mockResolvedValue({ type: 'ERROR', payload: { message: 'Fixture: dictionary unavailable' } })
  read.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111', exportDispatched: true, finished,
    accounts: [{ key: 'a', label: '测试收文账号', largeId: 'a' }],
    replay: { applyType: '2', applyNo: '', caseName: '', noticeName: '', xlh: '', startTime: '', endTime: '' },
    download: { casename: '', appno: '', startTime: '', endTime: '', status: 'unprocess' },
    importNotice: createDefaultNoticeImportQuery(), smeImportNotice: createDefaultNoticeImportQuery(),
    largeRules: { closeCaseRule: '1', closeCaseImportNotice: '0' },
    smeRules: { closeCaseRule: '1', closeCaseImportNotice: '0' },
    progress: {
      step1Status: 'done', step1Detail: '并集 7 条',
      large: { ...createInitialSystemPipelineProgress('large'), step6Status: finished ? 'done' : 'running',
        step6Detail: '第 1 轮已导入 50 条', importRound1Count: 50 },
      sme: createInitialSystemPipelineProgress('sme')
    }
  })
  const root = document.body.appendChild(document.createElement('div'))
  const app = createApp(PctNoticeWorkflowPage)
  app.directive('hint', {})
  app.mount(root)
  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(read).toHaveBeenCalledWith('workflow-desk',
      JSON.stringify(['pct-notice-batch', large.origin, large.operatorId, sme.origin, sme.operatorId]))
    expect(root.textContent).toContain('并集 7 条')
    expect(root.textContent).toContain('第 1 轮已导入 50 条')
    if (finished) {
      expect(root.textContent).not.toContain('续办上次全流程')
      expect(root.textContent).not.toContain('页面刷新时中断')
    } else {
      expect(root.textContent).toContain('已暂停')
      expect(root.textContent).toContain('页面刷新时中断')
      expect(root.textContent).toContain('续办上次全流程')
    }
    for (const [message] of request.mock.calls) expect(message).toMatchObject({ type: 'LOAD_NOTICE_INIT' })
    expect(put).not.toHaveBeenCalled()
  } finally {
    app.unmount()
    root.remove()
  }
})
