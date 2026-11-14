import { describe, expect, it } from 'vitest'
import {
  computeProtocolFingerprint,
  computeScenarioFingerprint,
  detectProtocolDrift,
} from '../../../src/hague/diagnostics/protocol/jsf-diff.mjs'

describe('JSF Protocol Fingerprint & Drift Detection', () => {
  it('computes deterministic protocol fingerprints without leaking sensitive values', () => {
    const req1 = {
      httpMethod: 'POST',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      sourceComponent: 'ApplicantForm:saveBtn',
      process: '@this',
      update: 'ApplicantForm',
      event: 'click',
      actionTypes: ['update', 'extension'],
    }

    const fp1 = computeProtocolFingerprint(req1)
    const fp2 = computeProtocolFingerprint({ ...req1, secretPayload: 'SUPER_SECRET_123' })

    expect(fp1).toBe(fp2)
    expect(typeof fp1).toBe('string')
    expect(fp1.length).toBeGreaterThan(8)
    expect(JSON.stringify(fp1)).not.toContain('SUPER_SECRET')
  })

  it('detects protocol drift when actions or namespace change', () => {
    const baseline = {
      scenarioId: 'save_applicant',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      expectedActions: ['update', 'extension'],
      viewStateBehavior: 'changes',
    }

    // Observed: server returns unexpected redirect instead of normal updates
    const observedRedirect = {
      scenarioId: 'save_applicant',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      observedActions: ['redirect'],
      viewStateBehavior: 'missing',
    }

    const drift = detectProtocolDrift(baseline, observedRedirect)
    expect(drift.hasDrift).toBe(true)
    expect(drift.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'unexpected_action', action: 'redirect' }),
        expect.objectContaining({ type: 'missing_expected_action', action: 'update' }),
        expect.objectContaining({ type: 'viewstate_behavior_anomaly' }),
      ])
    )
    expect(drift.severity).toBe('high')
  })

  it('does not classify dynamic component ID shifting alone as critical severity', () => {
    const baseline = {
      scenarioId: 'refresh_table',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      sourceComponent: 'j_idt50',
      expectedActions: ['update'],
      viewStateBehavior: 'changes',
    }

    // Server renumbered internal JSF dynamic id from j_idt50 to j_idt52
    const observed = {
      scenarioId: 'refresh_table',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      sourceComponent: 'j_idt52',
      observedActions: ['update'],
      viewStateBehavior: 'changes',
    }

    const drift = detectProtocolDrift(baseline, observed)
    expect(drift.hasDrift).toBe(true)
    expect(drift.changes).toHaveLength(1)
    expect(drift.changes[0].type).toBe('component_id_shift')
    // Must be low or medium severity, not high/critical
    expect(['low', 'medium']).toContain(drift.severity)
  })

  it('computes scenario fingerprints across chained multi-step requests', () => {
    const scenario = [
      { step: 1, action: 'select_office', path: '/HagueEFilingWeb/protected/page/application.xhtml' },
      { step: 2, action: 'add_applicant', path: '/HagueEFilingWeb/protected/page/application.xhtml' },
      { step: 3, action: 'save_draft', path: '/HagueEFilingWeb/protected/page/application.xhtml' },
    ]
    const sFp = computeScenarioFingerprint(scenario)
    expect(typeof sFp).toBe('string')
    expect(sFp.length).toBeGreaterThan(10)
  })

  it('reports baseline_missing rather than false no_drift when baseline is absent', () => {
    const observed = {
      scenarioId: 'save_applicant',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      observedActions: ['update'],
    }

    const drift = detectProtocolDrift(null, observed)
    expect(drift.hasDrift).toBe(false)
    expect(drift.driftStatus).toBe('baseline_missing')
    expect(drift.confidence).toBe('unresolved')
    expect(drift.unresolvedReasons).toContain('baseline_missing')
  })

  it('preserves sequential order of partial response actions in protocol fingerprint', () => {
    const req1 = {
      httpMethod: 'POST',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      actions: ['update', 'eval', 'delete']
    }
    const req2 = {
      httpMethod: 'POST',
      urlPath: '/HagueEFilingWeb/protected/page/application.xhtml',
      facesNamespace: 'javax',
      actions: ['delete', 'eval', 'update']
    }

    const fp1 = computeProtocolFingerprint(req1)
    const fp2 = computeProtocolFingerprint(req2)
    // Different action order yields different protocol fingerprints
    expect(fp1).not.toBe(fp2)
  })
})
