import { expect, it } from 'vitest'
import { runAgentTurn, type Complete } from '../../../src/agent/loop'
import { EMPTY_MEMORY, rememberFact } from '../../../src/agent/memory'
import { HAGUE_ARBITRATION_SKILL } from '../../../src/agent/hague-skill'
import { config, outcome, idleContext } from './support/agent-test-kit'
import { isMessage, MessageType } from '../../../src/shared/message'

it('routes Hague to its own system skill and preserves PCT recipient arbitration separately', async () => {
  const systems: string[] = []
  const complete: Complete = async (_config, options) => { systems.push(options.messages[0].content); return outcome('done') }
  await runAgentTurn(config, EMPTY_MEMORY, '海牙本批材料', idleContext, complete, undefined, undefined, HAGUE_ARBITRATION_SKILL)
  await runAgentTurn(config, EMPTY_MEMORY, '请仲裁收件人和抄送', idleContext, complete, undefined, undefined, true)
  expect(systems[0]).toContain('海牙新申请材料仲裁助手')
  expect(systems[0]).not.toContain('收件人')
  expect(systems[0]).not.toContain('IPR')
  expect(systems[1]).toContain('收件人仲裁')
  expect(systems[1]).not.toContain('海牙新申请材料仲裁助手')
})
it('keeps previous conversation and saved recipient facts out of Hague model input', async () => {
  const memory = rememberFact({ ...EMPTY_MEMORY, turns: [{ role: 'user', content: 'OLD_PCT_CONVERSATION' }] }, 'OLD_PCT_RECIPIENT_RULE')
  const complete: Complete = async (_config, options) => {
    const input = JSON.stringify(options.messages)
    expect(input).toContain('CURRENT_HAGUE_MATERIAL')
    expect(input).not.toContain('OLD_PCT_')
    return outcome('done')
  }
  const result = await runAgentTurn(config, memory, 'CURRENT_HAGUE_MATERIAL', idleContext, complete, undefined, undefined, HAGUE_ARBITRATION_SKILL)
  expect(result.memory.facts).toEqual(memory.facts)
})
it('validates explicit skill routing and rejects mixing it with the legacy plain selector', () => {
  const payload = { action: 'turn', message: '海牙材料', skill: HAGUE_ARBITRATION_SKILL }
  expect(isMessage({ type: MessageType.AgentChat, payload })).toBe(true)
  expect(isMessage({ type: MessageType.AgentChat, payload: { ...payload, plain: true } })).toBe(false)
  expect(isMessage({ type: MessageType.AgentChat, payload: { ...payload, skill: 'unknown' } })).toBe(false)
})
