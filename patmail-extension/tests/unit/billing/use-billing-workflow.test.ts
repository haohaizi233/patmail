import { createApp, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { LARGE_CUSTOMER_ORIGIN } from '../../../src/api/config'
import type { FeeSearchRow } from '../../../src/api/fee-search-types'
import type { BillingDeskSnapshot } from '../../../src/application/billing/billing-contracts'
import { BillingApplicationService } from '../../../src/application/billing/billing-service'
import { useBillingWorkflow } from '../../../src/app/composables/useBillingWorkflow'

vi.mock('../../../src/app/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    connection: ref({
      easyOrigin: LARGE_CUSTOMER_ORIGIN,
      operatorId: '11111111-1111-4111-8111-111111111111',
      lastOperatorId: '',
      displayName: '测试用户',
      lastDisplayName: '测试用户',
      easyTabId: 10,
      connectionVersion: 1,
      sessionStatus: 'authenticated',
      accountOffer: null,
      lastCheckedAt: '2026-11-22T00:00:00Z',
      message: 'ok',
    }),
  }),
}))

function feeRow(overrides: Partial<FeeSearchRow> = {}): FeeSearchRow {
  return {
    feeId: 'fee-1',
    caseId: 'case-1',
    procId: 'proc-1',
    sn: 1,
    caseVolume: 'PA250001CN',
    caseVolumeCustomer: 'CL-001',
    caseStatus: '正常',
    applyType: '发明',
    businessType: '专利',
    noticeStatus: '',
    requestStatus: '未请款',
    receiveStatus: '',
    payStatus: '',
    amount: 100,
    currency: 'USD',
    rate: 7.1,
    targetAmount: 710,
    targetCurrency: 'CNY',
    reviewStage: '',
    feeType: '申请费',
    appNo: 'CN2026001',
    appDate: '2026-05-10',
    requestNo: '',
    paymentNo: '',
    ctrlProc: '',
    feeClassName: '官方费用',
    feeClass: 'O',
    createTime: '2026-08-01',
    payDueDate: '2026-09-01',
    caseName: '测试案件',
    customerName: '测试客户',
    applicant: '测试客户',
    recieveAmount: '',
    billNo: '',
    invoiceNo: '',
    requestDate: '',
    payDate: '',
    receiveDueDate: '',
    receiveDate: '',
    finishDate: '2026-08-20',
    feeCustomer: '测试机构',
    flowUser: '',
    raw: {},
    ...overrides,
  }
}

describe('useBillingWorkflow doExportExcel preconditions', () => {
  it('does not poll while idle and uses a fresh announcement in the same export click', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 23, 9, 14))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const rates = (date: string, USD: number) => ({ date, sourceUrl: 'https://www.pbc.gov.cn', perCny: { USD } })
    const filledRates: Array<{ date: string; usd: number }> = []
    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        fill: (_id, _bytes, input) => {
          filledRates.push({ date: input.rateDate, usd: input.rates.USD })
          return Promise.resolve({ bytes: new Uint8Array(), fileName: 'out.xlsx', blockCount: 1, warnings: [] })
        },
      },
      exchangeRates: {
        fetchRates: vi.fn().mockResolvedValueOnce(rates('2026-11-20', 7.1)).mockResolvedValue(rates('2026-11-23', 7.2)),
      },
      downloads: { download: () => Promise.resolve({ status: 'failed', reason: 'fixture' }) },
      recovery: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
    })
    const fetchRates = vi.spyOn(service, 'fetchRates')
    let api!: ReturnType<typeof useBillingWorkflow>
    const app = createApp({ setup() { api = useBillingWorkflow({ service }); return () => h('div') } })
    app.mount(document.createElement('div'))
    try {
      await vi.advanceTimersByTimeAsync(0)
      api.onFeeSelectionChange([feeRow()])
      api.setStep(3)
      await vi.advanceTimersByTimeAsync(0)
      expect(api.ratesDate.value).toBe('2026-11-20')
      await vi.advanceTimersByTimeAsync(180_000)
      expect(api.ratesDate.value).toBe('2026-11-20')
      expect(fetchRates).toHaveBeenCalledTimes(1)
      await api.doExportExcel()
      expect(api.ratesDate.value).toBe('2026-11-23')
      expect(filledRates).toEqual([{ date: '2026-11-23', usd: 7.2 }])
      await api.doExportExcel()
      expect(fetchRates).toHaveBeenCalledTimes(3)
    } finally {
      app.unmount()
      visibility.mockRestore()
      vi.useRealTimers()
    }
  })

  it('checks export preconditions before overwriting notice/warnings or flipping exporting', async () => {
    let resolveRates: ((value: { date: string; sourceUrl: string; perCny: Record<string, number> }) => void) | undefined
    const service = new BillingApplicationService({
      templates: { loadTemplate: vi.fn(() => Promise.resolve(new Uint8Array())) },
      spreadsheet: {
        fill: vi.fn(() =>
          Promise.resolve({ bytes: new Uint8Array(), fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
        ),
      },
      exchangeRates: {
        fetchRates: vi.fn(
          () =>
            new Promise<{ date: string; sourceUrl: string; perCny: Record<string, number> }>(resolve => {
              resolveRates = resolve
            }),
        ),
      },
      downloads: {
        download: vi.fn(() =>
          Promise.resolve({ status: 'download_started' as const, fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
        ),
      },
      recovery: {
        load: vi.fn<() => Promise<BillingDeskSnapshot | null>>(() => Promise.resolve(null)),
        save: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    })
    const exportSpy = vi.spyOn(service, 'exportBilling')

    let api!: ReturnType<typeof useBillingWorkflow>
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp({
      setup() {
        api = useBillingWorkflow({ service })
        return () => h('div')
      },
    })
    app.mount(root)

    try {
      await vi.waitFor(() => {
        expect(api.ready.value).toBe(true)
      })

      // 1. Precondition failure sets reason without wiping existing warnings or calling exportBilling.
      api.exportWarnings.value = ['保留警告']
      await api.doExportExcel()
      expect(api.exporting.value).toBe(false)
      expect(api.exportResultNotice.value).toContain('步骤 2 还没有勾选费用')
      expect(api.exportWarnings.value).toEqual(['保留警告'])
      expect(exportSpy).not.toHaveBeenCalled()

      // 2. When ratesLoading is true, doExportExcel returns silently without altering notice/warnings.
      api.onFeeSelectionChange([feeRow()])
      await nextTick()
      const loadingPromise = api.loadPbcRates()
      expect(api.ratesLoading.value).toBe(true)
      api.exportResultNotice.value = '保留上次导出提示'
      api.exportWarnings.value = ['保留既有提示']

      await api.doExportExcel()
      expect(api.exporting.value).toBe(false)
      expect(api.exportResultNotice.value).toBe('保留上次导出提示')
      expect(api.exportWarnings.value).toEqual(['保留既有提示'])
      expect(exportSpy).not.toHaveBeenCalled()

      resolveRates?.({ date: '2026-11-22', sourceUrl: 'https://www.pbc.gov.cn', perCny: { USD: 7.1 } })
      await loadingPromise
    } finally {
      app.unmount()
      root.remove()
    }
  })

  it('defaults confirmPctExceptions to true and keeps it checked across selection changes', async () => {
    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        fill: () => Promise.resolve({ bytes: new Uint8Array(), fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
      },
      exchangeRates: {
        fetchRates: () => Promise.resolve({ date: '2026-11-24', sourceUrl: 'https://www.pbc.gov.cn', perCny: { USD: 7.1 } }),
      },
      downloads: {
        download: () => Promise.resolve({ status: 'download_started' as const, fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
      },
      recovery: {
        load: () => Promise.resolve(null),
        save: () => Promise.resolve(),
      },
    })

    let api!: ReturnType<typeof useBillingWorkflow>
    const root = document.createElement('div')
    const app = createApp({
      setup() {
        api = useBillingWorkflow({ service })
        return () => h('div')
      },
    })
    app.mount(root)
    try {
      await nextTick()
      expect(api.confirmPctExceptions.value).toBe(true)
      api.confirmPctExceptions.value = false
      api.onFeeSelectionChange([feeRow()])
      await nextTick()
      expect(api.confirmPctExceptions.value).toBe(true)
    } finally {
      app.unmount()
      root.remove()
    }
  })
})
