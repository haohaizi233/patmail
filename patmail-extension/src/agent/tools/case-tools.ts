import type { ToolSchema } from '../llm'
import { AGENT_FILE_KEEP, type AgentMemoryState, type AgentWork } from '../memory'
import type { SelectedPatentFile } from '../../mail/types'
import { isMessage, MessageType } from '../../shared/message'
import {
  clipToolText,
  forwardedError,
  pageNote,
  stopIfNeeded,
  textArg,
  toolDone,
  wholeArg,
  type ListedRows,
  type ToolContext,
  type ToolOutcome,
} from './contracts'

const FILE_PAGE_SIZES = [20, 50, 100] as const
const FILE_PAGE_SIZE = 20

function filePageSize(args: Record<string, unknown>): number | null {
  const value = args.pageSize
  if (value === undefined || value === '') return FILE_PAGE_SIZE
  const parsed = typeof value === 'number' ? value : Number(value)
  return (FILE_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : null
}

function asSelected(item: {
  fileId?: string
  fileName?: string
  fileDescription?: string
  customerName?: string
  caseId?: string
  caseName?: string
  caseVolume?: string
  customerVolume?: string
  applicationNo?: string
  officialPostDate?: string
}): SelectedPatentFile | null {
  if (!item.fileId || !item.fileName) return null
  return {
    fileId: item.fileId,
    fileName: item.fileName,
    fileDescription: item.fileDescription ?? '',
    customerName: item.customerName ?? '',
    ...(item.caseId ? { caseId: item.caseId } : {}),
    ...(item.caseName ? { caseName: item.caseName } : {}),
    ...(item.caseVolume ? { caseVolume: item.caseVolume } : {}),
    ...(item.customerVolume ? { customerVolume: item.customerVolume } : {}),
    ...(item.applicationNo ? { applicationNo: item.applicationNo } : {}),
    ...(item.officialPostDate ? { officialPostDate: item.officialPostDate } : {}),
  }
}

function mergeByKey<T>(previous: readonly T[], incoming: readonly T[], key: (item: T) => string, cap: number): T[] {
  const map = new Map<string, T>()
  for (const item of previous) map.set(key(item), item)
  for (const item of incoming) map.set(key(item), item)
  return [...map.values()].slice(-cap)
}

function withFiles(memory: AgentMemoryState, files: SelectedPatentFile[], fileQuery: string, replace: boolean): AgentWork {
  const previous = memory.work
  const next = replace ? files.slice(0, AGENT_FILE_KEEP) : mergeByKey(previous?.files ?? [], files, item => item.fileId, AGENT_FILE_KEEP)
  return {
    files: next,
    deadlines: previous?.deadlines ?? [],
    fileQuery,
    ...(previous?.deadlineQuery ? { deadlineQuery: previous.deadlineQuery } : {}),
  }
}

function caseLines(items: Array<{ caseVolume?: string; caseId?: string; caseName?: string; fileName?: string; customerName?: string; applicationNo?: string }>): string {
  return items
    .map(item => [item.caseVolume, item.caseId && `案件编号 ${item.caseId}`, item.caseName, item.fileName, item.customerName, item.applicationNo].filter(Boolean).join(' | '))
    .join('\n')
}

async function searchCases(ctx: ToolContext, args: Record<string, unknown>, memory: AgentMemoryState): Promise<ListedRows<SelectedPatentFile>> {
  const caseVolume = textArg(args, 'caseVolume')
  const applicationNo = textArg(args, 'applicationNo')
  const customerName = textArg(args, 'customerName', 120)
  const fileName = textArg(args, 'fileName', 120)
  const empty = { rows: [] as SelectedPatentFile[], queryKey: '', replace: true }
  if (!caseVolume && !applicationNo && !customerName && !fileName) {
    return { ...empty, text: '至少给出文号、申请号、客户或文件名中的一项。', ok: false }
  }
  const page = wholeArg(args, 'page')
  const pageSize = filePageSize(args)
  if (page === null) return { ...empty, text: '页码从 1 开始。', ok: false }
  if (pageSize === null) return { ...empty, text: '每页数量要是 20、50 或 100，和文件查询页一样。', ok: false }
  const queryKey = JSON.stringify({ caseVolume, applicationNo, customerName, fileName, pageSize })
  const replace = page <= 1 || memory.work?.fileQuery !== queryKey
  const query = {
    pageIndex: page,
    pageSize,
    ...(caseVolume ? { caseVolume } : {}),
    ...(applicationNo ? { applicationNo } : {}),
    ...(customerName ? { customerName } : {}),
    ...(fileName ? { fileName } : {}),
  }
  stopIfNeeded(ctx)
  const response = await ctx.forward({ type: MessageType.SearchFiles, payload: { query } })
  stopIfNeeded(ctx)
  const error = forwardedError(response)
  if (error) return { ...empty, queryKey, replace, text: error, ok: false }
  if (!isMessage(response) || response.type !== MessageType.SearchFilesResult) {
    return { ...empty, queryKey, replace, text: '文件查询没有返回结果。', ok: false }
  }
  if (!response.payload.ok) {
    return { ...empty, queryKey, replace, text: response.payload.error.message, ok: false }
  }
  const data = response.payload.data
  const selected = data.items.map(asSelected).filter((item): item is SelectedPatentFile => item !== null)
  const lines = caseLines(data.items)
  const text = clipToolText(
    [
      `文件查询共 ${data.total} 条。${pageNote(data.total, data.pageIndex, data.pageSize, data.totalPages)}`,
      '案件编号只用于下一步调用。',
      lines || '这一页没有记录。',
    ].join('\n'),
  )
  return { text, ok: true, rows: selected, queryKey, replace }
}

export const CASE_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'search_cases',
      description: '在 EASY 文件管理里按我方文号、申请号、客户或文件名查案件文件。至少给一项条件。和文件查询页一样，默认每页 20 条，也可以 50 或 100。没看完就用同样的条件把 page 加 1 再查。',
      parameters: {
        type: 'object',
        properties: {
          caseVolume: { type: 'string', description: '我方文号' },
          applicationNo: { type: 'string', description: '申请号' },
          customerName: { type: 'string', description: '客户名称，可模糊' },
          fileName: { type: 'string', description: '文件名' },
          page: { type: 'integer', description: '页码，从 1 开始。不填是第 1 页' },
          pageSize: { type: 'integer', enum: [20, 50, 100], description: '每页条数，和文件查询页一样。不填是 20' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_contacts',
      description: '按文号导出案件联系人。文号可空，空则用这一轮查到的文件。',
      parameters: {
        type: 'object',
        properties: { volumes: { type: 'string', description: '文号，多个用空格或逗号分开' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'review_case_fields',
      description: '按我方文号读取已经封装好的案件字段：要求表、发明人、案件页上固定的几栏。只填 caseVolume。不会创建发文，也不能改接口。返回的栏就是可以仲裁的范围。',
      parameters: {
        type: 'object',
        properties: { caseVolume: { type: 'string', description: '我方文号，一次一个' } },
        required: ['caseVolume'],
        additionalProperties: false,
      },
    },
  },
]

export async function executeCaseTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome | null> {
  if (name === 'search_cases') {
    const found = await searchCases(ctx, args, memory)
    if (!found.ok || !found.queryKey) return toolDone(found.text, memory, false)
    const work = withFiles(memory, found.rows, found.queryKey, found.replace)
    ctx.rememberFiles(work.files)
    return toolDone(found.text, { ...memory, work }, true)
  }
  if (name === 'export_contacts') {
    const text = await ctx.exportContacts(textArg(args, 'volumes', 400))
    return toolDone(text, memory, text.startsWith('联系人共'))
  }
  if (name === 'review_case_fields') {
    const caseVolume = textArg(args, 'caseVolume')
    if (!caseVolume) return toolDone('要填写我方文号。', memory, false)
    stopIfNeeded(ctx)
    const forwarded = await ctx.forward({ type: MessageType.ReadCaseFields, payload: { caseVolume } })
    if (!isMessage(forwarded) || forwarded.type !== MessageType.ReadCaseFieldsResult) {
      const error = forwardedError(forwarded)
      return toolDone(error || '案件字段没有返回。', memory, false)
    }
    const text = forwarded.payload.text
    return toolDone(text, memory, text.startsWith('案件字段：'))
  }
  return null
}
