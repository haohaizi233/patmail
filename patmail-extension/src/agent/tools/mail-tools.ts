import type { ToolSchema } from '../llm'
import type { AgentMemoryState } from '../memory'
import { stopIfNeeded, textArg, toolDone, type ToolContext, type ToolOutcome } from './contracts'

export const MAIL_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '按文号、申请号、客户或文件名查出文件，在发文任务里记下一条计划。一次最多 8 个文件。不会提交到 EASY，也不会代点创建发文或提交审核。',
      parameters: {
        type: 'object',
        properties: {
          caseVolume: { type: 'string', description: '我方文号' },
          applicationNo: { type: 'string', description: '申请号' },
          customerName: { type: 'string', description: '客户名称' },
          fileName: { type: 'string', description: '文件名' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_mail',
      description: '用这一轮查到的文件起草主题和正文，并分成几封。占位符由文件填写。不发送，不提交。',
      parameters: {
        type: 'object',
        properties: { customerName: { type: 'string', description: '客户名称，可空，空则用这一轮文件上的客户' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '列出发文任务页里当前登录人的任务。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reviewers',
      description: '列出审核人，并说明当前登录人能否被选中。不提交审核。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_processes',
      description: '列出流程名单。不开页面。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'AP、EF 或 CO' },
          searchKey: { type: 'string', description: '搜索词，可空' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_mail',
      description: '只读核对一封已经存在的邮件，不写入。',
      parameters: {
        type: 'object',
        properties: { mailId: { type: 'string', description: '邮件编号' } },
        required: ['mailId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_easy',
      description: '按这一轮查到的期限事项，创建发文并提交给默认审核人。写开关关着就不会提交。',
      parameters: {
        type: 'object',
        properties: { caseVolume: { type: 'string', description: '我方文号，可空。空则用这一轮查到的文件文号' } },
        additionalProperties: false,
      },
    },
  },
]

export async function executeMailTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome | null> {
  if (name === 'create_task') {
    stopIfNeeded(ctx)
    const text = await ctx.createTask({
      caseVolume: textArg(args, 'caseVolume'),
      applicationNo: textArg(args, 'applicationNo'),
      customerName: textArg(args, 'customerName', 120),
      fileName: textArg(args, 'fileName', 120),
    })
    return toolDone(text, memory, text.startsWith('已') || text.includes('没有提交到 EASY'))
  }
  if (name === 'draft_mail') {
    const text = await ctx.draftMail(textArg(args, 'customerName', 80))
    return toolDone(text, memory, text.startsWith('起草完成'))
  }
  if (name === 'list_tasks') {
    const text = await ctx.listTasks()
    return toolDone(text, memory, text.startsWith('发文任务共'))
  }
  if (name === 'list_reviewers') {
    const text = await ctx.listReviewers()
    return toolDone(text, memory, text.startsWith('审核人共'))
  }
  if (name === 'list_processes') {
    const kind = textArg(args, 'kind', 8).toUpperCase()
    if (kind !== 'AP' && kind !== 'EF' && kind !== 'CO') {
      return toolDone('流程种类要是 AP、EF 或 CO。', memory, false)
    }
    const text = await ctx.listProcesses(kind, textArg(args, 'searchKey', 80))
    return toolDone(text, memory, text.startsWith('流程共'))
  }
  if (name === 'diagnose_mail') {
    const mailId = textArg(args, 'mailId', 40)
    if (!mailId) return toolDone('要写明邮件编号。', memory, false)
    const text = await ctx.diagnoseMail(mailId)
    return toolDone(text, memory, text.startsWith('邮件核对 '))
  }
  if (name === 'submit_easy') {
    stopIfNeeded(ctx)
    const text = await ctx.submitEasy(textArg(args, 'caseVolume', 400))
    return toolDone(text, memory, text.startsWith('已提交到 EASY'))
  }
  return null
}
