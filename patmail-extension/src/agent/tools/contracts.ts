import type { AgentQuestion } from '../ask'
import { LlmError, type ToolSchema } from '../llm'
import { clipToolResult, type AgentMemoryState } from '../memory'
import type { SelectedPatentFile } from '../../mail/types'
import { isMessage, type ContentRequest } from '../../shared/message'

export interface DeadlineRow {
  procId: string
  caseId: string
  caseVolume: string
  /** 处理事项。提交时用来和表格行精确对行，避免同一文号两行串线。 */
  ctrlProc?: string
}

export interface ToolContext {
  /** 这一轮的取消信号。停下或新的一句话进来时中止。 */
  signal?: AbortSignal
  /** 经工作台转发到已绑定的 EASY 标签页。失败时返回 { error }。 */
  forward(message: ContentRequest): Promise<unknown>
  snapshot(): { connected: boolean; displayName: string; origin: string; message: string }
  customers(): Promise<Array<{ name: string; workflowId: string; surface: string }>>
  workflows(): Promise<Array<{ label: string; summary: string; steps: Array<{ title: string; detail: string }> }>>
  skills(): Array<{ title: string; blurb: string; detail: string }>
  /** 在 API/ 全部接口文档里按 Call、入口或中文主题取片段。 */
  lookupApi(query: string): string | Promise<string>
  /** 按本领创建一条工作流，写进工作流目录。 */
  createWorkflow(input: { name: string; summary: string; skills: string }): Promise<string>
  /** 改一条非系统工作流上的某一栏。 */
  setWorkflowField(input: { name: string; skill: string; field: string; value: string }): Promise<string>
  /** 按查到的文件创建一条发文任务。不提交到 EASY。 */
  createTask(input: { caseVolume: string; applicationNo: string; customerName: string; fileName: string }): Promise<string>
  rememberFiles(files: SelectedPatentFile[]): void
  recentFiles(): SelectedPatentFile[]
  rememberDeadlines(rows: DeadlineRow[]): void
  recentDeadlines(): DeadlineRow[]
  submitEasy(caseVolume: string): Promise<string>
  readCustomer(name: string): Promise<string>
  previewWorkflow(name: string): Promise<string>
  draftMail(customerName: string): Promise<string>
  listTasks(): Promise<string>
  listHistory(surface: string): Promise<string>
  listReviewers(): Promise<string>
  listProcesses(kind: string, searchKey: string): Promise<string>
  listAcceptance(): Promise<string>
  readonlyAcceptance(call: string, caseTypeId: string, mailId: string): Promise<string>
  diagnoseMail(mailId: string): Promise<string>
  exportContacts(volumes: string): Promise<string>
  /** 助手决定提问时，等用户在浮窗里答完。 */
  askUser?(questions: AgentQuestion[]): Promise<string>
}

export interface ToolOutcome {
  text: string
  memory: AgentMemoryState
  ok: boolean
}

export interface ToolDomainModule {
  schemas: readonly ToolSchema[]
  execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
    memory: AgentMemoryState,
  ): Promise<ToolOutcome> | ToolOutcome | null
}

/** 起草结果的固定句式。主题和没收录的占位符都留在原文里。 */
export function formatDraft(parts: {
  letters: number
  subject: string
  body: string
  notes: string[]
  who: string
}): string {
  const body = parts.body.trim()
  const shown = body.length > 600 ? `${body.slice(0, 600)}…` : body
  const notes = parts.notes.map(note => note.trim()).filter(Boolean)
  return [
    `起草完成。分成 ${parts.letters} 封。没有提交到 EASY。`,
    `主题：${parts.subject.trim() || '（空）'}`,
    `正文：${shown || '（空）'}`,
    parts.who.trim(),
    notes.length ? notes.join('\n') : '占位符都已填上。',
  ]
    .filter(Boolean)
    .join('\n')
}

export function toolDone(text: string, memory: AgentMemoryState, ok: boolean): ToolOutcome {
  return { text, memory, ok }
}

export function textArg(args: Record<string, unknown>, key: string, max = 80): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function wholeArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key]
  if (value === undefined || value === '') return 1
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) return null
  return parsed
}

export function stopIfNeeded(ctx: ToolContext): void {
  if (ctx.signal?.aborted) throw new LlmError('REQUEST_TIMEOUT', '已停下。')
}

export function clipToolText(text: string): string {
  return clipToolResult(text)
}

export function forwardedError(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string') {
    return value.error
  }
  if (!isMessage(value)) return 'EASY 没有返回可识别的结果。'
  return null
}

export function pageNote(total: number, pageIndex: number, pageSize: number, totalPages: number): string {
  const pages = Math.max(1, totalPages || 1)
  const shown = Math.min(Math.max(1, pageIndex), pages)
  const more = shown < pages ? `\n还有下一页。要看下一页，用同样的条件再查，页码填 ${shown + 1}。` : ''
  return `第 ${shown} / ${pages} 页，每页 ${pageSize} 条。${more}`
}

export interface ListedRows<T> {
  text: string
  ok: boolean
  rows: T[]
  queryKey: string
  replace: boolean
}
