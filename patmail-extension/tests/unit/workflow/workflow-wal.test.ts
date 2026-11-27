import { describe, expect, it, vi } from 'vitest'
import type { RecoveryTransport } from '../../../src/recovery/client'
import { WorkflowWal } from '../../../src/workflow/wal'

class TestWorkflow extends WorkflowWal<boolean> {
  protected completed(result: boolean): boolean { return result }
}

function ledger() {
  const records = new Map<string, { payload: unknown; revision: number }>()
  return vi.fn<RecoveryTransport>(async request => {
    const key = request.scope!
    const head = records.get(key) ?? { payload: null, revision: 0 }
    if (request.op === 'get') return head
    if (request.expectedRevision !== head.revision) throw new Error('revision conflict')
    const next = { payload: request.payload, revision: head.revision + 1 }
    records.set(key, next)
    return next
  })
}

describe('workflow WAL', () => {
  it.each([true, { state: 'unexpected' }])('refuses invalid persisted write intents (%j)', async payload => {
    const journal = ledger().mockResolvedValueOnce({ payload, revision: 1 })
    const send = vi.fn(() => Promise.resolve(true))
    await expect(new TestWorkflow(journal).run('fee', true, 'submit', () => true, send)).rejects.toThrow('记录无效')
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses to dispatch when the journal does not acknowledge an intent version', async () => {
    const journal = ledger().mockResolvedValueOnce({ payload: null, revision: 0 })
      .mockResolvedValueOnce({})
    const send = vi.fn(() => Promise.resolve(true))
    await expect(new TestWorkflow(journal).run('fee', true, 'submit', () => true, send)).rejects.toThrow('没有返回提交版本')
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps one active dispatcher for a resumable scope and releases it on an error', async () => {
    const journal = ledger()
    const workflow = new TestWorkflow(journal)
    const send = vi.fn(() => Promise.resolve(true))
    journal.mockRejectedValueOnce(new Error('WAL unavailable'))
    const first = workflow.run('fee', true, 'submit', () => true, send)
    await expect(workflow.run('fee', true, 'submit', () => true, send)).rejects.toThrow('正在执行')
    await expect(first).rejects.toThrow('WAL unavailable')
    await expect(workflow.run('fee', true, 'submit', () => true, send)).resolves.toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('resumes a confirmed draft after a restart and blocks an unconfirmed final submit', async () => {
    type Progress = { phase: 'preflight' | 'creating' | 'draft' | 'submitting'; filingId?: string }
    class FeeWorkflow extends WorkflowWal<boolean, Progress> {
      protected completed(result: boolean): boolean { return result }
    }
    const recovery = {
      initial: { phase: 'preflight' } as Progress,
      canResume: (value: unknown): value is Progress =>
        typeof value === 'object' && value !== null && 'phase' in value &&
        (value.phase === 'preflight' || value.phase === 'draft')
    }
    const journal = ledger()
    await new FeeWorkflow(journal).run('fee', true, 'submit', () => true, () => Promise.resolve(false), recovery)
    await new FeeWorkflow(journal).run('fee', true, 'submit', () => true, async checkpoint => {
      await checkpoint({ phase: 'creating' })
      await checkpoint({ phase: 'draft', filingId: 'saved-filing' })
      return false
    }, recovery)
    await new FeeWorkflow(journal).run('fee', true, 'submit', () => true, async (checkpoint, progress) => {
      expect(progress).toEqual({ phase: 'draft', filingId: 'saved-filing' })
      await checkpoint({ phase: 'submitting', filingId: 'saved-filing' })
      return false
    }, recovery)
    const send = vi.fn(() => Promise.resolve(true))
    await expect(new FeeWorkflow(journal).run('fee', true, 'submit', () => true, send, recovery)).rejects.toThrow('未确认')
    expect(send).not.toHaveBeenCalled()
  })

  it('requires a durable intent before dispatch and blocks a completed submission after restart', async () => {
    const journal = ledger()
    const send = vi.fn(() => {
      expect(journal.mock.calls.at(-1)?.[0].payload).toMatchObject({ state: 'pending' })
      return Promise.resolve(true)
    })
    await expect(new TestWorkflow(journal).run('fee', true, 'submit', () => true, send)).resolves.toBe(true)
    await expect(new TestWorkflow(journal).run('fee', true, 'submit', () => true, send)).rejects.toThrow('已完成')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('blocks a concurrent or restarted run with an unconfirmed receipt', async () => {
    const journal = ledger()
    const send = vi.fn(() => Promise.resolve(false))
    const results = await Promise.allSettled([
      new TestWorkflow(journal).run('pct', false, 'import', () => true, send),
      new TestWorkflow(journal).run('pct', false, 'import', () => true, send)
    ])
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    await expect(new TestWorkflow(journal).run('pct', false, 'import', () => true, send)).rejects.toThrow('未确认')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('allows confirmed repeatable steps and never dispatches if WAL fails or the account changes', async () => {
    const send = vi.fn(() => Promise.resolve(true))
    const journal = ledger()
    const workflow = new TestWorkflow(journal)
    await expect(workflow.run('pct', false, 'import', () => false, send)).rejects.toThrow('会话')
    expect(send).not.toHaveBeenCalled()
    await workflow.run('pct', false, 'import', () => true, send)
    await workflow.run('pct', false, 'import', () => true, send)
    journal.mockRejectedValueOnce(new Error('WAL unavailable'))
    await expect(workflow.run('pct', false, 'import', () => true, send)).rejects.toThrow('WAL unavailable')
    expect(send).toHaveBeenCalledTimes(2)
  })
})
