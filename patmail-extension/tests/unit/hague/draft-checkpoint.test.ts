import { expect, it } from 'vitest'
import { reactive, isProxy } from 'vue'
import { draftCheckpointSnapshot, draftWarnings, type DraftCheckpoint } from '../../../src/hague/draft-contract'
import { runDraftPlan, draftPlanKey, draftSteps } from '../../../src/hague/draft-runner'
import type { DraftPlan } from '../../../src/hague/draft-plan'
import { runDraftBatch } from '../../../src/hague/draft-batch'
import { draftReviewNotes } from '../../../src/hague/draft-completion'
import type { HagueRow } from '../../../src/hague/workflow'

const plan: DraftPlan = { reference: 'PO1HAGUE', applicants: [], creators: [], parties: ['EM'], publicationMonths: 6, priorities: [], locarno: '28', description: '', designs: [] }
const checkpoint = (): DraftCheckpoint => ({ tabId: 7, reference: '123', next: 1, total: draftSteps(plan).length, status: 'uncertain', stage: 'create', planKey: draftPlanKey(plan), warnings: ['keep existing note'], generatedPriorities: [], recoveryAttempts: { '1': 0 } })

it('detaches nested Vue proxies before sending a checkpoint to Chrome Storage', () => {
  const value = reactive(checkpoint())
  expect(isProxy(value.warnings)).toBe(true)
  const snapshot = draftCheckpointSnapshot(value)
  expect(snapshot.warnings).toEqual(['keep existing note'])
  expect(isProxy(snapshot.warnings)).toBe(false)
  expect(isProxy(snapshot.generatedPriorities)).toBe(false)
  expect(isProxy(snapshot.recoveryAttempts)).toBe(false)
  expect(snapshot).toMatchObject({ reference: '123', next: 1, planKey: value.planKey })
  snapshot.warnings?.push('new')
  expect(value.warnings).toEqual(['keep existing note'])
})

it('restores Chrome-serialized indexed warning objects in numeric order', () => {
  expect(draftWarnings({ '1': 'second', '0': 'first' })).toEqual(['first', 'second'])
  expect(draftWarnings({})).toEqual([])
  expect(draftWarnings('legacy note')).toEqual(['legacy note'])
  expect(draftWarnings({ unexpected: 'do not silently accept this shape' })).toContain('历史草稿提示格式异常，请核对原记录。')
})

it('recovers an existing allocation with legacy warnings without allocating a replacement', async () => {
  const saved = checkpoint(), controller = new AbortController(), commands: string[] = []
  Reflect.set(saved, 'warnings', { '0': 'keep existing note' })
  const result = await runDraftPlan(plan, 7, {
    call: async command => { commands.push(command.op); return { ok: true, reference: '123', page: 'application' } },
    recover: async () => ({ outcome: 'completed', receipt: { ok: true, reference: '123', page: 'application' } }),
    save: async value => { if (value.next === 2) controller.abort() },
  }, controller.signal, saved)
  expect(commands.every(command => command === 'inspect')).toBe(true)
  expect(result).toMatchObject({ reference: '123', next: 2, status: 'stopped' })
  expect(result.warnings).toContain('keep existing note')
  expect(Array.isArray(result.warnings)).toBe(true)
})

it('completes fourteen existing checkpoints in six lanes without creating any replacement draft', async () => {
  const rows: HagueRow[] = Array.from({ length: 14 }, (_, index) => {
    const casePlan = { ...plan, reference: `PO${index + 1}HAGUE` }
    const saved = { ...checkpoint(), transport: 'http' as const, reference: String(index + 1), planKey: draftPlanKey(casePlan) }
    Reflect.set(saved, 'warnings', { '0': 'keep existing note' })
    return { folder: { caseVolume: casePlan.reference, path: casePlan.reference, documents: [], images: [], issues: [] }, state: 'review', confirmed: false, error: '', draft: saved }
  })
  let active = 0, peak = 0, creates = 0
  const result = await runDraftBatch(rows, 6, {
    transport: 'http', recoverUncertain: true, plan: row => ({ ...plan, reference: row.folder.caseVolume }), open: async () => 7,
    run: async (row, casePlan, tabId, update) => {
      active++; peak = Math.max(peak, active)
      let page: 'application' | 'summary' | 'portfolio' = 'application'
      const receipt = () => ({ ok: true, reference: row.draft?.reference, page, documentId: `doc-${row.folder.caseVolume}`, draftSaved: page === 'portfolio' })
      try {
        return await runDraftPlan(casePlan, tabId, {
          recover: async () => ({ outcome: 'completed', receipt: receipt() }),
          call: async command => {
            if (command.op === 'create') creates++
            if (command.op === 'summary') page = 'summary'
            if (command.op === 'backToApplication') page = 'application'
            if (command.op === 'saveDraft') page = 'portfolio'
            return receipt()
          },
          save: async () => {}, update,
        }, undefined, row.draft)
      } finally { active-- }
    },
    save: async (row, value) => { row.draft = draftCheckpointSnapshot(value) },
  })
  expect(result).toMatchObject({ succeeded: 14, failed: 0, skipped: 0, settled: 14, active: 0 })
  expect(peak).toBe(6)
  expect(creates).toBe(0)
  expect(rows.every(row => row.draft?.status === 'saved' && Array.isArray(row.draft.warnings))).toBe(true)
  Reflect.set(rows[0].draft!, 'warnings', { '0': 'keep existing note' })
  expect(draftReviewNotes(rows[0])).toContain('PO1HAGUE：keep existing note')
})

it('normalizes indexed generated-priority arrays restored from historical Chrome checkpoints',()=>{
 const saved=checkpoint();Reflect.set(saved,'generatedPriorities',{'0':{number:'202430000001.1',date:'2024-01-01',country:'CN',das:'',generated:true}})
 expect(draftCheckpointSnapshot(saved).generatedPriorities).toEqual([{number:'202430000001.1',date:'2024-01-01',country:'CN',das:'',generated:true}])
 Reflect.set(saved,'generatedPriorities',{});expect(draftCheckpointSnapshot(saved).generatedPriorities).toEqual([])
})
