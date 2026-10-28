import { apiError, type ApiResult } from '../api/types'
import { yieldToMain } from '../utils/idle'
import type { FilingSearchRow } from '../api/filing-search-types'
import {
  acceptorUserIds,
  FILING_EXPORT_HEADERS,
  FILING_FETCH_CONCURRENCY,
  filingExportCells,
  filingExportRows,
  filingReturnTop,
  type FilingExportRow,
  type FilingFlowRow,
  type FilingUser
} from '../api/filing-export'
import type { XlsxBarChart, XlsxSheetSpec } from '../customer/xlsx-table'

/**
 * 「递交管理-已完成导出」的取数编排。每件递交只打两个主接口：
 * 一次 GetFlowHistory（obj_id 传 filing_id），接手人再按人去重打 ShowUserInfo 取部门。
 * 我方文号、申请日、案件状态来自查询结果行，不再额外请求。
 */

export interface FilingExportDeps {
  readFlow: (filingId: string) => Promise<ApiResult<FilingFlowRow[]>>
  readUser: (userId: string) => Promise<ApiResult<FilingUser>>
}

export interface FilingExportProgress {
  /** 一件查完就报这一件的行，页面按件行级刷新。 */
  onFiling?: (index: number, lines: FilingExportRow[]) => void
  onProgress?: (done: number, total: number) => void
  /** 行档里已经有的件直接拿来用，不再打接口。取数中断后续传就靠这个。 */
  known?: (index: number) => FilingExportRow[] | undefined
}

/** 取数时并行几件。和翻页拉行同一个并发数，把请求打满。 */
const FILING_EXPORT_CONCURRENCY = FILING_FETCH_CONCURRENCY

function acceptorIdsOf(flow: readonly FilingFlowRow[]): string[] {
  return acceptorUserIds(flow)
}

/**
 * 逐件读流程历史、按人去重读部门，产出导出行。失败的件记进 problems，导出照常继续，
 * 不让一件读不到就整批停住。
 */
/** 容灾：偶发的繁忙、超时先自己重试一轮，一件读不到不该整批出洞。 */
async function retryRead<T>(load: () => Promise<ApiResult<T>>, attempts = 2): Promise<ApiResult<T>> {
  let last: ApiResult<T> | null = null
  for (let round = 1; round <= attempts; round += 1) {
    try {
      last = await load()
      if (last.ok) return last
    } catch {
      last = apiError('NETWORK_ERROR', '读取失败。')
    }
    if (round < attempts) await new Promise(resolve => setTimeout(resolve, 400))
  }
  return last ?? apiError('NETWORK_ERROR', '读取失败。')
}

export async function collectFilingExport(
  filings: readonly FilingSearchRow[],
  deps: FilingExportDeps,
  progress: FilingExportProgress = {}
): Promise<{ lines: FilingExportRow[]; problems: string[] }> {
  const slots: FilingExportRow[][] = filings.map(() => [])
  const problems: string[] = []
  const userLoads = new Map<string, Promise<FilingUser | null>>()
  const loadUser = (userId: string): Promise<FilingUser | null> => {
    const existing = userLoads.get(userId)
    if (existing) return existing
    const load = retryRead(() => deps.readUser(userId)).then(result => (result.ok ? result.data : null)).catch(() => null)
    userLoads.set(userId, load)
    return load
  }
  let cursor = 0
  let done = 0
  let spun = 0
  const worker = async (): Promise<void> => {
    while (cursor < filings.length) {
      const index = cursor++
      const filing = filings[index]
      try {
        const carried = progress.known?.(index)
        if (carried) {
          slots[index] = carried
          progress.onFiling?.(index, carried)
          // 行档里现成的件不过网络，一口气涌进来会把主线程整段占住；干一段让一让。
          spun += 1
          if (spun % 200 === 0) await yieldToMain()
          continue
        }
        if (!filing.filingId) throw new Error('这条递交缺编号，读不到流程历史。')
        const flowResult = await retryRead(() => deps.readFlow(filing.filingId))
        if (!flowResult.ok) throw new Error(flowResult.error.message)
        const flow = flowResult.data
        const users = new Map<string, FilingUser>()
        await Promise.all(acceptorIdsOf(flow).map(async userId => {
          const user = await loadUser(userId)
          if (user) users.set(userId, user)
        }))
        const lines = filingExportRows(filing, flow, userId => users.get(userId)?.deptFullName ?? '')
        slots[index] = lines
        progress.onFiling?.(index, lines)
      } catch (error) {
        const label = filing.caseVolume.trim() || filing.filingId || `第 ${index + 1} 件`
        problems.push(`${label}：${error instanceof Error ? error.message : '读取失败。'}`)
        slots[index] = []
        progress.onFiling?.(index, [])
      } finally {
        done += 1
        progress.onProgress?.(done, filings.length)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FILING_EXPORT_CONCURRENCY, Math.max(filings.length, 1)) }, worker))
  return { lines: slots.flat(), problems }
}

/** 表格下面留两行空再上图。 */
const CHART_GAP_ROWS = 2
/** 图浮上去占多少行高，十根柱子放得下。 */
const CHART_HEIGHT_ROWS = 22
/** 图从第 1 列画到第 10 列，和九列的表差不多宽。 */
const CHART_LAST_COLUMN = 9

/**
 * 导出表：第一行是九列表头，导出时冻结首行。表格下方顺延一张横向柱状图——
 * 前10大退回（按我方文号数退回次数，多的在最上面），图下面附它引用的两列数据。
 * 一次都没有退回时不带图，免得空图占着表下面一大块。
 */
export function filingExportSheet(lines: readonly FilingExportRow[]): XlsxSheetSpec {
  const name = '递交管理-已完成导出'
  const rows: Array<Array<string | number>> = [[...FILING_EXPORT_HEADERS], ...lines.map(filingExportCells)]
  const top = filingReturnTop(lines)
  if (!top.length) return { name, rows, freezeHeader: true }
  const labels = top.map(item => item.caseVolume.trim() || '（无文号）')
  const chartTop = rows.length + CHART_GAP_ROWS
  const chartBottom = chartTop + CHART_HEIGHT_ROWS
  const dataHeaderRow = chartBottom + 1
  const chart: XlsxBarChart = {
    title: '前10大退回（按我方文号）',
    seriesName: '退回次数',
    bars: top.map((item, index) => ({ label: labels[index], value: item.count })),
    labelColumn: 0,
    valueColumn: 1,
    firstRow: dataHeaderRow + 1,
    lastRow: dataHeaderRow + top.length,
    anchor: { firstRow: chartTop, lastRow: chartBottom, firstColumn: 0, lastColumn: CHART_LAST_COLUMN }
  }
  // 图浮在这些行上，行里一个字不写；数据块接着图下面，图表就引用这两列（次数是数值格，图上读得出数）。
  while (rows.length <= chartBottom) rows.push([])
  rows.push(['我方文号', '退回次数'])
  top.forEach((item, index) => rows.push([labels[index], item.count]))
  return { name, rows, freezeHeader: true, chart }
}
