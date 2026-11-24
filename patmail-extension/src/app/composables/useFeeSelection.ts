import { computed, markRaw, ref, shallowRef, triggerRef, watch, type Ref } from 'vue'
import type { FeeSearchQuery } from '../../api/fee-search-params'
import type { FeeSearchResult, FeeSearchRow } from '../../api/fee-search-types'
import { cleanFeeRowForSnapshot, isUnrequestedFee, sortFeeRows } from '../../application/billing/billing-validation'

export { cleanFeeRowForSnapshot }

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

export function useFeeSelection(options: UseFeeSelectionOptions) {
  const selectedIds = shallowRef<Record<string, true>>({})
  const selectedFeeIds = computed(() => Object.keys(selectedIds.value))
  const selectedCount = computed(() => selectedFeeIds.value.length)
  const allKnownRows = shallowRef<Map<string, FeeSearchRow>>(new Map())
  const rowsRevision = ref(0)

  const selectedRowsList = computed(() => {
    void rowsRevision.value
    const known = allKnownRows.value
    const list: FeeSearchRow[] = []
    for (const id of selectedFeeIds.value) {
      const row = known.get(id)
      if (row) list.push(row)
    }
    return sortFeeRows(list)
  })

  const selectingAll = ref(false)
  watch([selectedIds, rowsRevision, selectingAll], () => {
    if (selectingAll.value) return
    options.onSelectionChange?.(selectedRowsList.value)
  })

  const failedPages = ref<number[]>([])
  const selectionNotice = ref('')
  const cachedPages = new Map<number, Set<string>>()
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

  function registerKnownRows(rows: Iterable<FeeSearchRow>, emitTrigger = !selectingAll.value): void {
    let changed = false
    const map = allKnownRows.value
    for (const row of rows) {
      const raw = markRaw(row)
      if (map.get(raw.feeId) !== raw) {
        map.set(raw.feeId, raw)
        changed = true
      }
    }
    if (changed && emitTrigger) {
      triggerRef(allKnownRows)
      rowsRevision.value += 1
    }
  }

  function finishBulkSelection(): void {
    triggerRef(allKnownRows)
    rowsRevision.value += 1
    selectingAll.value = false
  }

  function toggleRow(row: FeeSearchRow, checked: boolean): void {
    const next = { ...selectedIds.value }
    if (checked) {
      if (next[row.feeId]) return
      next[row.feeId] = true
    } else {
      if (!next[row.feeId]) return
      delete next[row.feeId]
    }
    selectedIds.value = next
  }

  function selectCurrentPage(select: boolean): void {
    if (!options.result.value) return
    const next = { ...selectedIds.value }
    let changed = false
    for (const row of options.result.value.rows) {
      if (select) {
        if (!next[row.feeId]) {
          next[row.feeId] = true
          changed = true
        }
      } else if (next[row.feeId]) {
        delete next[row.feeId]
        changed = true
      }
    }
    if (changed) selectedIds.value = next
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
    const shouldSelect = !unrequestedOnly || (isUnrequestedFee(row) && !exclude?.(row))
    const next = { ...selectedIds.value }
    if (shouldSelect) {
      if (next[row.feeId]) return
      next[row.feeId] = true
    } else {
      if (!next[row.feeId]) return
      delete next[row.feeId]
    }
    selectedIds.value = next
  }

  function applyBulkPageRows(rows: Iterable<FeeSearchRow>, unrequestedOnly: boolean, page?: number): void {
    const rowList = Array.isArray(rows) ? (rows as readonly FeeSearchRow[]) : Array.from(rows)
    if (page !== undefined) {
      cachedPages.set(page, new Set(rowList.map(row => row.feeId)))
    }
    registerKnownRows(rowList)
    const exclude = options.getDefaultSelectionExclusion?.()
    const next = { ...selectedIds.value }
    let selectedChanged = false
    for (const row of rowList) {
      const shouldSelect = !unrequestedOnly || (isUnrequestedFee(row) && !exclude?.(row))
      if (shouldSelect) {
        if (!next[row.feeId]) {
          next[row.feeId] = true
          selectedChanged = true
        }
      } else if (next[row.feeId]) {
        delete next[row.feeId]
        selectedChanged = true
      }
    }
    if (selectedChanged) selectedIds.value = next
    else if (page !== undefined) rowsRevision.value += 1
  }

  function applyQuickFeeSelect(mode: 'O' | 'A'): void {
    if (options.quickFeeSelectMode) options.quickFeeSelectMode.value = mode
    if (!options.result.value) return
    const targetLabel = mode === 'O' ? '官费' : '代理费'
    const next = { ...selectedIds.value }
    for (const row of options.result.value.rows) {
      const matched = row.feeClass === mode || row.feeClassName === targetLabel
      if (matched) next[row.feeId] = true
      else delete next[row.feeId]
    }
    selectedIds.value = next
  }

  function replaceBillingSelection(rows: FeeSearchRow[]): void {
    if (selectionPending.value || selectionIncomplete.value) return
    const next: Record<string, true> = {}
    for (const row of rows) {
      if (allKnownRows.value.has(row.feeId)) next[row.feeId] = true
    }
    selectedIds.value = next
    selectionNotice.value = ''
  }

  function resetSelectionState(): void {
    selectingAll.value = false
    failedPages.value = []
    allKnownRows.value.clear()
    cachedPages.clear()
    triggerRef(allKnownRows)
    rowsRevision.value += 1
    clearAllSelected()
  }

  return {
    selectedIds,
    selectedCount,
    selectedFeeIds,
    allKnownRows,
    rowsRevision,
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
    registerKnownRows,
    finishBulkSelection,
    applyBulkPageRows,
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
