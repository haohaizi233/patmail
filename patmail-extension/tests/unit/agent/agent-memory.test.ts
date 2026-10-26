import { describe, expect, it } from 'vitest'
import { runAgentTurn, type Complete } from '../../../src/agent/loop'
import { applySummary, clipToolResult, COMPRESS_AT_CHARS, EMPTY_MEMORY, factsForPrompt, foldDigest, KEEP_RECENT_CHARS, needsCompression, normalizeMemory, projectOldToolText, rememberFact, searchFacts, splitForCompression, contextChars, visibleHistory, AGENT_TURN_CHARS } from '../../../src/agent/memory'
import { isMessage, MessageType } from '../../../src/shared/message'
import { config, outcome, idleContext } from './support/agent-test-kit'

describe('agent memory', () => {
  it('keeps older tool text in storage and sends only the first line', async () => {
    const stored = '文件查询共 1 条。\n案件编号 CASE-1\n受理通知书'
    expect(projectOldToolText(stored)).toContain('已收成一行')
    expect(projectOldToolText(stored)).not.toContain('CASE-1')
    expect(projectOldToolText('文件查询共 1 条。')).toBe('文件查询共 1 条。')
    const prior = {
      ...EMPTY_MEMORY,
      turns: [
        { role: 'user' as const, content: '查一下' },
        { role: 'tool' as const, content: stored, toolCallId: 'old' },
        { role: 'assistant' as const, content: '查到了。' }
      ]
    }
    let toolText = ''
    const complete: Complete = async (_config, options) => {
      toolText = options.messages.find(message => message.role === 'tool')?.content ?? ''
      return outcome('这一轮还没查。')
    }
    const turn = await runAgentTurn(config, prior, '再看一眼', idleContext, complete)
    expect(toolText).not.toContain('CASE-1')
    expect(toolText).toContain('已收成一行')
    expect(turn.memory.turns.find(item => item.toolCallId === 'old')?.content).toContain('CASE-1')
  })

  it('普通提问不把上一轮裁决原文送给模型，照抄的回复也不收下', async () => {
    const verdict = '空 PA25114685CN｜提醒申请PCT｜拿不准｜依据 客户要求没有指定发给谁'
    const prior = {
      ...EMPTY_MEMORY,
      turns: [
        { role: 'user' as const, content: '请仲裁收件人和抄送。这是第 1/1 批。\n\n客户文号 PA1' },
        { role: 'assistant' as const, content: verdict }
      ]
    }
    const sent: string[][] = []
    let calls = 0
    const complete: Complete = async (_config, options) => {
      sent.push(options.messages.filter(message => message.role !== 'system').map(message => message.content))
      calls += 1
      return calls === 1 ? outcome(verdict) : outcome('我是 PatMail 的执行助手。')
    }
    const turn = await runAgentTurn(config, prior, '你是谁?', idleContext, complete)
    expect(sent[0]?.join('\n')).not.toContain('PA25114685CN')
    expect(sent[0]?.join('\n')).not.toContain('请仲裁收件人和抄送。这是第 1/1 批')
    expect(sent[0]?.join('\n')).toContain('你是谁?')
    expect(turn.reply).toContain('执行助手')
    expect(turn.reply).not.toContain('PA25114685CN')
  })

  it('连续照抄上一轮时，不把抄写存成新回复', async () => {
    const verdict = '空 PA25114685CN｜提醒申请PCT｜拿不准｜依据 客户要求没有指定发给谁'
    const prior = {
      ...EMPTY_MEMORY,
      turns: [
        { role: 'user' as const, content: '你好' },
        { role: 'assistant' as const, content: verdict }
      ]
    }
    const complete: Complete = async () => outcome(verdict)
    const turn = await runAgentTurn(config, prior, '你是谁?', idleContext, complete)
    expect(turn.reply).toContain('没有采用')
    expect(turn.reply).not.toContain('PA25114685CN')
    expect(turn.history.at(-1)?.content).not.toContain('PA25114685CN')
  })

  it('compresses only after the stored cache crosses the size threshold', () => {
    const short = Array.from({ length: 40 }, (_, index) => ({ role: 'user' as const, content: `第${index}句` }))
    expect(needsCompression({ ...EMPTY_MEMORY, turns: short })).toBe(false)
    const turns = Array.from({ length: 60 }, (_, index) => ({ role: 'user' as const, content: `${index}:${'查'.repeat(4_000)}` }))
    const state = { ...EMPTY_MEMORY, turns }
    expect(contextChars(state)).toBeGreaterThan(COMPRESS_AT_CHARS)
    expect(needsCompression(state)).toBe(true)
    const next = applySummary(state, '用户在查期限')
    expect(next.summary).toBe('用户在查期限')
    expect(next.turns.length).toBeGreaterThan(8)
    expect(next.turns.length).toBeLessThan(turns.length)
    expect(contextChars({ ...next, summary: '' })).toBeLessThanOrEqual(KEEP_RECENT_CHARS)
    expect(next.turns.at(-1)?.content.startsWith('59:')).toBe(true)
  })

  it('keeps a tool call and its result on the same side of the cut', () => {
    const split = splitForCompression({
      ...EMPTY_MEMORY,
      turns: [
        { role: 'user', content: '旧'.repeat(100) },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c', type: 'function', function: { name: 'search_cases', arguments: '{}' } }] },
        { role: 'tool', content: 'P001', toolCallId: 'c' }
      ]
    }, 10)
    expect(split.older.map(turn => turn.role)).toEqual(['user'])
    expect(split.recent.map(turn => turn.role)).toEqual(['assistant', 'tool'])
    expect(split.recent[1]?.content).toBe('P001')
  })

  it('folds older turns into quoted lines and drops a free-form summary', () => {
    const folded = foldDigest('用户已经查到文号 P999 在甲公司名下。', [
      { role: 'user', content: '查文号 P001' },
      { role: 'tool', content: '没有查到 P001。' },
      { role: 'assistant', content: '\u001ethought\u001e先编一个客户\u001e没有查到。' }
    ])
    expect(folded).toContain('- 用户：查文号 P001')
    expect(folded).toContain('- 工具原文：没有查到 P001。')
    expect(folded).toContain('- 助手说过：没有查到。')
    expect(folded).not.toContain('P999')
    expect(folded).not.toContain('先编一个客户')
  })

  it('keeps the head and tail of a long tool result and hides gate notes', () => {
    const clipped = clipToolResult(`头${'中'.repeat(3_000)}尾标记`)
    expect(clipped.startsWith('头')).toBe(true)
    expect(clipped.endsWith('尾标记')).toBe(true)
    expect(clipped).toContain('中间已省略')
    const folded = foldDigest('', [
      { role: 'user', content: '去调用工具，不要只叙述。', hidden: true },
      { role: 'user', content: '查 P001' }
    ])
    expect(folded).toContain('查 P001')
    expect(folded).not.toContain('去调用工具')
    const memory = normalizeMemory({
      summary: '',
      turns: [{ role: 'user', content: '去调用工具', hidden: true }],
      facts: [],
      digestMisses: 2
    })
    expect(memory.turns[0]?.hidden).toBe(true)
    expect(memory.digestMisses).toBe(2)
    expect(visibleHistory(memory)).toEqual([])
  })

  it('keeps an arbitration reply longer than 2 万字', () => {
    const content = `文号 PA25111283CN｜收件人 韩玉奎｜身份 客户联系人｜抄送 吴文章｜抄送身份 商务｜依据 客户要求。\n`.repeat(500)
    expect(content.length).toBeGreaterThan(20_000)
    expect(content.length).toBeLessThan(AGENT_TURN_CHARS)
    const memory = normalizeMemory({ summary: '', turns: [{ role: 'assistant', content }, { role: 'user', content }], facts: [] })
    expect(memory.turns).toHaveLength(2)
    expect(visibleHistory(memory).every(item => item.content === content)).toBe(true)
    expect(isMessage({
      type: MessageType.AgentChatResult,
      payload: {
        ok: true,
        data: {
          reply: content,
          model: 'test',
          steps: 1,
          history: visibleHistory(memory),
          sessions: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '仲裁', updatedAt: '2026-10-12T07:00:00.000Z', active: true }],
          activeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        }
      }
    })).toBe(true)
  })

  it('dedupes long-term facts and can search them', () => {
    const once = rememberFact(EMPTY_MEMORY, '先看法律期限')
    const twice = rememberFact(once, '先看法律期限')
    expect(twice.facts).toHaveLength(1)
    expect(searchFacts(twice, '法律').map(fact => fact.text)).toEqual(['先看法律期限'])
    const many = ['宁德时代', '华星光电', '先看法律期限', '内部期限优先', '常用文号P001'].reduce((state, text, index) => rememberFact(state, text, `2026-01-0${index + 1}T00:00:00.000Z`), EMPTY_MEMORY)
    const prompted = factsForPrompt(many, '查一下华星光电').map(fact => fact.text)
    expect(prompted[0]).toBe('华星光电')
    expect(prompted).toContain('常用文号P001')
    expect(prompted).not.toContain('宁德时代')
  })
})
