import { describe, expect, it } from 'vitest'
import { parseJsfProtocol } from '../../../src/hague/diagnostics/protocol/jsf-semantics.mjs'
import { analyzeJavaScript } from '../../../src/hague/diagnostics/ast/analyzer.mjs'
import { analyzeEvidence } from '../../../src/hague/diagnostics/evidence/evidence-model.mjs'

// Simple deterministic Mulberry32 PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Protocol & AST Deterministic Mutation Fuzzing', () => {
  const SEED = 20261114
  const random = mulberry32(SEED)

  const BASE_TEMPLATES = [
    '<partial-response><changes><update id="designForm"><![CDATA[<div>OK</div>]]></update><update id="javax.faces.ViewState"><![CDATA[TOKEN]]></update></changes></partial-response>',
    '<partial-response><error><error-name>Exception</error-name><error-message>MSG</error-message></error></partial-response>',
    '<partial-response><redirect url="https://hague.wipo.int/HagueEFilingWeb/login"/></partial-response>',
    '<partial-response><extension ln="primefaces" type="args">{"validationFailed":true}</extension></partial-response>',
  ]

  const MUTATIONS = [
    (s: string) => s.slice(0, Math.floor(random() * s.length)), // truncation
    (s: string) => s + '</unexpected>', // unmatched tags
    (s: string) => s.replace('update', 'x'.repeat(500)), // huge tag name
    (s: string) => s + '<![CDATA['.repeat(20), // unclosed CDATA
    (s: string) => s.replace('TOKEN', 'SECRET_CANARY_VALUE_9999'), // secret injection
    (s: string) => s + '\u0000\u0001\u001f\ufffd', // control characters
    (s: string) => '<!DOCTYPE html SYSTEM "http://evil.invalid">' + s, // DTD injection
    (s: string) => s.replace('<partial-response>', '<partial-response><eval>alert(1)</eval>'),
  ]

  it('runs 100 deterministic mutation fuzz cases without crashing or leaking canary', () => {
    const canary = 'SECRET_CANARY_VALUE_9999'

    for (let i = 0; i < 100; i++) {
      const base = BASE_TEMPLATES[Math.floor(random() * BASE_TEMPLATES.length)]
      const mutate = MUTATIONS[Math.floor(random() * MUTATIONS.length)]
      const fuzzInput = mutate(base)

      let res
      expect(() => {
        res = parseJsfProtocol(fuzzInput)
      }).not.toThrow()

      expect(res).toBeDefined()
      // Rule: Canary values must never leak into serialized diagnostic output
      expect(JSON.stringify(res)).not.toContain(canary)
      // Rule: Protocol parser must never claim business completion
      expect(res).not.toHaveProperty('businessStatus')
    }
  })

  it('fuzzes AST analyzer with syntax mutations without code execution', () => {
    const AST_TEMPLATES = [
      'PrimeFaces.ab({s:"ApplicantForm:save", p:"@this", u:"ApplicantForm"});',
      'const a = 1; { const b = a + 2; PrimeFaces.ab({s:"comp"}); }',
      'function test() { return eval("secret"); }',
      'var x = window["dynamic" + Math.random()]; PrimeFaces.ab({s: x});',
    ]

    for (let i = 0; i < 50; i++) {
      const template = AST_TEMPLATES[Math.floor(random() * AST_TEMPLATES.length)]
      const mutated = template.slice(0, Math.floor(random() * template.length)) + '; } ); }'

      let astRes: ReturnType<typeof analyzeJavaScript> | undefined
      expect(() => {
        astRes = analyzeJavaScript(mutated)
      }).not.toThrow()

      expect(astRes).toBeDefined()
      expect(Array.isArray(astRes?.calls)).toBe(true)
    }
  })

  it('verifies evidence model never promotes unconfirmed responses to business confirmation under event mutation', () => {
    for (let i = 0; i < 30; i++) {
      const e1 = { version: 1 as const, source: 'application' as const, phase: 'request.dispatched' as const, timestamp: '2026-11-14T00:00:00Z', requestId: 'r1', traceId: 't1', caseRunId: 'c1' }
      const e2 = { version: 1 as const, source: 'application' as const, phase: 'http.response' as const, httpStatus: 200, timestamp: '2026-11-14T00:00:01Z', requestId: 'r1', traceId: 't1', caseRunId: 'c1' }
      const e3 = { version: 1 as const, source: 'application' as const, phase: 'jsf.parsed' as const, protocolStatus: 'valid' as const, updateCount: 5, timestamp: '2026-11-14T00:00:02Z', requestId: 'r1', traceId: 't1', caseRunId: 'c1' }

      const events = random() > 0.5 ? [e3, e2, e1] : [e1, e2, e3]

      const result = analyzeEvidence(events, { requestId: 'r1', traceId: 't1', caseRunId: 'c1' })
      expect(result.BUSINESS).toBe('unconfirmed')
      expect(result.CERTAINTY).toBe('unknown')
      expect(result.explanation).toContain('权威业务回执证据缺失')
    }
  })
})
