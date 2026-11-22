import type { LimitMonitorRow } from '../../api/limit-monitor-types'
import { joinCaseVolumes, splitCaseVolumes } from '../../customer/volume-list'
import { isMessage, MessageType } from '../../shared/message'
import type { ToolSchema } from '../llm'
import { AGENT_DEADLINE_KEEP, type AgentMemoryState, type AgentWork } from '../memory'
import {
  clipToolText,
  forwardedError,
  pageNote,
  stopIfNeeded,
  textArg,
  toolDone,
  wholeArg,
  type DeadlineRow,
  type ListedRows,
  type ToolContext,
  type ToolOutcome,
} from './contracts'

const LIMIT_PAGE_SIZE = 10
const LIMIT_COLLECT_SIZE = 100
const LIMIT_COLLECT_PAGES = 20

function mergeByKey<T>(previous: readonly T[], incoming: readonly T[], key: (item: T) => string, cap: number): T[] {
  const map = new Map<string, T>()
  for (const item of previous) map.set(key(item), item)
  for (const item of incoming) map.set(key(item), item)
  return [...map.values()].slice(-cap)
}

function withDeadlines(memory: AgentMemoryState, rows: DeadlineRow[], deadlineQuery: string, replace: boolean): AgentWork {
  const previous = memory.work
  const next = replace
    ? rows.slice(0, AGENT_DEADLINE_KEEP)
    : mergeByKey(previous?.deadlines ?? [], rows, item => item.procId, AGENT_DEADLINE_KEEP)
  return {
    files: previous?.files ?? [],
    deadlines: next,
    ...(previous?.fileQuery ? { fileQuery: previous.fileQuery } : {}),
    deadlineQuery,
  }
}

function deadlineLines(items: Array<{ caseVolume?: string; caseId?: string; procId?: string; ctrlProc?: string; customerName?: string; intDueDate?: string; cusDueDate?: string; legalDueDate?: string }>): string {
  return items
    .map(item =>
      [
        item.caseVolume,
        item.caseId && `案件编号 ${item.caseId}`,
        item.procId && `事项编号 ${item.procId}`,
        item.ctrlProc,
        item.customerName,
        item.intDueDate && `内部 ${item.intDueDate}`,
        item.cusDueDate && `客户 ${item.cusDueDate}`,
        item.legalDueDate && `法律 ${item.legalDueDate}`,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n')
}

async function readDeadlinePage(
  ctx: ToolContext,
  query: { type: 'all'; pageIndex: number; pageSize: number; caseVolume?: string; applicationNo?: string; customerName?: string },
): Promise<{ ok: true; items: LimitMonitorRow[]; total: number; pageIndex: number; pageSize: number; totalPages: number } | { ok: false; text: string }> {
  stopIfNeeded(ctx)
  const response = await ctx.forward({ type: MessageType.SearchLimitMonitor, payload: { query } })
  stopIfNeeded(ctx)
  const error = forwardedError(response)
  if (error) return { ok: false, text: error }
  if (!isMessage(response) || response.type !== MessageType.SearchLimitMonitorResult) {
    return { ok: false, text: '期限监控没有返回结果。' }
  }
  if (!response.payload.ok) return { ok: false, text: response.payload.error.message }
  const data = response.payload.data
  return { ok: true, items: data.items, total: data.total, pageIndex: data.pageIndex, pageSize: data.pageSize, totalPages: data.totalPages }
}

function deadlineRefs(items: Array<{ procId?: string; caseId?: string; caseVolume?: string; ctrlProc?: string }>): DeadlineRow[] {
  return items
    .filter(item => item.procId && item.caseVolume)
    .map(item => ({
      procId: item.procId ?? '',
      caseId: item.caseId ?? '',
      caseVolume: item.caseVolume ?? '',
      ...(item.ctrlProc ? { ctrlProc: item.ctrlProc } : {}),
    }))
}

async function searchDeadlines(ctx: ToolContext, args: Record<string, unknown>, memory: AgentMemoryState): Promise<ListedRows<DeadlineRow>> {
  const kind = textArg(args, 'kind') || 'all'
  const allowed = ['all', 'pay', 'suspend', 'abandon', 'recall', 'priority', 'fee']
  const empty = { rows: [] as DeadlineRow[], queryKey: '', replace: true }
  if (!allowed.includes(kind)) return { ...empty, text: '期限页签无效。', ok: false }
  const caseVolume = textArg(args, 'caseVolume', 4_000)
  const applicationNo = textArg(args, 'applicationNo')
  const customerName = textArg(args, 'customerName', 120)
  const volumes = splitCaseVolumes(caseVolume)
  if (volumes.length > 1) {
    const joined = joinCaseVolumes(volumes)
    const queryKey = JSON.stringify({ caseVolume: joined, applicationNo, customerName, kind, collected: true })
    const first = await readDeadlinePage(ctx, {
      type: kind as 'all',
      pageIndex: 1,
      pageSize: LIMIT_COLLECT_SIZE,
      ...(joined ? { caseVolume: joined } : {}),
      ...(applicationNo ? { applicationNo } : {}),
      ...(customerName ? { customerName } : {}),
    })
    if (!first.ok) return { ...empty, queryKey, text: first.text, ok: false }
    const items = [...first.items]
    const pages = Math.min(LIMIT_COLLECT_PAGES, Math.max(1, Math.ceil(first.total / LIMIT_COLLECT_SIZE)))
    for (let page = 2; page <= pages; page += 1) {
      const next = await readDeadlinePage(ctx, {
        type: kind as 'all',
        pageIndex: page,
        pageSize: LIMIT_COLLECT_SIZE,
        ...(joined ? { caseVolume: joined } : {}),
        ...(applicationNo ? { applicationNo } : {}),
        ...(customerName ? { customerName } : {}),
      })
      if (!next.ok) return { ...empty, queryKey, text: `第 ${page} 页没有完成：${next.text}`, ok: false }
      items.push(...next.items)
    }
    const rows = deadlineRefs(items)
    const kept = rows.slice(0, AGENT_DEADLINE_KEEP)
    const tail = first.total > kept.length ? `\n一共 ${first.total} 条，这次留下 ${kept.length} 条。` : ''
    const text = clipToolText(
      `期限监控共 ${first.total} 条。多个文号已一次查完。${tail}\n${deadlineLines(items.slice(0, AGENT_DEADLINE_KEEP)) || '这个条件下没有期限记录。'}`,
    )
    return { text, ok: true, rows: kept, queryKey, replace: true }
  }
  const page = wholeArg(args, 'page')
  if (page === null) return { ...empty, text: '页码从 1 开始。', ok: false }
  const queryKey = JSON.stringify({ caseVolume, applicationNo, customerName, kind, pageSize: LIMIT_PAGE_SIZE })
  const replace = page <= 1 || memory.work?.deadlineQuery !== queryKey
  const pageResult = await readDeadlinePage(ctx, {
    type: kind as 'all',
    pageIndex: page,
    pageSize: LIMIT_PAGE_SIZE,
    ...(caseVolume ? { caseVolume } : {}),
    ...(applicationNo ? { applicationNo } : {}),
    ...(customerName ? { customerName } : {}),
  })
  if (!pageResult.ok) return { ...empty, queryKey, replace, text: pageResult.text, ok: false }
  const text = clipToolText(
    [
      `期限监控共 ${pageResult.total} 条。${pageNote(pageResult.total, pageResult.pageIndex, pageResult.pageSize, pageResult.totalPages)}`,
      deadlineLines(pageResult.items) || '这一页没有未结束的事项。',
    ].join('\n'),
  )
  return { text, ok: true, rows: deadlineRefs(pageResult.items), queryKey, replace }
}

export const DEADLINE_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'search_deadlines',
      description: '在期限监控里查还没结束的处理事项和内部/客户/法律期限。和期限页一样，每页 10 条。没看完就用同样的条件把 page 加 1。文号有多个时一次查完，不用填页码。',
      parameters: {
        type: 'object',
        properties: {
          caseVolume: { type: 'string', description: '我方文号。多个用空格或分号分开' },
          applicationNo: { type: 'string', description: '申请号' },
          customerName: { type: 'string', description: '客户名称' },
          kind: { type: 'string', enum: ['all', 'pay', 'suspend', 'abandon', 'recall', 'priority', 'fee'], description: '页签，不确定就用 all' },
          page: { type: 'integer', description: '页码，从 1 开始。不填是第 1 页。多个文号时忽略' },
        },
        additionalProperties: false,
      },
    },
  },
]

export async function executeDeadlineTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome | null> {
  if (name !== 'search_deadlines') return null
  const found = await searchDeadlines(ctx, args, memory)
  if (!found.ok || !found.queryKey) return toolDone(found.text, memory, false)
  const work = withDeadlines(memory, found.rows, found.queryKey, found.replace)
  ctx.rememberDeadlines(work.deadlines)
  return toolDone(found.text, { ...memory, work }, true)
}
