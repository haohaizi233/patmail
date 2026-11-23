import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeeSearchQuery from '../../../src/app/components/FeeSearchQuery.vue'
import { MessageType, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'
import { resetTaskCheckProgress } from '../../../src/app/check-progress'
import type { FeeSearchRow } from '../../../src/api/fee-search-types'

vi.mock('../../../src/shell/components/ThemeSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue', 'options'],
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        return () =>
          h(
            'select',
            {
              value: props.modelValue,
              onChange: (event: Event) => emit('update:modelValue', Number((event.target as HTMLSelectElement).value))
            },
            (props.options as Array<{ value: number; label: string }>).map(option =>
              h('option', { value: option.value }, option.label)
            )
          )
      }
    })
  }
})

vi.mock('../../../src/shell/components/TreeOptionSelect.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue', 'choices'],
      emits: ['update:modelValue'],
      setup() {
        return () => h('div', { class: 'tree-mock' })
      }
    })
  }
})

vi.mock('../../../src/shell/components/WDatePicker.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue'],
      emits: ['update:modelValue'],
      setup() {
        return () => h('div', { class: 'date-mock' })
      }
    })
  }
})

type MaybeRef<T> = T | { value: T }

interface FeeSearchExpose {
  doSearch: (pageIndex?: number) => Promise<void> | void
  setValues: (patch: Record<string, string>) => void
  billingSnapshot: () => Record<string, unknown>
  restoreBillingSnapshot: (state: Record<string, unknown>) => void
  selectingAll: MaybeRef<boolean>
  selectedCount: MaybeRef<number>
  getSelectedRows: () => FeeSearchRow[]
}

function unwrapCount(v: MaybeRef<number>): number {
  return typeof v === 'number' ? v : v.value
}

function unwrapBool(v: MaybeRef<boolean>): boolean {
  return typeof v === 'boolean' ? v : v.value
}

let app: App | undefined
let compExpose: FeeSearchExpose | null = null

function vm(): FeeSearchExpose {
  if (!compExpose) throw new Error('FeeSearchQuery 未挂载')
  return compExpose
}

afterEach(() => {
  app?.unmount()
  app = undefined
  compExpose = null
  document.body.innerHTML = ''
  resetTaskCheckProgress()
  vi.clearAllMocks()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(
    node => node.textContent?.trim().includes(label)
  )
  if (!found) throw new Error(`Missing button with label containing ${label}`)
  return found
}

function mockFeeRow(index: number): FeeSearchRow {
  return {
    sn: index,
    feeId: `fee-guid-${index}`,
    caseId: `case-guid-${index}`,
    procId: `proc-guid-${index}`,
    caseVolume: `PA${2511250 + index}`,
    caseVolumeCustomer: `P2022${1560 + index}`,
    caseStatus: '发知',
    applyType: '发知',
    businessType: 'PCT实件进，未通知',
    noticeStatus: '未通知',
    requestStatus: '未请款',
    receiveStatus: '未收款',
    payStatus: '已缴费',
    feeType: '合作所代理',
    appNo: `2025-${55520 + index}`,
    amount: 2018.89,
    currency: 'USD',
    rate: 113.3333,
    targetAmount: 228807.47,
    targetCurrency: 'JPY',
    reviewStage: '',
    appDate: '2025-01-01',
    requestNo: '',
    paymentNo: '',
    ctrlProc: '后补译文',
    feeClass: 'A',
    feeClassName: '代理费',
    createTime: '2025-01-01',
    payDueDate: '2025-02-01',
    caseName: '测试案件',
    customerName: '美的工业技',
    applicant: '广东美芝制',
    recieveAmount: '',
    billNo: '',
    invoiceNo: '',
    requestDate: '',
    payDate: '',
    receiveDueDate: '',
    receiveDate: '',
    finishDate: '',
    feeCustomer: '',
    flowUser: '',
    raw: {}
  }
}

describe('FeeSearchQuery selection tests', () => {
  it('多页默认勾选、失败页重试及手动全选按每页 100 条翻页并使用正确的勾选范围', async () => {
    const total = 250
    const pageSize = 100
    const requestedPages: number[] = []
    const requestedPageSizes: number[] = []
    const requestedVolumes: Array<string | undefined> = []
    let thirdPageAttempts = 0

    const bridge: MessageBridge = {
      request: vi.fn(async (message: ContentRequest): Promise<ContentResponse> => {
        if (message.type === MessageType.SearchFee) {
          const pageIndex = message.payload.query.pageIndex
          requestedPages.push(pageIndex)
          requestedPageSizes.push(message.payload.query.pageSize)
          requestedVolumes.push(message.payload.query.case_volume)
          if (pageIndex === 3 && ++thirdPageAttempts <= 3) {
            return { type: MessageType.Error, payload: { message: 'fixture unavailable' } }
          }
          const start = (pageIndex - 1) * pageSize
          const end = Math.min(start + pageSize, total)
          const rows: FeeSearchRow[] = []
          for (let i = start + 1; i <= end; i++) {
            const row = mockFeeRow(i)
            if (i === total) row.requestStatus = '审核中'
            rows.push(row)
          }
          return {
            type: MessageType.SearchFeeResult,
            payload: {
              ok: true,
              data: {
                total,
                rows,
                summary: {
                  pageAgentFee: 0,
                  pageOfficialFee: 0,
                  pageThirdPartyFee: 0
                }
              }
            }
          }
        }
        if (message.type === MessageType.SearchFeeAmount) {
          return {
            type: MessageType.SearchFeeAmountResult,
            payload: { ok: true, data: { FeeList: [] } }
          }
        }
        return {
          type: MessageType.Error,
          payload: { message: `Unhandled ${message.type}` }
        }
      })
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    app = createApp({
      setup() {
        return () =>
          h(FeeSearchQuery, {
            ref: (el: unknown) => {
              compExpose = el as FeeSearchExpose | null
            },
            bridge,
            userId: 'user-1',
            canSearch: true
          })
      }
    })
    app.directive('hint', () => {})
    app.provide('bridge', bridge)
    app.mount(root)
    await settle()

    // 触发查询
    await vm().doSearch(1)
    await settle()
    await vi.waitFor(() => expect(unwrapBool(vm().selectingAll)).toBe(false), 3000)

    // 验证：3 页（1, 2, 3）都被请求，且每页 100 条
    expect(requestedPages).toContain(1)
    expect(requestedPages).toContain(2)
    expect(requestedPages).toContain(3)
    expect(requestedPageSizes.every(size => size === 100)).toBe(true)

    const currentSelectedCount = () => unwrapCount(vm().selectedCount)
    expect(currentSelectedCount()).toBe(200)
    button('重试没读到的页').click()
    await vi.waitFor(() => expect(currentSelectedCount()).toBe(249))
    expect(vm().getSelectedRows().some(row => row.requestStatus === '审核中')).toBe(false)

    // 验证：「取消全选所有」按钮可清空所有选择
    const deselectBtn = button('取消全选所有')
    expect(deselectBtn.disabled).toBe(false)
    deselectBtn.click()
    await settle()

    expect(currentSelectedCount()).toBe(0)
    expect(vm().getSelectedRows().length).toBe(0)

    // 验证：「全选所有」按钮可重新选回所有 250 条
    const selectAllBtn = button('全选所有')
    expect(selectAllBtn.disabled).toBe(false)
    selectAllBtn.click()
    await settle()

    expect(currentSelectedCount()).toBe(250)
    expect(vm().getSelectedRows().length).toBe(250)

    // 验证：「取消本页」仅取消当前第 1 页的 100 条（剩余 150 条依然被选中）
    const deselectCurrentPageBtn = button('取消本页')
    deselectCurrentPageBtn.click()
    await settle()

    expect(currentSelectedCount()).toBe(150)

    // 验证：「全选本页」重新勾上当前页的 100 条
    const selectCurrentPageBtn = button('全选本页')
    selectCurrentPageBtn.click()
    await settle()

    expect(currentSelectedCount()).toBe(250)

    vm().setValues({ case_volume: 'NEW-SCOPE' })
    const requestCountBeforeNext = requestedPages.length
    const topNextBtn = document.querySelector<HTMLButtonElement>('nav[aria-label="费用查询顶部分页"] button:last-of-type')
    expect(topNextBtn).not.toBeNull()
    topNextBtn!.click()
    await settle()
    expect(requestedPages.length).toBe(requestCountBeforeNext)
    expect(document.querySelector('nav[aria-label="费用查询顶部分页"] span')?.textContent).toBe('第 2 / 3 页')
    expect(document.querySelector('nav[aria-label="费用查询分页"] span')?.textContent).toBe('第 2 / 3 页')
    expect(document.querySelector('.fee-data-table tbody tr .seq-col')?.textContent?.trim()).toBe('101')
    expect(currentSelectedCount()).toBe(250)

    // 验证：「清空选择」清空全部
    const clearBtn = button('清空选择')
    clearBtn.click()
    await settle()

    expect(currentSelectedCount()).toBe(0)
  })

  it('单页默认全选所有：查询结果条数小于等于 pageSize 时直接全部勾选', async () => {
    const total = 5
    const requestedPages: number[] = []

    const bridge: MessageBridge = {
      request: vi.fn(async (message: ContentRequest): Promise<ContentResponse> => {
        if (message.type === MessageType.SearchFee) {
          const pageIndex = message.payload.query.pageIndex
          requestedPages.push(pageIndex)
          const rows: FeeSearchRow[] = []
          for (let i = 1; i <= total; i++) {
            rows.push(mockFeeRow(i))
          }
          return {
            type: MessageType.SearchFeeResult,
            payload: {
              ok: true,
              data: {
                total,
                rows,
                summary: {
                  pageAgentFee: 0,
                  pageOfficialFee: 0,
                  pageThirdPartyFee: 0
                }
              }
            }
          }
        }
        if (message.type === MessageType.SearchFeeAmount) {
          return { type: MessageType.SearchFeeAmountResult, payload: { ok: true, data: { FeeList: [] } } }
        }
        return { type: MessageType.Error, payload: { message: `Unhandled ${message.type}` } }
      })
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    app = createApp({
      setup() {
        return () =>
          h(FeeSearchQuery, {
            ref: (el: unknown) => {
              compExpose = el as FeeSearchExpose | null
            },
            bridge,
            userId: 'user-1',
            canSearch: true
          })
      }
    })
    app.directive('hint', () => {})
    app.provide('bridge', bridge)
    app.mount(root)
    await settle()

    await vm().doSearch(1)
    await settle()

    // 仅请求了第 1 页
    expect(requestedPages).toEqual([1])

    const currentSelectedCount = () => unwrapCount(vm().selectedCount)
    expect(currentSelectedCount()).toBe(5)
    expect(vm().getSelectedRows().length).toBe(5)
  })

  it('默认全选安全机制：排除已请款记录，点击「全选所有」可强制全选全部记录', async () => {
    const total = 10

    const bridge: MessageBridge = {
      request: vi.fn(async (message: ContentRequest): Promise<ContentResponse> => {
        if (message.type === MessageType.SearchFee) {
          const rows: FeeSearchRow[] = []
          for (let i = 1; i <= total; i++) {
            const r = mockFeeRow(i)
            // 前 3 项标记为「已请款」，其余 7 项为「未请款」
            if (i <= 3) r.requestStatus = '已请款'
            rows.push(r)
          }
          return {
            type: MessageType.SearchFeeResult,
            payload: {
              ok: true,
              data: {
                total,
                rows,
                summary: { pageAgentFee: 0, pageOfficialFee: 0, pageThirdPartyFee: 0 }
              }
            }
          }
        }
        if (message.type === MessageType.SearchFeeAmount) {
          return { type: MessageType.SearchFeeAmountResult, payload: { ok: true, data: { FeeList: [] } } }
        }
        return { type: MessageType.Error, payload: { message: `Unhandled ${message.type}` } }
      })
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    app = createApp({
      setup() {
        return () =>
          h(FeeSearchQuery, {
            ref: (el: unknown) => {
              compExpose = el as FeeSearchExpose | null
            },
            bridge,
            userId: 'user-1',
            canSearch: true
          })
      }
    })
    app.directive('hint', () => {})
    app.provide('bridge', bridge)
    app.mount(root)
    await settle()

    await vm().doSearch(1)
    await settle()

    const currentSelectedCount = () => unwrapCount(vm().selectedCount)
    // 默认全选应排除 3 项已请款记录，勾选 7 项未请款记录
    expect(currentSelectedCount()).toBe(7)

    // 用户点击「全选所有」按钮强制全选所有记录
    const selectAllBtn = button('全选所有')
    selectAllBtn.click()
    await settle()

    // 强制全选后为 10 项
    expect(currentSelectedCount()).toBe(10)
  })

  it('恢复旧版 pageSize=10 请款快照后，重新查询自动按每页 100 条翻页', async () => {
    const requestedPageSizes: number[] = []
    const total = 150

    const bridge: MessageBridge = {
      request: vi.fn(async (message: ContentRequest): Promise<ContentResponse> => {
        if (message.type === MessageType.SearchFee) {
          const { pageIndex, pageSize } = message.payload.query
          requestedPageSizes.push(pageSize)
          const start = (pageIndex - 1) * pageSize
          const end = Math.min(start + pageSize, total)
          const rows: FeeSearchRow[] = []
          for (let i = start + 1; i <= end; i++) rows.push(mockFeeRow(i))
          return {
            type: MessageType.SearchFeeResult,
            payload: {
              ok: true,
              data: {
                total,
                rows,
                summary: { pageAgentFee: 0, pageOfficialFee: 0, pageThirdPartyFee: 0 }
              }
            }
          }
        }
        if (message.type === MessageType.SearchFeeAmount) {
          return { type: MessageType.SearchFeeAmountResult, payload: { ok: true, data: { FeeList: [] } } }
        }
        return { type: MessageType.Error, payload: { message: `Unhandled ${message.type}` } }
      })
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    app = createApp({
      setup() {
        return () =>
          h(FeeSearchQuery, {
            ref: (el: unknown) => {
              compExpose = el as FeeSearchExpose | null
            },
            bridge,
            userId: 'user-1',
            canSearch: true
          })
      }
    })
    app.directive('hint', () => {})
    app.provide('bridge', bridge)
    app.mount(root)
    await settle()

    // 模拟从本地存储恢复旧版请款快照（pageSize: 10，无结果或带旧结果）
    const snapshot = vm().billingSnapshot()
    vm().restoreBillingSnapshot({ ...snapshot, pageSize: 10, result: null, query: null })
    await settle()
    expect(vm().billingSnapshot().pageSize).toBe(100)

    vm().restoreBillingSnapshot({
      ...snapshot,
      pageSize: 10,
      query: { pageIndex: 1, pageSize: 10 },
      result: { total: 10, rows: [mockFeeRow(1)], summary: { pageAgentFee: 0, pageOfficialFee: 0, pageThirdPartyFee: 0 } }
    })
    await settle()

    await vm().doSearch(1)
    await settle()
    await vi.waitFor(() => expect(unwrapBool(vm().selectingAll)).toBe(false), 3000)

    expect(requestedPageSizes).toEqual([100, 100])
    expect(unwrapCount(vm().selectedCount)).toBe(150)
  })
})
