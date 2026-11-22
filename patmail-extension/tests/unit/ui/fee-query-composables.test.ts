import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { FeeSearchQuery } from '../../../src/api/fee-search-params'
import type { FeeSearchResult, FeeSearchRow } from '../../../src/api/fee-search-types'
import { cleanFeeRowForSnapshot, useFeeSelection } from '../../../src/app/composables/useFeeSelection'
import { useFeeQueryTemplates, type SelectedCustomerRef } from '../../../src/app/composables/useFeeQueryTemplates'
import { closeDialog } from '../../../src/app/dialog'
import { MessageType, type MessageBridge } from '../../../src/shared/message'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function makeFeeRow(index: number, overrides: Partial<FeeSearchRow> = {}): FeeSearchRow {
  return {
    feeId: `fee-${index}`,
    caseVolume: `PA2026${index}`,
    customerName: '美的',
    feeType: index % 2 === 0 ? '代理费' : '申请费',
    feeClass: index % 2 === 0 ? 'A' : 'O',
    feeClassName: index % 2 === 0 ? '代理费' : '官费',
    currency: 'USD',
    amount: 100 * index,
    requestNo: '',
    requestStatus: '未请款',
    ctrlProc: '新申请',
    procId: `proc-${index}`,
    sn: index,
    raw: {
      word_count: '1200',
      secret_internal_token: 'do-not-persist',
      fee_desc: 'test',
    },
    ...overrides,
  } as FeeSearchRow
}

describe('useFeeSelection & useFeeQueryTemplates composables', () => {
  it('tracks cross-page fee selection, guards replacement when incomplete, and trims snapshots', () => {
    const row1 = makeFeeRow(1)
    const row2 = makeFeeRow(2, { requestNo: 'REQ-2', requestStatus: '已请款' })
    const row3 = makeFeeRow(3)
    const result = ref<FeeSearchResult | null>({
      total: 25,
      rows: [row1, row2],
      summary: { pageAgentFee: 200, pageOfficialFee: 100, pageThirdPartyFee: 0 },
    })
    const lastQuery = ref<FeeSearchQuery | null>({ pageIndex: 1, pageSize: 10 } as FeeSearchQuery)
    const searchState = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('success')
    const showTypeMode = ref<'all' | 'selected'>('all')
    const pageSize = ref(10)
    const quickFeeSelectMode = ref<'' | 'O' | 'A'>('')

    const selection = useFeeSelection({
      result,
      lastQuery,
      searchState,
      showTypeMode,
      pageSize,
      quickFeeSelectMode,
      getDefaultSelectionExclusion: () => row => (row.feeId === 'fee-3' ? '自定义排除' : ''),
    })

    selection.allKnownRows.value.set(row1.feeId, row1)
    selection.allKnownRows.value.set(row2.feeId, row2)
    selection.allKnownRows.value.set(row3.feeId, row3)

    expect(selection.totalPages.value).toBe(3)
    selection.selectBulkRow(row1, true)
    selection.selectBulkRow(row2, true)
    selection.selectBulkRow(row3, true)
    expect(selection.selectedFeeIds.value).toEqual(['fee-1'])

    selection.applyQuickFeeSelect('A')
    expect(quickFeeSelectMode.value).toBe('A')
    expect(selection.selectedFeeIds.value).toEqual(['fee-2'])

    showTypeMode.value = 'selected'
    expect(selection.displayRows.value.map(r => r.feeId)).toEqual(['fee-2'])

    selection.failedPages.value = [2]
    expect(selection.selectionIncomplete.value).toBe(true)
    selection.replaceBillingSelection([row1])
    expect(selection.selectedFeeIds.value).toEqual(['fee-2'])

    selection.failedPages.value = []
    selection.replaceBillingSelection([row3, row1])
    expect(selection.selectedRowsList.value.map(r => r.feeId)).toEqual(['fee-1', 'fee-3'])

    const cleaned = cleanFeeRowForSnapshot(row1)
    expect(cleaned.raw).toEqual({ word_count: '1200', fee_desc: 'test' })
    expect(cleaned.raw.secret_internal_token).toBeUndefined()

    selection.resetSelectionState()
    expect(selection.selectedCount.value).toBe(0)
    expect(selection.allKnownRows.value.size).toBe(0)
  })

  it('loads, applies, imports JSON templates, and resets template state cleanly', async () => {
    const values = ref<Record<string, string>>({ case_type: '', bill_no: 'B1' })
    const checkedBoxes = ref<Record<string, boolean>>({ is_agent: true })
    const selectedCustomers = ref<SelectedCustomerRef[]>([])
    const selectedRuleOutCustomers = ref<SelectedCustomerRef[]>([])
    const canRead = computed(() => true)
    const maybeExpandAdvanced = vi.fn()
    const onCustomersLoaded = vi.fn()
    const onRefreshCtrlProc = vi.fn()

    const queryXml = '<xmlRoot><case_type>1</case_type><country>US</country><bill_no>INV-9</bill_no></xmlRoot>'

    const bridge = {
      request: vi.fn((msg: { type: string }) => {
        if (msg.type === MessageType.ListHistoryQueries) {
          return Promise.resolve({
            type: MessageType.HistoryQueriesResult,
            payload: { ok: true, data: [{ id: '12345678-1234-1234-1234-1234567890ab', name: '美国模板' }] },
          })
        }
        if (msg.type === MessageType.GetHistoryQuery) {
          return Promise.resolve({
            type: MessageType.HistoryQueryResult,
            payload: { ok: true, data: { queryXml } },
          })
        }
        return Promise.resolve({ type: MessageType.Error, payload: { message: 'unexpected' } })
      }),
    } as unknown as MessageBridge

    const tpl = useFeeQueryTemplates({
      defaultValues: { case_type: '', bill_no: '' },
      values,
      checkedBoxes,
      selectedCustomers,
      selectedRuleOutCustomers,
      canRead,
      activeBridge: () => bridge,
      collectDisplayValues: () => ({}),
      maybeExpandAdvanced,
      onCustomersLoaded,
      onRefreshCtrlProc,
    })

    await tpl.loadTemplates(false)
    expect(tpl.templates.value).toHaveLength(1)
    await tpl.applyTemplate('12345678-1234-1234-1234-1234567890ab')
    expect(values.value.bill_no).toBe('INV-9')
    expect(tpl.saveName.value).toBe('美国模板')
    expect(onRefreshCtrlProc).toHaveBeenCalled()

    await tpl.applyTemplate('')
    expect(values.value.bill_no).toBe('')
    expect(checkedBoxes.value).toEqual({})

    tpl.resetTemplatesForUser()
    expect(tpl.templates.value).toEqual([])
    expect(tpl.selectedTemplateId.value).toBe('')
    tpl.disposeTemplates()
  })

  it('keeps the next template selection live when the previous template is deleted', async () => {
    const previous = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const next = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const deletion = deferred<unknown>()
    const nextDetail = deferred<unknown>()
    const entries = [{ id: previous, name: '原模板' }, { id: next, name: '下一份' }]
    const detail = (number: string) => ({
      type: MessageType.HistoryQueryResult,
      payload: { ok: true, data: { queryXml: `<xmlRoot><bill_no>${number}</bill_no></xmlRoot>` } },
    })
    const request = vi.fn(({ type, payload }: { type: string; payload?: { queryId?: string } }) => {
      if (type === MessageType.DeleteHistoryQuery) return deletion.promise
      if (type === MessageType.GetHistoryQuery) return payload?.queryId === next ? nextDetail.promise : Promise.resolve(detail('OLD'))
      return Promise.resolve({ type: MessageType.HistoryQueriesResult, payload: { ok: true, data: entries } })
    })
    const bridge = { request } as unknown as MessageBridge
    const values = ref<Record<string, string>>({ bill_no: '' })
    const tpl = useFeeQueryTemplates({
      defaultValues: { bill_no: '' }, values, checkedBoxes: ref({}), selectedCustomers: ref([]),
      selectedRuleOutCustomers: ref([]), canRead: ref(true), activeBridge: () => bridge,
      collectDisplayValues: () => ({}), maybeExpandAdvanced: vi.fn(), onCustomersLoaded: vi.fn(),
      onRefreshCtrlProc: vi.fn(),
    })
    await tpl.loadTemplates(false)
    await tpl.applyTemplate(previous)
    const deleting = tpl.deleteTemplate()
    closeDialog(true)
    await Promise.resolve()
    expect(tpl.deletingTemplate.value).toBe(true)
    request.mockClear()
    await tpl.applyTemplate(previous)
    expect(request).not.toHaveBeenCalled()
    const selecting = tpl.applyTemplate(next)
    deletion.resolve({ type: MessageType.HistoryQueryDeleted, payload: { ok: true } })
    await deleting
    nextDetail.resolve(detail('NEXT'))
    await selecting
    expect(tpl.selectedTemplateId.value).toBe(next)
    expect(tpl.applyingTemplate.value).toBe(false)
    expect(values.value.bill_no).toBe('NEXT')
    tpl.disposeTemplates()
  })

  it('keeps list and detail requests independent and ignores stale details after clearing or changing account', async () => {
    const list = deferred<unknown>()
    const details = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()]
    const request = vi.fn(({ type }: { type: string }) =>
      type === MessageType.ListHistoryQueries
        ? list.promise
        : type === MessageType.GetHistoryQuery
          ? details.shift()!.promise
          : Promise.resolve({ type: MessageType.Error, payload: { message: 'unexpected' } }),
    )
    const bridge = { request } as unknown as MessageBridge
    const [first, cleared, oldAccount] = details
    const values = ref<Record<string, string>>({ bill_no: 'FORM-BEFORE-LOAD' })
    const tpl = useFeeQueryTemplates({
      defaultValues: { bill_no: '' },
      values,
      checkedBoxes: ref({}),
      selectedCustomers: ref([]),
      selectedRuleOutCustomers: ref([]),
      canRead: ref(true),
      activeBridge: () => bridge,
      collectDisplayValues: () => ({}),
      maybeExpandAdvanced: vi.fn(),
      onCustomersLoaded: vi.fn(),
      onRefreshCtrlProc: vi.fn(),
    })
    const detail = {
      type: MessageType.HistoryQueryResult,
      payload: { ok: true, data: { queryXml: '<xmlRoot><bill_no>INV-OLD</bill_no></xmlRoot>' } },
    }
    const loading = tpl.loadTemplates(true)
    const selected = tpl.applyTemplate('first')
    tpl.saveName.value = '不会覆盖旧模板'
    await tpl.saveTemplate()
    expect(request).toHaveBeenCalledTimes(2)
    first.resolve(detail)
    list.resolve({
      type: MessageType.HistoryQueriesResult,
      payload: { ok: true, data: [{ id: 'first', name: '模板' }] },
    })
    await Promise.all([loading, selected])
    expect(tpl.loadingTemplates.value).toBe(false)
    expect(tpl.templates.value).toHaveLength(1)
    expect(values.value.bill_no).toBe('INV-OLD')

    const beforeClear = tpl.applyTemplate('first')
    await tpl.applyTemplate('')
    cleared.resolve(detail)
    await beforeClear
    expect(values.value.bill_no).toBe('')

    const beforeSwitch = tpl.applyTemplate('first')
    tpl.unknownTemplateFields.value = { accountSpecific: 'previous' }
    tpl.resetTemplatesForUser()
    oldAccount.resolve(detail)
    await beforeSwitch
    expect(values.value.bill_no).toBe('')
    expect(tpl.unknownTemplateFields.value).toEqual({})

    const id = '12345678-1234-1234-1234-1234567890ab'
    tpl.templates.value = [{ id, name: '旧账号模板', source: 'easy' }]
    tpl.selectedTemplateId.value = id
    const deletion = tpl.deleteTemplate()
    tpl.resetTemplatesForUser()
    closeDialog(true)
    await deletion
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ type: MessageType.DeleteHistoryQuery }))
  })
})
