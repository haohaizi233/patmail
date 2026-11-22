import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { FeeSearchQuery } from '../../api/fee-search-params'
import type { FeeSearchResult, FeeSearchRow } from '../../api/fee-search-types'
import { isUnrequestedFee, sortFeeRows } from '../../application/billing/billing-validation'

export interface UseFeeSelectionOptions {
  result: Ref<FeeSearchResult | null>
  lastQuery: Ref<FeeSearchQuery | null>
  searchState: Ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>
  showTypeMode: Ref<'all' | 'selected'>
  pageSize: Ref<number>
  quickFeeSelectMode?: Ref<'' | 'O' | 'A'>
  getDefaultSelectionExclusion?: () => ((row: FeeSearchRow) => string) | undefined
  onSelectionChange?: (rows: FeeSearchRow[]) => void
}

const SNAPSHOT_RAW_FIELDS = [
  'word_count',
  'fee_desc',
  'out_bill_date',
  'agency_name_cn',
  'country',
  'law_fee_date',
] as const

export function cleanFeeRowForSnapshot(row: FeeSearchRow): FeeSearchRow {
  const raw = Object.fromEntries(
    SNAPSHOT_RAW_FIELDS.flatMap(key => {
      const value = row.raw[key]
      return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : []
    }),
  )
  return { ...row, raw }
}

export function useFeeSelection(options: UseFeeSelectionOptions) {
  const selectedIds = ref<Record<string, boolean>>({})
  const selectedCount = computed(() => Object.values(selectedIds.value).filter(Boolean).length)
  const selectedFeeIds = computed(() =>
    Object.entries(selectedIds.value)
      .filter(([, checked]) => checked)
      .map(([id]) => id),
  )
  const allKnownRows = ref<Map<string, FeeSearchRow>>(new Map())

  const selectedRowsList = computed(() => {
    const list = selectedFeeIds.value.map(id => allKnownRows.value.get(id)).filter((r): r is FeeSearchRow => Boolean(r))
    return sortFeeRows(list)
  })

  watch(
    selectedRowsList,
    rows => {
      options.onSelectionChange?.(rows)
    },
    { deep: true },
  )

  const selectingAll = ref(false)
  const failedPages = ref<number[]>([])
  const selectionNotice = ref('')
  const cachedPages = reactive(new Map<number, Set<string>>())
  const unrequestedOnlyBatch = ref(false)
  const selectionPending = computed(() => selectingAll.value || options.searchState.value === 'loading')
  const selectionIncomplete = computed(() => failedPages.value.length > 0 || options.searchState.value === 'error')

  const displayRows = computed(() => {
    if (!options.result.value) return []
    if (options.showTypeMode.value === 'selected') {
      return options.result.value.rows.filter(isRowSelected)
    }
    return options.result.value.rows
  })

  const totalPages = computed(() => {
    if (!options.result.value || options.result.value.total === 0) return 1
    return Math.ceil(options.result.value.total / (options.lastQuery.value?.pageSize ?? options.pageSize.value))
  })

  function isRowSelected(row: FeeSearchRow): boolean {
    return Boolean(selectedIds.value[row.feeId])
  }

  function toggleRow(row: FeeSearchRow, checked: boolean): void {
    selectedIds.value[row.feeId] = checked
  }

  function selectCurrentPage(select: boolean): void {
    if (!options.result.value) return
    for (const row of options.result.value.rows) {
      selectedIds.value[row.feeId] = select
    }
  }

  function clearAllSelected(): void {
    selectedIds.value = {}
    if (options.quickFeeSelectMode) options.quickFeeSelectMode.value = ''
    selectionNotice.value = ''
  }

  function deselectAllPages(): void {
    clearAllSelected()
  }

  function selectBulkRow(row: FeeSearchRow, unrequestedOnly: boolean): void {
    const exclude = options.getDefaultSelectionExclusion?.()
    selectedIds.value[row.feeId] = !unrequestedOnly || (isUnrequestedFee(row) && !exclude?.(row))
  }

  function applyQuickFeeSelect(mode: 'O' | 'A'): void {
    if (options.quickFeeSelectMode) options.quickFeeSelectMode.value = mode
    if (!options.result.value) return
    const targetLabel = mode === 'O' ? '官费' : '代理费'
    for (const row of options.result.value.rows) {
      const matched = row.feeClass === mode || row.feeClassName === targetLabel
      selectedIds.value[row.feeId] = matched
    }
  }

  function replaceBillingSelection(rows: FeeSearchRow[]): void {
    if (selectionPending.value || selectionIncomplete.value) return
    selectedIds.value = Object.fromEntries(
      rows.filter(row => allKnownRows.value.has(row.feeId)).map(row => [row.feeId, true]),
    )
    selectionNotice.value = ''
  }

  function resetSelectionState(): void {
    selectingAll.value = false
    failedPages.value = []
    allKnownRows.value.clear()
    cachedPages.clear()
    clearAllSelected()
  }

  return {
    selectedIds,
    selectedCount,
    selectedFeeIds,
    allKnownRows,
    selectedRowsList,
    selectingAll,
    failedPages,
    selectionNotice,
    cachedPages,
    unrequestedOnlyBatch,
    selectionPending,
    selectionIncomplete,
    displayRows,
    totalPages,
    isRowSelected,
    toggleRow,
    selectCurrentPage,
    clearAllSelected,
    deselectAllPages,
    selectBulkRow,
    applyQuickFeeSelect,
    replaceBillingSelection,
    resetSelectionState,
  }
}
