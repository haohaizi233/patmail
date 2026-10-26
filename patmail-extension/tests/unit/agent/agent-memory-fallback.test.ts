import { describe, expect, it } from 'vitest'
import { LlmError } from '../../../src/agent/llm'
import { runAgentTurn, type Complete } from '../../../src/agent/loop'
import { EMPTY_MEMORY, saveMemory, AGENT_SESSIONS_KEY, type MemoryStorage } from '../../../src/agent/memory'
import { config, outcome, idleContext } from './support/agent-test-kit'

describe('agent 记忆写不下时的兜底', () => {
  it('缓存写不进去也不抛错，回答不被缓存拖住', async () => {
    const area: MemoryStorage = {
      get: async () => ({}),
      set: async () => { throw new Error('QUOTA_BYTES quota exceeded.') },
      remove: async () => { throw new Error('QUOTA_BYTES quota exceeded.') }
    }
    await expect(saveMemory(area, { ...EMPTY_MEMORY, turns: [{ role: 'user', content: '你好' }] })).resolves.toBeUndefined()
  })

  it('写不下时先收短这段对话，仍不行就清掉其它对话的原文', async () => {
    const active = 'session-aaaa1111'
    const other = 'session-bbbb2222'
    const store = new Map<string, unknown>([
      [AGENT_SESSIONS_KEY, {
        activeId: active,
        facts: [],
        items: [
          { id: active, title: '当前', updatedAt: '2026-01-02T00:00:00.000Z' },
          { id: other, title: '旧的', updatedAt: '2026-01-01T00:00:00.000Z' }
        ]
      }]
    ])
    const removed: string[] = []
    const sizes: number[] = []
    let allow = false
    const area: MemoryStorage = {
      get: async key => (store.has(key) ? { [key]: store.get(key) } : {}),
      set: async items => {
        const size = JSON.stringify(items).length
        sizes.push(size)
        if (!allow) throw new Error('QUOTA_BYTES quota exceeded.')
        for (const [key, value] of Object.entries(items)) store.set(key, value)
      },
      remove: async keys => {
        removed.push(...(Array.isArray(keys) ? keys : [keys]))
        allow = true
      }
    }
    const turns = Array.from({ length: 20 }, (_, index) => ({ role: 'user' as const, content: `${index}:${'字'.repeat(8_000)}` }))
    await saveMemory(area, { ...EMPTY_MEMORY, turns })
    expect(sizes).toHaveLength(3)
    expect(sizes[2]).toBeLessThan(sizes[0])
    expect(removed).toContain(`patmail.agent.session.v1.${other}`)
    expect(removed).not.toContain(`patmail.agent.session.v1.${active}`)
  })

  it('模型嫌上下文太长时先收工具结果，收不下再丢更早的原话', async () => {
    const bulky = (mark: string): { role: 'user'; content: string } => ({ role: 'user', content: `${mark}${'甲'.repeat(20_000)}` })
    const prior = { ...EMPTY_MEMORY, turns: [bulky('旧1'), bulky('旧2'), bulky('旧3'), bulky('旧4'), bulky('新')] }
    const sizes: number[] = []
    let calls = 0
    const complete: Complete = async (_config, options) => {
      sizes.push(options.messages.reduce((sum, message) => sum + message.content.length, 0))
      calls += 1
      if (calls === 1) throw new LlmError('HTTP_ERROR', '模型服务返回 HTTP 400：This model maximum context length is exceeded', 400)
      return outcome('好了。')
    }
    const turn = await runAgentTurn(config, prior, '继续', idleContext, complete)
    expect(turn.reply).toContain('好了')
    expect(calls).toBe(2)
    expect(sizes[1]).toBeLessThan(sizes[0])
  })
})
