/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- CDP fixture mocks deliberately exercise raw protocol events and pipeline outputs. */
import { describe, it, expect, afterEach } from 'vitest'
import { HagueResearchDiagnostics } from '../../../scripts/hague-research.mjs'
import { HagueDeepDiagnostics } from '../../../scripts/hague-diagnostics.mjs'
import { AnalysisWorker } from '../../../scripts/hague-research-broker.mjs'
import { analyzeEvidence } from '../../../src/hague/diagnostics/evidence/evidence-model.mjs'
import { buildDiagnosticReport, exportDiagnostics } from '../../../src/hague/diagnostics/reports'
import type { ProtocolBaseline } from '../../../src/hague/diagnostics/protocol/jsf-diff.mjs'

describe('Hague Research Full Chain Integration', () => {
  let workersToClean: AnalysisWorker[] = []

  afterEach(() => {
    for (const w of workersToClean) {
      try {
        w.clear()
      } catch {
        // ignore
      }
    }
    workersToClean = []
  })

  function createPipeline(options: { timeoutMs?: number; baseline?: ProtocolBaseline } = {}) {
    const worker = new AnalysisWorker({ timeoutMs: options.timeoutMs ?? 5000 })
    workersToClean.push(worker)
    const commands: any[] = []
    const events: any[] = []

    const deep = new HagueDeepDiagnostics(
      async (method: string, params: any) => {
        commands.push({ method, params })
        return {}
      },
      (_phase: string, data: any) => events.push(data),
      worker
    )

    const responseBodyMap: Record<string, string> = {}

    const send = async (method: string, params: any, session: string) => {
      commands.push({ method, params, session })
      if (method === 'Network.getResponseBody') {
        const body = responseBodyMap[params.requestId] ?? '<partial-response/>'
        return { body, base64Encoded: false }
      }
      return {}
    }

    const research = new HagueResearchDiagnostics(
      deep,
      send,
      (_phase: string, data: any) => events.push(data),
      { worker, baseline: options.baseline }
    )

    return {
      worker,
      deep,
      research,
      commands,
      events,
      setResponseBody: (reqId: string, xml: string) => {
        responseBodyMap[reqId] = xml
      }
    }
  }

  const target = {
    targetId: 'feedface-1111-2222-3333-444455556666',
    sessionId: 'deadbeef-1111-2222-3333-444455556666',
    url: 'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'
  }

  const baseRequest = {
    frameId: 'f-1',
    loaderId: 'l-1',
    type: 'XHR',
    request: {
      url: target.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax'
      },
      postData: 'javax.faces.partial.ajax=true&javax.faces.source=ApplicantForm%3Asave&javax.faces.partial.execute=%40this&javax.faces.partial.render=ApplicantForm'
    }
  }

  // --------------------------------------------------------------------------
  // Scenario A: Normal sequential AJAX interaction with ViewState tracking
  // --------------------------------------------------------------------------
  it('Scenario A: tracks causal ViewState across sequential requests, prevents raw leakage, and marks business unconfirmed without authoritative receipt', async () => {
    const { research, events, setResponseBody } = createPipeline()
    await research.enable(target)

    const secretToken1 = 'raw-secret-token-v1-9876543210'
    const secretToken2 = 'raw-secret-token-v2-1234567890'

    // First AJAX request
    const req1Id = 'req-1'
    setResponseBody(
      req1Id,
      `<partial-response><changes><update id="ApplicantForm"><![CDATA[<div>Step 1 Saved</div>]]></update><update id="javax.faces.ViewState"><![CDATA[${secretToken1}]]></update></changes></partial-response>`
    )
    research.request(target, target.sessionId, { ...baseRequest, requestId: req1Id })
    research.response(target.sessionId, { requestId: req1Id, response: { status: 200, mimeType: 'text/xml' } })
    await research.finished(target.sessionId, { requestId: req1Id, encodedDataLength: 150 })

    // Second AJAX request in the same session and frame
    const req2Id = 'req-2'
    setResponseBody(
      req2Id,
      `<partial-response><changes><update id="ApplicantForm"><![CDATA[<div>Step 2 Updated</div>]]></update><update id="javax.faces.ViewState"><![CDATA[${secretToken2}]]></update></changes></partial-response>`
    )
    research.request(target, target.sessionId, { ...baseRequest, requestId: req2Id })
    research.response(target.sessionId, { requestId: req2Id, response: { status: 200, mimeType: 'text/xml' } })
    await research.finished(target.sessionId, { requestId: req2Id, encodedDataLength: 160 })

    const parsedEvents = events.filter(e => e.phase === 'jsf.parsed')
    expect(parsedEvents).toHaveLength(2)

    // Verification 1: First request has INITIAL_OBSERVED semantics (no prior baseline)
    expect(parsedEvents[0].viewStateTransition).toBe('INITIAL_OBSERVED')
    expect(parsedEvents[0].viewStateChanged).toBe(false)
    expect(parsedEvents[0].protocolStatus).toBe('valid')
    expect(parsedEvents[0].updateCount).toBe(2)

    // Verification 2: Second request transitions through STATE_CHANGED
    expect(parsedEvents[1].viewStateTransition).toBe('STATE_CHANGED')
    expect(parsedEvents[1].viewStateChanged).toBe(true)
    expect(parsedEvents[1].protocolStatus).toBe('valid')

    // Verification 3: Absolute zero secret token leakage into diagnostic trace events
    const allEventsJson = JSON.stringify(events)
    expect(allEventsJson).not.toContain(secretToken1)
    expect(allEventsJson).not.toContain(secretToken2)

    // Verification 4: Six-layer evidence model analysis on the pipeline events
    // Transform events with source='cdp' and http.response to verify evidence model
    const traceEvents = events.map(e => ({
      ...e,
      source: 'cdp',
      timestamp: new Date().toISOString()
    }))
    // Also include http.response events
    traceEvents.push({
      version: 1,
      source: 'cdp',
      phase: 'http.response',
      timestamp: new Date().toISOString(),
      sessionId: target.sessionId,
      cdpRequestId: req1Id,
      httpStatus: 200
    } as any)
    traceEvents.push({
      version: 1,
      source: 'cdp',
      phase: 'http.response',
      timestamp: new Date().toISOString(),
      sessionId: target.sessionId,
      cdpRequestId: req2Id,
      httpStatus: 200
    } as any)

    const evidence = analyzeEvidence(traceEvents, { sessionId: target.sessionId, cdpRequestId: req2Id })
    expect(evidence.layers.HTTP).toBe('completed')
    expect(evidence.layers.JSF_PROTOCOL).toBe('valid')
    // Without authoritative receipt, BUSINESS must be unconfirmed, CERTAINTY unknown
    expect(evidence.layers.BUSINESS).toBe('unconfirmed')
    expect(evidence.layers.CERTAINTY).toBe('unknown')
    expect(evidence.missingEvidence).toContain('权威业务回执证据缺失')

    // Verification 5: Full diagnostic report
    const report = buildDiagnosticReport(traceEvents)
    expect(report.summary.confirmedSuccess).toBe(false)
    expect(report.summary.firstProvenFailure).toBeNull()
    expect(report.summary.protocolFingerprints.length).toBeGreaterThan(0)
  })

  // --------------------------------------------------------------------------
  // Scenario B: Business validation failure with HTTP 200
  // --------------------------------------------------------------------------
  it('Scenario B: correctly diagnoses JSF validation failed even on HTTP 200, marking JSF failed and business unconfirmed', async () => {
    const { research, events, setResponseBody } = createPipeline()
    await research.enable(target)

    const reqId = 'req-fail'
    const validationFailedXml = `<partial-response><changes><update id="ApplicantForm:messages"><![CDATA[<div class="ui-messages-error">Validation failed: Invalid postal code</div>]]></update><update id="javax.faces.ViewState"><![CDATA[v-token-val-fail]]></update><extension id="org.primefaces.validationFailed"><![CDATA[{"validationFailed":true}]]></extension></changes></partial-response>`

    setResponseBody(reqId, validationFailedXml)
    research.request(target, target.sessionId, { ...baseRequest, requestId: reqId })
    research.response(target.sessionId, { requestId: reqId, response: { status: 200, mimeType: 'text/xml' } })
    await research.finished(target.sessionId, { requestId: reqId, encodedDataLength: 200 })

    const parsedEvent = events.find(e => e.phase === 'jsf.parsed' && e.cdpRequestId === reqId)
    expect(parsedEvent).toBeDefined()
    expect(parsedEvent.validationFailed).toBe(true)
    expect(parsedEvent.protocolStatus).toBe('jsf_validation_failed')

    // Prepare trace events
    const traceEvents = events.map(e => ({
      ...e,
      source: 'cdp',
      timestamp: new Date().toISOString()
    }))
    traceEvents.push({
      version: 1,
      source: 'cdp',
      phase: 'http.response',
      timestamp: new Date().toISOString(),
      sessionId: target.sessionId,
      cdpRequestId: reqId,
      httpStatus: 200
    } as any)

    // Evaluate evidence model
    const evidence = analyzeEvidence(traceEvents, { sessionId: target.sessionId, cdpRequestId: reqId })
    expect(evidence.layers.HTTP).toBe('completed')
    // JSF Protocol layer must reflect failed due to validation failure
    expect(evidence.layers.JSF_PROTOCOL).toBe('failed')
    expect(evidence.layers.BUSINESS).toBe('unconfirmed')
    expect(evidence.layers.CERTAINTY).toBe('unknown')

    // Evaluate diagnostic report
    const report = buildDiagnosticReport(traceEvents)
    expect(report.summary.confirmedSuccess).toBe(false)
    expect(report.summary.firstProvenFailure).not.toBeNull()
    expect(report.summary.firstProvenFailure?.protocolStatus).toBe('jsf_validation_failed')
    expect(report.summary.hasUncertainty).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Scenario C: Protocol drift detection against baseline
  // --------------------------------------------------------------------------
  it('Scenario C: detects protocol drift against established baseline, reporting high severity drift without fake completion', async () => {
    // Known historical baseline: standard form update and extension
    const baseline: ProtocolBaseline = {
      httpMethod: 'POST',
      urlPath: '/HagueEFilingWeb/protected/portfolioManager.xhtml',
      facesNamespace: 'javax.faces',
      sourceComponent: 'ApplicantForm:save',
      actions: [
        { action: 'update', target: 'ApplicantForm' },
        { action: 'extension', target: 'org.primefaces.extensions' }
      ],
      actionTypes: ['update', 'extension'],
      viewStateBehavior: 'present',
      version: 1
    }

    const { research, events, setResponseBody } = createPipeline({ baseline })
    await research.enable(target)

    const reqId = 'xhr-drift'
    // Server unexpectedly returns a redirect to login page instead of the expected partial updates
    const redirectXml = `<partial-response><redirect url="/HagueEFilingWeb/login.xhtml"/></partial-response>`

    setResponseBody(reqId, redirectXml)
    research.request(target, target.sessionId, { ...baseRequest, requestId: reqId })
    research.response(target.sessionId, { requestId: reqId, response: { status: 200, mimeType: 'text/xml' } })
    await research.finished(target.sessionId, { requestId: reqId, encodedDataLength: 100 })

    const parsedEvent = events.find(e => e.phase === 'jsf.parsed' && e.cdpRequestId === reqId)
    expect(parsedEvent).toBeDefined()
    expect(parsedEvent.redirectDetected).toBe(true)
    expect(parsedEvent.driftStatus).toBe('drift_detected')
    expect(parsedEvent.driftSeverity).toBe('high')

    // Build report and verify drift reporting
    const traceEvents = events.map(e => ({
      ...e,
      source: 'cdp',
      timestamp: new Date().toISOString()
    }))
    const report = buildDiagnosticReport(traceEvents)
    expect(report.summary.driftStatus).toBe('drift_detected')
    expect(report.summary.confirmedSuccess).toBe(false)

    // Export markdown report and verify drift appears in the summary
    const md = exportDiagnostics(traceEvents, 'markdown')
    expect(md).toContain('漂移状态：drift_detected')
  })

  // --------------------------------------------------------------------------
  // Scenario D: Lifecycle race and session boundary isolation
  // --------------------------------------------------------------------------
  it('Scenario D: safely drops late responses across session teardown and re-enable, preventing cross-session pollution', async () => {
    const { research, events, setResponseBody } = createPipeline()
    await research.enable(target)

    const reqOldId = 'req-stale-lifecycle'
    setResponseBody(
      reqOldId,
      `<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[token-stale]]></update></changes></partial-response>`
    )

    // Old request dispatched in session 1
    research.request(target, target.sessionId, { ...baseRequest, requestId: reqOldId })
    research.response(target.sessionId, { requestId: reqOldId, response: { status: 200, mimeType: 'text/xml' } })

    // Simulate session teardown / disable before response finishes
    await research.disable()
    expect(research.mode).toBe('basic')
    expect(research.requests.size).toBe(0)

    // Now re-enable with a brand new target and session (new generation)
    const newTarget = {
      targetId: 'feedface-9999-8888-7777-666655554444',
      sessionId: 'deadbeef-9999-8888-7777-666655554444',
      url: 'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'
    }
    await research.enable(newTarget)
    expect(research.mode).toBe('research')
    expect(research.status().stats.observedRequests).toBe(0)

    // The stale old request from session 1 late-finishes now
    await research.finished(target.sessionId, { requestId: reqOldId, encodedDataLength: 100 })

    // Verification: Stale request was pruned/ignored, no jsf.parsed event was emitted for it
    const staleParsed = events.find(e => e.phase === 'jsf.parsed' && e.cdpRequestId === reqOldId)
    expect(staleParsed).toBeUndefined()

    // Now dispatch a valid new request in the new session
    const reqNewId = 'req-fresh-lifecycle'
    setResponseBody(
      reqNewId,
      `<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[token-fresh]]></update></changes></partial-response>`
    )
    research.request(newTarget, newTarget.sessionId, { ...baseRequest, requestId: reqNewId })
    research.response(newTarget.sessionId, { requestId: reqNewId, response: { status: 200, mimeType: 'text/xml' } })
    await research.finished(newTarget.sessionId, { requestId: reqNewId, encodedDataLength: 100 })

    // Verification: New request successfully parsed with fresh INITIAL_OBSERVED state
    const freshParsed = events.find(e => e.phase === 'jsf.parsed' && e.cdpRequestId === reqNewId)
    expect(freshParsed).toBeDefined()
    expect(freshParsed.viewStateTransition).toBe('INITIAL_OBSERVED')
    expect(freshParsed.sessionId).toBe(newTarget.sessionId)
    expect(freshParsed.targetId).toBe(newTarget.targetId)

    // Active queues and body bytes are completely clean
    expect(research.requests.size).toBe(0)
    expect(research.bytes).toBe(0)
    expect(research.queue.length).toBe(0)
  })
})
