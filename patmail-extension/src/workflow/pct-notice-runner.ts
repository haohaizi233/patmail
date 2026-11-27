import type { PctNoticeRunOwner, PctNoticeWriteTag } from '../shared/pct-notice-run'
import type {
  NoticeActionRequest,
  NoticeActionResult,
  NoticeDownloadQuery,
  NoticeImportQuery,
  NoticeInitData,
  NoticeOptionItem,
  NoticeReplayQuery,
  NoticeRow,
  NoticeSearchRequest,
  NoticeSearchResult
} from '../api/notice-types'
import { MessageType, type MessageBridge } from '../shared/message'
import type { CustomerMode } from '../settings/customer-mode'
import {
  decodeBase64ToArrayBuffer,
  extractUnimportedReplayRecords,
  mergeUnimportedUnion,
  parseNoticeExportTable,
  type MergedReplayCheckRecord,
  type ReplayCheckRecord
} from './pct-notice-excel'

export interface UnifiedCpcAccount {
  key: string
  label: string
  largeId?: string
  smeId?: string
}

export interface PctNoticeWorkflowParams {
  selectedAccountKeys: string[]
  replayQuery: Omit<NoticeReplayQuery, 'account' | 'pageIndex' | 'pageSize'>
  downloadQuery: Omit<NoticeDownloadQuery, 'account' | 'pageIndex' | 'pageSize'>
  importQuery: Omit<NoticeImportQuery, 'pageIndex' | 'pageSize'>
}

export type PctNoticeStepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped' | 'paused'

export interface Step1SystemSummary {
  exportedRows: number
  unimportedRows: number
  accountResults: Array<{ label: string; exported: number; unimported: number; note?: string }>
}

export interface Step1UnionResult {
  large: Step1SystemSummary
  sme: Step1SystemSummary
  mergedRows: MergedReplayCheckRecord[]
}

export interface SystemPipelineProgress {
  mode: CustomerMode
  step4Status: PctNoticeStepStatus
  step4Detail: string
  deletedPctCount: number
  step5Status: PctNoticeStepStatus
  step5Detail: string
  analyzedReplayCount: number
  step6Status: PctNoticeStepStatus
  step6Detail: string
  importRound1Count: number
  importRound2Count: number
  nonSystemFilteredCount: number
  logs: string[]
}

const SEARCH_PAGE_SIZE = 200
const ACTION_BATCH_SIZE = 50

/** 原站行字段可能是字符串或数字，统一转成纯标量文本；对象等其它类型按空串处理。 */
function fieldText(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
      ? String(value)
      : ''
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('任务已被用户中止。')
  }
}

export function createInitialSystemPipelineProgress(mode: CustomerMode): SystemPipelineProgress {
  return {
    mode,
    step4Status: 'idle',
    step4Detail: '等待执行',
    deletedPctCount: 0,
    step5Status: 'idle',
    step5Detail: '等待执行',
    analyzedReplayCount: 0,
    step6Status: 'idle',
    step6Detail: '等待执行',
    importRound1Count: 0,
    importRound2Count: 0,
    nonSystemFilteredCount: 0,
    logs: []
  }
}

/** 将大客户与中小客户的 CPC 收文账号按名称合并为统一勾选项。 */
export function mergeCpcAccounts(
  largeAccounts: readonly NoticeOptionItem[],
  smeAccounts: readonly NoticeOptionItem[]
): UnifiedCpcAccount[] {
  const map = new Map<string, UnifiedCpcAccount>()
  for (const item of largeAccounts) {
    const label = item.label.trim()
    if (!label || !item.value.trim()) continue
    const existing = map.get(label)
    if (existing) {
      if (!existing.largeId) existing.largeId = item.value.trim()
    } else {
      map.set(label, { key: label, label, largeId: item.value.trim() })
    }
  }
  for (const item of smeAccounts) {
    const label = item.label.trim()
    if (!label || !item.value.trim()) continue
    const existing = map.get(label)
    if (existing) {
      if (!existing.smeId) existing.smeId = item.value.trim()
    } else {
      map.set(label, { key: label, label, smeId: item.value.trim() })
    }
  }
  return [...map.values()]
}

export function isPctDownloadRow(row: NoticeRow): boolean {
  const raw = row.ShenQingH ?? row.cnApplicationnumber ?? row.app_no ?? row.appno ?? ''
  const appNo = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim().toUpperCase() : ''
  return appNo.startsWith('PCT/')
}

function mapOptionGuidByLabel(
  value: string,
  sourceOptions: readonly { value: string; label: string }[] | undefined,
  targetOptions: readonly { value: string; label: string }[] | undefined
): string {
  const trimmed = value.trim()
  if (!trimmed || !sourceOptions?.length || !targetOptions?.length) return value
  const src = sourceOptions.find(opt => opt.value === trimmed)
  if (!src) return value
  const target = targetOptions.find(opt => opt.label.trim() === src.label.trim())
  return target ? target.value : value
}

function mapTreeNodeGuidByLabel(
  value: string,
  sourceNodes: readonly { id: string; name: string }[] | undefined,
  targetNodes: readonly { id: string; name: string }[] | undefined
): string {
  const trimmed = value.trim()
  if (!trimmed || !sourceNodes?.length || !targetNodes?.length) return value
  const ids = trimmed.split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) return value
  const mapped = ids.map(id => {
    const src = sourceNodes.find(n => n.id === id)
    if (!src) return id
    const target = targetNodes.find(n => n.name.trim() === src.name.trim())
    return target ? target.id : id
  })
  return mapped.join(',')
}

/** 导入来文条件在发往目标系统（如中小客户）时，按名称对齐字典 GUID，并强制查询未处理（status='0'）。 */
export function adaptImportQueryForSystem(
  base: Omit<NoticeImportQuery, 'pageIndex' | 'pageSize'>,
  sourceInit: NoticeInitData | null,
  targetInit: NoticeInitData | null
): Omit<NoticeImportQuery, 'pageIndex' | 'pageSize'> {
  if (!sourceInit || !targetInit || sourceInit === targetInit) {
    return { ...base, status: '0' }
  }
  return {
    ...base,
    status: '0',
    apply_type: mapOptionGuidByLabel(base.apply_type, sourceInit.applyTypes, targetInit.applyTypes),
    agency_id: mapOptionGuidByLabel(base.agency_id, sourceInit.agencies, targetInit.agencies),
    flow_direction: mapOptionGuidByLabel(base.flow_direction, sourceInit.directions, targetInit.directions),
    branch_dept_id: mapOptionGuidByLabel(base.branch_dept_id, sourceInit.branches, targetInit.branches),
    apply_tags_id: mapOptionGuidByLabel(base.apply_tags_id, sourceInit.applyTags, targetInit.applyTags),
    customer_country: mapOptionGuidByLabel(base.customer_country, sourceInit.countries, targetInit.countries),
    assayer: mapTreeNodeGuidByLabel(base.assayer, sourceInit.users, targetInit.users),
    sales_help: mapTreeNodeGuidByLabel(base.sales_help, sourceInit.users, targetInit.users)
  }
}

export function partitionImportRows(rows: readonly NoticeRow[]): {
  nonSystemRows: NoticeRow[]
  closedCaseRows: NoticeRow[]
  normalRows: NoticeRow[]
} {
  const nonSystemRows: NoticeRow[] = []
  const closedCaseRows: NoticeRow[] = []
  const normalRows: NoticeRow[] = []
  for (const row of rows) {
    const oaId = fieldText(row.oa_id).trim()
    if (!oaId) continue
    const volume = fieldText(row.case_volume).trim()
    if (!volume) {
      nonSystemRows.push(row)
      continue
    }
    if (Number(row.is_finish) === 1) {
      closedCaseRows.push(row)
      continue
    }
    normalRows.push(row)
  }
  return { nonSystemRows, closedCaseRows, normalRows }
}

async function searchAllPages(
  bridge: MessageBridge,
  buildReq: (pageIndex: number, pageSize: number) => NoticeSearchRequest,
  signal?: AbortSignal
): Promise<NoticeRow[]> {
  const allRows: NoticeRow[] = []
  let pageIndex = 1
  while (true) {
    throwIfAborted(signal)
    const resp = await bridge.request({ type: MessageType.SearchNotice, payload: buildReq(pageIndex, SEARCH_PAGE_SIZE) }, signal)
    if (resp.type === MessageType.Error) {
      throw new Error(resp.payload.message)
    }
    if (resp.type !== MessageType.SearchNoticeResult || !resp.payload.ok) {
      const msg = resp.type === MessageType.SearchNoticeResult && !resp.payload.ok ? resp.payload.error.message : '来文列表查询失败。'
      throw new Error(msg)
    }
    const data: NoticeSearchResult = resp.payload.data
    if (data.needCpcLogin) {
      throw new Error(data.loginMessage || 'CPC 账号需要前往原站扫码登录后再操作。')
    }
    allRows.push(...data.rows)
    if (data.rows.length === 0 || allRows.length >= data.total || data.rows.length < SEARCH_PAGE_SIZE) {
      break
    }
    pageIndex += 1
  }
  return allRows
}

async function sendNoticeAction(bridge: MessageBridge, req: NoticeActionRequest, signal?: AbortSignal, pctRun?: PctNoticeWriteTag): Promise<NoticeActionResult> {
  throwIfAborted(signal)
  const resp = await bridge.request({ type: MessageType.NoticeAction, payload: req, ...(pctRun ? { pctRun } : {}) }, signal)
  if (resp.type === MessageType.Error) {
    throw new Error(resp.payload.message)
  }
  if (resp.type !== MessageType.NoticeActionResult) {
    throw new Error('操作返回了意外响应。')
  }
  if (!resp.payload.ok) {
    throw new Error(resp.payload.error.message)
  }
  if (resp.payload.data.needCpcLogin) {
    throw new Error(resp.payload.data.message || 'CPC 账号登录已过期，请先前往原站扫码登录。')
  }
  return resp.payload.data
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

function accountsForMode(accounts: readonly UnifiedCpcAccount[], mode: CustomerMode): Array<{ id: string; label: string }> {
  const list: Array<{ id: string; label: string }> = []
  for (const acc of accounts) {
    const id = mode === 'large' ? acc.largeId : acc.smeId
    if (id) list.push({ id, label: acc.label })
  }
  return list
}

function isEmptyExportMessage(message: string): boolean {
  return /无可导出数据|未返回有效的导出文件地址/.test(message)
}

async function exportReplayUnimportedForSystem(
  mode: CustomerMode,
  bridge: MessageBridge,
  accounts: readonly UnifiedCpcAccount[],
  replayQuery: Omit<NoticeReplayQuery, 'account' | 'pageIndex' | 'pageSize'>,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<{ summary: Step1SystemSummary; records: ReplayCheckRecord[] }> {
  const sysAccounts = accountsForMode(accounts, mode)
  const records: ReplayCheckRecord[] = []
  const accountResults: Step1SystemSummary['accountResults'] = []
  let exportedTotal = 0

  for (const acc of sysAccounts) {
    throwIfAborted(signal)
    onLog?.(`正在导出「${acc.label}」来文二次下载清单…`)
    const resp = await bridge.request(
      {
        type: MessageType.ExportNotice,
        payload: {
          tab: 'replay',
          delivery: 'inline',
          accountLabel: acc.label,
          query: {
            ...replayQuery,
            account: acc.id,
            pageIndex: 1,
            pageSize: SEARCH_PAGE_SIZE
          }
        }
      },
      signal
    )
    if (resp.type === MessageType.Error) {
      if (isEmptyExportMessage(resp.payload.message)) {
        accountResults.push({ label: acc.label, exported: 0, unimported: 0, note: '无可导出数据' })
        continue
      }
      throw new Error(resp.payload.message)
    }
    if (resp.type !== MessageType.ExportNoticeResult) {
      throw new Error('导出清单返回了意外响应。')
    }
    if (!resp.payload.ok) {
      if (isEmptyExportMessage(resp.payload.error.message)) {
        accountResults.push({ label: acc.label, exported: 0, unimported: 0, note: '无可导出数据' })
        continue
      }
      throw new Error(resp.payload.error.message)
    }
    const payload = resp.payload.data
    if (payload.async || !payload.fileBase64) {
      throw new Error(payload.message || '原站数据量过大已转为后台异步生成，请缩小发文日期范围后重试。')
    }
    const buffer = decodeBase64ToArrayBuffer(payload.fileBase64)
    const grid = await parseNoticeExportTable(buffer, payload.mimeType)
    const exportedCount = Math.max(0, grid.length - 1)
    const unimported = extractUnimportedReplayRecords(grid, { system: mode, accountLabel: acc.label })
    exportedTotal += exportedCount
    records.push(...unimported)
    accountResults.push({ label: acc.label, exported: exportedCount, unimported: unimported.length })
    onLog?.(`「${acc.label}」导出 ${exportedCount} 条，其中未导入 ${unimported.length} 条。`)
  }

  return {
    summary: {
      exportedRows: exportedTotal,
      unimportedRows: records.length,
      accountResults
    },
    records
  }
}

/** 第一步：大小客户系统并行导出「来文二次下载」核对清单，筛选未导入后取并集。 */
export async function runStep1ExportUnimportedUnion(options: {
  largeBridge: MessageBridge
  smeBridge: MessageBridge
  accounts: readonly UnifiedCpcAccount[]
  replayQuery: Omit<NoticeReplayQuery, 'account' | 'pageIndex' | 'pageSize'>
  onLog?: (mode: CustomerMode, message: string) => void
  signal?: AbortSignal
}): Promise<Step1UnionResult> {
  const [largeRes, smeRes] = await Promise.all([
    exportReplayUnimportedForSystem(
      'large',
      options.largeBridge,
      options.accounts,
      options.replayQuery,
      msg => options.onLog?.('large', msg),
      options.signal
    ),
    exportReplayUnimportedForSystem(
      'sme',
      options.smeBridge,
      options.accounts,
      options.replayQuery,
      msg => options.onLog?.('sme', msg),
      options.signal
    )
  ])

  const mergedRows = mergeUnimportedUnion([...largeRes.records, ...smeRes.records])
  return {
    large: largeRes.summary,
    sme: smeRes.summary,
    mergedRows
  }
}

/** 步骤 4 -> 5 -> 6 单系统顺序管道（由外层对大小客户系统 Promise.all 并行调用）。 */
export async function runSystemParallelPipeline(options: {
  mode: CustomerMode
  bridge: MessageBridge
  accounts: readonly UnifiedCpcAccount[]
  replayQuery: Omit<NoticeReplayQuery, 'account' | 'pageIndex' | 'pageSize'>
  downloadQuery: Omit<NoticeDownloadQuery, 'account' | 'pageIndex' | 'pageSize'>
  importQuery: Omit<NoticeImportQuery, 'pageIndex' | 'pageSize'>
  initData: Pick<NoticeInitData, 'closeCaseRule' | 'closeCaseImportNotice'> | null
  onProgress: (progress: SystemPipelineProgress) => void
  signal?: AbortSignal
  walOwner?: PctNoticeRunOwner
}): Promise<SystemPipelineProgress> {
  const state = createInitialSystemPipelineProgress(options.mode)
  const emit = (logMsg?: string): void => {
    if (logMsg) state.logs.push(logMsg)
    options.onProgress({ ...state, logs: [...state.logs] })
  }

  const sysAccounts = accountsForMode(options.accounts, options.mode)
  const sendWrite = (request: NoticeActionRequest, importRound?: 1 | 2) =>
    sendNoticeAction(options.bridge, request, options.signal, options.walOwner && { ...options.walOwner, importRound })

  // 步骤 4：在「来文下载」中删除所有「PCT/」开头的官文
  state.step4Status = 'running'
  state.step4Detail = '正在检索来文下载列表…'
  emit('开始执行：来文下载删除 PCT/ 开头官文')
  try {
    const pctFids = new Set<string>()
    for (const acc of sysAccounts) {
      throwIfAborted(options.signal)
      emit(`来文下载检索账号「${acc.label}」…`)
      const rows = await searchAllPages(
        options.bridge,
        (pageIndex, pageSize) => ({
          tab: 'download',
          query: {
            ...options.downloadQuery,
            account: acc.id,
            pageIndex,
            pageSize
          }
        }),
        options.signal
      )
      let matchedHere = 0
      for (const row of rows) {
        if (!isPctDownloadRow(row)) continue
        const fid = fieldText(row.fid).trim()
        if (fid) {
          pctFids.add(fid)
          matchedHere += 1
        }
      }
      emit(`账号「${acc.label}」共 ${rows.length} 条，命中 PCT/ 官文 ${matchedHere} 条。`)
    }
    const fidsList = [...pctFids]
    if (fidsList.length === 0) {
      state.step4Status = 'done'
      state.step4Detail = '未发现 PCT/ 开头官文，无需删除'
      emit('来文下载未发现 PCT/ 开头官文。')
    } else {
      for (const batch of chunkArray(fidsList, ACTION_BATCH_SIZE)) {
        const res = await sendWrite({ action: 'deleteDownloadOa', fids: batch })
        if (!res.ok) throw new Error(res.message || '删除 PCT/ 官文失败。')
        state.deletedPctCount += batch.length
        state.step4Detail = `已删除 ${state.deletedPctCount}/${fidsList.length} 条 PCT/ 官文`
        emit(`已删除 ${state.deletedPctCount}/${fidsList.length} 条 PCT/ 官文。`)
      }
      state.step4Status = 'done'
      state.step4Detail = `共删除 ${state.deletedPctCount} 条 PCT/ 官文`
    }
  } catch (error) {
    state.step4Status = 'error'
    state.step4Detail = error instanceof Error ? error.message : '来文下载删除失败'
    emit(`步骤 4 失败：${state.step4Detail}`)
    throw error
  }

  // 步骤 5：「来文二次下载」分析所有（勾选所有，导入未导入的都要分析）
  state.step5Status = 'running'
  state.step5Detail = '正在检索来文二次下载列表…'
  emit('开始执行：来文二次下载全量分析（含已导入与未导入）')
  try {
    for (const acc of sysAccounts) {
      throwIfAborted(options.signal)
      emit(`二次下载检索账号「${acc.label}」…`)
      const rows = await searchAllPages(
        options.bridge,
        (pageIndex, pageSize) => ({
          tab: 'replay',
          query: {
            ...options.replayQuery,
            account: acc.id,
            pageIndex,
            pageSize
          }
        }),
        options.signal
      )
      const items: Array<{ fid: string; xlh: string }> = []
      const seenFid = new Set<string>()
      for (const row of rows) {
        const fid = fieldText(row.fid).trim()
        if (!fid || seenFid.has(fid)) continue
        seenFid.add(fid)
        items.push({ fid, xlh: fieldText(row.fawenxlh).trim() })
      }
      if (items.length === 0) {
        emit(`账号「${acc.label}」在当前条件下无二次下载记录。`)
        continue
      }
      for (const batch of chunkArray(items, ACTION_BATCH_SIZE)) {
        const res = await sendWrite(
          {
            action: 'downloadTzsList',
            account: acc.id,
            accountLabel: acc.label,
            fids: batch.map(i => i.fid),
            xlh: batch.map(i => i.xlh),
            startTime: options.replayQuery.startTime,
            endTime: options.replayQuery.endTime,
            isReplay: true
          }
        )
        if (!res.ok) throw new Error(res.message || '二次下载分析失败。')
        state.analyzedReplayCount += batch.length
        state.step5Detail = `已分析 ${state.analyzedReplayCount} 条（当前账号 ${acc.label}）`
        emit(`账号「${acc.label}」完成一批二次分析 ${batch.length} 条，累计 ${state.analyzedReplayCount} 条。`)
      }
    }
    state.step5Status = 'done'
    state.step5Detail = state.analyzedReplayCount > 0 ? `共分析 ${state.analyzedReplayCount} 条` : '当前条件下无待分析记录'
  } catch (error) {
    state.step5Status = 'error'
    state.step5Detail = error instanceof Error ? error.message : '二次下载分析失败'
    emit(`步骤 5 失败：${state.step5Detail}`)
    throw error
  }

  // 步骤 6：「导入来文」中两轮全选导入系统
  state.step6Status = 'running'
  state.step6Detail = '正在执行第 1 轮导入…'
  emit('开始执行：导入来文两轮全选导入系统')
  try {
    const closeRule = options.initData?.closeCaseRule ?? '1'
    const closeImport = options.initData?.closeCaseImportNotice ?? '0'
    const shouldSplitClosed = (closeRule === '1' && closeImport === '1') || closeRule !== '1'

    const executeImportRound = async (round: 1 | 2): Promise<void> => {
      throwIfAborted(options.signal)
      const rows = await searchAllPages(
        options.bridge,
        (pageIndex, pageSize) => ({
          tab: 'import',
          query: {
            ...options.importQuery,
            status: '0',
            pageIndex,
            pageSize
          }
        }),
        options.signal
      )
      const { nonSystemRows, closedCaseRows, normalRows } = partitionImportRows(rows)
      if (nonSystemRows.length > 0) {
        state.nonSystemFilteredCount += nonSystemRows.length
        emit(`第 ${round} 轮查询共 ${rows.length} 条，其中 ${nonSystemRows.length} 条无我方文号（非本系统行）已自动跳过。`)
      } else {
        emit(`第 ${round} 轮查询共 ${rows.length} 条待导入记录。`)
      }

      const recordImported = (count: number): void => {
        const field = round === 1 ? 'importRound1Count' : 'importRound2Count'
        state[field] += count
        state.step6Detail = `第 ${round} 轮已导入 ${state[field]} 条`
        emit()
      }
      const importNormal = async (targetRows: readonly NoticeRow[]): Promise<void> => {
        const oaIds = targetRows.map(r => fieldText(r.oa_id).trim()).filter(Boolean)
        for (const batch of chunkArray(oaIds, ACTION_BATCH_SIZE)) {
          const check = await sendNoticeAction(options.bridge, { action: 'importCheck', oaIds: batch }, options.signal)
          if (check.checkWarnings?.length) {
            emit(`第 ${round} 轮导入前提示：${check.checkWarnings.join('；')}`)
          }
          const res = await sendWrite(
            { action: 'importNotice', oaIds: batch, mailSales: 'N', checkName: false },
            round
          )
          if (!res.ok) throw new Error(res.message || `第 ${round} 轮导入系统失败。`)
          recordImported(batch.length)
        }
      }

      if (shouldSplitClosed && closedCaseRows.length > 0) {
        const closedIds = closedCaseRows.map(r => fieldText(r.oa_id).trim()).filter(Boolean)
        for (const batch of chunkArray(closedIds, ACTION_BATCH_SIZE)) {
          const res = await sendWrite({ action: 'importCloseCase', oaIds: batch }, round)
          if (!res.ok) throw new Error(res.message || `第 ${round} 轮结案案件导入失败。`)
          recordImported(batch.length)
        }
        if (normalRows.length > 0) {
          await importNormal(normalRows)
        }
      } else {
        await importNormal([...closedCaseRows, ...normalRows])
      }

    }

    await executeImportRound(1)
    state.step6Detail = `第 1 轮已导入 ${state.importRound1Count} 条，准备第 2 轮…`
    emit(`第 1 轮导入完成：${state.importRound1Count} 条。`)

    await executeImportRound(2)
    state.step6Status = 'done'
    state.step6Detail = `第 1 轮 ${state.importRound1Count} 条 · 第 2 轮 ${state.importRound2Count} 条`
    emit(`第 2 轮导入完成：${state.importRound2Count} 条。`)
  } catch (error) {
    state.step6Status = 'error'
    state.step6Detail = error instanceof Error ? error.message : '导入来文失败'
    emit(`步骤 6 失败：${state.step6Detail}`)
    throw error
  }

  return { ...state, logs: [...state.logs] }
}
