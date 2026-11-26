import { createApp, h, nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'
import { taskCheckProgress } from '../../../src/app/check-progress'
import type { TopProgress } from '../../../src/app/composables/useTopProgress'
import { isNoticeTaskStatusEvent, NOTICE_STATUS_CHANNEL } from '../../../src/shared/notice-status'

let host: HTMLDivElement | undefined

afterEach(() => {
  host?.remove()
  host = undefined
})

describe('CheckRainbow state-machine mode & notice status guard', () => {
  it('renders pure state-machine banner without progressbar or fake percentage in state mode', async () => {
    const onDismiss = vi.fn()
    type MutableTopProgress = { -readonly [K in keyof TopProgress]: TopProgress[K] }
    const state = reactive<MutableTopProgress>({
      ...taskCheckProgress,
      visible: true,
      mode: 'state',
      status: 'run',
      label: '下载解析全部官文',
      stage: '轮询状态 (2/25)',
      summary: 'ProcessTzsListStatus',
      detail: '通知书处理中,请稍等!',
      elapsed: '已用时 5s',
      onDismiss
    })

    host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(CheckRainbow, { progress: state }) })
    app.directive('hint', {})
    app.mount(host)

    expect(host.querySelector('[role="progressbar"]')).toBeNull()
    expect(host.querySelector('.check-rainbow-track')).toBeNull()
    const statusBox = host.querySelector('[role="status"]')
    expect(statusBox).not.toBeNull()
    expect(statusBox?.textContent).toContain('下载解析全部官文')
    expect(statusBox?.textContent).toContain('轮询状态 (2/25)')
    expect(statusBox?.textContent).toContain('ProcessTzsListStatus：通知书处理中,请稍等!')
    expect(statusBox?.textContent).toContain('已用时 5s')
    expect(host.querySelector('.check-rainbow-close')).toBeNull()

    state.status = 'done'
    state.stage = '已完成'
    state.summary = '已同步至「导入来文」'
    state.detail = '通知书分析下载完成，共处理 11 条'
    await nextTick()

    expect(statusBox?.classList.contains('is-done')).toBe(true)
    const closeBtn = host.querySelector<HTMLButtonElement>('.check-rainbow-close')
    expect(closeBtn).not.toBeNull()
    closeBtn!.click()
    expect(onDismiss).toHaveBeenCalledTimes(1)

    app.unmount()
  })

  it('validates NOTICE_STATUS_CHANNEL payloads cleanly', () => {
    expect(NOTICE_STATUS_CHANNEL).toBe('patmail-notice-status')
    expect(
      isNoticeTaskStatusEvent({
        phase: 'polling',
        action: 'downloadTzsList',
        call: 'ProcessTzsListStatus',
        pollAttempt: 2,
        maxPolls: 25,
        serverMessage: '通知书处理中,请稍等!'
      })
    ).toBe(true)
    expect(isNoticeTaskStatusEvent({ phase: 'unknown', action: 'downloadTzsList', serverMessage: 'x' })).toBe(false)
    expect(isNoticeTaskStatusEvent({ phase: 'polling', action: 'downloadTzsList', pollAttempt: -1, serverMessage: 'x' })).toBe(false)
  })
})
