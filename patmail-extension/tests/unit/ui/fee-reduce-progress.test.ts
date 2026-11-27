import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import FeeReduceWorkflowPage from '../../../src/app/pages/FeeReduceWorkflowPage.vue'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'
import { MessageType, type AppMessage } from '../../../src/shared/message'

const request = vi.hoisted(() => vi.fn<(message: AppMessage) => Promise<unknown>>())
const confirm = vi.hoisted(() => vi.fn())
vi.mock('../../../src/app/services/full-page-bridge', () => ({ createWorkflowBridge: () => ({ request }) }))
vi.mock('../../../src/app/composables/useWorkspace', () => ({
  useWorkspace: () => ({ connection: ref({
    sessionStatus: 'authenticated', easyOrigin: 'http://183.36.43.66:88', easyTabId: 1,
    operatorId: '11111111-1111-4111-8111-111111111111', connectionVersion: 1
  }) })
}))
vi.mock('../../../src/settings/use-write-switch', () => ({ useWriteSwitch: () => ({ open: ref(true) }) }))
vi.mock('../../../src/app/dialog', () => ({ confirmDialog: confirm, infoDialog: vi.fn() }))

let app: App | undefined
let root: HTMLDivElement
const active = ref(true)
const progress = () => root.querySelector('[role="progressbar"]')
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  app?.unmount()
  root?.remove()
})

it('shows search, concurrent execution and retry progress in the shared header', async () => {
  const firstSearch = deferred()
  const secondSearch = deferred()
  const firstSubmit = deferred()
  const secondSubmit = deferred()
  const retry = deferred()
  const approval = deferred()
  confirm.mockReturnValueOnce(approval.promise)
  const searches = [firstSearch, secondSearch]
  const submissions = [firstSubmit, secondSubmit, retry]
  request.mockImplementation(({ type }) => {
    if (type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({
        type: MessageType.ReadFeeReduceReviewersResult,
        payload: { ok: true, data: { reviewers: [{ userId: '1', name: '初核人', count: null }] } }
      })
    }
    if (type === MessageType.InspectFeeReduceCases) return searches.shift()!.promise
    if (type === MessageType.SubmitFeeReduceFiling) return submissions.shift()!.promise
    throw new Error(`Unexpected request: ${type}`)
  })
  root = document.body.appendChild(document.createElement('div'))
  app = createApp({ render: () => [h(CheckRainbow), h(FeeReduceWorkflowPage, { embedded: true, isActive: active.value })] })
  app.directive('hint', {})
  app.mount(root)
  await settle()

  const volumes = Array.from({ length: 49 }, (_, index) => `PE${26115000 + index}CND`)
  const input = root.querySelector('textarea')!
  input.value = volumes.join('\n')
  input.dispatchEvent(new Event('input'))
  await nextTick()
  const buttons = root.querySelectorAll<HTMLButtonElement>('.fr-actions button')
  buttons[0].click()
  await settle()
  expect(progress()).not.toBeNull()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('检索 0/49')

  const searched = (batch: string[]) => ({
    type: MessageType.InspectFeeReduceCasesResult,
    payload: {
      ok: true,
      data: {
        items: batch.map(caseVolume => ({
          caseVolume,
          state: caseVolume === volumes[0] || caseVolume === volumes.at(-1) ? 'ready'
            : caseVolume === volumes[7] ? 'not_found' : 'completed'
        }))
      }
    }
  })
  firstSearch.resolve(searched(volumes.slice(0, 48)))
  await settle()
  expect(progress()?.getAttribute('aria-valuenow')).toBe('98')
  secondSearch.resolve(searched(volumes.slice(48)))
  await settle()
  expect(progress()?.getAttribute('aria-valuenow')).toBe('100')

  const tableRows = () => root.querySelectorAll<HTMLTableRowElement>('.fr-table tbody tr')
  const nextPage = () => [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '下一页')!
  const missingFilter = root.querySelector<HTMLButtonElement>('.fr-summary button')!
  expect(missingFilter.textContent).toContain('只看未查到（1）')
  missingFilter.click()
  await nextTick()
  expect(tableRows()).toHaveLength(1)
  expect(tableRows()[0].textContent).toContain(volumes[7])
  expect(buttons[1].textContent).toContain('2')
  missingFilter.click()
  await nextTick()
  expect(tableRows()).toHaveLength(20)
  expect(tableRows()[0].textContent).toContain(volumes[0])
  nextPage().click()
  await nextTick()
  expect(tableRows()).toHaveLength(20)
  expect(tableRows()[0].textContent).toContain(volumes[20])
  nextPage().click()
  await nextTick()
  expect(tableRows()).toHaveLength(9)
  expect(nextPage().disabled).toBe(true)
  const lastCheckbox = tableRows()[8].querySelector<HTMLInputElement>('input[type="checkbox"]')!
  lastCheckbox.click()
  await nextTick()
  expect(buttons[1].textContent).toContain('1')
  lastCheckbox.click()
  await nextTick()
  expect(buttons[1].textContent).toContain('2')

  buttons[1].click()
  const remark = root.querySelector<HTMLInputElement>('input[placeholder="同意"]')!
  remark.value = '修改后的意见'
  remark.dispatchEvent(new Event('input'))
  approval.resolve(true)
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('递交 0/2')
  const sent = request.mock.calls.flatMap(([message]) =>
    message.type === MessageType.SubmitFeeReduceFiling ? [message.payload] : []
  )
  expect(sent).toHaveLength(2)
  expect(sent.map(payload => payload.caseVolume)).toEqual([volumes[0], volumes.at(-1)])
  for (const payload of sent) {
    expect(payload).toMatchObject({
      remark: '同意', expectedScope: { easyTabId: 1, operatorId: '11111111-1111-4111-8111-111111111111' }
    })
  }
  const success = {
    type: MessageType.SubmitFeeReduceFilingResult,
    payload: { ok: true, data: { filingId: '1', warnings: [], message: '已提交初核' } }
  }
  secondSubmit.resolve({
    type: MessageType.SubmitFeeReduceFilingResult,
    payload: { ok: true, data: { outcome: 'already_completed', procStatus: '完成', message: '已回查原站，已跳过递交。' } }
  })
  await settle()
  expect(progress()?.getAttribute('aria-valuenow')).toBe('50')
  expect(progress()?.getAttribute('aria-valuetext')).toContain('已成功 0 件，跳过 1 件')
  expect(tableRows()[8].textContent).toContain('已完成（完成）')
  expect(tableRows()[8].querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
  firstSubmit.resolve({ type: MessageType.Error, payload: { message: '提交失败' } })
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('失败 1 件')
  expect(progress()?.getAttribute('aria-valuenow')).toBe('100')

  for (let page = 0; page < 2; page++) {
    const previous = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '上一页')!
    previous.click()
    await nextTick()
  }
  const retryButton = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '重试')!
  retryButton.click()
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('重试 0/1')
  active.value = false
  await nextTick()
  expect(progress()).toBeNull()
  retry.resolve(success)
  await settle()
  active.value = true
  await nextTick()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('重试 1/1')

  nextPage().click()
  await nextTick()
  const freshSearch = deferred()
  searches.push(freshSearch)
  input.value = volumes[0]
  input.dispatchEvent(new Event('input'))
  await nextTick()
  buttons[0].click()
  freshSearch.resolve(searched(volumes.slice(0, 1)))
  await settle()
  expect(tableRows()).toHaveLength(1)
  expect(tableRows()[0].textContent).toContain(volumes[0])
  expect(root.querySelector('.fr-pagination')).toBeNull()
})

it.each(['connection', 'flow status'] as const)('pauses on a shared failure and rechecks without resending writes (%s)', async failure => {
  const volumes = Array.from({ length: 12 }, (_, index) => `CASE-${index + 1}`)
  const inspects: string[][] = []
  let submits = 0
  request.mockReset()
  confirm.mockResolvedValue(true)
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
    }
    if (message.type === MessageType.InspectFeeReduceCases) {
      inspects.push(message.payload.caseVolumes)
      return Promise.resolve({ type: MessageType.InspectFeeReduceCasesResult, payload: {
        ok: true, data: { items: volumes.map(caseVolume => ({ caseVolume, state: 'ready' })) }
      } })
    }
    if (message.type === MessageType.SubmitFeeReduceFiling) {
      submits += 1
      if (submits === 1 && failure === 'flow status') {
        return Promise.resolve({ type: MessageType.SubmitFeeReduceFilingResult,
          payload: { ok: false, error: { code: 'FLOW_STATUS_UNVERIFIED', message: 'EASY 未确认递交单的最后流程状态。' } } })
      }
      return Promise.resolve({ type: MessageType.Error, payload: { message: 'EASY 连接已变化', feeBatchPause: submits === 1 ? 'verify' : 'not_sent' } })
    }
    throw new Error(`Unexpected request: ${message.type}`)
  })
  root = document.body.appendChild(document.createElement('div'))
  app = createApp(FeeReduceWorkflowPage)
  app.directive('hint', {})
  app.mount(root)
  await settle()
  const input = root.querySelector('textarea')!
  input.value = volumes.join('\n')
  input.dispatchEvent(new Event('input'))
  await nextTick()
  const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('.fr-actions button')]
    .find(item => item.textContent?.includes(label))!
  button('检索案件').click()
  await settle()
  button('递交已勾选').click()
  await settle()
  expect(submits).toBe(6)
  expect(root.textContent).toContain('待核对 1 件，未派发 11 件')
  expect(button('递交已勾选').disabled).toBe(true)
  button('重新检索本批未完成').click()
  await settle()
  expect(inspects).toEqual([volumes, volumes])
  expect(submits).toBe(6)
  expect(button('递交已勾选').textContent).toContain('11')
  expect(root.querySelector('.fr-table tbody tr')?.textContent).toContain('待核对')
})
