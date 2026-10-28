import { describe, expect, it } from 'vitest'
import { FilingRowsLedger, filingRowsBatchKey, type FilingRowsStore } from '../../../src/workflow/filing-rows'
import type { FilingExportRow } from '../../../src/api/filing-export'

function line(name: string, reason = '没有盖章'): FilingExportRow {
  return {
    returned: true,
    caseVolume: name, applyDate: '2026-10-22', flowDirection: '内-外', ctrlProc: '新申请',
    returnedBy: '余佳希', acceptedBy: '刘斌斌', acceptedDept: '电学三部', returnReason: reason, caseStatus: '审定'
  }
}

function filingRow(id: string) {
  return { filingId: id, caseVolume: `PA-${id}` }
}

function memoryStore(): FilingRowsStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    async remember(scope, payload) {
      data.set(scope, JSON.parse(JSON.stringify(payload)))
    },
    async recall(scope) {
      return data.get(scope) ?? null
    }
  }
}

describe('递交导出行档', () => {
  it('翻页才取行：一页只出那一页的行，按全局行序', () => {
    const ledger = new FilingRowsLedger('b1', [filingRow('a'), filingRow('b'), filingRow('c')], memoryStore())
    ledger.put(0, [line('PA-a1'), line('PA-a2')])
    ledger.put(1, [line('PA-b1')])
    ledger.put(2, [line('PA-c1'), line('PA-c2', '缺附图')])
    expect(ledger.lineCount).toBe(5)
    expect(ledger.page(0, 2).map(item => item.row.caseVolume)).toEqual(['PA-a1', 'PA-a2'])
    expect(ledger.page(2, 2).map(item => item.row.caseVolume)).toEqual(['PA-b1', 'PA-c1'])
    expect(ledger.page(4, 2).map(item => item.row.caseVolume)).toEqual(['PA-c2'])
    expect(ledger.page(5, 2)).toEqual([])
    // 行的 key 跟件号和件内序号走，翻页回来还是同一条。
    expect(ledger.page(2, 1)[0].key).toBe('1-0')
    expect(ledger.all().map(item => item.caseVolume)).toEqual(['PA-a1', 'PA-a2', 'PA-b1', 'PA-c1', 'PA-c2'])
  })

  it('行数按件增量维护，重复入档按后来的算', () => {
    const ledger = new FilingRowsLedger('b1', [filingRow('a'), filingRow('b')], memoryStore())
    ledger.put(0, [line('PA-a1'), line('PA-a2')])
    expect(ledger.lineCount).toBe(2)
    ledger.put(0, [line('PA-a1')])
    expect(ledger.lineCount).toBe(1)
    // 下标越界的件不入档。
    ledger.put(9, [line('x')])
    expect(ledger.lineCount).toBe(1)
  })

  it('只有取到行的件算取过，失败的空行续传时会重取', () => {
    const ledger = new FilingRowsLedger('b1', [filingRow('a'), filingRow('b')], memoryStore())
    ledger.put(0, [line('PA-a1')])
    ledger.put(1, [])
    expect(ledger.filled(0)).toHaveLength(1)
    expect(ledger.filled(1)).toBeUndefined()
  })

  it('落账本再装回来：同一批件接着用，取过的件不再打接口', async () => {
    const store = memoryStore()
    const rows = [filingRow('a'), filingRow('b'), filingRow('c')]
    const first = new FilingRowsLedger(filingRowsBatchKey(rows), rows, store)
    first.put(0, [line('PA-a1')])
    first.put(2, [line('PA-c1'), line('PA-c2', '缺附图')])
    await first.flush()
    expect(store.data.size).toBeGreaterThan(0)

    const again = new FilingRowsLedger(filingRowsBatchKey(rows), rows, store)
    expect(await again.restore()).toBe(2)
    expect(again.lineCount).toBe(3)
    expect(again.filled(0)).toHaveLength(1)
    expect(again.filled(1)).toBeUndefined()
    expect(again.page(0, 10).map(item => item.row.caseVolume)).toEqual(['PA-a1', 'PA-c1', 'PA-c2'])
  })

  it('换一批件装不回旧档，批次指纹跟并行到件的顺序无关', async () => {
    const store = memoryStore()
    const rows = [filingRow('a'), filingRow('b'), filingRow('c')]
    const first = new FilingRowsLedger(filingRowsBatchKey(rows), rows, store)
    first.put(0, [line('PA-a1')])
    await first.flush()

    const other = [filingRow('a'), filingRow('b')]
    const swapped = new FilingRowsLedger(filingRowsBatchKey(other), other, store)
    expect(await swapped.restore()).toBe(0)
    expect(swapped.lineCount).toBe(0)

    // 并行取数到件顺序每次不同，指纹不能跟着变。
    expect(filingRowsBatchKey(rows)).toBe(filingRowsBatchKey([filingRow('c'), filingRow('a'), filingRow('b')]))
    expect(filingRowsBatchKey(rows)).not.toBe(filingRowsBatchKey(other))
    expect(filingRowsBatchKey([])).toBe('empty')
  })

  it('翻页不越界：负起点、零页宽都不炸', () => {
    const ledger = new FilingRowsLedger('b1', [filingRow('a')], memoryStore())
    ledger.put(0, [line('PA-a1')])
    expect(ledger.page(-1, 5)).toEqual([])
    expect(ledger.page(0, 0)).toEqual([])
  })
})
