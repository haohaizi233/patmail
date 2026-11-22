import { applyEasyRefs, documentedCallAllowed, explainEasyArgs, payloadFromSummary, readEasySteps } from '../../api/documented-call'
import { isMessage, MessageType } from '../../shared/message'
import type { ToolSchema } from '../llm'
import type { AgentMemoryState } from '../memory'
import { clipToolText, forwardedError, stopIfNeeded, textArg, toolDone, type ToolContext, type ToolOutcome } from './contracts'

async function callEasy(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const explained = explainEasyArgs(args)
  if (explained) return explained
  const steps = readEasySteps(args)
  if (!steps) return '请给出入口和 Call，或一组按顺序调用的步骤。'
  const earlier: unknown[] = []
  const parts: string[] = []
  for (const [index, step] of steps.entries()) {
    stopIfNeeded(ctx)
    const allowed = documentedCallAllowed(step.handler, step.call)
    if (!allowed.ok) return [parts.join('\n\n'), `第 ${index + 1} 步${allowed.reason}`].filter(Boolean).join('\n')
    const filled = applyEasyRefs(step.fields, earlier)
    if (!filled.ok) return [parts.join('\n\n'), `第 ${index + 1} 步${filled.reason}`].filter(Boolean).join('\n')
    const forwarded = await ctx.forward({
      type: MessageType.CallEasy,
      payload: { handler: step.handler, call: step.call, ...(Object.keys(filled.fields).length ? { fields: filled.fields } : {}) },
    })
    const error = forwardedError(forwarded)
    if (error) return [parts.join('\n\n'), `第 ${index + 1} 步没有完成：${error}`].filter(Boolean).join('\n')
    if (!isMessage(forwarded) || forwarded.type !== MessageType.CallEasyResult) {
      return [parts.join('\n\n'), `第 ${index + 1} 步没有返回。`].filter(Boolean).join('\n')
    }
    earlier.push(payloadFromSummary(forwarded.payload.text))
    parts.push(`第 ${index + 1} 步 ${step.handler} ${step.call}\n${forwarded.payload.text}`)
  }
  return clipToolText(`已用当前登录会话调用，没有改数据。\n${parts.join('\n\n')}`)
}

export const DOCUMENTATION_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'call_easy',
      description: '用当前登录会话按顺序调用不会改数据的原站接口。固定组合用 recipe 加 case_id：biology、case-info、case-flow、case-demand。单步给 handler 和 call。要组合时给 steps，后面字段用 @{1.路径} 取第 1 步响应里的值，例如 @{1.TableRows.0.case_id}。先用 lookup_api 核对入口和参数。会改数据的 Call 不会发出。仲裁收件人不要用这个，页面会把表格和客户要求直接写成文字。',
      parameters: {
        type: 'object',
        properties: {
          recipe: { type: 'string', description: 'biology、case-info、case-flow、case-demand 之一' },
          case_id: { type: 'string', description: '查案件或查期限返回的案件编号' },
          handler: { type: 'string', description: '单步时的 ashx 入口，如 CFInvoice.ashx' },
          call: { type: 'string', description: '单步时的 Call 名，如 GetBiologyList' },
          fields: { type: 'object', description: '单步表单字段，值都是字符串。可空。', additionalProperties: { type: 'string' } },
          steps: {
            type: 'array',
            description: '按顺序组合，最多 4 步。每步含 handler、call、fields。',
            items: {
              type: 'object',
              properties: {
                handler: { type: 'string' },
                call: { type: 'string' },
                fields: { type: 'object', additionalProperties: { type: 'string' } },
              },
              required: ['handler', 'call'],
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_api',
      description: '查阅全部原站接口文档。词法和语义两路同时检索，再合并最相关的片段。用 Call 名（如 GetSearchFiles）、ashx 入口或中文主题。问一共有多少接口时，query 用「多少接口」。真实响应用 call_easy 发，不要说发不出请求。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Call 名、入口或中文主题' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
]

export async function executeDocumentationTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): Promise<ToolOutcome | null> {
  if (name === 'lookup_api') {
    const query = textArg(args, 'query', 120)
    if (!query) return toolDone('请给出 Call 名、入口或中文主题。', memory, false)
    return toolDone(clipToolText(await ctx.lookupApi(query)), memory, true)
  }
  if (name === 'call_easy') {
    const text = await callEasy(ctx, args)
    return toolDone(text, memory, text.startsWith('已用当前登录会话调用'))
  }
  return null
}
