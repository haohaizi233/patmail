import { describe, expect, it } from 'vitest'
import { LlmError } from '../../../src/agent/llm'
import { runAgentTurn, splitAgentReply, type Complete } from '../../../src/agent/loop'
import { EMPTY_MEMORY } from '../../../src/agent/memory'
import { agentToolSchemas, type ToolContext } from '../../../src/agent/tools'
import { groupToolCalls } from '../../../src/agent/turn-policy'
import { config, outcome, idleContext } from './support/agent-test-kit'

describe('tool waves and schemas', () => {
  it('runs case, deadline and api lookups together, and keeps writes alone', () => {
    expect(groupToolCalls(['search_cases', 'search_deadlines', 'lookup_api', 'draft_mail'])).toEqual([[0, 1, 2], [3]])
    expect(groupToolCalls(['search_cases', 'search_cases'])).toEqual([[0], [1]])
    expect(groupToolCalls(['submit_easy', 'lookup_api'])).toEqual([[0], [1]])
  })

  it('leaves reviewer and mail-check schemas out until the question needs them', () => {
    const plain = agentToolSchemas(['查一下文号 P001']).map(tool => tool.function.name)
    expect(plain).toContain('search_cases')
    expect(plain).toContain('call_easy')
    expect(plain).toContain('ask_user')
    expect(plain).toContain('plan_work')
    expect(plain).toContain('list_skills')
    expect(plain).toContain('describe_workflows')
    expect(plain).not.toContain('list_reviewers')
    expect(plain).not.toContain('preview_workflow')
    expect(agentToolSchemas(['帮我建一个工作流']).map(tool => tool.function.name)).toContain('preview_workflow')
    expect(plain).not.toContain('diagnose_mail')
    expect(agentToolSchemas(['审核人有哪些']).map(tool => tool.function.name)).toContain('list_reviewers')
    expect(agentToolSchemas(['查一下', '邮件编号 M-1']).map(tool => tool.function.name)).toContain('diagnose_mail')
  })

  it('overlaps readonly lookups in one model step', async () => {
    let inflight = 0
    let peak = 0
    const ctx: ToolContext = {
      ...idleContext,
      customers: async () => {
        inflight += 1
        peak = Math.max(peak, inflight)
        await new Promise(resolve => setTimeout(resolve, 40))
        inflight -= 1
        return []
      },
      lookupApi: () => {
        inflight += 1
        peak = Math.max(peak, inflight)
        inflight -= 1
        return '文档里没有对上「登录」。'
      }
    }
    let step = 0
    const complete: Complete = async () => {
      step += 1
      if (step === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [
              { id: 'c1', type: 'function', function: { name: 'list_customers', arguments: '{}' } },
              { id: 'c2', type: 'function', function: { name: 'lookup_api', arguments: '{"query":"登录"}' } }
            ]
          }]
        }
      }
      return outcome('两边都看过了。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '客户和登录接口一起看', ctx, complete)
    expect(peak).toBe(2)
    expect(turn.reply).toContain('两边都看过了')
  })

  it('stops a query after two failures with the same arguments', async () => {
    let sent = 0
    const ctx: ToolContext = {
      ...idleContext,
      forward: async () => {
        sent += 1
        return { error: '尚未连接 EASY。' }
      }
    }
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase < 4) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: `s${phase}`, type: 'function', function: { name: 'search_cases', arguments: '{"caseVolume":"P001"}' } }]
          }]
        }
      }
      return outcome('连着没连上，先停在查案件。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '查一下 P001', ctx, complete)
    expect(sent).toBe(1)
    expect(turn.memory.turns.some(item => item.content.includes('连着失败'))).toBe(true)
  })

  it('retries a dropped connection once', async () => {
    let calls = 0
    const seen: string[] = []
    const complete: Complete = async () => {
      calls += 1
      if (calls === 1) throw new LlmError('NETWORK_ERROR', '无法连接模型服务，请检查地址、密钥和网络。')
      return outcome('接上了。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '查一下', idleContext, complete, undefined, label => { seen.push(label) })
    expect(calls).toBe(2)
    expect(seen).toContain('网络不稳，再试一次')
    expect(turn.reply).toBe('接上了。')
  })

  it('continues after the model asks and the user answers', async () => {
    let phase = 0
    const ctx: ToolContext = { ...idleContext, askUser: async () => '1. 工作流叫什么\nPCT提醒' }
    const complete: Complete = async (_config, options) => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'a1', type: 'function', function: { name: 'ask_user', arguments: '{"questions":[{"prompt":"工作流叫什么"}]}' } }]
          }]
        }
      }
      const tool = options.messages.filter(message => message.role === 'tool').at(-1)?.content ?? ''
      expect(tool.startsWith('用户答：')).toBe(true)
      expect(tool).toContain('PCT提醒')
      return outcome('名字用 PCT提醒。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '先问我工作流的名字', ctx, complete)
    expect(phase).toBe(2)
    expect(turn.reply).toContain('PCT提醒')
  })

  it('stops the turn when the user stops during a question', async () => {
    const ctx: ToolContext = { ...idleContext, askUser: async () => '已停下。' }
    const complete: Complete = async () => ({
      usage: null,
      raw: {},
      choices: [{
        content: '',
        reasoning: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'a1', type: 'function', function: { name: 'ask_user', arguments: '{"questions":[{"prompt":"叫什么"}]}' } }]
      }]
    })
    await expect(runAgentTurn(config, EMPTY_MEMORY, '建一条工作流', ctx, complete)).rejects.toMatchObject({ message: '已停下。' })
  })

  it('follows a written plan past the short step cap', async () => {
    const sequence = ['list_customers', 'list_skills', 'describe_workflows', 'lookup_api', 'recall', 'list_tasks']
    const planArgs = JSON.stringify({
      steps: [
        { title: '看客户', tool: 'list_customers' },
        { title: '看本领', tool: 'list_skills' },
        { title: '看工作流', tool: 'describe_workflows' },
        { title: '查接口', tool: 'lookup_api' },
        { title: '翻记忆', tool: 'recall' },
        { title: '列任务', tool: 'list_tasks' }
      ]
    })
    let phase = 0
    const labels: string[] = []
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{ content: '', reasoning: '', finishReason: 'tool_calls', toolCalls: [{ id: 'p', type: 'function', function: { name: 'plan_work', arguments: planArgs } }] }]
        }
      }
      const tool = sequence[phase - 2]
      if (tool) {
        const args = tool === 'lookup_api' ? '{"query":"登录"}' : tool === 'recall' ? '{"query":"客户"}' : '{}'
        return {
          usage: null,
          raw: {},
          choices: [{ content: '', reasoning: '', finishReason: 'tool_calls', toolCalls: [{ id: `t${phase}`, type: 'function', function: { name: tool, arguments: args } }] }]
        }
      }
      return outcome('六步都办好了。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '这几件一起办', idleContext, complete, undefined, label => { labels.push(label) })
    expect(phase).toBe(8)
    expect(splitAgentReply(turn.reply).answer).toBe('六步都办好了。')
    expect(splitAgentReply(turn.reply).thought).toContain('已拆成计划')
    expect(splitAgentReply(turn.reply).thought).toContain('正在查客户')
    expect(labels).toContain('已拆成计划')
  })

  it('keeps going when the model tries to finish with a step left', async () => {
    const planArgs = JSON.stringify({
      steps: [
        { title: '看客户', tool: 'list_customers' },
        { title: '看本领', tool: 'list_skills' }
      ]
    })
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{ content: '', reasoning: '', finishReason: 'tool_calls', toolCalls: [{ id: 'p', type: 'function', function: { name: 'plan_work', arguments: planArgs } }] }]
        }
      }
      if (phase === 2 || phase === 4) {
        const tool = phase === 2 ? 'list_customers' : 'list_skills'
        return {
          usage: null,
          raw: {},
          choices: [{ content: '', reasoning: '', finishReason: 'tool_calls', toolCalls: [{ id: tool, type: 'function', function: { name: tool, arguments: '{}' } }] }]
        }
      }
      if (phase === 3) return outcome('已经办好了。')
      return outcome('两步都办好了。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '先看客户再看本领', idleContext, complete)
    expect(phase).toBe(5)
    expect(splitAgentReply(turn.reply).answer).toBe('两步都办好了。')
    expect(splitAgentReply(turn.reply).thought).toContain('正在查客户')
    expect(splitAgentReply(turn.reply).thought).toContain('正在看本领')
  })
})
