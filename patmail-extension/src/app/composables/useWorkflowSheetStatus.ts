import { computed, ref, watch, type Ref } from 'vue'
import { MAILED_UNFINISHED_REVIEW, SKIP_SEND_REVIEW, reviewNeedsArbitration } from '../../customer/pct-flow-status'
import type { PctTaskRow } from '../../customer/types'

export interface WorkflowIcHit {
  found: boolean
  gate: '' | 'open' | 'pending' | 'done'
  uncontrolled?: true
  skipSend?: true
  unread?: true
  statusUnread?: true
}

export interface WorkflowOutcomeBar {
  key: string
  label: string
  count: number
  color: string
  percent: number
}

export interface UseWorkflowSheetStatusOptions {
  rows: Ref<PctTaskRow[]>
  icPhase: Ref<'idle' | 'run' | 'done' | 'fail'>
  icEpoch: Ref<number>
  getIcHits: () => Record<string, WorkflowIcHit>
  limitByKey: Record<string, string>
  abnormalKeys: Ref<Set<string>>
  allowMailedUnfinished: Ref<boolean>
  pageSize?: number
}

export function normalizeWorkflowVolumeKey(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

export function buildWorkflowIcKey(volume: string, procLabel: string): string {
  return `${normalizeWorkflowVolumeKey(volume)}\n${procLabel.trim()}`
}

export function workflowRowVolumeKey(row: Pick<PctTaskRow, 'ourVolume' | 'customerVolume'>): string {
  return row.ourVolume.trim() || row.customerVolume
}

export function formatWorkflowReviewLabel(
  gate: 'open' | 'pending' | 'done' | undefined,
  hit?: { uncontrolled?: true; skipSend?: true },
): string {
  if (hit?.skipSend) return SKIP_SEND_REVIEW
  if (gate === 'pending') return '已提交审核'
  if (gate === 'done' && hit?.uncontrolled) return MAILED_UNFINISHED_REVIEW
  if (gate === 'done') return '已经审核通过'
  if (gate === 'open') return '还没提交审核'
  return '—'
}

export function workflowStatusShade(text: string): string {
  if (text === '还没提交审核') return 'shade-open'
  if (text === '已经审核通过') return 'shade-done'
  if (text === MAILED_UNFINISHED_REVIEW) return 'shade-mailed'
  if (text === SKIP_SEND_REVIEW) return 'shade-skip'
  if (text === '已提交审核') return 'shade-pending'
  if (text === '异常') return 'shade-abnormal'
  if (text === '库里没有' || text === '没查成') return 'shade-missing'
  return ''
}

export function useWorkflowSheetStatus(options: UseWorkflowSheetStatusOptions) {
  const pageSize = options.pageSize ?? 100
  const sheetPage = ref(1)
  const sheetPages = computed(() => Math.max(1, Math.ceil(options.rows.value.length / pageSize)))
  const sheetPageSafe = computed(() => Math.min(sheetPage.value, sheetPages.value))
  const sheetSeen = ref<number[]>([1])

  watch(sheetPageSafe, page => {
    if (!sheetSeen.value.includes(page)) sheetSeen.value = [...sheetSeen.value, page]
  })

  function rowsOnSheetPage(page: number): PctTaskRow[] {
    const start = (page - 1) * pageSize
    return options.rows.value.slice(start, start + pageSize)
  }

  function resetSheetPages(): void {
    sheetPage.value = 1
    sheetSeen.value = [1]
  }

  function setSheetPage(page: number): void {
    sheetPage.value = Math.min(Math.max(1, page), sheetPages.value)
  }

  function limitReview(row: PctTaskRow): string {
    return options.limitByKey[buildWorkflowIcKey(workflowRowVolumeKey(row), row.procLabel)] ?? ''
  }

  function sheetReview(row: PctTaskRow): { found: string; review: string } {
    const published = options.icEpoch.value
    const fromLimit = limitReview(row)
    const hit =
      published >= 0 ? options.getIcHits()[buildWorkflowIcKey(workflowRowVolumeKey(row), row.procLabel)] : undefined
    if (hit) {
      if (hit.unread) return { found: '没查成', review: '—' }
      if (hit.statusUnread) return { found: '有', review: '状态没读到' }
      if (!hit.found) {
        if (fromLimit && fromLimit !== '…') return { found: '有', review: fromLimit }
        return { found: '库里没有', review: '—' }
      }
      const fromFlow = hit.gate ? formatWorkflowReviewLabel(hit.gate, hit) : ''
      if (fromLimit === '还没提交审核' && fromFlow === '已经审核通过') {
        return { found: '有', review: fromLimit }
      }
      if (fromFlow === '还没提交审核' && (fromLimit === '已提交审核' || fromLimit === '已经审核通过')) {
        return { found: '有', review: fromLimit }
      }
      if (fromFlow) return { found: '有', review: fromFlow }
      if (fromLimit && fromLimit !== '…') return { found: '有', review: fromLimit }
      return { found: '有', review: fromLimit === '…' ? '…' : '没有这项处理事项' }
    }
    if (fromLimit) return { found: '有', review: fromLimit }
    if (options.icPhase.value === 'fail') return { found: '没查成', review: '—' }
    if (options.icPhase.value === 'run') return { found: '正在查', review: '…' }
    if (options.icPhase.value === 'done') return { found: '库里没有', review: '—' }
    return { found: '', review: '' }
  }

  function sheetStatus(row: PctTaskRow): { found: string; review: string } {
    const base = sheetReview(row)
    if (options.abnormalKeys.value.has(buildWorkflowIcKey(workflowRowVolumeKey(row), row.procLabel))) {
      return { found: base.found || '有', review: '异常' }
    }
    return base
  }

  function rowsForArbitration(): PctTaskRow[] {
    return options.rows.value.filter(row =>
      reviewNeedsArbitration(sheetStatus(row).review, options.allowMailedUnfinished.value),
    )
  }

  const flowByKey = computed(() => {
    const out: Record<string, string> = {}
    for (const row of options.rows.value) {
      const review = sheetStatus(row).review
      if (!review || review === '—' || review === '…') continue
      out[buildWorkflowIcKey(workflowRowVolumeKey(row), row.procLabel)] = review
    }
    return out
  })

  const outcomePack = computed(() => {
    const empty = { text: '', bars: [] as WorkflowOutcomeBar[] }
    if (!options.rows.value.length) return empty
    let pending = 0
    let submitted = 0
    let mailed = 0
    let done = 0
    let missing = 0
    let unread = 0
    let noProc = 0
    let statusMiss = 0
    let checking = 0
    let abnormal = 0
    let skipped = 0
    for (const row of options.rows.value) {
      const status = sheetStatus(row)
      if (status.review === '异常') abnormal += 1
      else if (status.found === '库里没有') missing += 1
      else if (status.found === '没查成') unread += 1
      else if (status.found === '正在查' || status.review === '…') checking += 1
      else if (status.review === '还没提交审核') pending += 1
      else if (status.review === '已提交审核') submitted += 1
      else if (status.review === MAILED_UNFINISHED_REVIEW) mailed += 1
      else if (status.review === SKIP_SEND_REVIEW) skipped += 1
      else if (status.review === '已经审核通过') done += 1
      else if (status.review === '没有这项处理事项') noProc += 1
      else if (status.review === '状态没读到') statusMiss += 1
      else if (options.icPhase.value === 'run') checking += 1
      else missing += 1
    }
    const text = [
      pending ? `还有 ${pending} 行待处理。提交时只发勾上的，一件一封。` : '没有待处理的行。',
      submitted ? `已提交审核 ${submitted} 行。` : '',
      mailed ? `${MAILED_UNFINISHED_REVIEW} ${mailed} 行。` : '',
      skipped ? `${SKIP_SEND_REVIEW} ${skipped} 行。` : '',
      done ? `已经审核通过 ${done} 行。` : '',
      missing ? `库里没有 ${missing} 行。` : '',
      unread ? `没查成 ${unread} 行。` : '',
      noProc ? `没有这项处理事项 ${noProc} 行。` : '',
      statusMiss ? `状态没读到 ${statusMiss} 行。` : '',
      abnormal ? `异常 ${abnormal} 行。` : '',
      checking ? `还有 ${checking} 行正在核对。` : '',
    ]
      .filter(Boolean)
      .join('')
    const bars = [
      { key: 'pending', label: '待处理', count: pending, color: '#1d4ed8' },
      { key: 'submitted', label: '已提交审核', count: submitted, color: '#9a6700' },
      { key: 'mailed', label: MAILED_UNFINISHED_REVIEW, count: mailed, color: '#3e5670' },
      { key: 'skipped', label: SKIP_SEND_REVIEW, count: skipped, color: '#7a3e86' },
      { key: 'done', label: '已经审核通过', count: done, color: '#157a45' },
      { key: 'missing', label: '库里没有', count: missing, color: '#c4234e' },
      { key: 'unread', label: '没查成', count: unread, color: '#c4234e' },
      { key: 'noProc', label: '没有这项处理事项', count: noProc, color: '#8b95a8' },
      { key: 'statusMiss', label: '状态没读到', count: statusMiss, color: '#8b95a8' },
      { key: 'abnormal', label: '异常', count: abnormal, color: '#9a6700' },
      { key: 'checking', label: '正在核对', count: checking, color: '#b7c0d2' },
    ].filter(item => item.count > 0)
    const widest = Math.max(...bars.map(item => item.count), 1)
    return {
      text,
      bars: bars.map(item => ({ ...item, percent: Math.max(2, Math.round((item.count / widest) * 1000) / 10) })),
    }
  })

  const outcome = computed(() => outcomePack.value.text)
  const outcomeBars = computed(() => outcomePack.value.bars)

  return {
    sheetPage,
    sheetPages,
    sheetPageSafe,
    sheetSeen,
    rowsOnSheetPage,
    resetSheetPages,
    setSheetPage,
    limitReview,
    sheetReview,
    sheetStatus,
    rowsForArbitration,
    flowByKey,
    outcomePack,
    outcome,
    outcomeBars,
  }
}
