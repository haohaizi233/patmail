import { describe, expect, it } from 'vitest'
import { buildDiagnosticReport, exportDiagnostics } from '../../../src/hague/diagnostics/reports'
import { replayDiagnostics } from '../../../src/hague/diagnostics/replay'
import { diffFingerprints, fingerprintProtocol } from '../../../src/hague/diagnostics/fingerprint'

const event = (extra = {}) => ({ version: 1, source: 'application', traceId: 'trace-one', caseRunId: 'case-one', phase: 'http.response', timestamp: '2026-11-13T00:00:00.000Z', httpStatus: 200, ...extra })
describe('safe diagnostic reports and offline replay', () => {
  it('never infers success from HTTP 200 and reports missing CDP evidence', () => {
    const report = buildDiagnosticReport([event()])
    expect(report.summary.firstProvenFailure).toBeNull()
    expect(report.summary.cdpMissing).toBe(true)
    expect(report.summary.confirmedSuccess).toBe(false)
  })
  it('exports only sanitized fields and aliases cases', () => {
    const raw = event({ body: 'SECRET', reference: 'SECRET', caseVolume: 'SECRET', headers: { Cookie: 'SECRET' }, applicantName: 'SECRET', email: 'SECRET', address: 'SECRET', priorityNumber: 'SECRET', filename: 'SECRET', viewState: 'SECRET', base64: 'SECRET', parameterValues: ['SECRET'], sourceLocation: { functionName: 'SECRET' } })
    for (const format of ['json', 'jsonl', 'markdown'] as const) expect(exportDiagnostics([raw], format)).not.toContain('SECRET')
  })
  it('supports one-line JSONL and summary JSON round trips without network access', () => {
    expect(replayDiagnostics(exportDiagnostics([event()], 'jsonl')).report.events).toHaveLength(1)
    expect(replayDiagnostics(exportDiagnostics([event()], 'json')).report.events).toHaveLength(1)
  })
  it('preserves six opaque cases and never assigns unmatched CDP to a case', () => {
    const report = buildDiagnosticReport([...Array.from({ length: 6 }, (_, i) => event({ caseRunId: `case-${i}` })), event({ source: 'cdp', caseRunId: undefined, traceId: undefined, correlationConfidence: 'ambiguous' })])
    expect(report.tree).toHaveLength(6)
    expect(report.timeline.at(-1)?.alias).toBe('未归属')
    expect(report.summary.cdpMissing).toBe(false)
  })
  it('does not invent HTTP codes for transport failures', () => {
    const report = buildDiagnosticReport([event({ transportStatus: 'timeout', httpStatus: null, certainty: 'unknown' })])
    expect(report.summary.firstProvenFailure?.httpStatus).toBeNull()
    expect(report.summary.confirmedSuccess).toBe(false)
  })
  it('replays only versioned bounded safe events, marks provenance and rejects unsupported input', () => {
    expect(replayDiagnostics(JSON.stringify([event()])).provenance).toBe('offline-replay')
    expect(() => replayDiagnostics(JSON.stringify([event({ version: 99 })]))).toThrow('UNSUPPORTED_SCHEMA')
    expect(() => replayDiagnostics('x'.repeat(2_000_001))).toThrow('REPLAY_LIMIT')
  })
  it('finds proven rejection and does not turn unknown into completion', () => {
    const report = buildDiagnosticReport([event({ businessStatus: 'unknown' }), event({ businessStatus: 'rejected', protocolStatus: 'jsf_validation_failed' })])
    expect(report.summary.firstProvenFailure?.businessStatus).toBe('rejected')
    expect(report.summary.hasUncertainty).toBe(true)
  })
  it('compares stable structural fingerprints without retaining unknown component strings', () => {
    const a = fingerprintProtocol({ forms: ['SECRET'], actions: ['PrimeFaces.ab'], components: ['SECRET'] })
    const b = fingerprintProtocol({ forms: ['SECRET'], actions: ['PrimeFaces.ab', 'mojarra.ab'], components: ['SECRET'] })
    expect(JSON.stringify(a)).not.toContain('SECRET')
    expect(diffFingerprints(a, b).added.actions).toEqual(['mojarra.ab'])
    expect(fingerprintProtocol({ actions: ['mojarra.ab', 'PrimeFaces.ab'] }).hash).toBe(fingerprintProtocol({ actions: ['PrimeFaces.ab', 'mojarra.ab'] }).hash)
  })
})



it('resolves transient unknown states only with a later authoritative receipt on the same trace',()=>{
 expect(buildDiagnosticReport([event({phase:'request.dispatched',businessStatus:'unknown'}),event({phase:'step.completed',businessStatus:'completed'})]).summary.hasUncertainty).toBe(true)
 expect(buildDiagnosticReport([event({phase:'request.dispatched',businessStatus:'unknown'}),event({phase:'business.validated',businessStatus:'confirmed',evidenceCodes:['BUSINESS_RECEIPT_VERIFIED']})]).summary.hasUncertainty).toBe(false)
 expect(buildDiagnosticReport([event({phase:'step.uncertain',businessStatus:'unknown'}),event({phase:'step.completed',traceId:'trace-other',businessStatus:'completed'})]).summary.hasUncertainty).toBe(true)
})

it('exports independent layers and deterministic explanations without elevating legacy success',()=>{
 const legacy=event({phase:'step.completed',businessStatus:'completed'})
 expect(buildDiagnosticReport([legacy]).summary.confirmedSuccess).toBe(false)
 const verified=event({phase:'business.validated',businessStatus:'confirmed',evidenceCodes:['BUSINESS_RECEIPT_VERIFIED']})
 expect(buildDiagnosticReport([verified]).summary.confirmedSuccess).toBe(true)
 const json=JSON.parse(exportDiagnostics([legacy],'json')) as ReturnType<typeof buildDiagnosticReport>
 expect(json.evidence[0].layers.BUSINESS).toBe('unconfirmed')
 expect(exportDiagnostics([legacy],'markdown')).toContain('权威业务回执证据缺失')
 expect((JSON.parse(exportDiagnostics([legacy],'jsonl')) as {phase:string}).phase).toBe('step.completed')
})
