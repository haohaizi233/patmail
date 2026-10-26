import { AGENT_CONFIG_DEFAULT } from '../../../../src/agent/config'
import type { ChatOutcome } from '../../../../src/agent/llm'
import { emptyPageTools, type ToolContext } from '../../../../src/agent/tools'

export const config = { ...AGENT_CONFIG_DEFAULT, maxTokens: 64 }

export function outcome(content: string, toolName?: string): ChatOutcome {
  return {
    usage: null,
    raw: {},
    choices: [{
      content,
      reasoning: '',
      finishReason: toolName ? 'tool_calls' : 'stop',
      toolCalls: toolName ? [{ id: 'call_1', type: 'function', function: { name: toolName, arguments: '{"text":"先看法律期限"}' } }] : []
    }]
  }
}

export const idleContext: ToolContext = {
  forward: async () => ({ error: '尚未连接 EASY。' }),
  snapshot: () => ({ connected: false, displayName: '', origin: '', message: '尚未连接 EASY。' }),
  customers: async () => [],
  workflows: async () => [{ label: 'PCT提醒', summary: '把表格整理成信', steps: [{ title: '读表格', detail: '一行一件' }] }],
  skills: () => [{ title: '读表格', blurb: '从表格里读出文号', detail: '表头要对上。' }],
  lookupApi: query => `文档里没有对上「${query}」。`,
  createWorkflow: async () => '已创建工作流。',
  setWorkflowField: async () => '已改这一栏。',
  createTask: async () => '已记下任务。',
  ...emptyPageTools()
}

