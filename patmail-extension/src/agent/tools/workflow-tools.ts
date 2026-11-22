import type { ToolSchema } from '../llm'
import type { AgentMemoryState } from '../memory'
import { clipToolText, stopIfNeeded, textArg, toolDone, type ToolContext, type ToolOutcome } from './contracts'

export const WORKFLOW_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: '列出这位登录人在插件里配过的客户，以及各自走哪条工作流。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_workflows',
      description: '用大白话说明一条已有的发文工作流要做什么。不给名字就列出全部。要新建用 create_workflow。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '工作流名称的一部分，例如 PCT 或鹏城' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: '列出可以拼进工作流的本领：读表、对事项、配收件人、提交审核等，每项都是给非技术人员看的说法。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_workflow',
      description: '按本领创建一条工作流并保存。本领用中文名，用顿号或逗号分开，例如：读表格、核对事项、谁来收。系统自带的不会被覆盖。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '工作流名字' },
          skills: { type: 'string', description: '要包含的本领，按顺序' },
          summary: { type: 'string', description: '一句说明，可空' },
        },
        required: ['name', 'skills'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_workflow_field',
      description: '修改一条自己创建的工作流里某一栏的值。不能改系统自带的 PCT提醒、PCT鹏城专案和文件管理。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '工作流的完整名字' },
          skill: { type: 'string', description: '本领名字，例如 读表格' },
          field: { type: 'string', description: '栏的名字，例如 我方文号那一列' },
          value: { type: 'string', description: '要写成的内容' },
        },
        required: ['name', 'skill', 'field', 'value'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_customer',
      description: '读一位客户在插件里的配置和绑定的工作流。连上 EASY 时再读客户名录。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '客户名称' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_workflow',
      description: '用大白话预览一条工作流的步骤。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '工作流名字' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_history',
      description: '列出记录页里保存的查询。',
      parameters: {
        type: 'object',
        properties: { surface: { type: 'string', description: 'file 或 limit，默认 file' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_acceptance',
      description: '列出验收页已经记下的只读核对记录。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readonly_acceptance',
      description: '对一个只读接口做一次验收核对。不发送写请求。',
      parameters: {
        type: 'object',
        properties: {
          call: { type: 'string', description: '只读 Call 名' },
          caseTypeId: { type: 'string', description: '案件类型，可空' },
          mailId: { type: 'string', description: '邮件编号，可空' },
        },
        required: ['call'],
        additionalProperties: false,
      },
    },
  },
]

export async function executeWorkflowTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome | null> {
  if (name === 'list_customers') {
    const rows = await ctx.customers()
    if (rows.length === 0) return toolDone('当前账号还没有在插件里保存客户。', memory, true)
    return toolDone(
      clipToolText(rows.slice(0, 40).map(row => `${row.name}｜入口 ${row.surface || '未设'}｜工作流 ${row.workflowId || '未设'}`).join('\n')),
      memory,
      true,
    )
  }
  if (name === 'describe_workflows') {
    const nameQuery = textArg(args, 'name', 40).toLowerCase()
    const flows = await ctx.workflows()
    const picked = nameQuery ? flows.filter(flow => flow.label.toLowerCase().includes(nameQuery) || flow.summary.toLowerCase().includes(nameQuery)) : flows
    if (picked.length === 0) return toolDone('没有对上的工作流。', memory, false)
    return toolDone(
      clipToolText(picked.map(flow => `${flow.label}：${flow.summary}\n${flow.steps.map((step, index) => `${index + 1}. ${step.title} ${step.detail}`).join('\n')}`).join('\n\n')),
      memory,
      true,
    )
  }
  if (name === 'list_skills') {
    return toolDone(clipToolText(ctx.skills().map(skill => `${skill.title}：${skill.blurb}。${skill.detail}`).join('\n')), memory, true)
  }
  if (name === 'create_workflow') {
    const title = textArg(args, 'name', 40)
    const skills = textArg(args, 'skills', 400)
    if (!title || !skills) return toolDone('要有名字，以及用哪些本领。', memory, false)
    stopIfNeeded(ctx)
    const created = await ctx.createWorkflow({ name: title, summary: textArg(args, 'summary', 400), skills })
    return toolDone(created, memory, created.startsWith('已'))
  }
  if (name === 'set_workflow_field') {
    const title = textArg(args, 'name', 40)
    const skill = textArg(args, 'skill', 40)
    const field = textArg(args, 'field', 40)
    const value = textArg(args, 'value', 200)
    if (!title || !skill || !field || !value) return toolDone('要写明工作流、本领、哪一栏、改成什么。', memory, false)
    stopIfNeeded(ctx)
    const edited = await ctx.setWorkflowField({ name: title, skill, field, value })
    return toolDone(edited, memory, edited.startsWith('已'))
  }
  if (name === 'read_customer') {
    const title = textArg(args, 'name', 80)
    if (!title) return toolDone('要写明客户名称。', memory, false)
    const text = await ctx.readCustomer(title)
    return toolDone(text, memory, text.startsWith('客户 '))
  }
  if (name === 'preview_workflow') {
    const title = textArg(args, 'name', 40)
    if (!title) return toolDone('要写明工作流名字。', memory, false)
    const text = await ctx.previewWorkflow(title)
    return toolDone(text, memory, text.startsWith('工作流预览'))
  }
  if (name === 'list_history') {
    const text = await ctx.listHistory(textArg(args, 'surface', 16))
    return toolDone(text, memory, text.startsWith('查询记录共'))
  }
  if (name === 'list_acceptance') {
    const text = await ctx.listAcceptance()
    return toolDone(text, memory, text.startsWith('验收共'))
  }
  if (name === 'readonly_acceptance') {
    const call = textArg(args, 'call', 40)
    if (!call) return toolDone('要写明只读 Call 名。', memory, false)
    const text = await ctx.readonlyAcceptance(call, textArg(args, 'caseTypeId', 80), textArg(args, 'mailId', 40))
    return toolDone(text, memory, text.startsWith('只读验收 '))
  }
  return null
}
