import { describe, expect, it } from 'vitest'
import { runFilingPages, type FilingPageResult } from '../../../src/app/filing-pages'

function row(id: string) {
  return {
    filingId: id, caseId: '', procId: '', caseVolume: `PA-${id}`, caseName: '', customerName: '', customerCode: '',
    applyType: '', ctrlProc: '', intDueDate: '', filingDate: '2026-10-22', caseType: '', branchDept: '', createUser: '',
    createTime: '', flowStatus: '', flowDirection: 'IO', appNo: '', customerVolume: '', appDate: '2026-10-22', caseStatus: '审定'
  }
}

const fast = { gapMs: 1 }

describe('全选所有拉页的容灾', () => {
  it('偶发失败自己重试，一轮内补齐，不惊动用户', async () => {
    const attempts = new Map<number, number>()
    const seen: number[] = []
    const missed = await runFilingPages([1, 2, 3], async page => {
      const round = (attempts.get(page) ?? 0) + 1
      attempts.set(page, round)
      if (page === 2 && round === 1) return { ok: false, session: false }
      return { ok: true, rows: [row(`f-${page}`)] }
    }, { ...fast, onPage: page => { seen.push(page) } })
    expect(missed).toEqual([])
    expect(attempts.get(2)).toBe(2)
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('一直失败的页记下页码，其余照常收齐', async () => {
    const seen: number[] = []
    const missed = await runFilingPages([1, 2, 3, 4], async page => {
      if (page === 3) return { ok: false, session: false }
      return { ok: true, rows: [row(`f-${page}`)] }
    }, { ...fast, attempts: 2, onPage: page => { seen.push(page) } })
    expect(missed).toEqual([3])
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 4])
  })

  it('会话失效立刻停手，不空转剩下的页', async () => {
    const called: number[] = []
    const missed = await runFilingPages([1, 2, 3, 4, 5, 6], async page => {
      called.push(page)
      return page === 2 ? { ok: false, session: true } : { ok: true, rows: [row(`f-${page}`)] }
    }, { ...fast, concurrency: 1 })
    expect(called).toEqual([1, 2])
    expect(missed).toEqual([2])
  })

  it('抛异常也算失败页，不炸整批', async () => {
    const missed = await runFilingPages([1, 2], async page => {
      if (page === 1) throw new Error('通道断了')
      return { ok: true, rows: [row('f-2')] } satisfies FilingPageResult
    }, { ...fast, attempts: 2 })
    expect(missed).toEqual([1])
  })

  it('漏掉的页可以单独再拉一轮补齐', async () => {
    const broken = new Set([2, 4])
    const fetchPage = async (page: number): Promise<FilingPageResult> => {
      if (broken.has(page)) return { ok: false, session: false }
      return { ok: true, rows: [row(`f-${page}`)] }
    }
    const first = await runFilingPages([1, 2, 3, 4], fetchPage, { ...fast, attempts: 1 })
    expect(first).toEqual([2, 4])
    broken.clear()
    const second = await runFilingPages(first, fetchPage, { ...fast, attempts: 1 })
    expect(second).toEqual([])
  })
})
