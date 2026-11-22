import { reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  useWorkflowSheetStatus,
  workflowStatusShade,
  type WorkflowIcHit,
} from '../../../src/app/composables/useWorkflowSheetStatus'
import type { PctTaskRow } from '../../../src/customer/types'
import { MAILED_UNFINISHED_REVIEW, SKIP_SEND_REVIEW } from '../../../src/customer/pct-flow-status'

function makeRow(index: number, overrides: Partial<PctTaskRow> = {}): PctTaskRow {
  return {
    ourVolume: `PA2026${String(index).padStart(4, '0')}CN`,
    customerVolume: `CU-${index}`,
    customerName: '美的',
    procLabel: '进入国家阶段',
    mailTypeId: 'mt-1',
    iprName: '张三',
    contactName: '李四',
    selected: false,
    ...overrides,
  } as PctTaskRow
}

describe('useWorkflowSheetStatus composable', () => {
  it('computes status precedence, abnormal overrides, outcome bars, and arbitration candidates', () => {
    const rows = ref<PctTaskRow[]>([
      makeRow(1),
      makeRow(2),
      makeRow(3, { ourVolume: '', customerVolume: 'CUST-ONLY-3' }),
      makeRow(4),
      makeRow(5),
    ])
    const icPhase = ref<'idle' | 'run' | 'done' | 'fail'>('done')
    const icEpoch = ref(1)
    let hits: Record<string, WorkflowIcHit> = {
      'PA20260001CN\n进入国家阶段': { found: true, gate: 'open' },
      'PA20260002CN\n进入国家阶段': { found: true, gate: 'done', uncontrolled: true },
      'CUST-ONLY-3\n进入国家阶段': { found: true, gate: 'done' },
      'PA20260004CN\n进入国家阶段': { found: false, gate: '' },
      'PA20260005CN\n进入国家阶段': { found: true, gate: 'done', skipSend: true },
    }
    const limitByKey = reactive<Record<string, string>>({
      'PA20260001CN\n进入国家阶段': '还没提交审核',
    })
    const abnormalKeys = ref(new Set<string>(['PA20260004CN\n进入国家阶段']))
    const allowMailedUnfinished = ref(true)

    const sheet = useWorkflowSheetStatus({
      rows,
      icPhase,
      icEpoch,
      getIcHits: () => hits,
      limitByKey,
      abnormalKeys,
      allowMailedUnfinished,
      pageSize: 2,
    })

    expect(sheet.sheetStatus(rows.value[0])).toEqual({ found: '有', review: '还没提交审核' })
    expect(sheet.sheetStatus(rows.value[1])).toEqual({ found: '有', review: MAILED_UNFINISHED_REVIEW })
    expect(sheet.sheetStatus(rows.value[2])).toEqual({ found: '有', review: '已经审核通过' })
    expect(sheet.sheetStatus(rows.value[3])).toEqual({ found: '库里没有', review: '异常' })
    expect(sheet.sheetStatus(rows.value[4])).toEqual({ found: '有', review: SKIP_SEND_REVIEW })

    expect(workflowStatusShade('还没提交审核')).toBe('shade-open')
    expect(workflowStatusShade(MAILED_UNFINISHED_REVIEW)).toBe('shade-mailed')
    expect(workflowStatusShade('异常')).toBe('shade-abnormal')

    expect(sheet.rowsForArbitration().map(r => r.ourVolume)).toEqual([
      'PA20260001CN',
      'PA20260002CN',
      'PA20260004CN',
      'PA20260005CN',
    ])
    allowMailedUnfinished.value = false
    expect(sheet.rowsForArbitration().map(r => r.ourVolume)).toEqual(['PA20260001CN', 'PA20260004CN', 'PA20260005CN'])

    expect(sheet.outcome.value).toContain('还有 1 行待处理')
    expect(sheet.outcome.value).toContain(`${MAILED_UNFINISHED_REVIEW} 1 行`)
    expect(sheet.outcome.value).toContain('异常 1 行')
    expect(sheet.outcomeBars.value.length).toBe(5)
    expect(sheet.outcomeBars.value.every(b => b.percent === 100)).toBe(true)

    expect(sheet.flowByKey.value['PA20260001CN\n进入国家阶段']).toBe('还没提交审核')
    hits = { ...hits, 'PA20260001CN\n进入国家阶段': { found: false, gate: '', unread: true } }
    icEpoch.value += 1
    expect(sheet.sheetStatus(rows.value[0])).toEqual({ found: '没查成', review: '—' })
  })

  it('clamps pagination bounds and tracks visited pages', async () => {
    const rows = ref([makeRow(1), makeRow(2), makeRow(3), makeRow(4), makeRow(5)])
    const icPhase = ref<'idle' | 'run' | 'done' | 'fail'>('idle')
    const icEpoch = ref(0)
    const sheet = useWorkflowSheetStatus({
      rows,
      icPhase,
      icEpoch,
      getIcHits: () => ({}),
      limitByKey: {},
      abnormalKeys: ref(new Set<string>()),
      allowMailedUnfinished: ref(true),
      pageSize: 2,
    })

    expect(sheet.sheetPages.value).toBe(3)
    expect(sheet.rowsOnSheetPage(2).map(r => r.ourVolume)).toEqual(['PA20260003CN', 'PA20260004CN'])

    sheet.setSheetPage(99)
    expect(sheet.sheetPageSafe.value).toBe(3)
    await Promise.resolve()
    expect(sheet.sheetSeen.value).toEqual([1, 3])

    sheet.setSheetPage(0)
    expect(sheet.sheetPageSafe.value).toBe(1)

    sheet.resetSheetPages()
    expect(sheet.sheetPageSafe.value).toBe(1)
    expect(sheet.sheetSeen.value).toEqual([1])
  })
})
