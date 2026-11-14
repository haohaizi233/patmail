import { createHash } from 'node:crypto'
import { createSourceIndex } from '../src/hague/diagnostics/correlation/correlator.mjs'
import { parentPort } from 'node:worker_threads'
import { analyzeJavaScript } from '../src/hague/diagnostics/ast/analyzer.mjs'
import { createViewStateStateMachine } from '../src/hague/diagnostics/protocol/jsf-state-machine.mjs'
import { parseJsfProtocol } from '../src/hague/diagnostics/protocol/jsf-semantics.mjs'
import { computeProtocolFingerprint, detectProtocolDrift } from '../src/hague/diagnostics/protocol/jsf-diff.mjs'
import { createObservedComponentRegistry } from '../src/hague/diagnostics/protocol/observed-components.mjs'

const stateMachine = createViewStateStateMachine()
const index = createSourceIndex()
const componentRegistry = createObservedComponentRegistry()

parentPort.on('message', async (msg) => {
  if (msg.type === 'signal') {
    const { action, payload } = msg
    if (action === 'begin_request') stateMachine.beginRequest(payload.scope, payload.requestId)
    else if (action === 'forget_request') stateMachine.forgetRequest(payload.scope, payload.requestId)
    else if (action === 'invalidate_document') stateMachine.invalidateDocument(payload.scope)
    else if (action === 'invalidate_session') stateMachine.invalidateSession(payload.sessionId)
    else if (action === 'clear') {
      stateMachine.clear()
      index.clear()
      componentRegistry.clear()
    }
    return
  }

  const { id, kind, value, options = {} } = msg
  const started = performance.now()
  try {
    let result
    if (kind === 'ast') {
      result = analyzeJavaScript(value)
      index.addScript({
        ...options,
        generation: undefined,
        scriptHash: createHash('sha256').update(value).digest('hex'),
        calls: result.calls
      })
    } else if (kind === 'lookup') {
      const locations = Array.isArray(value.sourceLocations) ? value.sourceLocations.slice(0, 20) : [value.sourceLocation]
      const matches = new Map()
      let ambiguous = false
      for (const sourceLocation of locations) {
        const edge = index.lookup({ ...value, sourceLocation })
        if (edge.astCorrelationConfidence === 'ambiguous') ambiguous = true
        for (const match of edge.matches ?? []) {
          const key = JSON.stringify([match.scriptId, match.scriptHash, match.location?.line, match.location?.column])
          matches.set(key, { match, edge, functionName: sourceLocation?.functionName })
        }
      }
      if (!ambiguous && matches.size === 1) {
        const selected = [...matches.values()][0]
        result = { ...selected.edge, matches: [selected.match], functionName: selected.functionName }
      } else {
        result = {
          astConfidence: 'unresolved',
          astCorrelationConfidence: ambiguous || matches.size > 1 ? 'ambiguous' : 'unmatched',
          correlationConfidence: 'unmatched',
          matches: [],
          reasons: [ambiguous || matches.size > 1 ? 'multiple_calls' : 'source_location_missing']
        }
      }
    } else if (kind === 'state') {
      result = stateMachine.getDiagnosticsSnapshot(options.scope)
    } else {
      // kind === 'xml'
      const parsed = parseJsfProtocol(value, options)
      const rawViewState = parsed._rawViewState

      // Determine document scope
      let scope = options.scope
      if (!scope && options.contextKey) {
        const parts = String(options.contextKey).split(':')
        scope = { sessionId: parts[0], frameId: parts[1], loaderId: parts[2] }
      }

      // Record ViewState transition in state machine
      let transitionRes = { status: 'UNKNOWN', transition: 'STATE_UNVERIFIABLE' }
      if (scope && scope.sessionId && scope.frameId) {
        transitionRes = await stateMachine.recordResponseViewState(scope, options.requestId, rawViewState)
      }

      // Protocol fingerprinting (preserves action order)
      const observedMeta = {
        httpMethod: 'POST',
        urlPath: options.urlPath || scope?.urlPath,
        facesNamespace: parsed.namespace,
        sourceComponent: options.sourceComponent,
        actions: parsed.actions,
        actionTypes: parsed.actions?.map(a => a.action),
        viewStateBehavior: parsed.viewStatePresent ? 'present' : 'missing'
      }
      const fingerprint = computeProtocolFingerprint(observedMeta)

      // Drift detection
      let drift = undefined
      if (options.baseline !== undefined) {
        drift = detectProtocolDrift(options.baseline, observedMeta)
      }

      // Track observed components
      for (const compId of parsed.updatedComponents ?? []) {
        componentRegistry.registerComponent({
          componentId: compId,
          formId: scope?.formId,
          sourceEvidence: 'response_update',
          confidence: 'unresolved'
        })
      }

      // Safe Trace projection: zero raw values leak
      result = {
        protocolStatus: parsed.protocolStatus,
        errorCode: parsed.errorCode,
        xmlParsed: parsed.xmlParsed,
        parserError: parsed.parserError,
        jsfError: parsed.jsfError,
        validationFailed: parsed.validationFailed,
        redirectDetected: parsed.redirectDetected,
        redirectPaths: parsed.redirect?.urlPath ? [parsed.redirect.urlPath] : undefined,
        updateCount: parsed.updateCount,
        insertCount: parsed.insertCount,
        deleteCount: parsed.deleteCount,
        attributeCount: parsed.attributeCount,
        evalCount: parsed.evalCount,
        extensionCount: parsed.extensionCount,
        unknownNodeCount: parsed.unknownNodeCount,
        updatedComponents: parsed.updatedComponents,
        expectedUpdates: parsed.expectedUpdates,
        bodyStatus: parsed.bodyStatus,
        viewStatePresent: parsed.viewStatePresent,
        viewStateLength: parsed.viewStateLength,
        viewStateChanged: transitionRes.transition === 'STATE_CHANGED',
        viewStateTransition: transitionRes.transition,
        viewStateStatus: transitionRes.status,
        protocolFingerprint: fingerprint,
        driftStatus: drift?.driftStatus,
        driftSeverity: drift?.severity,
        baselineVersion: drift?.baselineVersion,
        unresolvedReasons: [...parsed.unresolvedReasons, ...(drift?.unresolvedReasons ?? [])]
      }
    }

    parentPort.postMessage({
      id,
      result,
      metrics: { durationMs: performance.now() - started, heapBytes: process.memoryUsage().heapUsed }
    })
  } catch {
    parentPort.postMessage({ id, error: true })
  }
})
