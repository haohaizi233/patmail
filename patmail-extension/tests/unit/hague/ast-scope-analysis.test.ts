import { describe, expect, it } from 'vitest'
import { analyzeJavaScript, extractJsfCallIR } from '../../../src/hague/diagnostics/ast/analyzer.mjs'

describe('AST Lexical Scope & Constant Propagation Hardening', () => {
  it('correctly isolates block-scoped variable shadowing without leaking to outer scope', () => {
    const code = `
      const target = "headerForm";
      {
        const target = "ApplicantForm";
        PrimeFaces.ab({ s: target });
      }
      PrimeFaces.ab({ s: target });
    `
    const r = analyzeJavaScript(code)
    expect(r.calls).toHaveLength(2)
    // First call inside block should resolve to shadowed "ApplicantForm"
    expect(r.calls[0].source).toBe('ApplicantForm')
    // Second call outside block should resolve to outer "headerForm"
    expect(r.calls[1].source).toBe('headerForm')
  })

  it('performs static evaluation on compile-time ternary and logical expressions', () => {
    const code = `
      const isApp = true;
      const comp = isApp ? "ApplicantForm:saveBtn" : "portfolio";
      PrimeFaces.ab({ s: comp });
    `
    const r = analyzeJavaScript(code)
    expect(r.calls[0].source).toBe('ApplicantForm:saveBtn')
    expect(r.calls[0].confidence).toBe('static')
  })

  it('resolves conservative alias chains without side effects', () => {
    const code = `
      const original = "DescriptionForm:save";
      const alias1 = original;
      const alias2 = alias1;
      PrimeFaces.ab({ s: alias2, u: "DescriptionForm" });
    `
    const r = analyzeJavaScript(code)
    expect(r.calls[0].source).toBe('DescriptionForm:save')
    expect(r.calls[0].update).toBe('DescriptionForm')
    expect(r.calls[0].confidence).toBe('static')
  })

  it('resolves simple literal object destructuring', () => {
    const code = `
      const { comp, form } = { comp: "PriorityForm:addPriority", form: "PriorityForm" };
      PrimeFaces.ab({ s: comp, f: form });
    `
    const r = analyzeJavaScript(code)
    expect(r.calls[0].source).toBe('PriorityForm:addPriority')
    expect(r.calls[0].form).toBe('PriorityForm')
  })

  it('fails closed when an object property is mutated or dynamically assigned', () => {
    const code = `
      const cfg = { s: "ApplicantForm:btn" };
      cfg.s = window.someDynamicValue;
      PrimeFaces.ab(cfg);
    `
    const r = analyzeJavaScript(code)
    // Because cfg.s was reassigned with dynamic value, it must be marked unresolved
    expect(r.calls[0].confidence).toBe('unresolved')
    expect(r.calls[0].unresolvedReasons).toContain('source:dynamic')
  })

  it('extracts standardized JsfCallIR intermediate representation', () => {
    const code = `
      PrimeFaces.ab({ s: "ApplicantForm:save", f: "ApplicantForm", p: "@this", u: "ApplicantForm", e: "click" });
    `
    const irs = extractJsfCallIR(code)
    expect(irs).toHaveLength(1)
    expect(irs[0]).toMatchObject({
      callType: 'PrimeFaces.ab',
      sourceComponent: 'ApplicantForm:save',
      form: 'ApplicantForm',
      process: ['@this'],
      update: ['ApplicantForm'],
      event: 'click',
      staticConfidence: 'static',
      unresolvedReasons: [],
    })
    expect(irs[0].sourceLocation).toBeDefined()
    expect(irs[0].sourceLocation.line).toBeGreaterThanOrEqual(1)
  })
})
