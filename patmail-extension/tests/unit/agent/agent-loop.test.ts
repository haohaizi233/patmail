import { describe, expect, it } from 'vitest'
import { LlmError } from '../../../src/agent/llm'
import { journalEntries, packJournal, runAgentTurn, splitAgentReply, thoughtLead, type Complete } from '../../../src/agent/loop'
import { EMPTY_MEMORY, rememberFact } from '../../../src/agent/memory'
import { MessageType } from '../../../src/shared/message'
import { executeAgentTool, formatDraft, type ToolContext } from '../../../src/agent/tools'
import { config, outcome, idleContext } from './support/agent-test-kit'

describe('agent loop', () => {
  it('retries a rate limit before giving up', async () => {
    let tries = 0
    const complete: Complete = async () => {
      tries += 1
      if (tries === 1) throw new LlmError('HTTP_ERROR', 'slow', 429)
      return outcome('好。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, complete)
    expect(tries).toBe(2)
    expect(turn.reply).toContain('好')
  })

  it('does not send the same case query twice in one turn', async () => {
    let calls = 0
    const ctx: ToolContext = {
      ...idleContext,
      forward: async () => {
        calls += 1
        return {
          type: MessageType.SearchFilesResult,
          payload: { ok: true, data: { items: [], total: 0, pageIndex: 1, pageSize: 20, totalPages: 1 } }
        }
      }
    }
    let step = 0
    const complete: Complete = async () => {
      step += 1
      if (step < 3) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: `c${step}`, type: 'function', function: { name: 'search_cases', arguments: '{"caseVolume":"P001"}' } }]
          }]
        }
      }
      return outcome('查过了。')
    }
    await runAgentTurn(config, EMPTY_MEMORY, '查 P001', ctx, complete)
    expect(calls).toBe(1)
  })

  it('calls a tool and then answers from the tool result', async () => {
    const seen: string[] = []
    const activity: string[] = []
    const complete: Complete = async (_config, options) => {
      seen.push(options.messages.at(-1)?.role ?? '')
      if (!options.messages.some(message => message.role === 'tool')) return outcome('', 'remember')
      return outcome('已记下：以后先看法律期限。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '记住我先看法律期限', idleContext, complete, undefined, label => activity.push(label))
    expect(seen).toEqual(['user', 'tool'])
    expect(activity).toContain('正在记下')
    expect(turn.reply).toContain('法律期限')
    expect(turn.memory.facts.map(fact => fact.text)).toEqual(['先看法律期限'])
    expect(turn.history.map(item => item.role)).toEqual(['user', 'assistant'])
    expect(turn.steps).toBe(2)
  })

  it('puts the reasoning chain in front of the answer only when thinking is on', async () => {
    const complete: Complete = async () => ({
      usage: null,
      raw: {},
      choices: [{ content: '结论', reasoning: '先核对字段', finishReason: 'stop', toolCalls: [] }]
    })
    const on = await runAgentTurn({ ...config, thinking: true }, EMPTY_MEMORY, '你好', idleContext, complete)
    expect(splitAgentReply(on.reply)).toEqual({ thought: '先核对字段', answer: '结论' })
    const off = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, complete)
    expect(off.reply).toBe('结论')
  })

  it('keeps every thinking pass and the step record after the turn ends', async () => {
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '先查这件案子。',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'c1', type: 'function', function: { name: 'search_cases', arguments: '{"caseVolume":"PA25110088CND"}' } }]
          }]
        }
      }
      if (phase === 2) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '再看有哪些本领。',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'c2', type: 'function', function: { name: 'list_skills', arguments: '{}' } }]
          }]
        }
      }
      return {
        usage: null,
        raw: {},
        choices: [{ content: '接口返回了空表。', reasoning: '把这次响应告诉用户。', finishReason: 'stop', toolCalls: [] }]
      }
    }
    const turn = await runAgentTurn({ ...config, thinking: true }, EMPTY_MEMORY, '你给我调用下', idleContext, complete)
    const split = splitAgentReply(turn.reply)
    expect(split.answer).toBe('接口返回了空表。')
    const order = ['先查这件案子。', '- 正在查案件', '再看有哪些本领。', '- 正在看本领', '把这次响应告诉用户。']
    let cursor = -1
    for (const piece of order) {
      const found = split.thought.indexOf(piece)
      expect(found).toBeGreaterThan(cursor)
      cursor = found
    }
  })

  it('asks once more for the conclusion when thinking is cut off by the length limit', async () => {
    const thinking: boolean[] = []
    const complete: Complete = async (active, options) => {
      thinking.push(active.thinking)
      if (thinking.length === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '让我看看规则。我应该如实反馈。让我再试一次。规则说不能编。',
            finishReason: 'length',
            toolCalls: []
          }]
        }
      }
      expect(options.messages.at(-1)?.content).toContain('直接给出结论')
      expect(options.tools).toBeUndefined()
      return { usage: null, raw: {}, choices: [{ content: '文档里没有登录方面的接口。', reasoning: '', finishReason: 'stop', toolCalls: [] }] }
    }
    const turn = await runAgentTurn({ ...config, thinking: true, maxTokens: 1024 }, EMPTY_MEMORY, '登录方面的接口有哪些', idleContext, complete)
    expect(thinking).toEqual([true, false])
    expect(splitAgentReply(turn.reply).answer).toBe('文档里没有登录方面的接口。')
    expect(turn.reply).not.toContain('让我看看规则')
  })

  it('stitches a reply that stopped at the length limit', async () => {
    let calls = 0
    const complete: Complete = async () => {
      calls += 1
      if (calls === 1) return { usage: null, raw: {}, choices: [{ content: '查到 2 件。', reasoning: '', finishReason: 'length', toolCalls: [] }] }
      return { usage: null, raw: {}, choices: [{ content: '都还没到提交。', reasoning: '', finishReason: 'stop', toolCalls: [] }] }
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '查一下', idleContext, complete)
    expect(turn.reply).toBe('查到 2 件。\n都还没到提交。')
  })

  it('shows the draft while the model is still writing, even when thinking is off', async () => {
    const seen: string[] = []
    const complete: Complete = async (_active, options) => {
      options.onDelta?.({ reasoning: '', content: '让我再看规则' })
      options.onDelta?.({ reasoning: '', content: '让我再看规则。没有对上。' })
      return { usage: null, raw: {}, choices: [{ content: '没有对上。', reasoning: '', finishReason: 'stop', toolCalls: [] }] }
    }
    const labels: string[] = []
    await runAgentTurn(config, EMPTY_MEMORY, '登录接口', idleContext, complete, undefined, (label, thought) => {
      labels.push(label)
      if (thought) seen.push(thought)
    })
    expect(labels).toContain('正在写')
    expect(seen.some(item => item.includes('让我再看规则'))).toBe(true)
  })

  it('hides an unclosed think tag instead of showing it as the answer', () => {
    const split = splitAgentReply('<think>先看规则\n还在想')
    expect(split.answer).toBe('')
    expect(split.thought).toContain('先看规则')
  })

  it('folds a stored 思考 heading so the Chinese reply stays outside the chain', () => {
    const raw = '**思考**\n\nThe user said "你好" (Hello).\n\nI will respond in Chinese as requested.\n\n你好！我是 PatMail 执行助手。'
    expect(splitAgentReply(raw)).toEqual({
      thought: 'The user said "你好" (Hello).\n\nI will respond in Chinese as requested.',
      answer: '你好！我是 PatMail 执行助手。'
    })
    expect(thoughtLead(splitAgentReply(raw).thought)).toBe('The user said "你好" (Hello).')
  })

  it('keeps only the first line of a long thought as the collapsed lead', () => {
    expect(thoughtLead(`${'字'.repeat(40)}\n第二行不该露出来。`)).toBe(`${'字'.repeat(36)}…`)
  })

  it('keeps finished steps in the fold and leads with the latest step', () => {
    const thought = '先看规则。\n\n- 正在查接口：文档里有这个 Call\n- 正在等你回答'
    expect(journalEntries(thought)).toEqual([
      { kind: 'thought', text: '先看规则。', detail: '' },
      { kind: 'step', text: '正在查接口', detail: '文档里有这个 Call' },
      { kind: 'step', text: '正在等你回答', detail: '' }
    ])
    expect(thoughtLead(thought)).toBe('正在等你回答')
  })

  it('drops extra thinking before it drops the steps', () => {
    const reply = packJournal('结论', [
      { kind: 'thought', text: '想'.repeat(13_000), detail: '' },
      { kind: 'step', text: '正在查接口', detail: '有这个 Call' }
    ])
    const split = splitAgentReply(reply)
    expect(split.answer).toBe('结论')
    expect(split.thought).toContain('正在查接口')
    expect(split.thought.includes('想'.repeat(13_000))).toBe(false)
  })

  it('nudges a workflow claim until the tool succeeds, and hides the nudge', async () => {
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) return outcome('已经建好工作流了。')
      if (phase === 2) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'wf', type: 'function', function: { name: 'create_workflow', arguments: '{"name":"甲","skills":"读表格"}' } }]
          }]
        }
      }
      return outcome('已创建「甲」。可以在工作流页面看到。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '帮我建一个工作流，名字甲，本领读表格', idleContext, complete)
    expect(phase).toBe(3)
    expect(turn.reply).toContain('已创建')
    expect(turn.history.map(item => item.content).join('\n')).not.toContain('去调用工具')
  })

  it('warns on the third identical query and stops before the fifth run', async () => {
    let forwards = 0
    const ctx: ToolContext = {
      ...idleContext,
      forward: async () => {
        forwards += 1
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              items: [{ fileId: 'f1', fileName: '受理通知书', caseVolume: 'P001' }],
              total: 1, pageIndex: 1, pageSize: 10, totalPages: 1
            }
          }
        }
      }
    }
    const seen: string[] = []
    const complete: Complete = async (_config, options) => {
      seen.push(options.messages.filter(message => message.role === 'tool').map(message => message.content).join('\n'))
      if (!options.tools?.length) return outcome('停在文号 P001，不再重复查。')
      return {
        usage: null,
        raw: {},
        choices: [{
          content: '',
          reasoning: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: `c${seen.length}`, type: 'function', function: { name: 'search_cases', arguments: '{"caseVolume":"P001"}' } }]
        }]
      }
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '查文号 P001', ctx, complete)
    expect(forwards).toBe(1)
    expect(seen.some(text => text.includes('第 3 次'))).toBe(true)
    expect(seen.some(text => text.includes('重复了 5 次') && text.includes('search_cases'))).toBe(true)
    expect(turn.reply).toContain('P001')
  })

  it('asks again when a failed tool is described as done', async () => {
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 's1', type: 'function', function: { name: 'search_cases', arguments: '{"caseVolume":"P001"}' } }]
          }]
        }
      }
      if (phase === 2) return outcome('已经办好了。')
      return outcome('还没连上，这一步没查成。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '查一下 P001', idleContext, complete)
    expect(turn.reply).toContain('没查成')
    expect(phase).toBe(3)
  })

  it('closes a maxed-out turn without tools, and keeps a blocked narration as the reply', async () => {
    const toolsOff: boolean[] = []
    const looping: Complete = async (_config, options) => {
      toolsOff.push(!options.tools?.length)
      if (!options.tools?.length) return outcome('查到一半，停在文件查询。')
      return {
        usage: null,
        raw: {},
        choices: [{
          content: '',
          reasoning: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: `t${toolsOff.length}`, type: 'function', function: { name: 'search_cases', arguments: JSON.stringify({ caseVolume: `P${toolsOff.length}` }) } }]
        }]
      }
    }
    const summarized = await runAgentTurn(config, EMPTY_MEMORY, '看一下连接', idleContext, looping)
    expect(summarized.reply).toContain('停在文件查询')
    expect(toolsOff.filter(Boolean)).toEqual([true])
    expect(toolsOff.filter(open => !open)).toHaveLength(6)

    let calls = 0
    const narrating: Complete = async (_config, options) => {
      calls += 1
      expect(options.tools?.length).toBeGreaterThan(0)
      return outcome('我已经建好了。')
    }
    const blocked = await runAgentTurn(config, EMPTY_MEMORY, '帮我建一个工作流', idleContext, narrating)
    expect(calls).toBe(3)
    expect(blocked.reply).toContain('建好')
  })

  it('hangs recall on the user message and drops a fact the user never said', async () => {
    let system = ''
    let user = ''
    const remembered = rememberFact({ ...EMPTY_MEMORY, summary: '摘录标记XYZ' }, '先看法律期限')
    const complete: Complete = async (_config, options) => {
      system = options.messages[0]?.content ?? ''
      user = options.messages.filter(message => message.role === 'user').at(-1)?.content ?? ''
      return outcome('好。')
    }
    await runAgentTurn(config, remembered, '你好', idleContext, complete)
    expect(system).not.toContain('先看法律期限')
    expect(system).not.toContain('摘录标记XYZ')
    expect(user).toContain('先看法律期限')
    expect(user).toContain('摘录标记XYZ')

    let phase = 0
    const inventing: Complete = async () => {
      phase += 1
      if (phase === 1) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'r1', type: 'function', function: { name: 'remember', arguments: '{"text":"凭空的客户甲"}' } }]
          }]
        }
      }
      return outcome('没有记下。')
    }
    const dropped = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, inventing)
    expect(dropped.memory.facts).toEqual([])
    expect(dropped.reply).toContain('没有记下')
  })

  it('remembers a paraphrased preference using its verified original user quote', async () => {
    let calls = 0
    const persisted: string[][] = []
    const complete: Complete = async (_config, options) => {
      calls += 1
      if (calls > 1) return outcome('已记住，以后我就叫雷琳玥。')
      const schema = options.tools?.find(tool => tool.function.name === 'remember')
      expect(schema?.function.parameters.required).toContain('source')
      const result = outcome('', 'remember')
      result.choices[0].toolCalls[0].function.arguments = JSON.stringify({ text: '用户希望助手以后叫雷琳玥', source: '你以后就叫雷琳玥了' })
      return result
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '你以后就叫雷琳玥了', idleContext, complete, async state => {
      persisted.push(state.facts.map(fact => fact.text))
    })
    expect(turn.memory.facts.map(fact => fact.text)).toEqual(['你以后就叫雷琳玥了'])
    expect(persisted.at(-1)).toEqual(['你以后就叫雷琳玥了'])
    expect(calls).toBe(2)
  })

  it('preserves the source meaning rather than saving an unsupported interpretation', async () => {
    let calls = 0
    const complete: Complete = async () => {
      if (++calls > 1) return outcome('已记住，不叫你王总。')
      const result = outcome('', 'remember')
      result.choices[0].toolCalls[0].function.arguments = JSON.stringify({ text: '用户喜欢被叫王总，客户编号是P999', source: '不要叫我王总' })
      return result
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '不要叫我王总', idleContext, complete)
    expect(turn.memory.facts.map(fact => fact.text)).toEqual(['不要叫我王总'])
    expect(JSON.stringify(turn.memory.facts)).not.toContain('P999')
  })

  it('allows one correction with original evidence and accepts the recovered result', async () => {
    let calls = 0
    const complete: Complete = async () => {
      calls += 1
      if (calls > 2) return outcome('已记住，以后我就叫雷琳玥。')
      const result = outcome('', 'remember')
      result.choices[0].toolCalls[0].id = `remember-${calls}`
      result.choices[0].toolCalls[0].function.arguments = JSON.stringify(calls === 1
        ? { text: '助手名字是雷琳玥' }
        : { text: '用户希望助手叫雷琳玥', source: '你以后就叫雷琳玥了' })
      return result
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '你以后就叫雷琳玥了', idleContext, complete)
    expect(turn.memory.facts.map(fact => fact.text)).toEqual(['你以后就叫雷琳玥了'])
    expect(calls).toBe(3)
    expect(turn.reply).toContain('已记住')
  })

  it('stops rejected memory writes after two attempts even when wording changes', async () => {
    let calls = 0
    const variants = ['凭空客户甲', '用户常用凭空客户甲', '用户偏好客户甲']
    const saved: string[][] = []
    const complete: Complete = async () => {
      calls += 1
      const result = outcome('', 'remember')
      result.choices[0].toolCalls[0].id = `remember-${calls}`
      result.choices[0].toolCalls[0].function.arguments = JSON.stringify({ text: variants[(calls - 1) % variants.length], source: '凭空的来源' })
      return result
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, complete, async state => { saved.push(state.facts.map(fact => fact.text)) })
    expect(calls).toBe(2)
    expect(turn.memory.facts).toEqual([])
    expect(saved.every(facts => facts.length === 0)).toBe(true)
    expect(turn.reply).toContain('停止')
    expect(turn.reply).not.toContain('已记住')
  })

  it('does not accept a source quote that only appeared in assistant output', async () => {
    let calls = 0
    const complete: Complete = async () => {
      if (++calls > 1) return outcome('没有成功记下。')
      const result = outcome('', 'remember')
      result.choices[0].toolCalls[0].function.arguments = JSON.stringify({ text: '用户偏好客户甲', source: '用户偏好客户甲' })
      return result
    }
    const turn = await runAgentTurn(config, { ...EMPTY_MEMORY, turns: [{ role: 'assistant', content: '用户偏好客户甲' }] }, '你好', idleContext, complete)
    expect(turn.memory.facts).toEqual([])
  })

  it('retries a rate limit once, trims on overflow, and does not retry auth', async () => {
    let limited = 0
    const retry: Complete = async () => {
      limited += 1
      if (limited === 1) throw new LlmError('HTTP_ERROR', 'slow', 429)
      return outcome('好。')
    }
    const slowed = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, retry)
    expect(slowed.reply).toBe('好。')
    expect(limited).toBe(2)

    const long = `头${'中'.repeat(4_000)}尾端ZZ`
    let overflowed = 0
    const overflow: Complete = async (_config, options) => {
      overflowed += 1
      const tool = options.messages.find(message => message.role === 'tool')
      expect(tool?.content).toContain('中间已省略')
      expect(tool?.content.endsWith('尾端ZZ')).toBe(true)
      if (overflowed === 1) throw new LlmError('HTTP_ERROR', 'maximum context length exceeded', 400)
      return outcome('缩短后答完。')
    }
    const prior = {
      ...EMPTY_MEMORY,
      turns: [
        { role: 'user' as const, content: '查' },
        { role: 'assistant' as const, content: '', toolCalls: [{ id: 'old', type: 'function' as const, function: { name: 'search_cases', arguments: '{}' } }] },
        { role: 'tool' as const, content: long, toolCallId: 'old' }
      ]
    }
    const shortened = await runAgentTurn(config, prior, '继续', idleContext, overflow)
    expect(shortened.reply).toContain('缩短后')
    expect(overflowed).toBe(2)

    let authed = 0
    const denied: Complete = async () => {
      authed += 1
      throw new LlmError('HTTP_ERROR', 'no', 401)
    }
    await expect(runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, denied)).rejects.toBeInstanceOf(LlmError)
    expect(authed).toBe(1)

    let stuck = 0
    const noShrink: Complete = async () => {
      stuck += 1
      throw new LlmError('HTTP_ERROR', 'maximum context length exceeded', 400)
    }
    await expect(runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, noShrink)).rejects.toBeInstanceOf(LlmError)
    expect(stuck).toBe(1)
  })

  it('retries a gateway 502 twice, then surfaces the error', async () => {
    let calls = 0
    const activity: string[] = []
    const complete: Complete = async () => {
      calls += 1
      if (calls < 3) throw new LlmError('HTTP_ERROR', '模型服务返回 HTTP 502。', 502)
      return outcome('接上了。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, complete, undefined, label => activity.push(label))
    expect(turn.reply).toBe('接上了。')
    expect(calls).toBe(3)
    expect(activity.filter(item => item === '模型暂时没接上，再试一次')).toHaveLength(2)

    let failed = 0
    const down: Complete = async () => {
      failed += 1
      throw new LlmError('HTTP_ERROR', '模型服务返回 HTTP 502。', 502)
    }
    await expect(runAgentTurn(config, EMPTY_MEMORY, '你好', idleContext, down)).rejects.toThrow('502')
    expect(failed).toBe(3)
  })

  it('does not keep a remembered fact when the turn is stopped', async () => {
    const saved: Array<ReturnType<typeof rememberFact>> = []
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) return outcome('', 'remember')
      throw new LlmError('REQUEST_TIMEOUT', '已停下。')
    }
    await expect(runAgentTurn(config, EMPTY_MEMORY, '记住我先看法律期限', idleContext, complete, async state => {
      saved.push(state)
    })).rejects.toThrow('已停下。')
    expect(saved.at(-1)?.facts).toEqual([])
  })

  it('keeps a grounded fact when the next model call fails', async () => {
    const saved: Array<ReturnType<typeof rememberFact>> = []
    let phase = 0
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) return outcome('', 'remember')
      throw new LlmError('HTTP_ERROR', '模型服务返回 HTTP 502。', 502)
    }
    await expect(runAgentTurn(config, EMPTY_MEMORY, '记住我先看法律期限', idleContext, complete, async state => {
      saved.push(state)
    })).rejects.toThrow('502')
    expect(saved.at(-1)?.facts.map(fact => fact.text)).toEqual(['先看法律期限'])
  })

  it('stops excerpting after three misses and still clips the tool text', async () => {
    const marker = `旧标记${'甲'.repeat(4_000)}`
    const turns = [
      { role: 'user' as const, content: marker },
      ...Array.from({ length: 50 }, (_, index) => ({ role: 'user' as const, content: `${index}:${'乙'.repeat(4_000)}` }))
    ]
    const complete: Complete = async () => outcome('还在。')
    const turn = await runAgentTurn(config, { ...EMPTY_MEMORY, turns, digestMisses: 3 }, '你好', idleContext, complete)
    expect(turn.memory.summary).toBe('')
    expect(turn.memory.turns.some(item => item.content.includes('旧标记'))).toBe(true)
  })

  it('keeps searched files on this turn and drafts from them', async () => {
    let volume = ''
    const ctx: ToolContext = {
      ...idleContext,
      rememberFiles(files) { volume = files[0]?.customerVolume ?? '' },
      recentFiles: () => [],
      draftMail: async () => formatDraft({
        letters: 1,
        subject: 'ZL20250306002-受理',
        body: '您好',
        notes: ['模板里的 {未知栏} 还没有对应内容'],
        who: '收件：未定'
      }),
      forward: async () => ({
        type: MessageType.SearchFilesResult,
        payload: {
          ok: true,
          data: {
            items: [{ fileId: 'f1', fileName: '受理通知书', customerName: '甲公司', customerVolume: 'ZL20250306002', caseId: 'CASE-1' }],
            total: 1, pageIndex: 1, pageSize: 10, totalPages: 1
          }
        }
      })
    }
    const searched = await executeAgentTool('search_cases', '{"customerName":"甲公司"}', ctx, EMPTY_MEMORY)
    expect(searched.text).toContain('文件查询共 1 条')
    expect(searched.text).toContain('案件编号 CASE-1')
    expect(volume).toBe('ZL20250306002')
    let phase = 0
    const seen: string[] = []
    const complete: Complete = async (_config, options) => {
      phase += 1
      seen.push(options.messages.filter(message => message.role === 'tool').map(message => message.content).join('\n'))
      if (phase === 1) return outcome('信已经对好了。')
      if (phase === 2) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'd1', type: 'function', function: { name: 'draft_mail', arguments: '{"customerName":"甲公司"}' } }]
          }]
        }
      }
      return outcome('主题已经起草，还有没收录的占位符。没有提交。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '帮我对上要发的信', ctx, complete)
    expect(phase).toBe(3)
    expect(seen.some(text => text.includes('主题：ZL20250306002-受理') && text.includes('{未知栏}'))).toBe(true)
    expect(turn.reply).toContain('没有提交')
  })

  it('submits only after submit_easy succeeds, and still finishes the turn', async () => {
    let phase = 0
    const ctx: ToolContext = {
      ...idleContext,
      submitEasy: async () => '已提交到 EASY。已提交 1 件给当前登录人审核。'
    }
    const complete: Complete = async () => {
      phase += 1
      if (phase === 1) return outcome('已提交审核。')
      if (phase === 2) {
        return {
          usage: null,
          raw: {},
          choices: [{
            content: '',
            reasoning: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 's1', type: 'function', function: { name: 'submit_easy', arguments: '{"caseVolume":"P001"}' } }]
          }]
        }
      }
      return outcome('已提交到 EASY，交给当前登录人审核。')
    }
    const turn = await runAgentTurn(config, EMPTY_MEMORY, '帮我提交审核', ctx, complete)
    expect(phase).toBe(3)
    expect(turn.reply).toContain('已提交到 EASY')
  })
})
