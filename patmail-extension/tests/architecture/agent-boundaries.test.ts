import { describe, expect, it } from 'vitest'
import { evaluateArchitecture, scanProjectDependencies } from '../../scripts/architecture-check.mjs'
import { agentToolSchemas } from '../../src/agent/tools'

describe('agent layer boundaries', () => {
  it('ensures Agent, background/agent.ts and protected Mail UI go through MailApplicationService with zero direct domain bypasses', () => {
    const inventory = scanProjectDependencies()
    const violations = evaluateArchitecture(inventory)
    expect(violations.filter(v => v.rule === 'C-agent-through-application')).toEqual([])
    expect(violations.filter(v => v.rule === 'G-mail-ui-through-application')).toEqual([])
  })

  it('keeps submit_easy schema aligned with default reviewer business policy', () => {
    const submitSchema = agentToolSchemas().find(item => item.function.name === 'submit_easy')
    expect(submitSchema).toBeDefined()
    expect(submitSchema?.function.description).toContain('默认审核人')
    expect(submitSchema?.function.description).not.toContain('当前登录人')
  })
})
