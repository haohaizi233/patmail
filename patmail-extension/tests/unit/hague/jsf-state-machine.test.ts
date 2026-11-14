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

  it('marks INITIAL_OBSERVED on first AJAX response when initial page state was not observed', async () => {
    const sm = createViewStateStateMachine()
    const scope = { sessionId: 'sess-first', frameId: 'frame-first', loaderId: 'loader-first' }

    // Start research mode without prior recordInitialViewState
    sm.beginRequest(scope, 'ajax-req-1')

    // First response arrives
    const res1 = await sm.recordResponseViewState(scope, 'ajax-req-1', 'vs_first_ajax_seen')
    // Section 3.4: Must be INITIAL_OBSERVED, NOT STATE_CHANGED!
    expect(res1.transition).toBe('INITIAL_OBSERVED')
    expect(res1.status).toBe('INITIAL_OBSERVED')
    expect(sm.getState(scope)).toBe('INITIAL_OBSERVED')

    // Subsequent response now has an established baseline
    sm.beginRequest(scope, 'ajax-req-2')
    const res2 = await sm.recordResponseViewState(scope, 'ajax-req-2', 'vs_second_ajax_seen')
    expect(res2.transition).toBe('STATE_CHANGED')
    expect(res2.status).toBe('STATE_CHANGED')
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

  it('handles concurrent in-flight requests and avoids regression from late responses (precise assertion)', async () => {
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

    // Late Request A returns third with older vs_1 (which is in tagHistory)
    const resA = await sm.recordResponseViewState(scope, 'req-A', 'vs_1')
    // Out-of-order response MUST be precisely OUT_OF_ORDER (not loosely any of 3 states)
    expect(resA.transition).toBe('OUT_OF_ORDER')
  })

  it('evaluates six-way concurrent requests correctly across arrival orders', async () => {
    const sm = createViewStateStateMachine()
    const scope = { sessionId: 'sess-6way', frameId: 'frame-6', loaderId: 'loader-6' }

    await sm.recordInitialViewState(scope, 'vs_base')

    // Dispatch 6 parallel requests
    for (let i = 1; i <= 6; i++) {
      sm.beginRequest(scope, `req-6-${i}`)
    }

    // req-3 returns first with new state
    const res3 = await sm.recordResponseViewState(scope, 'req-6-3', 'vs_step_3')
    expect(res3.transition).toBe('STATE_CHANGED')

    // req-4 returns second with same state as step 3
    const res4 = await sm.recordResponseViewState(scope, 'req-6-4', 'vs_step_3')
    expect(res4.transition).toBe('STATE_UNCHANGED')

    // req-5 returns third with step 5
    const res5 = await sm.recordResponseViewState(scope, 'req-6-5', 'vs_step_5')
    expect(res5.transition).toBe('STATE_CHANGED')

    // req-6 returns fourth with same state
    const res6 = await sm.recordResponseViewState(scope, 'req-6-6', 'vs_step_5')
    expect(res6.transition).toBe('STATE_UNCHANGED')

    // req-1 returns late with vs_base (in history)
    const res1 = await sm.recordResponseViewState(scope, 'req-6-1', 'vs_base')
    expect(res1.transition).toBe('OUT_OF_ORDER')

    // req-2 returns late with vs_step_3 (in history)
    const res2 = await sm.recordResponseViewState(scope, 'req-6-2', 'vs_step_3')
    expect(res2.transition).toBe('OUT_OF_ORDER')
  })

  it('isolates state across targets, sessions, frames, and forms', async () => {
    const sm = createViewStateStateMachine()
    const scopeTargetA = { sessionId: 'sess-iso', targetId: 'target-A', frameId: 'f1', loaderId: 'l1' }
    const scopeTargetB = { sessionId: 'sess-iso', targetId: 'target-B', frameId: 'f1', loaderId: 'l1' }
    const scopeForm1 = { sessionId: 'sess-iso', targetId: 'target-A', frameId: 'f1', loaderId: 'l1', formId: 'Form1' }
    const scopeForm2 = { sessionId: 'sess-iso', targetId: 'target-A', frameId: 'f1', loaderId: 'l1', formId: 'Form2' }

    await sm.recordInitialViewState(scopeTargetA, 'vs_targetA')
    await sm.recordInitialViewState(scopeTargetB, 'vs_targetB')
    await sm.recordInitialViewState(scopeForm1, 'vs_form1')
    await sm.recordInitialViewState(scopeForm2, 'vs_form2')

    sm.beginRequest(scopeTargetA, 'req-ta')
    sm.beginRequest(scopeTargetB, 'req-tb')
    sm.beginRequest(scopeForm1, 'req-f1')
    sm.beginRequest(scopeForm2, 'req-f2')

    // Target A response doesn't affect Target B
    const resTA = await sm.recordResponseViewState(scopeTargetA, 'req-ta', 'vs_targetA_next')
    expect(resTA.transition).toBe('STATE_CHANGED')
    expect(sm.getState(scopeTargetB)).toBe('REQUEST_IN_FLIGHT')

    // Form 1 response doesn't affect Form 2
    const resF1 = await sm.recordResponseViewState(scopeForm1, 'req-f1', 'vs_form1_next')
    expect(resF1.transition).toBe('STATE_CHANGED')
    expect(sm.getState(scopeForm2)).toBe('REQUEST_IN_FLIGHT')
  })

  it('prunes expired in-flight requests and bounds context and in-flight capacity', async () => {
    const sm = createViewStateStateMachine({ maxInFlight: 10, maxInFlightPerDoc: 4, ttlMs: 1000 })
    const scope = { sessionId: 'sess-cap', frameId: 'f-cap', loaderId: 'l-cap' }
    await sm.recordInitialViewState(scope, 'vs_init')

    // Dispatch 5 requests for single doc (max is 4)
    for (let i = 1; i <= 5; i++) {
      sm.beginRequest(scope, `req-cap-${i}`)
    }
    const snap = sm.getDiagnosticsSnapshot(scope)
    expect(snap.inFlightCount).toBeLessThanOrEqual(4)

    // Oldest req-cap-1 was evicted from inFlight; its late response cannot verify preTag
    const res1 = await sm.recordResponseViewState(scope, 'req-cap-1', 'vs_unknown_1')
    expect(res1.transition).toBe('STATE_UNVERIFIABLE')

    // Forget request cancels tracking
    sm.forgetRequest(scope, 'req-cap-5')
    const res5 = await sm.recordResponseViewState(scope, 'req-cap-5', 'vs_unknown_5')
    expect(res5.transition).toBe('STATE_UNVERIFIABLE')

    // Invalidate document clears doc state and associated in-flight
    sm.invalidateDocument(scope)
    expect(sm.getState(scope)).toBe('UNKNOWN')
  })

  it('returns STATE_UNVERIFIABLE when cross-session or ownership is ambiguous', async () => {
    const sm = createViewStateStateMachine()
    const ambiguousScope = { sessionId: '', frameId: '' }
    const res = await sm.recordResponseViewState(ambiguousScope, 'req-unk', 'vs_val')
    expect(res.transition).toBe('STATE_UNVERIFIABLE')
  })

  it('supports session invalidation and research re-enable isolation', async () => {
    const sm = createViewStateStateMachine()
    const scopeSession1 = { sessionId: 'sess-old', frameId: 'f1', loaderId: 'l1' }
    const scopeSession2 = { sessionId: 'sess-new', frameId: 'f1', loaderId: 'l1' }

    await sm.recordInitialViewState(scopeSession1, 'vs_old')
    sm.beginRequest(scopeSession1, 'req-old')

    // Session 1 is invalidated
    sm.invalidateSession('sess-old')
    expect(sm.getState(scopeSession1)).toBe('UNKNOWN')

    // Late response from session 1 cannot alter state
    const resOld = await sm.recordResponseViewState(scopeSession1, 'req-old', 'vs_late')
    expect(resOld.transition).toBe('STATE_UNVERIFIABLE')

    // Fresh session 2 works cleanly
    await sm.recordInitialViewState(scopeSession2, 'vs_new')
    sm.beginRequest(scopeSession2, 'req-new')
    const resNew = await sm.recordResponseViewState(scopeSession2, 'req-new', 'vs_new_2')
    expect(resNew.transition).toBe('STATE_CHANGED')
  })
})


describe('P1 scoped cancellation', () => {
  const a = { sessionId: 'A', targetId: 'T', frameId: 'F', loaderId: 'L', formId: 'form' }
  it.each(['sessionId', 'frameId', 'loaderId', 'formId'] as const)('retains the other %s identity with the same requestId', async field => {
    const sm = createViewStateStateMachine()
    const b = { ...a, [field]: 'other' }
    await sm.recordInitialViewState(a, 'initial-a')
    await sm.recordInitialViewState(b, 'initial-b')
    sm.beginRequest(a, '123'); sm.beginRequest(b, '123')
    sm.forgetRequest(field === 'sessionId' ? { sessionId: 'A' } : a, '123')
    expect(sm.getDiagnosticsSnapshot().inFlightCount).toBe(1)
    expect((await sm.recordResponseViewState(b, '123', 'next-b')).transition).toBe('STATE_CHANGED')
    expect((await sm.recordResponseViewState(a, '123', 'next-a')).transition).toBe('STATE_UNVERIFIABLE')
    expect(sm.getState(a)).toBe('REQUEST_IN_FLIGHT')
  })
  it('rejects missing, malformed and ambiguous scope without global deletion', () => {
    const sm = createViewStateStateMachine()
    sm.beginRequest(a, '123'); sm.beginRequest({ ...a, frameId: 'other' }, '123')
    for (const scope of [undefined, null, {}, { sessionId: 'A', frameId: 42 }, { sessionId: 'A' }]) {
      expect(() => { Reflect.apply(sm.forgetRequest.bind(sm), sm, [scope, '123']) }).not.toThrow()
      expect(sm.getDiagnosticsSnapshot().inFlightCount).toBe(2)
    }
    sm.forgetRequest(a, '123'); sm.forgetRequest(a, '123')
    expect(sm.getDiagnosticsSnapshot().inFlightCount).toBe(1)
  })
  it('does not commit a response cancelled while private HMAC parsing is in progress', async () => {
    const sm = createViewStateStateMachine()
    sm.beginRequest(a, '123')
    const response = sm.recordResponseViewState(a, '123', 'private-token')
    sm.forgetRequest(a, '123')
    expect((await response).transition).toBe('STATE_UNVERIFIABLE')
    expect(sm.getState(a)).toBe('REQUEST_IN_FLIGHT')
    expect(JSON.stringify(sm.getDiagnosticsSnapshot(a))).not.toContain('private-token')
  })
  it('ignores a late cancellation after clear without touching another session', async () => {
    const sm = createViewStateStateMachine()
    sm.beginRequest(a, '123'); sm.clear()
    const b = { ...a, sessionId: 'B' }
    sm.beginRequest(b, '123'); sm.forgetRequest({ sessionId: 'A' }, '123')
    expect((await sm.recordResponseViewState(b, '123', 'new-private-token')).transition).toBe('INITIAL_OBSERVED')
  })
})
