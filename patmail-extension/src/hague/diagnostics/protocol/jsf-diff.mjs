import { safeComponentId, safePath, stableHash } from '../schema.mjs'

function fnv1a(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function computeProtocolFingerprint(req = {}) {
  const method = (req.httpMethod || 'POST').toUpperCase()
  const path = safePath(req.urlPath) || '/unknown'
  const ns = req.facesNamespace || 'unknown'
  const src = safeComponentId(req.sourceComponent || '')
  const proc = req.process ? String(req.process).split(/\s+/).sort().join(' ') : ''
  const upd = req.update ? String(req.update).split(/\s+/).sort().join(' ') : ''
  const evt = req.event || ''
  // JSF Partial Response actions maintain sequential semantic order; do not sort!
  const actionList = Array.isArray(req.actions)
    ? req.actions.map(a => (typeof a === 'string' ? a : a.action)).join(',')
    : Array.isArray(req.actionTypes)
      ? req.actionTypes.join(',')
      : ''

  const canonical = [method, path, ns, src, proc, upd, evt, actionList].join('|')
  return `proto:${fnv1a(canonical)}`
}

export function computeScenarioFingerprint(steps = []) {
  if (!Array.isArray(steps) || !steps.length) return 'scenario:empty'
  const normalized = steps.map(s => {
    const action = s.action || s.stepLabel || s.operation || 'unknown'
    const path = safePath(s.path || s.urlPath) || '/unknown'
    return `${s.step || 0}:${action}:${path}`
  }).join('->')
  return `scenario:${fnv1a(normalized)}`
}

export function detectProtocolDrift(baseline, observed) {
  if (!baseline) {
    return {
      hasDrift: false,
      driftStatus: 'baseline_missing',
      severity: 'low',
      baselineVersion: undefined,
      protocolFingerprint: observed ? computeProtocolFingerprint(observed) : undefined,
      changes: [],
      confidence: 'unresolved',
      unresolvedReasons: ['baseline_missing']
    }
  }

  if (!observed) {
    return {
      hasDrift: false,
      driftStatus: 'unresolved',
      severity: 'low',
      baselineVersion: baseline.version || '1.0.0',
      protocolFingerprint: undefined,
      changes: [],
      confidence: 'unresolved',
      unresolvedReasons: ['insufficient_data']
    }
  }

  const changes = []
  let severity = 'low'

  // 1. Faces namespace change
  if (baseline.facesNamespace && observed.facesNamespace && baseline.facesNamespace !== observed.facesNamespace) {
    changes.push({
      type: 'namespace_changed',
      from: baseline.facesNamespace,
      to: observed.facesNamespace,
      details: `Faces namespace shifted from ${baseline.facesNamespace} to ${observed.facesNamespace}`
    })
    severity = 'high'
  }

  // 2. Actions comparison
  const expectedActions = baseline.expectedActions || baseline.observedActions || []
  const actualActions = observed.observedActions || observed.expectedActions || []

  for (const exp of expectedActions) {
    if (!actualActions.includes(exp)) {
      changes.push({
        type: 'missing_expected_action',
        action: exp,
        details: `Expected action "${exp}" was not observed in response`
      })
      if (['update', 'extension'].includes(exp)) severity = 'high'
    }
  }

  for (const act of actualActions) {
    if (['redirect', 'error'].includes(act) && !expectedActions.includes(act)) {
      changes.push({
        type: 'unexpected_action',
        action: act,
        details: `Unexpected action "${act}" observed in response`
      })
      severity = 'high'
    }
  }

  // 3. ViewState behavior change
  if (baseline.viewStateBehavior && observed.viewStateBehavior && baseline.viewStateBehavior !== observed.viewStateBehavior) {
    changes.push({
      type: 'viewstate_behavior_anomaly',
      from: baseline.viewStateBehavior,
      to: observed.viewStateBehavior,
      details: `ViewState behavior altered from ${baseline.viewStateBehavior} to ${observed.viewStateBehavior}`
    })
    if (observed.viewStateBehavior === 'missing') severity = 'high'
  }

  // 4. Source component comparison (distinguish dynamic j_idt shift from structural change)
  if (baseline.sourceComponent && observed.sourceComponent && baseline.sourceComponent !== observed.sourceComponent) {
    const isBaselineDynamic = /^j_idt\d+$/.test(baseline.sourceComponent)
    const isObservedDynamic = /^j_idt\d+$/.test(observed.sourceComponent)

    if (isBaselineDynamic && isObservedDynamic) {
      changes.push({
        type: 'component_id_shift',
        from: baseline.sourceComponent,
        to: observed.sourceComponent,
        details: `Dynamic component ID renumbered (${baseline.sourceComponent} -> ${observed.sourceComponent})`
      })
      // Dynamic shift alone is never automatically high severity
      if (severity !== 'high') severity = 'medium'
    } else {
      changes.push({
        type: 'source_component_changed',
        from: baseline.sourceComponent,
        to: observed.sourceComponent,
        details: `Source component identity changed`
      })
      severity = 'high'
    }
  }

  const hasDrift = changes.length > 0
  return {
    hasDrift,
    driftStatus: hasDrift ? 'drift_detected' : 'no_drift',
    severity: hasDrift ? severity : 'low',
    baselineVersion: baseline.version || '1.0.0',
    protocolFingerprint: computeProtocolFingerprint(observed),
    changes,
    confidence: 'exact',
    unresolvedReasons: []
  }
}
