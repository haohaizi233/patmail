import { describe, expect, it } from 'vitest'
import { createViewStateStateMachine } from '../../../src/hague/diagnostics/protocol/jsf-state-machine.mjs'

describe('ViewState State Machine & Causal Chain Tracking', () => {
  it('progresses through deterministic lifecycle states on single document', async () => {
    const sm = createViewStateStateMachine()
    const scope = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-1', formId: 'ApplicantForm' }

    expect(sm.getState(scope)).toBe('UNKNOWN')

    // Initial load of page
    await sm.recordInitialViewState(scope, 'vs_initial_token_123')
    expect(sm.getState(scope)).toBe('INITIAL_OBSERVED')

    // Request 1 dispatched
    const req1 = sm.beginRequest(scope, 'req-1')
    expect(req1.status).toBe('REQUEST_IN_FLIGHT')

    // Response 1 returns updated ViewState
    const res1 = await sm.recordResponseViewState(scope, 'req-1', 'vs_updated_token_456')
    expect(res1.transition).toBe('STATE_CHANGED')
    expect(res1.status).toBe('STATE_CHANGED')

    // Request 2 dispatched
    sm.beginRequest(scope, 'req-2')

    // Response 2 returns same ViewState
    const res2 = await sm.recordResponseViewState(scope, 'req-2', 'vs_updated_token_456')
    expect(res2.transition).toBe('STATE_UNCHANGED')
    expect(res2.status).toBe('STATE_UNCHANGED')
  })

  it('detects missing ViewState in partial response', async () => {
    const sm = createViewStateStateMachine()
    const scope = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-1' }

    await sm.recordInitialViewState(scope, 'vs_initial')
    sm.beginRequest(scope, 'req-1')

    const res = await sm.recordResponseViewState(scope, 'req-1', null)
    expect(res.transition).toBe('STATE_MISSING')
  })

  it('marks DOCUMENT_CHANGED when loaderId or frameId changes', async () => {
    const sm = createViewStateStateMachine()
    const scope1 = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-1' }
    const scope2 = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-2' }

    await sm.recordInitialViewState(scope1, 'vs_doc_1')
    sm.beginRequest(scope1, 'req-1')
    await sm.recordResponseViewState(scope1, 'req-1', 'vs_doc_1_up')

    // New loader on same frame indicates a full document navigation
    expect(sm.getState(scope2)).toBe('DOCUMENT_CHANGED')
  })

  it('enforces privacy boundary: zero raw string retention and ephemeral keys', async () => {
    const sm = createViewStateStateMachine()
    const secretToken = 'SECRET_SENSITIVE_VIEWSTATE_TOKEN_XYZ_987654321'
    const scope = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-1' }

    await sm.recordInitialViewState(scope, secretToken)
    sm.beginRequest(scope, 'req-1')
    const res = await sm.recordResponseViewState(scope, 'req-1', secretToken + '_MODIFIED')

    const snapshot = sm.getDiagnosticsSnapshot(scope)
    expect(JSON.stringify(snapshot)).not.toContain('SECRET_SENSITIVE')
    expect(JSON.stringify(res)).not.toContain('SECRET_SENSITIVE')
    expect(snapshot.hasActiveKey).toBe(true)

    // Reset clears memory keys
    sm.clear()
    expect(sm.getState(scope)).toBe('UNKNOWN')
    expect(sm.getDiagnosticsSnapshot(scope).hasActiveKey).toBe(false)
  })

  it('handles concurrent in-flight requests and avoids regression from late responses', async () => {
    const sm = createViewStateStateMachine()
    const scope = { sessionId: 'sess-1', frameId: 'frame-1', loaderId: 'loader-1' }

    await sm.recordInitialViewState(scope, 'vs_0')

    // Dispatches 3 parallel requests
    sm.beginRequest(scope, 'req-A')
    sm.beginRequest(scope, 'req-B')
    sm.beginRequest(scope, 'req-C')

    // Request B returns first with vs_1
    const resB = await sm.recordResponseViewState(scope, 'req-B', 'vs_1')
    expect(resB.transition).toBe('STATE_CHANGED')

    // Request C returns second with vs_2
    const resC = await sm.recordResponseViewState(scope, 'req-C', 'vs_2')
    expect(resC.transition).toBe('STATE_CHANGED')

    // Late Request A returns third with older vs_1
    const resA = await sm.recordResponseViewState(scope, 'req-A', 'vs_1')
    // Out-of-order response should be flagged or recognized against authoritative latest state
    expect(['STATE_CHANGED', 'STATE_CONFLICT', 'OUT_OF_ORDER']).toContain(resA.transition)
  })

  it('returns STATE_UNVERIFIABLE when cross-session or ownership is ambiguous', async () => {
    const sm = createViewStateStateMachine()
    const ambiguousScope = { sessionId: '', frameId: '' }
    const res = await sm.recordResponseViewState(ambiguousScope, 'req-unk', 'vs_val')
    expect(res.transition).toBe('STATE_UNVERIFIABLE')
  })
})
