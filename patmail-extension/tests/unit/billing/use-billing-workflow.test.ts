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
      void api.setStep(3)
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

  it('waits for WAL draft restore before scraping PBC rates on CNY-only Step 3 and never blocks CNY export', async () => {
    let resolveDraft!: (snapshot: BillingDeskSnapshot | null) => void
    const draftPromise = new Promise<BillingDeskSnapshot | null>(resolve => {
      resolveDraft = resolve
    })
    let resolveRates!: (value: { date: string; sourceUrl: string; perCny: Record<string, number> }) => void
    const ratesPromise = new Promise<{ date: string; sourceUrl: string; perCny: Record<string, number> }>(resolve => {
      resolveRates = resolve
    })
    const fetchRates = vi.fn(() => ratesPromise)

    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        fill: () => Promise.resolve({ bytes: new Uint8Array(), fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
      },
      exchangeRates: { fetchRates },
      downloads: {
        download: () => Promise.resolve({ status: 'download_started' as const, fileName: 'out.xlsx', blockCount: 1, warnings: [] }),
      },
      recovery: {
        load: () => draftPromise,
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
      expect(api.restoring.value).toBe(true)
      expect(fetchRates).not.toHaveBeenCalled()

      resolveDraft({
        version: 1,
        template: 'midea-pct',
        step: 3,
        headers: { title: '美的 PCT 恢复' },
        options: { reviewFee: 0, bankFee: 0 },
        extra: [],
        excluded: [],
        volumeInput: '',
        bills: {},
        syncKey: 'midea-pct\u0001',
        rates: {},
        clearedRates: {},
        rateDate: '',
      })

      await vi.waitFor(() => {
        expect(api.restoring.value).toBe(false)
        expect(fetchRates).toHaveBeenCalledTimes(1)
      })

      api.onFeeSelectionChange([
        feeRow({
          caseVolume: 'PA250001PCT',
          businessType: 'PCT国际阶段',
          currency: 'CNY',
          customerName: '美的小家电事业部',
        }),
      ])
      await nextTick()
      expect(api.ratesLoading.value).toBe(true)
      expect(api.exportDisabledReason.value).toBe('')
      expect(api.exportDisabled.value).toBe(false)

      resolveRates({
        date: '2026-11-24',
        sourceUrl: 'https://www.pbc.gov.cn/mock',
        perCny: { USD: 7.1234 },
      })
      await ratesPromise
      await nextTick()
      expect(api.pbcPerCny.value.USD).toBe(7.1234)
      expect(api.ratesLoading.value).toBe(false)
    } finally {
      app.unmount()
      root.remove()
    }
  })

  it('completes pure-CNY batch export even when background PBC rates resolve mid-export', async () => {
    let resolveRates!: (value: { date: string; sourceUrl: string; perCny: Record<string, number> }) => void
    const ratesPromise = new Promise<{ date: string; sourceUrl: string; perCny: Record<string, number> }>(resolve => {
      resolveRates = resolve
    })
    let notifyFillEntered!: () => void
    const fillEntered = new Promise<void>(resolve => {
      notifyFillEntered = resolve
    })
    let releaseFill!: () => void
    const fillGate = new Promise<void>(resolve => {
      releaseFill = resolve
    })
    let fillCount = 0

    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        async fill(_id, _bytes, input) {
          fillCount += 1
          if (fillCount === 1) notifyFillEntered()
          await fillGate
          return {
            bytes: new Uint8Array([1]),
            fileName: `${input.fileNameSuffix ?? 'out'}.xlsx`,
            blockCount: 1,
            warnings: [],
          }
        },
      },
      exchangeRates: { fetchRates: () => ratesPromise },
      downloads: {
        download: req =>
          Promise.resolve({
            status: 'download_completed' as const,
            downloadId: 1,
            fileName: req.fileName,
            savedFileName: req.fileName,
            blockCount: 1,
            warnings: [],
          }),
      },
      recovery: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
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
      await vi.waitFor(() => expect(api.ready.value).toBe(true))
      api.selectedTemplateId.value = 'midea-pct'
      await vi.waitFor(() => expect(api.ready.value).toBe(true))
      api.onFeeSelectionChange([
        feeRow({ feeId: 'cny-1', caseVolume: 'PA01PCT', businessType: 'PCT国际阶段', currency: 'CNY', customerName: '美的小家电事业部' }),
        feeRow({ feeId: 'cny-2', caseVolume: 'PA02PCT', businessType: 'PCT国际阶段', currency: 'CNY', customerName: '美的新能源事业部' }),
      ])
      void api.setStep(3)
      await nextTick()
      expect(api.ratesLoading.value).toBe(true)

      const exportPromise = api.doExportExcel()
      await fillEntered
      resolveRates({
        date: '2026-11-24',
        sourceUrl: 'https://www.pbc.gov.cn/mid-export',
        perCny: { USD: 7.1234 },
      })
      await ratesPromise
      await nextTick()
      releaseFill()
      await exportPromise

      expect(api.exportResultNotice.value).toContain('已按客户分表批量导出 2/2 份')
      expect(api.exportBatchItems.value).toHaveLength(2)
      expect(api.exportBatchItems.value.every(item => item.status === 'download_completed')).toBe(true)
    } finally {
      app.unmount()
      root.remove()
    }
  })

  it('allows complete manual FX rates with valid manualRateDate when cross-day PBC refresh fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 23, 10, 0))
    const fetchRates = vi
      .fn<() => Promise<{ date: string; sourceUrl: string; perCny: Record<string, number> }>>()
      .mockResolvedValueOnce({ date: '2026-11-23', sourceUrl: 'https://www.pbc.gov.cn/day1', perCny: { USD: 7.1 } })
      .mockRejectedValue(new Error('央行网络超时'))
    const capturedRates: Array<{ rateDate: string; rateSourceUrl?: string; usd: number }> = []

    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        fill: (_id, _bytes, input) => {
          capturedRates.push({ rateDate: input.rateDate, rateSourceUrl: input.rateSourceUrl, usd: input.rates.USD })
          return Promise.resolve({ bytes: new Uint8Array([1]), fileName: 'usd.xlsx', blockCount: 1, warnings: [] })
        },
      },
      exchangeRates: { fetchRates },
      downloads: {
        download: req =>
          Promise.resolve({
            status: 'download_completed' as const,
            downloadId: 7,
            fileName: req.fileName,
            savedFileName: req.fileName,
            blockCount: 1,
            warnings: [],
          }),
      },
      recovery: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
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
      await vi.advanceTimersByTimeAsync(0)
      api.onFeeSelectionChange([feeRow({ currency: 'USD', amount: 100 })])
      void api.setStep(3)
      await vi.advanceTimersByTimeAsync(0)
      expect(api.ratesDate.value).toBe('2026-11-23')

      vi.setSystemTime(new Date(2026, 10, 24, 10, 0))
      await api.doExportExcel()
      expect(api.exportResultNotice.value).toContain('央行网络超时')
      expect(capturedRates).toHaveLength(0)

      api.updateRate('USD', '7.15')
      api.manualRateDate.value = '2026-11-24'
      await api.doExportExcel()
      expect(capturedRates).toEqual([{ rateDate: '手工 2026-11-24', rateSourceUrl: '手工填写', usd: 7.15 }])
      expect(api.exportResultNotice.value).toContain('已导出并确认下载完成')
    } finally {
      app.unmount()
      root.remove()
      vi.useRealTimers()
    }
  })

  it('indexes filesByVolume in O(1), updates activeVolumes immutably, and persists drafts after bulk selection finishes', async () => {
    vi.useFakeTimers()
    const saveMock = vi.fn<(scope: string, snapshot: BillingDeskSnapshot) => Promise<void>>(() => Promise.resolve())
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
        save: saveMock,
      },
    })

    const mockSelectingAll = ref(true)
    const mockSnapshotRevision = ref(0)
    let api!: ReturnType<typeof useBillingWorkflow>
    const root = document.createElement('div')
    const app = createApp({
      setup() {
        api = useBillingWorkflow({ service })
        api.feeQueryRef.value = {
          selectionPending: false,
          selectionIncomplete: false,
          get selectingAll() {
            return mockSelectingAll.value
          },
          get snapshotRevision() {
            return mockSnapshotRevision.value
          },
          getKnownRows: () => [],
          replaceBillingSelection: () => {},
          billingSnapshot: () => ({ selectedIds: ['fee-1'] }),
          restoreBillingSnapshot: () => {},
        }
        return () => h('div')
      },
    })
    app.mount(root)
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(api.ready.value).toBe(true)

      api.fileSelection.value = {
        f1: { fileId: 'f1', fileName: '10001 PA250001US 费用账单 20261101.pdf', fileDescription: '付款INVOICE', customerName: '测试客户', caseVolume: 'PA250001US' },
        f2: { fileId: 'f2', fileName: '10002 PA250001US 补充账单 20261102.pdf', fileDescription: '付款INVOICE', customerName: '测试客户', caseVolume: 'PA250001US' },
      }
      await nextTick()
      expect(api.filesByVolume.value.get('PA250001US')).toHaveLength(2)

      api.customVolumeInput.value = 'PA250002US\nPA250003US'
      api.addCustomVolume()
      expect(api.activeVolumes.value).toEqual(['PA250001US', 'PA250002US', 'PA250003US'])

      // 批量翻页期间跳过增量 WAL 保存
      mockSnapshotRevision.value += 1
      await nextTick()
      await vi.advanceTimersByTimeAsync(500)
      expect(saveMock).not.toHaveBeenCalled()

      // 批量翻页结束后自动触发草稿持久化
      mockSelectingAll.value = false
      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      expect(saveMock).toHaveBeenCalledTimes(1)
      expect(saveMock.mock.calls[0]?.[1].extra).toEqual(['PA250002US', 'PA250003US'])
    } finally {
      app.unmount()
      root.remove()
      vi.useRealTimers()
    }
  })

  it('auto-revalidates recovered Step 1 bill queries in the background on fee search, step advance, and export', async () => {
    const filledFiles: string[] = []
    const service = new BillingApplicationService({
      templates: { loadTemplate: () => Promise.resolve(new Uint8Array()) },
      spreadsheet: {
        fill: (_id, _bytes, input) => {
          filledFiles.push(input.fileNameSuffix ?? 'ok')
          return Promise.resolve({ bytes: new Uint8Array([1]), fileName: 'out.xlsx', blockCount: 1, warnings: [] })
        },
      },
      exchangeRates: {
        fetchRates: () => Promise.resolve({ date: '2026-11-24', sourceUrl: 'https://www.pbc.gov.cn', perCny: { USD: 7.1 } }),
      },
      downloads: {
        download: req =>
          Promise.resolve({
            status: 'download_completed' as const,
            downloadId: 11,
            fileName: req.fileName,
            savedFileName: req.fileName,
            blockCount: 1,
            warnings: [],
          }),
      },
      recovery: {
        load: () => Promise.resolve(null),
        save: () => Promise.resolve(),
      },
    })

    const hasRecoveredQuery = ref(true)
    const canRefresh = ref(true)
    const searchError = ref(false)
    let simulateNextRefreshFail = false
    const refreshCalls: boolean[] = []
    let resolveRefresh: (() => void) | null = null

    let api!: ReturnType<typeof useBillingWorkflow>
    const root = document.createElement('div')
    const app = createApp({
      setup() {
        api = useBillingWorkflow({ service })
        api.filePanelRef.value = {
          selectAllPages: () => undefined,
          getBillingSelectionIssue: () =>
            searchError.value
              ? '账单查询失败，请重新查询。'
              : hasRecoveredQuery.value
                ? '请先刷新验证已恢复的账单查询。'
                : '',
          get hasRecoveredQuery() {
            return hasRecoveredQuery.value
          },
          get canRefresh() {
            return canRefresh.value
          },
          refresh: (scrollOnSuccess = true) => {
            refreshCalls.push(scrollOnSuccess)
            return new Promise<void>(resolve => {
              resolveRefresh = () => {
                if (simulateNextRefreshFail) {
                  searchError.value = true
                } else {
                  searchError.value = false
                  hasRecoveredQuery.value = false
                }
                resolve()
              }
            })
          },
        }
        return () => h('div')
      },
    })
    app.mount(root)
    try {
      await vi.waitFor(() => expect(api.ready.value).toBe(true))
      api.onFeeSelectionChange([feeRow({ currency: 'CNY', customerName: '歌尔股份有限公司' })])
      await nextTick()

      // 1. Step 2 query kicks off background Step 1 revalidation silently (scrollOnSuccess = false).
      api.onFeeSearch()
      expect(refreshCalls).toEqual([false])
      expect(resolveRefresh).not.toBeNull()
      resolveRefresh!()
      resolveRefresh = null
      await vi.waitFor(() => expect(api.fileSelectionIssue.value).toBe(''))

      // 2. Step 3 advance automatically awaits recovered-query refresh and enters Step 3 on success.
      hasRecoveredQuery.value = true
      await nextTick()
      const step3Promise = api.setStep(3)
      expect(api.stepNotice.value).toContain('正在自动验证已恢复的账单查询')
      await vi.waitFor(() => expect(resolveRefresh).not.toBeNull())
      resolveRefresh!()
      resolveRefresh = null
      await step3Promise
      expect(api.currentStep.value).toBe(3)
      expect(api.stepNotice.value).toBe('')
      expect(refreshCalls).toEqual([false, false])

      // 3. Failed refresh surfaces real error instead of advancing silently.
      api.currentStep.value = 2
      hasRecoveredQuery.value = true
      searchError.value = false
      simulateNextRefreshFail = true
      await nextTick()
      const failedStepPromise = api.setStep(3)
      await vi.waitFor(() => expect(resolveRefresh).not.toBeNull())
      resolveRefresh!()
      resolveRefresh = null
      await failedStepPromise
      expect(api.currentStep.value).toBe(2)
      expect(api.stepNotice.value).toBe('账单查询失败，请重新查询。')

      // 4. Direct Step 3 export auto-revalidates before generating workbook.
      simulateNextRefreshFail = false
      searchError.value = false
      api.currentStep.value = 3
      hasRecoveredQuery.value = true
      await nextTick()
      expect(api.exportDisabled.value).toBe(false)
      const exportPromise = api.doExportExcel()
      await vi.waitFor(() => expect(resolveRefresh).not.toBeNull())
      resolveRefresh!()
      resolveRefresh = null
      await exportPromise
      expect(hasRecoveredQuery.value).toBe(false)
      expect(filledFiles).toHaveLength(1)
      expect(api.exportResultNotice.value).toContain('已导出并确认下载完成')
    } finally {
      app.unmount()
      root.remove()
    }
  })

  it('isolates WAL drafts per billing template across switches and reloads', async () => {
    const store = new Map<string, string>()
    const memoryStorage: Storage = {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: key => store.get(key) ?? null,
      key: index => [...store.keys()][index] ?? null,
      removeItem: key => {
        store.delete(key)
      },
      setItem: (key, value) => {
        store.set(key, value)
      },
    }
    vi.stubGlobal('localStorage', memoryStorage)
    const wal = new Map<string, BillingDeskSnapshot>()
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
        load: scope => Promise.resolve(wal.get(scope) ?? null),
        save: (scope, snapshot) => {
          wal.set(scope, structuredClone(snapshot))
          return Promise.resolve()
        },
      },
    })

    const mountInstance = () => {
      let api!: ReturnType<typeof useBillingWorkflow>
      const snapshotRev = ref(0)
      let currentFees: string[] = []
      const root = document.createElement('div')
      const app = createApp({
        setup() {
          api = useBillingWorkflow({ service })
          api.feeQueryRef.value = {
            selectionPending: false,
            selectionIncomplete: false,
            get snapshotRevision() {
              return snapshotRev.value
            },
            getKnownRows: () => [],
            replaceBillingSelection: () => {},
            billingSnapshot: () => ({ selectedIds: [...currentFees] }),
            restoreBillingSnapshot: raw => {
              const obj = raw as { selectedIds?: string[] } | undefined
              currentFees = [...(obj?.selectedIds ?? [])]
            },
          }
          return () => h('div')
        },
      })
      app.mount(root)
      return {
        api,
        app,
        root,
        setFees(ids: string[]) {
          currentFees = ids
          snapshotRev.value += 1
        },
        getFees() {
          return currentFees
        },
      }
    }

    const first = mountInstance()
    try {
      await vi.waitFor(() => expect(first.api.ready.value).toBe(true))
      expect(first.api.selectedTemplateId.value).toBe('general-foreign')
      first.api.headerValues.value.title = '歌尔11月请款'
      first.api.customVolumeInput.value = 'PA-GOER-1'
      first.api.addCustomVolume()
      await first.api.setStep(2)
      first.setFees(['goer-fee-1'])
      await nextTick()

      // Switch to 美的 PCT: should flush 歌尔 draft to its own scope and load clean 美的 PCT
      first.api.selectedTemplateId.value = 'midea-pct'
      await vi.waitFor(() => expect(first.api.ready.value).toBe(true))
      const goerScope = JSON.stringify([LARGE_CUSTOMER_ORIGIN, '11111111-1111-4111-8111-111111111111', 'general-foreign'])
      const pctScope = JSON.stringify([LARGE_CUSTOMER_ORIGIN, '11111111-1111-4111-8111-111111111111', 'midea-pct'])
      expect(wal.get(goerScope)?.headers.title).toBe('歌尔11月请款')
      expect(wal.get(goerScope)?.extra).toEqual(['PA-GOER-1'])
      expect(wal.get(goerScope)?.fees).toEqual({ selectedIds: ['goer-fee-1'] })
      expect(first.api.activeVolumes.value).toEqual([])
      expect(first.api.headerValues.value.title).not.toBe('歌尔11月请款')

      first.api.headerValues.value.title = '美的PCT 11月'
      first.api.customVolumeInput.value = 'PA-PCT-2'
      first.api.addCustomVolume()
      await first.api.setStep(2)
      first.setFees(['pct-fee-2'])
      await nextTick()

      // Switch back to 歌尔: 美的 PCT flushed to pctScope, 歌尔 restored from goerScope
      first.api.selectedTemplateId.value = 'general-foreign'
      await vi.waitFor(() => expect(first.api.ready.value).toBe(true))
      expect(wal.get(pctScope)?.headers.title).toBe('美的PCT 11月')
      expect(wal.get(pctScope)?.extra).toEqual(['PA-PCT-2'])
      expect(first.api.headerValues.value.title).toBe('歌尔11月请款')
      expect(first.api.activeVolumes.value).toEqual(['PA-GOER-1'])
      expect(first.api.currentStep.value).toBe(2)
      expect(first.getFees()).toEqual(['goer-fee-1'])
    } finally {
      first.app.unmount()
      first.root.remove()
    }

    // Re-mount (simulates reload): restores active template (general-foreign) and switching opens midea-pct draft
    const second = mountInstance()
    try {
      await vi.waitFor(() => expect(second.api.ready.value).toBe(true))
      expect(second.api.selectedTemplateId.value).toBe('general-foreign')
      expect(second.api.headerValues.value.title).toBe('歌尔11月请款')
      expect(second.api.activeVolumes.value).toEqual(['PA-GOER-1'])

      second.api.selectedTemplateId.value = 'midea-pct'
      await vi.waitFor(() => expect(second.api.ready.value).toBe(true))
      expect(second.api.headerValues.value.title).toBe('美的PCT 11月')
      expect(second.api.activeVolumes.value).toEqual(['PA-PCT-2'])
      expect(second.api.currentStep.value).toBe(2)
      expect(second.getFees()).toEqual(['pct-fee-2'])
    } finally {
      second.app.unmount()
      second.root.remove()
      vi.unstubAllGlobals()
    }
  })

  it('falls back to legacy single-scope WAL draft when no template-scoped draft exists', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => {
        store.delete(key)
      },
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    } satisfies Storage)
    const legacyScope = JSON.stringify([LARGE_CUSTOMER_ORIGIN, '11111111-1111-4111-8111-111111111111'])
    const wal = new Map<string, BillingDeskSnapshot>([
      [
        legacyScope,
        {
          version: 1,
          template: 'midea-foreign',
          step: 2,
          headers: { title: '旧版美的涉外草稿' },
          options: { reviewFee: 0, bankFee: 0 },
          extra: ['PA-LEGACY-1'],
          excluded: [],
          volumeInput: '',
          bills: {},
          syncKey: 'midea-foreign\u0001PA-LEGACY-1',
          rates: {},
          clearedRates: {},
          rateDate: '',
        },
      ],
    ])
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
        load: scope => Promise.resolve(wal.get(scope) ?? null),
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
      await vi.waitFor(() => expect(api.ready.value).toBe(true))
      expect(api.selectedTemplateId.value).toBe('midea-foreign')
      expect(api.headerValues.value.title).toBe('旧版美的涉外草稿')
      expect(api.activeVolumes.value).toEqual(['PA-LEGACY-1'])
      expect(api.currentStep.value).toBe(2)
    } finally {
      app.unmount()
      root.remove()
      vi.unstubAllGlobals()
    }
  })
})
