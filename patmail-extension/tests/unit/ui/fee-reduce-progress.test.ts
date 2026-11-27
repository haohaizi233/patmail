import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import FeeReduceWorkflowPage from '../../../src/app/pages/FeeReduceWorkflowPage.vue'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'
import { MessageType, type AppMessage } from '../../../src/shared/message'
import { emptyConnection } from '../../../src/shared/connection'

const request = vi.hoisted(() => vi.fn<(message: AppMessage) => Promise<unknown>>())
const confirm = vi.hoisted(() => vi.fn())
const recoveryState = vi.hoisted(() => new Map<string, unknown>())
const writeCheckpoint = vi.hoisted(() => vi.fn<(scope: string, value: unknown) => boolean>())
const readCheckpoint = vi.hoisted(() => vi.fn<(scope: string) => boolean>())
const connected = {
  ...emptyConnection('http://183.36.43.66:88'),
  sessionStatus: 'authenticated' as const, easyTabId: 1,
  operatorId: '11111111-1111-4111-8111-111111111111', connectionVersion: 1
}
const connection = ref(connected as ReturnType<typeof emptyConnection>)
vi.mock('../../../src/app/services/full-page-bridge', () => ({ createWorkflowBridge: () => ({ request }) }))
vi.mock('../../../src/app/composables/useWorkspace', () => ({
  useWorkspace: () => ({ connection })
}))
vi.mock('../../../src/settings/use-write-switch', () => ({ useWriteSwitch: () => ({ open: ref(true) }) }))
vi.mock('../../../src/app/dialog', () => ({ confirmDialog: confirm, infoDialog: vi.fn() }))
vi.mock('../../../src/recovery/client', () => ({
  createRecoveryClient: () => ({
    get: (_slot: string, scope: string) => readCheckpoint(scope) === false
      ? Promise.reject(new Error('测试：恢复账本读取失败')) : Promise.resolve(recoveryState.get(scope) ?? null),
    put: (_slot: string, scope: string, value: unknown) => {
      if (writeCheckpoint(scope, value) === false) return Promise.reject(new Error('测试：恢复账本写入失败'))
      recoveryState.set(scope, value)
      return Promise.resolve()
    },
    forget: (_slot: string, scope: string) => {
      recoveryState.delete(scope)
      return Promise.resolve()
    }
  })
}))

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
  recoveryState.clear()
  writeCheckpoint.mockReset()
  readCheckpoint.mockReset()
  connection.value = connected
})

function mountWorkbench() {
  root = document.body.appendChild(document.createElement('div'))
  app = createApp({ render: () => [h(CheckRainbow), h(FeeReduceWorkflowPage, { embedded: true, isActive: true })] })
  app.directive('hint', {})
  app.mount(root)
}

function inspectResponse(volumes: string[]) {
  return { type: MessageType.InspectFeeReduceCasesResult, payload: { ok: true, data: {
    items: volumes.map((caseVolume, index) => ({
      caseVolume, caseId: '', caseName: '', appNo: '', procId: '', procName: '', procStatus: '', reason: '',
      state: index === 1 ? 'not_found' : 'ready'
    }))
  } } }
}

it('shows account verification on refresh and retries a failed WAL read in the same connection', async () => {
  const scope = JSON.stringify(['fee-reduce-batch', connected.easyOrigin, connected.operatorId])
  recoveryState.set(scope, {
    kind: 'fee-reduce-batch-v1', id: 'reopen', entries: [{ caseVolume: 'CASE-1' }, { caseVolume: 'CASE-2' }]
  })
  recoveryState.set(`${scope}:cursor:reopen`, { nextIndex: 1 })
  let available = false
  readCheckpoint.mockImplementation(() => available)
  request.mockReset()
  request.mockResolvedValue({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
  connection.value = emptyConnection(connected.easyOrigin)
  mountWorkbench()
  await settle()
  expect(root.textContent).toContain('确认 EASY 登录后恢复上次费减进度')
  expect(readCheckpoint).not.toHaveBeenCalled()

  connection.value = connected
  await settle()
  const retry = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('重新读取恢复进度'))
  expect(retry).toBeDefined()
  expect(root.textContent).toContain('读取上次费减进度失败')
  expect(root.querySelector<HTMLButtonElement>('.fr-actions button')?.disabled).toBe(true)

  available = true
  retry?.click()
  await settle()
  expect(root.textContent).toContain('已恢复上次费减批次')
  expect(root.textContent).toContain('待核对 1 件，未派发 1 件')
  expect(progress()?.classList.contains('is-hold')).toBe(true)
  expect(root.textContent).not.toContain('读取上次费减进度失败')
  expect(request.mock.calls.every(([message]) => message.type === MessageType.ReadFeeReduceReviewers)).toBe(true)
})

it('automatically resumes from the durable page and keeps recovered results read-only', async () => {
  const volumes = Array.from({ length: 49 }, (_, index) => `CASE-${index + 1}`)
  const interrupted = deferred()
  const resumed = deferred()
  const remaining: string[][] = []
  request.mockReset()
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
    }
    if (message.type !== MessageType.InspectFeeReduceCases) throw new Error('Recovery must avoid writes')
    if (message.payload.caseVolumes.length === 48) return Promise.resolve(inspectResponse(message.payload.caseVolumes))
    remaining.push(message.payload.caseVolumes)
    return remaining.length === 1 ? interrupted.promise : resumed.promise
  })
  mountWorkbench()
  await settle()
  const input = root.querySelector('textarea')!
  input.value = volumes.join('\n')
  input.dispatchEvent(new Event('input'))
  await nextTick()
  root.querySelector<HTMLButtonElement>('.fr-actions button')!.click()
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('检索 48/49')
  expect(progress()?.classList.contains('is-run')).toBe(true)
  expect(request.mock.calls.filter(([message]) => message.type === MessageType.InspectFeeReduceCases)).toHaveLength(2)

  app?.unmount()
  root.remove()
  mountWorkbench()
  interrupted.resolve(inspectResponse(volumes.slice(48)))
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('检索 48/49')
  expect(progress()?.classList.contains('is-run')).toBe(true)
  expect(progress()?.getAttribute('aria-valuetext')).toContain('从检查点继续检索')
  expect(root.querySelector('textarea')?.value).toBe(volumes.join('\n'))
  const toggle = root.querySelector<HTMLButtonElement>('.fr-actions button[aria-pressed]')!
  expect(toggle.textContent).toContain('只看未查到（1）')
  toggle.click()
  await nextTick()
  expect(root.querySelectorAll('.fr-table tbody tr')).toHaveLength(1)
  expect(root.querySelector('.fr-table tbody tr')?.textContent).toContain('CASE-2')
  const submit = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('递交已勾选'))
  expect(submit?.disabled).toBe(true)
  expect(remaining).toEqual([volumes.slice(48), volumes.slice(48)])
  expect(request.mock.calls.filter(([message]) => message.type === MessageType.InspectFeeReduceCases)).toHaveLength(3)

  resumed.resolve(inspectResponse(volumes.slice(48)))
  await settle()
  expect(progress()?.getAttribute('aria-valuetext')).toContain('检索 49/49')
  expect(progress()?.classList.contains('is-done')).toBe(true)
  expect(submit?.disabled).toBe(true)
  expect(request.mock.calls.some(([message]) => message.type === MessageType.SubmitFeeReduceFiling)).toBe(false)
})

it('reconnects to the original account and resumes its read-only recheck without resending a submission', async () => {
  const volumes = Array.from({ length: 49 }, (_, index) => `CASE-${index + 1}`)
  const scope = JSON.stringify(['fee-reduce-batch', connected.easyOrigin, connected.operatorId])
  const inspection = `${scope}:inspection`
  recoveryState.set(scope, {
    kind: 'fee-reduce-batch-v1', id: 'pending-submission',
    entries: volumes.map(caseVolume => ({ caseVolume }))
  })
  recoveryState.set(`${scope}:cursor:pending-submission`, { nextIndex: 1 })
  recoveryState.set(inspection, { id: 'partial', volumes, reviewVolumes: ['CASE-1'], recheckBatchId: 'pending-submission' })
  recoveryState.set(`${inspection}:partial:progress`, { nextPage: 1, state: 'running' })
  recoveryState.set(`${inspection}:partial:0`, inspectResponse(volumes.slice(0, 48)).payload.data.items)
  const requested: string[][] = []
  request.mockReset()
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
    }
    if (message.type !== MessageType.InspectFeeReduceCases) throw new Error('Auto-resume must only send reads')
    requested.push(message.payload.caseVolumes)
    return Promise.resolve(requested.length === 1
      ? { type: MessageType.InspectFeeReduceCasesResult, payload: { ok: false,
        error: { code: 'SESSION_EXPIRED', message: 'EASY 登录已过期' } } }
      : inspectResponse(message.payload.caseVolumes))
  })
  mountWorkbench()
  await settle()
  expect(progress()?.classList.contains('is-hold')).toBe(true)
  expect(root.textContent).toContain('确认原 EASY 账号后自动继续')
  expect(requested).toEqual([volumes.slice(48)])
  expect(recoveryState.get(scope)).toBeDefined()

  connection.value = emptyConnection(connected.easyOrigin)
  await settle()
  connection.value = { ...connected, easyTabId: 2, connectionVersion: 2 }
  await settle()
  expect(requested).toEqual([volumes.slice(48), volumes.slice(48)])
  expect(progress()?.getAttribute('aria-valuetext')).toContain('检索 49/49')
  expect(root.querySelector('.fr-table tbody tr')?.textContent).toContain('待核对')
  expect(root.querySelector('.fr-table tbody tr input')?.getAttribute('disabled')).not.toBeNull()
  expect(request.mock.calls.some(([message]) => message.type === MessageType.SubmitFeeReduceFiling)).toBe(false)
})

it('restores pending work after refresh and only preselects cases beyond the durable cursor', async () => {
  const scope = JSON.stringify(['fee-reduce-batch', 'http://183.36.43.66:88', '11111111-1111-4111-8111-111111111111'])
  recoveryState.set(scope, {
    kind: 'fee-reduce-batch-v1', id: 'saved',
    entries: [{ caseVolume: 'CASE-0' }, { caseVolume: 'CASE-1' }, { caseVolume: 'CASE-2' }]
  })
  recoveryState.set(`${scope}:cursor:saved`, { nextIndex: 2, outcomes: 's..' })
  request.mockReset()
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
    }
    if (message.type !== MessageType.InspectFeeReduceCases) throw new Error('Writes cannot start during recovery')
    const inspected = inspectResponse(message.payload.caseVolumes)
    for (const item of inspected.payload.data.items) item.state = 'ready'
    return Promise.resolve(inspected)
  })
  mountWorkbench()
  await settle()
  expect(root.textContent).toContain('已恢复上次费减批次')
  expect(root.textContent).toContain('待核对 1 件，未派发 1 件')
  expect(root.querySelectorAll('.fr-table tbody tr')).toHaveLength(3)
  expect(root.querySelector('.fr-table tbody tr')?.textContent).toContain('已提交初核')
  expect(progress()?.getAttribute('aria-valuetext')).toContain('递交 1/3')
  const regularSearch = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('检索案件与处理状态'))
  expect(regularSearch?.disabled).toBe(true)
  const recheck = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('重新检索本批未完成'))!
  recheck.click()
  await settle()
  const result = root.querySelectorAll('.fr-table tbody tr')
  expect(result).toHaveLength(2)
  expect(result[0].textContent).toContain('待核对')
  expect(result[0].querySelector<HTMLInputElement>('input')?.checked).toBe(false)
  expect(result[1].querySelector<HTMLInputElement>('input')?.checked).toBe(true)

  app?.unmount()
  root.remove()
  mountWorkbench()
  await settle()
  expect(root.querySelector('.fr-table tbody tr')?.textContent).toContain('待核对')
  root.querySelector<HTMLButtonElement>('.fr-actions button')!.click()
  await settle()
  const rechecked = root.querySelectorAll('.fr-table tbody tr')
  expect(rechecked[0].querySelector<HTMLInputElement>('input')?.checked).toBe(false)
  expect(rechecked[1].querySelector<HTMLInputElement>('input')?.checked).toBe(true)
  expect(request.mock.calls.some(([message]) => message.type === MessageType.SubmitFeeReduceFiling)).toBe(false)
})

it('blocks fee writes if the first send cursor fails to persist', async () => {
  request.mockReset()
  confirm.mockResolvedValue(true)
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({ type: MessageType.ReadFeeReduceReviewersResult, payload: { ok: true, data: { reviewers: [] } } })
    }
    if (message.type === MessageType.InspectFeeReduceCases) return Promise.resolve(inspectResponse(message.payload.caseVolumes))
    throw new Error('A failed WAL checkpoint must prevent any fee write')
  })
  writeCheckpoint.mockImplementation((scope, value) => !scope.includes(':cursor:') ||
    (value as { nextIndex: number }).nextIndex === 0)
  mountWorkbench()
  await settle()
  const input = root.querySelector('textarea')!
  input.value = 'CASE-1'
  input.dispatchEvent(new Event('input'))
  await nextTick()
  const buttons = root.querySelectorAll<HTMLButtonElement>('.fr-actions button')
  buttons[0].click()
  await settle()
  buttons[1].click()
  await settle()
  expect(request.mock.calls.some(([message]) => message.type === MessageType.SubmitFeeReduceFiling)).toBe(false)
  expect(root.textContent).toContain('批次发出位置写入 WAL 失败')
  expect(root.textContent).toContain('未派发 1 件')
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
  const missingFilter = root.querySelector<HTMLButtonElement>('.fr-actions button[aria-pressed]')!
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
  expect(tableRows()[1].textContent).toContain(volumes[48])
  const lastReadyCheckbox = tableRows()[1].querySelector<HTMLInputElement>('input[type="checkbox"]')!
  lastReadyCheckbox.click()
  await nextTick()
  expect(buttons[1].textContent).toContain('1')
  lastReadyCheckbox.click()
  await nextTick()
  expect(buttons[1].textContent).toContain('2')
  nextPage().click()
  await nextTick()
  expect(tableRows()).toHaveLength(20)
  expect(tableRows()[0].textContent).toContain(volumes[19])
  nextPage().click()
  await nextTick()
  expect(tableRows()).toHaveLength(9)
  expect(nextPage().disabled).toBe(true)

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

it('automatically loads primary reviewers when EASY connection becomes authenticated after mount', async () => {
  request.mockReset()
  request.mockImplementation(message => {
    if (message.type === MessageType.ReadFeeReduceReviewers) {
      return Promise.resolve({
        type: MessageType.ReadFeeReduceReviewersResult,
        payload: {
          ok: true,
          data: {
            nodeName: '流程人员初核',
            reviewers: [
              { userId: 'rev-1', name: '王初核', count: 3 },
              { userId: 'rev-2', name: '李复核', count: 1 }
            ],
            message: '已读取 2 位初核人。'
          }
        }
      })
    }
    throw new Error(`Unexpected request: ${message.type}`)
  })
  connection.value = emptyConnection(connected.easyOrigin)
  mountWorkbench()
  await settle()
  expect(request).not.toHaveBeenCalled()

  connection.value = connected
  await settle()
  expect(request).toHaveBeenCalledWith({ type: MessageType.ReadFeeReduceReviewers })
  expect(root.textContent).toContain('王初核 (3)')
})
