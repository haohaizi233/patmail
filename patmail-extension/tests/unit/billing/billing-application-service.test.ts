import fs from 'node:fs'
import { webcrypto } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { FeeSearchRow } from '../../../src/api/fee-search-types'
import { BillingApplicationService, formatExportOutcomeNotice } from '../../../src/application/billing/billing-service'
import {
  buildBillingSyncKey,
  buildMideaPctDefaultExclusion,
  collectInvolvedCurrencies,
  collectPctCandidates,
  collectPctExceptions,
  computeActiveCaseVolumes,
  computeBillingReconciliation,
  computeEffectiveExchangeRates,
  extractBillMapFromFiles,
  filterPctExportExceptions,
  hasForeignCurrencyRows,
  isValidBillingTemplateId,
  validateBillingExportPreconditions,
  validateBillingFeeSelection,
} from '../../../src/application/billing/billing-validation'
import type { ExportOutcome } from '../../../src/application/billing/billing-contracts'
import {
  createBrowserBlobDownloadAdapter,
  createChromeExtensionDownloadsVerifier,
  createTrackedBillingDownloadAdapter,
  createVerifiedChromeDownloadAdapter,
  type ChromeDownloadDelta,
  type BillingDownloadTracking,
} from '../../../src/infrastructure/billing/billing-adapters'
import { defaultHeaders, fillBillingTemplate, type BillingTemplateId } from '../../../src/billing/templates'
import { XlsxBook } from '../../../src/billing/xlsx-engine'

const ASSETS_DIR = path.resolve(__dirname, '../../../src/assets/billing')

it('reconciles a persisted browser ID after a page remount without starting a duplicate', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture')
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  try {
    const ledger = new Map<string, unknown>()
    const tracking: BillingDownloadTracking = {
      get: key => Promise.resolve(ledger.get(key)),
      put: (key, record) => {
        ledger.set(key, record)
        return Promise.resolve()
      },
      lock: (_key, action) => action(),
    }
    const start = vi.fn(() => Promise.resolve(71))
    let state: 'in_progress' | 'complete' = 'in_progress'
    const search = vi.fn(() => Promise.resolve([{ state }]))
    const request = {
      bytes: new Uint8Array(8 * 1024 * 1024),
      fileName: 'fixture.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
      job: { scope: 'account-a', parameters: 'case selection' },
    }
    const adapter = () => createTrackedBillingDownloadAdapter({ download: start, search }, tracking)
    expect(await adapter().download(request)).toMatchObject({ status: 'download_started', downloadId: 71 })
    expect(await adapter().download(request)).toMatchObject({ status: 'unknown', downloadId: 71 })
    state = 'complete'
    expect(await adapter().download(request)).toMatchObject({ status: 'download_completed', downloadId: 71 })
    expect(start).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith({ id: 71 })
    expect(JSON.stringify([...ledger])).not.toContain('case selection')
  } finally {
    createUrl.mockRestore()
    revokeUrl.mockRestore()
    vi.unstubAllGlobals()
  }
})

const TEMPLATE_FILES: Record<BillingTemplateId, string> = {
  'general-foreign': 'qingkuan-general-foreign.xlsx',
  'midea-foreign': 'qingkuan-midea-foreign.xlsx',
  'midea-pct': 'qingkuan-midea-pct.xlsx',
}

function readAsset(id: BillingTemplateId): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(ASSETS_DIR, TEMPLATE_FILES[id])))
}

function mockFeeRow(partial: Partial<FeeSearchRow>): FeeSearchRow {
  return {
    feeId: 'fee-1',
    caseId: 'case-1',
    procId: 'proc-1',
    sn: 1,
    caseVolume: 'PA2411768CN-EP',
    caseVolumeCustomer: 'CL-001',
    caseStatus: '正常',
    applyType: '发明',
    businessType: '专利',
    noticeStatus: '',
    requestStatus: '未请款',
    receiveStatus: '',
    payStatus: '',
    amount: 1500,
    currency: 'EUR',
    rate: 7.85,
    targetAmount: 11775,
    targetCurrency: 'CNY',
    reviewStage: '',
    feeType: '申请费',
    appNo: 'EP2026001',
    appDate: '2026-05-10',
    requestNo: '',
    paymentNo: '',
    ctrlProc: '进入欧洲国家阶段',
    feeClassName: '第三方费用',
    feeClass: 'T',
    createTime: '2026-08-01',
    payDueDate: '2026-09-01',
    caseName: '无线通信装置',
    customerName: '美的小家电事业部',
    applicant: '美的小家电事业部',
    recieveAmount: '',
    billNo: '',
    invoiceNo: '',
    requestDate: '',
    payDate: '',
    receiveDueDate: '',
    receiveDate: '',
    finishDate: '2026-08-20',
    feeCustomer: '欧洲专利代理事务所',
    flowUser: '',
    raw: {},
    ...partial,
  }
}

function makeTestService(downloadOutcome?: ExportOutcome) {
  const saved: Array<{ scope: string; snapshot: unknown }> = []
  const service = new BillingApplicationService({
    templates: {
      loadTemplate: id => Promise.resolve(readAsset(id)),
    },
    spreadsheet: {
      fill: (id, bytes, input) => fillBillingTemplate(id, bytes, input),
    },
    exchangeRates: {
      fetchRates: () =>
        Promise.resolve({
          date: '2026-11-22',
          perCny: { USD: 7.1, EUR: 7.85, JPY: 0.048 },
          sourceUrl: 'https://www.pbc.gov.cn/mock',
        }),
    },
    downloads: {
      download: req =>
        Promise.resolve(
          downloadOutcome ?? {
            status: 'download_started',
            fileName: req.fileName,
            blockCount: req.blockCount,
            warnings: req.warnings,
          },
        ),
    },
    recovery: {
      load: () => Promise.resolve(null),
      save: (scope, snapshot) => {
        saved.push({ scope, snapshot })
        return Promise.resolve()
      },
    },
  })
  return { service, saved }
}

describe('BillingApplicationService Golden Master & Ports', () => {
  it('matches fillBillingTemplate semantic workbook output across all three billing templates', async () => {
    const { service } = makeTestService()
    const today = new Date('2026-11-22T00:00:00Z')

    const scenarios: Array<{
      id: BillingTemplateId
      rows: FeeSearchRow[]
      cellsToCompare: string[]
    }> = [
      {
        id: 'general-foreign',
        rows: [
          mockFeeRow({
            feeId: 'g-official',
            feeClass: 'O',
            feeType: '申请费',
            currency: 'USD',
            amount: 500,
          }),
          mockFeeRow({
            feeId: 'g-agent',
            feeClass: 'T',
            feeType: '合作所代理费',
            currency: 'USD',
            amount: 1200,
          }),
        ],
        cellsToCompare: ['A1', 'A2', 'B5', 'I5', 'O5', 'P5'],
      },
      {
        id: 'midea-foreign',
        rows: [
          mockFeeRow({
            feeId: 'm-outside',
            feeType: '合作所代理费',
            amount: 1400,
            currency: 'USD',
            raw: { fee_desc: '主动修改费用', out_bill_date: '2026-07-22', agency_name_cn: 'K&L' },
          }),
          mockFeeRow({
            feeId: 'm-translate',
            feeType: '合作所代理费',
            currency: 'CNY',
            amount: 1797.12,
            raw: { fee_desc: '7488 字*240 元/千字= 1797.12 元' },
          }),
        ],
        cellsToCompare: ['L7', 'S8', 'W9', 'X9', 'Y9', 'AH7'],
      },
      {
        id: 'midea-pct',
        rows: [
          mockFeeRow({
            feeId: 'p-1',
            caseVolume: 'PA2511001PCT',
            feeClass: 'O',
            feeType: '国际申请费',
            businessType: 'PCT 国际申请',
            currency: 'CHF',
            amount: 1330,
          }),
          mockFeeRow({
            feeId: 'p-2',
            caseVolume: 'PA2511001PCT',
            feeClass: 'A',
            feeType: '我方代理费',
            businessType: 'PCT 国际申请',
            currency: 'CNY',
            amount: 3000,
          }),
        ],
        cellsToCompare: ['B7', 'G7', 'K7', 'L7'],
      },
    ]

    for (const scenario of scenarios) {
      const input = {
        rows: scenario.rows,
        bills: {},
        rates: { CNY: 1, USD: 7.1, EUR: 7.85, CHF: 8.1 },
        rateDate: '2026-11-22',
        headers: defaultHeaders(scenario.id, today),
        options: { reviewFee: 100, bankFee: 250 },
        today,
      }
      const baseline = await fillBillingTemplate(scenario.id, readAsset(scenario.id), input)
      const outcome = await service.generateWorkbook(scenario.id, input)

      expect(outcome.status).toBe('generated')
      if (outcome.status !== 'generated') throw new Error('expected generated')

      expect(outcome.fileName).toBe(baseline.fileName)
      expect(outcome.blockCount).toBe(baseline.blockCount)
      expect(outcome.warnings).toEqual(baseline.warnings)

      const baseBook = await XlsxBook.open(baseline.bytes)
      const newBook = await XlsxBook.open(outcome.bytes)
      expect(newBook.sheets.map(s => s.name)).toEqual(baseBook.sheets.map(s => s.name))

      const targetSheetName = scenario.id === 'midea-foreign' ? baseBook.sheets[1].name : baseBook.sheets[0].name
      const baseSheet = baseBook.sheet(targetSheetName)
      const newSheet = newBook.sheet(targetSheetName)
      for (const ref of scenario.cellsToCompare) {
        expect(newSheet.valueOf(ref)).toEqual(baseSheet.valueOf(ref))
      }
    }
  })

  it('rejects stale export if context mutates during workbook generation', async () => {
    const { service } = makeTestService()
    const { outcome } = await service.exportBilling({
      templateId: 'general-foreign',
      rows: [mockFeeRow({ currency: 'CNY' })],
      bills: {},
      parameters: {
        headers: defaultHeaders('general-foreign'),
        options: { reviewFee: 0, bankFee: 0 },
        rates: { CNY: 1 },
        rateSourceUrl: '',
        rateDate: '2026-11-22',
      },
      fileSelectionIssue: '',
      feeSelectionIssue: '',
      reconciliationRequestedCount: 0,
      confirmExistingFees: false,
      pctExportExceptionsCount: 0,
      confirmPctExceptions: false,
      needsForeignRates: false,
      ratesCheckedOn: '2026-11-22',
      ratesLoading: false,
      missingRateCodes: [],
      usesManualRate: false,
      manualRateDate: '',
      today: new Date('2026-11-22T00:00:00Z'),
      isStale: () => true,
    })

    expect(outcome).toEqual({
      status: 'failed',
      reason: '生成期间请款范围或导出参数已变化，请核对后重新导出。',
    })
  })

  it('keeps browser blob download as download_started and verified chrome download states distinct', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blobAdapter = createBrowserBlobDownloadAdapter()
    const blobOutcome = await blobAdapter.download({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'test.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    expect(blobOutcome.status).toBe('download_started')
    expect(formatExportOutcomeNotice(blobOutcome)).toContain('已生成并触发浏览器下载（尚未确认落盘完成）：test.xlsx')

    const completeAdapter = createVerifiedChromeDownloadAdapter({
      download: () => Promise.resolve(42),
      search: () => Promise.resolve([{ state: 'complete' }]),
    })
    const completedOutcome = await completeAdapter.download({
      bytes: new Uint8Array([1, 2]),
      fileName: 'ok.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 2,
      warnings: [],
    })
    expect(completedOutcome.status).toBe('download_completed')
    expect(formatExportOutcomeNotice(completedOutcome)).toContain('已导出并确认下载完成：ok.xlsx')

    const interruptedAdapter = createVerifiedChromeDownloadAdapter({
      download: () => Promise.resolve(43),
      search: () => Promise.resolve([{ state: 'interrupted', error: 'USER_CANCELED' }]),
    })
    expect(
      await interruptedAdapter.download({
        bytes: new Uint8Array([1]),
        fileName: 'cancel.xlsx',
        mimeType: 'application/octet-stream',
        blockCount: 1,
        warnings: [],
      }),
    ).toEqual({ status: 'download_interrupted', reason: '下载中断：USER_CANCELED' })

    const unknownAdapter = createVerifiedChromeDownloadAdapter({
      download: () => Promise.resolve(44),
      search: () => Promise.resolve([]),
    })
    const unknownOutcome = await unknownAdapter.download({
      bytes: new Uint8Array([1]),
      fileName: 'missing.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    expect(unknownOutcome.status).toBe('unknown')

    const unreadableAdapter = createVerifiedChromeDownloadAdapter({
      download: () => Promise.resolve(45),
      search: () => Promise.reject(new Error('status unavailable')),
    })
    const unreadableOutcome = await unreadableAdapter.download({
      bytes: new Uint8Array([1]),
      fileName: 'unreadable.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    expect(unreadableOutcome).toMatchObject({ status: 'unknown', downloadId: 45 })

    // Event-driven chrome.downloads.onChanged tracking + cleanup guarantees
    const listeners = new Set<(delta: ChromeDownloadDelta) => void>()
    const onChangedAdapter = createVerifiedChromeDownloadAdapter(
      {
        download: () => Promise.resolve(101),
        search: () => Promise.resolve([{ state: 'in_progress' }]),
        onChanged: {
          addListener: cb => {
            listeners.add(cb)
          },
          removeListener: cb => {
            listeners.delete(cb)
          },
        },
      },
      { settleTimeoutMs: 500 },
    )
    const pendingComplete = onChangedAdapter.download({
      bytes: new Uint8Array([9]),
      fileName: 'async-ok.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(listeners.size).toBe(1)
    for (const cb of listeners) cb({ id: 999, state: { current: 'interrupted' } })
    for (const cb of listeners) cb({ id: 101, state: { current: 'complete' } })
    expect(await pendingComplete).toMatchObject({ status: 'download_completed', downloadId: 101 })
    expect(listeners.size).toBe(0)

    const onChangedInterrupted = createVerifiedChromeDownloadAdapter(
      {
        download: () => Promise.resolve(102),
        search: () => Promise.resolve([{ state: 'in_progress' }]),
        onChanged: {
          addListener: cb => {
            listeners.add(cb)
          },
          removeListener: cb => {
            listeners.delete(cb)
          },
        },
      },
      { settleTimeoutMs: 500 },
    )
    const pendingInterrupt = onChangedInterrupted.download({
      bytes: new Uint8Array([9]),
      fileName: 'async-fail.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    await Promise.resolve()
    await Promise.resolve()
    for (const cb of listeners) {
      cb({ id: 102, state: { current: 'interrupted' }, error: { current: 'DISK_FULL' } })
    }
    expect(await pendingInterrupt).toEqual({ status: 'download_interrupted', reason: '下载中断：DISK_FULL' })
    expect(listeners.size).toBe(0)

    const timeoutAdapter = createVerifiedChromeDownloadAdapter(
      {
        download: () => Promise.resolve(103),
        search: () => Promise.resolve([{ state: 'in_progress' }]),
        onChanged: {
          addListener: cb => {
            listeners.add(cb)
          },
          removeListener: cb => {
            listeners.delete(cb)
          },
        },
      },
      { settleTimeoutMs: 15 },
    )
    const timeoutOutcome = await timeoutAdapter.download({
      bytes: new Uint8Array([9]),
      fileName: 'timeout.xlsx',
      mimeType: 'application/octet-stream',
      blockCount: 1,
      warnings: [],
    })
    expect(timeoutOutcome).toMatchObject({ status: 'unknown', downloadId: 103 })
    expect(listeners.size).toBe(0)

    const fastRaceAdapter = createVerifiedChromeDownloadAdapter(
      {
        download: () => Promise.resolve(104),
        search: () => Promise.resolve([{ state: 'complete' }]),
        onChanged: {
          addListener: cb => {
            listeners.add(cb)
          },
          removeListener: cb => {
            listeners.delete(cb)
          },
        },
      },
      { settleTimeoutMs: 500 },
    )
    expect(
      await fastRaceAdapter.download({
        bytes: new Uint8Array([9]),
        fileName: 'fast.xlsx',
        mimeType: 'application/octet-stream',
        blockCount: 1,
        warnings: [],
      }),
    ).toMatchObject({ status: 'download_completed', downloadId: 104 })
    expect(listeners.size).toBe(0)
    expect(createChromeExtensionDownloadsVerifier()).toBeNull()

    for (const searchFailure of [false, true]) {
      const adapter = createVerifiedChromeDownloadAdapter(
        {
          download: () => Promise.resolve(105),
          search: () => (searchFailure ? Promise.reject(new Error('status unavailable')) : Promise.resolve([])),
          onChanged: {
            addListener: cb => {
              listeners.add(cb)
            },
            removeListener: cb => {
              listeners.delete(cb)
            },
          },
        },
        { settleTimeoutMs: 1000 },
      )
      const pending = adapter.download({
        bytes: new Uint8Array([9]),
        fileName: 'slow.xlsx',
        mimeType: 'application/octet-stream',
        blockCount: 1,
        warnings: [],
      })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(listeners.size).toBe(1)
      for (const cb of listeners) cb({ id: 105, state: { current: 'complete' } })
      expect(await pending).toMatchObject({ status: 'download_completed', downloadId: 105 })
    }

    const earlyAdapter = createVerifiedChromeDownloadAdapter(
      {
        download: () => {
          for (const cb of listeners) {
            cb({ id: 106, state: { current: 'complete' } })
            cb({ id: 106 })
          }
          return Promise.resolve(106)
        },
        search: () => Promise.resolve([]),
        onChanged: {
          addListener: cb => {
            listeners.add(cb)
          },
          removeListener: cb => {
            listeners.delete(cb)
          },
        },
      },
      { settleTimeoutMs: 100 },
    )
    expect(
      await earlyAdapter.download({
        bytes: new Uint8Array([9]),
        fileName: 'early.xlsx',
        mimeType: 'application/octet-stream',
        blockCount: 1,
        warnings: [],
      }),
    ).toMatchObject({ status: 'download_completed', downloadId: 106 })
    expect(listeners.size).toBe(0)

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    clickSpy.mockRestore()
  })

  it('validates preconditions, PCT candidates, exchange rates, and volume sets consistently', () => {
    expect(isValidBillingTemplateId('midea-foreign')).toBe(true)
    expect(isValidBillingTemplateId('unknown')).toBe(false)
    expect(buildBillingSyncKey('midea-pct', ['B', 'A'])).toBe('midea-pct\u0001A\nB')

    const bills = extractBillMapFromFiles(
      {
        f1: {
          fileId: 'f1',
          fileName: 'INV2026001 PA2411768CN-EP 新申请 20260722.pdf',
          fileDescription: '付款INVOICE',
          customerName: '美的',
          caseVolume: 'PA2411768CN-EP',
        },
      },
      {},
    )
    expect(Object.keys(bills)).toEqual(['PA2411768CN-EP'])
    expect(computeActiveCaseVolumes(['PA1', 'PA2'], ['PA3'], ['PA2'])).toEqual(['PA1', 'PA3'])

    const effective = computeEffectiveExchangeRates({ USD: 7.1, EUR: 7.8 }, { USD: 7.15 }, { EUR: true })
    expect(effective).toEqual({ CNY: 1, USD: 7.15 })

    const rows = [
      mockFeeRow({
        feeId: 'p-ok',
        caseVolume: 'PA25001PCT',
        businessType: 'PCT 国际申请',
        feeClass: 'O',
        feeType: '国际申请费',
        customerName: '美的集团',
        currency: 'CHF',
      }),
      mockFeeRow({
        feeId: 'p-bad',
        caseVolume: 'PA25002PCT',
        businessType: 'PCT 国际申请',
        feeClass: 'O',
        feeType: '无效官费名称',
        customerName: '美的集团',
        currency: 'CNY',
      }),
    ]
    expect(hasForeignCurrencyRows(rows)).toBe(true)
    expect(collectInvolvedCurrencies(rows)).toContain('CHF')
    expect(collectPctCandidates(rows).get('美的集团')).toHaveLength(1)
    const exceptions = collectPctExceptions(rows)
    expect(exceptions).toHaveLength(1)
    expect(filterPctExportExceptions(exceptions, '美的集团')).toHaveLength(1)

    const exclusion = buildMideaPctDefaultExclusion(true)
    expect(exclusion?.(mockFeeRow({ customerName: '' }))).toBe('客户名称缺失')
    expect(exclusion?.(mockFeeRow({ customerName: '其他公司' }))).toBe('不属于美的客户')

    const reconciliation = computeBillingReconciliation('general-foreign', rows, {})
    expect(reconciliation.totalCases).toBe(2)
    expect(
      validateBillingFeeSelection({
        selectionPending: true,
        selectionIncomplete: false,
        selectedCount: 1,
        ready: true,
        syncKeyMatches: true,
        isMideaPct: false,
        selectedFeeRows: rows,
      }),
    ).toContain('费用还在读取')

    expect(
      validateBillingExportPreconditions({
        templateId: 'general-foreign',
        rows,
        bills: {},
        parameters: {
          headers: {},
          options: { reviewFee: 0, bankFee: 0 },
          rates: {},
          rateSourceUrl: '',
          rateDate: '',
        },
        fileSelectionIssue: '',
        feeSelectionIssue: '',
        reconciliationRequestedCount: 1,
        confirmExistingFees: false,
        pctExportExceptionsCount: 0,
        confirmPctExceptions: false,
        needsForeignRates: false,
        ratesCheckedOn: '2026-11-22',
        ratesLoading: false,
        missingRateCodes: [],
        usesManualRate: false,
        manualRateDate: '',
        today: new Date('2026-11-22T00:00:00Z'),
      }),
    ).toEqual({ ok: false, reason: '请确认已立单或状态待核对的费用后再导出。' })
  })
})
