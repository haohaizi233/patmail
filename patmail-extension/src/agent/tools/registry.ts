import { LlmError, type ToolSchema } from '../llm'
import type { AgentMemoryState } from '../memory'
import { requiredTools } from '../turn-policy'
import { CASE_TOOL_SCHEMAS, executeCaseTool } from './case-tools'
import { CONNECTION_TOOL_SCHEMAS, executeConnectionTool } from './connection-tools'
import { stopIfNeeded, toolDone, type ToolContext, type ToolOutcome } from './contracts'
import { DEADLINE_TOOL_SCHEMAS, executeDeadlineTool } from './deadline-tools'
import { DOCUMENTATION_TOOL_SCHEMAS, executeDocumentationTool } from './documentation-tools'
import { MAIL_TOOL_SCHEMAS, executeMailTool } from './mail-tools'
import { executeMemoryTool, MEMORY_TOOL_SCHEMAS } from './memory-tools'
import { executeWorkflowTool, WORKFLOW_TOOL_SCHEMAS } from './workflow-tools'

const ALL_SCHEMAS: readonly ToolSchema[] = [
  ...CONNECTION_TOOL_SCHEMAS,
  ...CASE_TOOL_SCHEMAS,
  ...DEADLINE_TOOL_SCHEMAS,
  ...WORKFLOW_TOOL_SCHEMAS,
  ...DOCUMENTATION_TOOL_SCHEMAS,
  ...MEMORY_TOOL_SCHEMAS,
  ...MAIL_TOOL_SCHEMAS,
]

const SCHEMA_BY_NAME = new Map<string, ToolSchema>(ALL_SCHEMAS.map(schema => [schema.function.name, schema]))

// 保持模型工具枚举展示顺序稳定。
const ORDERED_NAMES = [
  'connection_status',
  'search_cases',
  'search_deadlines',
  'list_customers',
  'describe_workflows',
  'list_skills',
  'call_easy',
  'lookup_api',
  'plan_work',
  'ask_user',
  'remember',
  'recall',
  'create_workflow',
  'set_workflow_field',
  'create_task',
  'read_customer',
  'preview_workflow',
  'draft_mail',
  'list_tasks',
  'list_history',
  'list_reviewers',
  'list_processes',
  'list_acceptance',
  'readonly_acceptance',
  'diagnose_mail',
  'submit_easy',
  'export_contacts',
  'review_case_fields',
] as const

export const SCHEMAS: ToolSchema[] = ORDERED_NAMES.map(name => SCHEMA_BY_NAME.get(name)!).filter(Boolean)
const KNOWN_TOOL_NAMES = new Set(SCHEMAS.map(item => item.function.name))

/** 每轮都带上的工具。其余在用户这句话用得上时才带 schema。 */
const HOT_TOOLS = new Set([
  'connection_status',
  'search_cases',
  'search_deadlines',
  'list_customers',
  'lookup_api',
  'call_easy',
  'ask_user',
  'plan_work',
  'remember',
  'recall',
  'create_task',
  'draft_mail',
  'submit_easy',
  'list_skills',
  'describe_workflows',
  'review_case_fields',
])

const COLD_TOOLS: ReadonlyArray<readonly [string, RegExp]> = [
  ['describe_workflows', /工作流/],
  ['list_skills', /本领|技能/],
  ['create_workflow', /工作流/],
  ['set_workflow_field', /栏|字段/],
  ['read_customer', /客户资料|客户配置|这位客户/],
  ['preview_workflow', /预览/],
  ['list_tasks', /任务/],
  ['list_history', /查询记录|历史查询|记录页/],
  ['list_reviewers', /审核人/],
  ['list_processes', /流程/],
  ['list_acceptance', /验收/],
  ['readonly_acceptance', /验收/],
  ['diagnose_mail', /核对邮件|邮件核对|邮件编号|mailId|mail_id/i],
  ['export_contacts', /联系人/],
]

/** 不传文本时返回全部，供对照。传入本轮用户原话后，冷工具只在对得上时出现。 */
export function agentToolSchemas(texts?: readonly string[]): ToolSchema[] {
  if (!texts) return SCHEMAS
  const blob = texts.join('\n')
  const wanted = new Set(HOT_TOOLS)
  for (const name of requiredTools(blob)) wanted.add(name)
  for (const [name, pattern] of COLD_TOOLS) {
    if (pattern.test(blob)) wanted.add(name)
  }
  if (/工作流/.test(blob) || wanted.has('create_workflow')) {
    for (const name of ['list_skills', 'describe_workflows', 'preview_workflow', 'create_workflow', 'set_workflow_field']) {
      wanted.add(name)
    }
  }
  for (const schema of SCHEMAS) {
    if (blob.includes(schema.function.name)) wanted.add(schema.function.name)
  }
  return SCHEMAS.filter(schema => wanted.has(schema.function.name))
}

export async function executeAgentTool(
  name: string,
  rawArguments: string,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome> {
  let args: Record<string, unknown> = {}
  if (rawArguments.trim()) {
    try {
      const parsed = JSON.parse(rawArguments) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>
      }
    } catch {
      return toolDone('工具参数不是有效 JSON。', memory, false)
    }
  }
  try {
    stopIfNeeded(ctx)
    const syncOutcome = executeConnectionTool(name, args, ctx, memory)
    if (syncOutcome) return syncOutcome

    const outcome =
      (await executeCaseTool(name, args, ctx, memory)) ??
      (await executeDeadlineTool(name, args, ctx, memory)) ??
      (await executeWorkflowTool(name, args, ctx, memory)) ??
      (await executeDocumentationTool(name, args, ctx, memory)) ??
      (await executeMemoryTool(name, args, ctx, memory, KNOWN_TOOL_NAMES)) ??
      (await executeMailTool(name, args, ctx, memory))

    if (outcome) return outcome

    const names = SCHEMAS.map(item => item.function.name).join('、')
    return toolDone(`没有这个工具：${name}。现在可以用：${names}`, memory, false)
  } catch (error) {
    if (error instanceof LlmError && error.message === '已停下。') throw error
    return toolDone(error instanceof Error ? error.message : '工具没有完成。', memory, false)
  }
}
