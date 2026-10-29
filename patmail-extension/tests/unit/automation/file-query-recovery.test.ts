import { describe, expect, it } from 'vitest'
import { fileQueryScope, restoredFileQuery } from '../../../src/recovery/file-query'
describe('file query snapshots', () => {
  it('keeps full owner and surface identity without truncation', () => {
    const id = 'x'.repeat(300)
    expect(fileQueryScope('https://example.test/', id, 'desk')).not.toBe(fileQueryScope('https://example.test', id + '2', 'desk'))
    expect(fileQueryScope('https://example.test', id, 'desk')).not.toBe(fileQueryScope('https://example.test', id, 'float'))
  })
  it('restores local state read-only and forces running task to paused without mutating stored evidence', () => {
    const snapshot = { version: 1, owner: ['https://example.test', 'u', 'desk'], selected: { f: { fileId: 'f', fileNo: 'A', fileName: 'f.pdf' } }, activeTask: { id: 't', status: 'running', items: [] }, result: { items: [], total: 0 } }
    const restored = restoredFileQuery(snapshot, 'https://example.test', 'u', 'desk')!
    expect(restored.activeTask?.status).toBe('paused')
    expect(snapshot.activeTask.status).toBe('running')
    expect(restoredFileQuery(snapshot, 'https://example.test', 'other', 'desk')).toBeNull()
    expect(restoredFileQuery({ ...snapshot, owner: undefined }, 'https://example.test', 'u', 'desk')).toBeNull()
  })
})
