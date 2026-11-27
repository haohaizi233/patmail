import { expect, it } from 'vitest'
import { createRecoveryClient } from '../../../src/recovery/client'
import { feeInspectionJournal } from '../../../src/workflow/fee-reduce-inspection-recovery'
import type { FeeReduceCaseInspectItem } from '../../../src/api/fee-reduce-types'

function item(caseVolume: string): FeeReduceCaseInspectItem {
  return { caseVolume, caseId: '', caseName: '', appNo: '', procId: '', procName: '', procStatus: '', state: 'not_found', reason: '' }
}

it('restores only contiguous committed pages and prunes obsolete batches without removing the current batch', async () => {
  const store = new Map<string, unknown>()
  let denyWrite = ''
  const client = createRecoveryClient(async ({ op, scope, payload }) => {
    if (!scope) throw new Error('Missing scope')
    if (op === 'get') return { payload: store.get(scope) }
    if (scope === denyWrite) throw new Error('WAL unavailable')
    if ((payload as { forgotten?: boolean }).forgotten) store.delete(scope)
    else store.set(scope, payload)
    return { revision: 1 }
  })
  const journal = feeInspectionJournal(client, 'scope')
  expect(await journal.read()).toBeNull()
  store.set('scope', { id: 'legacy', volumes: [42] })
  expect(await journal.read()).toBeNull()
  const { plan } = await journal.begin(['1', '2'])
  const cursor = `scope:${plan.id}:progress`
  expect(await journal.read()).toMatchObject({ rows: [], state: 'running' })
  await journal.append(plan, 0, [item('1')])
  denyWrite = cursor
  await expect(journal.append(plan, 1, [item('2')])).rejects.toThrow('WAL unavailable')
  expect(await journal.read()).toMatchObject({ rows: [item('1')], state: 'running' })
  denyWrite = ''
  await journal.finish(plan, 1, 'failed')
  expect(await journal.read()).toMatchObject({ rows: [item('1')], state: 'failed' })
  await journal.append(plan, 1, [item('2')])
  await journal.finish(plan, 2, 'done')
  expect(await journal.read()).toMatchObject({ rows: [item('1'), item('2')], state: 'done' })
  const secondPage = `scope:${plan.id}:1`
  store.set(secondPage, [{ caseVolume: 'bad result' }])
  expect(await journal.read()).toMatchObject({ rows: [item('1')], state: 'running' })
  store.set(secondPage, [item('2'), item('3')])
  expect(await journal.read()).toMatchObject({ rows: [item('1')], state: 'running' })
  store.set(cursor, { nextPage: -1, state: 'done' })
  expect(await journal.read()).toMatchObject({ rows: [], state: 'running' })
  store.set(cursor, { nextPage: 2, state: 'done' })
  const replacement = await journal.begin(['3'])
  expect(replacement.previous).toEqual(plan)
  await journal.prune(plan)
  expect(store.has(cursor)).toBe(false)
  expect(store.has(secondPage)).toBe(false)
  expect(await journal.read()).toMatchObject({ id: replacement.plan.id, volumes: ['3'], rows: [] })
})
