import { describe, expect, it } from 'vitest'
import { sanitizeWorkflowDeskState } from '../../../src/app/pages/workflow-desk-state'
const valid = (value: unknown): value is { id: string; steps: unknown[] } => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' && Array.isArray((value as { steps?: unknown }).steps)

describe('workflow desk recovery state', () => {
  it('restores navigation and unsaved editor selections', () => {
    const draft = { id: 'custom', steps: [{ id: 'step-2' }] }
    expect(sanitizeWorkflowDeskState({ screen: 'flow', hagueView: 'guide', jihuaView: 'use', draft, selectedId: 'step-2', dirty: true, picked: ['a'], newName: 'draft' }, valid)).toEqual({ screen: 'flow', hagueView: 'guide', jihuaView: 'use', draft, selectedId: 'step-2', dirty: true, picked: ['a'], newName: 'draft' })
  })
  it('rejects unknown screens and sanitizes optional fields', () => {
    expect(sanitizeWorkflowDeskState({ screen: 'unknown' }, valid)).toBeNull()
    expect(sanitizeWorkflowDeskState({ screen: 'flow', draft: { steps: 'bad' } }, valid)).toMatchObject({ screen: 'sea', draft: null })
    expect(sanitizeWorkflowDeskState({ screen: 'ocean', picked: [1, 'ok'], newName: 'x'.repeat(50) }, valid)).toMatchObject({ screen: 'ocean', picked: ['ok'], newName: 'x'.repeat(40), dirty: false })
  })
})

